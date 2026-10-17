package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"sync"

	acp "github.com/coder/acp-go-sdk"
	harnessruntime "github.com/kagent-dev/kagent/go/harness/runtime"
)

type hermesRunner struct {
	logger    *slog.Logger
	command   []string
	dataDir   string
	workspace string

	mu         sync.Mutex
	process    *exec.Cmd
	input      io.WriteCloser
	connection *acp.ClientSideConnection
	client     *hermesACPClient
	sessionID  string
}

func newHermesRunner(logger *slog.Logger, command []string, dataDir, workspace string) *hermesRunner {
	return &hermesRunner{logger: logger, command: command, dataDir: dataDir, workspace: workspace}
}

func (r *hermesRunner) Check(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.ensureConnected(ctx, "")
}

func (r *hermesRunner) Run(ctx context.Context, turn harnessruntime.Turn, sink harnessruntime.EventSink) (harnessruntime.Outcome, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.ensureConnected(ctx, turn.ContinuationID); err != nil {
		return harnessruntime.Outcome{}, err
	}
	if turn.ContinuationID == "" {
		if err := sink.SessionStarted(harnessruntime.SessionStarted{ContinuationID: r.sessionID}); err != nil {
			return harnessruntime.Outcome{}, err
		}
	}

	r.client.setSink(sink)
	defer r.client.setSink(nil)
	_, err := r.connection.Prompt(ctx, acp.PromptRequest{
		SessionId: acp.SessionId(r.sessionID),
		Prompt:    []acp.ContentBlock{acp.TextBlock(turn.Prompt)},
	})
	if err != nil {
		return harnessruntime.Outcome{}, fmt.Errorf("prompt Hermes session %s: %w", r.sessionID, err)
	}
	return harnessruntime.Outcome{}, nil
}

func (r *hermesRunner) ensureConnected(ctx context.Context, continuationID string) error {
	if r.connection != nil {
		select {
		case <-r.connection.Done():
			r.stopProcess()
		default:
			if continuationID == "" || continuationID == r.sessionID {
				return nil
			}
			return fmt.Errorf("Hermes runtime is bound to session %s, not %s", r.sessionID, continuationID)
		}
	}
	if len(r.command) == 0 {
		return fmt.Errorf("Hermes command is required")
	}

	cmd := exec.Command(r.command[0], r.command[1:]...)
	cmd.Dir = r.workspace
	cmd.Env = append(os.Environ(), "HERMES_HOME="+r.dataDir+"/hermes", "HOME="+r.dataDir)
	cmd.Stderr = os.Stderr
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("open Hermes stdin: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return fmt.Errorf("open Hermes stdout: %w", err)
	}
	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		return fmt.Errorf("start Hermes ACP process: %w", err)
	}

	client := newHermesACPClient()
	connection := acp.NewClientSideConnection(client, stdin, stdout)
	connection.SetLogger(r.logger)
	if _, err := connection.Initialize(ctx, acp.InitializeRequest{
		ProtocolVersion:    acp.ProtocolVersionNumber,
		ClientCapabilities: acp.ClientCapabilities{},
	}); err != nil {
		stopCommand(cmd, stdin)
		return fmt.Errorf("initialize Hermes ACP connection: %w", err)
	}

	if continuationID == "" {
		session, err := connection.NewSession(ctx, acp.NewSessionRequest{Cwd: r.workspace, McpServers: []acp.McpServer{}})
		if err != nil {
			stopCommand(cmd, stdin)
			return fmt.Errorf("create Hermes ACP session: %w", err)
		}
		r.sessionID = string(session.SessionId)
	} else {
		if _, err := connection.LoadSession(ctx, acp.LoadSessionRequest{
			Cwd: r.workspace, SessionId: acp.SessionId(continuationID), McpServers: []acp.McpServer{},
		}); err != nil {
			stopCommand(cmd, stdin)
			return fmt.Errorf("load Hermes ACP session %s: %w", continuationID, err)
		}
		r.sessionID = continuationID
	}

	r.process = cmd
	r.input = stdin
	r.connection = connection
	r.client = client
	return nil
}

func (r *hermesRunner) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.stopProcess()
}

func (r *hermesRunner) stopProcess() error {
	var err error
	if r.input != nil {
		err = r.input.Close()
	}
	if r.process != nil && r.process.Process != nil {
		if killErr := r.process.Process.Kill(); killErr != nil && !errors.Is(killErr, os.ErrProcessDone) && err == nil {
			err = killErr
		}
		_ = r.process.Wait()
	}
	r.process = nil
	r.input = nil
	r.connection = nil
	r.client = nil
	r.sessionID = ""
	return err
}

func stopCommand(cmd *exec.Cmd, input io.Closer) {
	_ = input.Close()
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}
}
