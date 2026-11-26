package main

import (
	"cmp"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"strings"

	a2atype "github.com/a2aproject/a2a-go/v2/a2a"
	"github.com/kagent-dev/kagent/go/adk/pkg/app"
	"github.com/kagent-dev/kagent/go/adk/pkg/bootstrap"
	runtimeconfig "github.com/kagent-dev/kagent/go/adk/pkg/config"
	contract "github.com/kagent-dev/kagent/go/api/bootstrap"
	runtimea2a "github.com/kagent-dev/kagent/go/harness/runtime/a2a"
	"github.com/kagent-dev/kagent/go/harness/runtime/continuation"
	"github.com/kagent-dev/kagent/go/pkg/logging"
	"github.com/kagent-dev/kagent/go/pkg/tracing"
)

const (
	dataDir      = "/data"
	workspaceDir = "/data/workspace"
	privatePort  = "80"
)

// options are the adapter's own command-line flags. The file flags exist only so
// --check can run outside an Actor, where there is no kagent control plane to
// fetch the bootstrap bundle from.
type options struct {
	check         bool
	configFile    string
	agentCardFile string
}

func (o options) validate() error {
	if (o.configFile == "") != (o.agentCardFile == "") {
		return fmt.Errorf("--config-file and --agent-card-file must be set together")
	}
	if o.configFile != "" && !o.check {
		return fmt.Errorf("--config-file and --agent-card-file are only valid with --check")
	}
	return nil
}

func main() {
	var opts options
	flag.BoolVar(&opts.check, "check", false, "validate configuration and Hermes ACP startup, then exit")
	flag.StringVar(&opts.configFile, "config-file", "", "with --check: read the compiled ADKConfig JSON from this file instead of the kagent bootstrap bundle")
	flag.StringVar(&opts.agentCardFile, "agent-card-file", "", "with --check: read the Agent Card JSON from this file instead of the kagent bootstrap bundle")
	flag.Parse()
	logger, err := logging.New(os.Stderr, "info")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	ctx := logging.IntoContext(context.Background(), logger)
	if err := run(ctx, logger, opts); err != nil {
		logger.ErrorContext(ctx, "Hermes Harness stopped", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, logger *slog.Logger, opts options) error {
	if err := opts.validate(); err != nil {
		return err
	}
	var configJSON, agentCardJSON []byte
	var err error
	if opts.configFile != "" {
		configJSON, agentCardJSON, err = loadFiles(opts.configFile, opts.agentCardFile)
	} else {
		configJSON, agentCardJSON, err = loadBootstrap(ctx, os.Getenv, contract.Directory)
	}
	if err != nil {
		return err
	}

	var card a2atype.AgentCard
	if err := json.Unmarshal(agentCardJSON, &card); err != nil {
		return fmt.Errorf("decode Agent Card: %w", err)
	}
	if strings.TrimSpace(card.Name) == "" {
		return fmt.Errorf("Agent Card name is required")
	}

	cfg, err := parseConfig(configJSON)
	if err != nil {
		return err
	}
	process := runtimeconfig.ProcessConfig(cfg)
	// The compiled runtime config carries the log level, so rebuild the logger once it is known.
	if logger, err = logging.New(os.Stderr, cmp.Or(process.GetLogLevel(), "info")); err != nil {
		return fmt.Errorf("create logger: %w", err)
	}
	ctx = logging.IntoContext(ctx, logger)
	if err := materializeHermesConfig(cfg, dataDir, workspaceDir); err != nil {
		return err
	}
	runner := newHermesRunner(logger, []string{"hermes", "acp"}, dataDir, workspaceDir)
	defer runner.Close()
	if opts.check {
		if err := runner.Check(ctx); err != nil {
			return fmt.Errorf("check Hermes runtime: %w", err)
		}
		return nil
	}
	store, err := continuation.New(dataDir+"/adapter", "hermes", validateSessionID)
	if err != nil {
		return fmt.Errorf("create continuation store: %w", err)
	}
	// A BYO runtime has no compiled telemetry identity, so the executor gets the empty one.
	executor, err := runtimea2a.New(runner, store, tracing.RuntimeTelemetry{})
	if err != nil {
		return fmt.Errorf("create A2A executor: %w", err)
	}
	application, err := app.New(app.AppConfig{
		AgentCard:        card,
		Port:             privatePort,
		AppName:          card.Name,
		ControlPlaneURL:  process.GetControlPlaneUrl(),
		MaxContentLength: process.MaxContentLength,
		Logger:           logger,
	}, executor)
	if err != nil {
		return fmt.Errorf("construct private A2A app: %w", err)
	}
	if err := application.Run(); err != nil {
		return fmt.Errorf("run private A2A app: %w", err)
	}
	return nil
}

// loadBootstrap returns the compiled ADKConfig and Agent Card from kagent's
// bootstrap bundle. kagent sets only the KAGENT_BOOTSTRAP_JSON descriptor in the
// Actor. On first start the bundle is fetched from the control plane over gRPC
// and saved under directory, which lives on the durable /data volume, so a
// restored Actor reuses it without calling the controller again. Production
// passes contract.Directory, which is what bootstrap.FromEnvironment uses.
func loadBootstrap(ctx context.Context, getenv func(string) string, directory string) ([]byte, []byte, error) {
	bundle, err := bootstrap.Load(ctx, getenv(contract.Environment), directory, getenv("SSL_CERT_FILE"))
	if err != nil {
		return nil, nil, fmt.Errorf("load kagent bootstrap bundle from %s: %w", contract.Environment, err)
	}
	return bundle.GetConfigJson(), bundle.GetAgentCardJson(), nil
}

func loadFiles(configFile, agentCardFile string) ([]byte, []byte, error) {
	configJSON, err := os.ReadFile(configFile)
	if err != nil {
		return nil, nil, fmt.Errorf("read config file: %w", err)
	}
	agentCardJSON, err := os.ReadFile(agentCardFile)
	if err != nil {
		return nil, nil, fmt.Errorf("read Agent Card file: %w", err)
	}
	return configJSON, agentCardJSON, nil
}

func validateSessionID(id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("Hermes session ID is empty")
	}
	return nil
}
