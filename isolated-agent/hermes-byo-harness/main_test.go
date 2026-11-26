package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"google.golang.org/protobuf/proto"

	contract "github.com/kagent-dev/kagent/go/api/bootstrap"
	runtimev1 "github.com/kagent-dev/kagent/go/api/gen/kagent/runtime/v1"
)

const (
	testConfigJSON = `{"runtime":{"control_plane_url":"http://kagent-controller.kagent:8083","name":"hermes-assistant","namespace":"kagent"},` +
		`"agent":{"name":"hermes_assistant","instruction":"Be concise.","model":{"model":"gpt-4.1-mini","openai":{}}}}`
	testAgentCardJSON = `{"name":"hermes_assistant","version":"v1"}`
)

// writeCachedBundle stores a bundle the way bootstrap.Load saves it after a
// fetch, so the test exercises the restore path without a control plane.
func writeCachedBundle(t *testing.T) (string, *runtimev1.BootstrapBundle) {
	t.Helper()
	bundle, err := contract.NewBundle(strings.Repeat("a", 64), []byte(testConfigJSON), []byte(testAgentCardJSON))
	if err != nil {
		t.Fatal(err)
	}
	raw, err := proto.Marshal(bundle)
	if err != nil {
		t.Fatal(err)
	}
	directory := filepath.Join(t.TempDir(), "bootstrap")
	if err := os.MkdirAll(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "bundle.pb"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	return directory, bundle
}

func descriptorEnv(t *testing.T, descriptor contract.Descriptor) func(string) string {
	t.Helper()
	raw, err := json.Marshal(descriptor)
	if err != nil {
		t.Fatal(err)
	}
	return func(name string) string {
		if name == contract.Environment {
			return string(raw)
		}
		return ""
	}
}

func TestLoadBootstrapFromCachedBundle(t *testing.T) {
	t.Parallel()
	directory, bundle := writeCachedBundle(t)
	getenv := descriptorEnv(t, contract.Descriptor{
		FormatVersion: contract.FormatVersion, ControlPlaneURL: "http://kagent-controller.kagent:8083",
		Revision: bundle.GetRevision(), SHA256: bundle.GetSha256(),
	})
	configJSON, agentCardJSON, err := loadBootstrap(context.Background(), getenv, directory)
	if err != nil {
		t.Fatal(err)
	}
	if string(configJSON) != testConfigJSON || string(agentCardJSON) != testAgentCardJSON {
		t.Fatalf("unexpected payload: config=%s card=%s", configJSON, agentCardJSON)
	}
	cfg, err := parseConfig(configJSON)
	if err != nil {
		t.Fatal(err)
	}
	if got := cfg.GetAgent().GetModel().GetModel(); got != "gpt-4.1-mini" {
		t.Fatalf("got model %q, want gpt-4.1-mini", got)
	}
}

func TestLoadBootstrapRejectsDigestMismatch(t *testing.T) {
	t.Parallel()
	directory, bundle := writeCachedBundle(t)
	getenv := descriptorEnv(t, contract.Descriptor{
		FormatVersion: contract.FormatVersion, ControlPlaneURL: "http://kagent-controller.kagent:8083",
		Revision: bundle.GetRevision(), SHA256: strings.Repeat("b", 64),
	})
	if _, _, err := loadBootstrap(context.Background(), getenv, directory); err == nil {
		t.Fatal("expected a bundle that does not match the descriptor to be rejected")
	}
}

func TestLoadBootstrapRequiresDescriptor(t *testing.T) {
	t.Parallel()
	_, _, err := loadBootstrap(context.Background(), func(string) string { return "" }, t.TempDir())
	if err == nil || !strings.Contains(err.Error(), contract.Environment) {
		t.Fatalf("expected a missing %s error, got %v", contract.Environment, err)
	}
}

func TestOptionsValidate(t *testing.T) {
	t.Parallel()
	for name, tc := range map[string]struct {
		opts    options
		wantErr bool
	}{
		"bootstrap":            {opts: options{}},
		"check with bootstrap": {opts: options{check: true}},
		"check with files":     {opts: options{check: true, configFile: "c.json", agentCardFile: "a.json"}},
		"files without check":  {opts: options{configFile: "c.json", agentCardFile: "a.json"}, wantErr: true},
		"config file only":     {opts: options{check: true, configFile: "c.json"}, wantErr: true},
		"agent card file only": {opts: options{check: true, agentCardFile: "a.json"}, wantErr: true},
	} {
		if err := tc.opts.validate(); (err != nil) != tc.wantErr {
			t.Errorf("%s: validate() error = %v, wantErr %v", name, err, tc.wantErr)
		}
	}
}
