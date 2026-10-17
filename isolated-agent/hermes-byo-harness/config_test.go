package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMaterializeHermesConfig(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	workspace := filepath.Join(root, "workspace")
	cfg, err := parseConfig([]byte(`{"runtime":{"control_plane_url":"http://kagent-controller.kagent:8083","name":"hermes-assistant","namespace":"kagent"},` +
		`"agent":{"name":"hermes_assistant","instruction":"Be concise.","model":{"model":"gpt-4.1-mini","openai":{"base_url":"https://api.openai.com/v1"}}}}`))
	if err != nil {
		t.Fatal(err)
	}
	if err := materializeHermesConfig(cfg, root, workspace); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(filepath.Join(root, "hermes", "config.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(contents)
	for _, expected := range []string{
		"default: gpt-4.1-mini", "provider: openai", "base_url: https://api.openai.com/v1",
		"max_tokens: 32768", "key_env: OPENAI_API_KEY", "api_mode: chat_completions", "system_prompt: Be concise.",
	} {
		if !strings.Contains(text, expected) {
			t.Fatalf("configuration does not contain %q:\n%s", expected, text)
		}
	}
}

func TestMaterializeHermesConfigRejectsUnsupportedProvider(t *testing.T) {
	t.Parallel()
	cfg, err := parseConfig([]byte(`{"agent":{"name":"hermes_assistant","model":{"model":"claude-sonnet-4-5","anthropic":{}}}}`))
	if err != nil {
		t.Fatal(err)
	}
	err = materializeHermesConfig(cfg, t.TempDir(), t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "only OpenAI") {
		t.Fatalf("expected unsupported provider error, got %v", err)
	}
}

func TestParseConfigRejectsLegacyShape(t *testing.T) {
	t.Parallel()
	if _, err := parseConfig([]byte(`{"model":{"type":"openai","model":"gpt-4.1-mini"},"instruction":"Be concise."}`)); err == nil {
		t.Fatal("expected the pre-1.0 configuration shape to be rejected")
	}
}
