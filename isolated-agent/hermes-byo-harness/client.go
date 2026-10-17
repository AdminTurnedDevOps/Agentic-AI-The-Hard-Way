package main

import (
	"context"
	"sync"

	acp "github.com/coder/acp-go-sdk"
	harnessruntime "github.com/kagent-dev/kagent/go/harness/runtime"
)

type hermesACPClient struct {
	mu        sync.RWMutex
	sink      harnessruntime.EventSink
	toolNames map[string]string
}

func newHermesACPClient() *hermesACPClient {
	return &hermesACPClient{toolNames: map[string]string{}}
}

func (c *hermesACPClient) setSink(sink harnessruntime.EventSink) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sink = sink
}

func (c *hermesACPClient) SessionUpdate(_ context.Context, notification acp.SessionNotification) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.sink == nil {
		return nil
	}
	update := notification.Update
	switch {
	case update.AgentMessageChunk != nil && update.AgentMessageChunk.Content.Text != nil:
		return c.sink.TextDelta(harnessruntime.TextDelta{Text: update.AgentMessageChunk.Content.Text.Text})
	case update.ToolCall != nil:
		name := update.ToolCall.Title
		id := string(update.ToolCall.ToolCallId)
		c.toolNames[id] = name
		arguments, _ := update.ToolCall.RawInput.(map[string]any)
		return c.sink.ToolCall(harnessruntime.ToolCall{ID: id, Name: name, Arguments: arguments})
	case update.ToolCallUpdate != nil && update.ToolCallUpdate.Status != nil:
		status := *update.ToolCallUpdate.Status
		if status != acp.ToolCallStatusCompleted && status != acp.ToolCallStatusFailed {
			return nil
		}
		id := string(update.ToolCallUpdate.ToolCallId)
		return c.sink.ToolResult(harnessruntime.ToolResult{
			ID: id, Name: c.toolNames[id], Result: update.ToolCallUpdate.RawOutput,
			IsError: status == acp.ToolCallStatusFailed,
		})
	default:
		return nil
	}
}

func (c *hermesACPClient) RequestPermission(_ context.Context, request acp.RequestPermissionRequest) (acp.RequestPermissionResponse, error) {
	for _, option := range request.Options {
		if option.Kind == acp.PermissionOptionKindRejectOnce || option.Kind == acp.PermissionOptionKindRejectAlways {
			return acp.RequestPermissionResponse{Outcome: acp.RequestPermissionOutcome{
				Selected: &acp.RequestPermissionOutcomeSelected{Outcome: "selected", OptionId: option.OptionId},
			}}, nil
		}
	}
	return acp.RequestPermissionResponse{Outcome: acp.RequestPermissionOutcome{
		Cancelled: &acp.RequestPermissionOutcomeCancelled{Outcome: "cancelled"},
	}}, nil
}

func (c *hermesACPClient) ReadTextFile(context.Context, acp.ReadTextFileRequest) (acp.ReadTextFileResponse, error) {
	return acp.ReadTextFileResponse{}, acp.NewMethodNotFound("fs/read_text_file")
}

func (c *hermesACPClient) WriteTextFile(context.Context, acp.WriteTextFileRequest) (acp.WriteTextFileResponse, error) {
	return acp.WriteTextFileResponse{}, acp.NewMethodNotFound("fs/write_text_file")
}

func (c *hermesACPClient) CreateTerminal(context.Context, acp.CreateTerminalRequest) (acp.CreateTerminalResponse, error) {
	return acp.CreateTerminalResponse{}, acp.NewMethodNotFound("terminal/create")
}

func (c *hermesACPClient) KillTerminal(context.Context, acp.KillTerminalRequest) (acp.KillTerminalResponse, error) {
	return acp.KillTerminalResponse{}, acp.NewMethodNotFound("terminal/kill")
}

func (c *hermesACPClient) TerminalOutput(context.Context, acp.TerminalOutputRequest) (acp.TerminalOutputResponse, error) {
	return acp.TerminalOutputResponse{}, acp.NewMethodNotFound("terminal/output")
}

func (c *hermesACPClient) ReleaseTerminal(context.Context, acp.ReleaseTerminalRequest) (acp.ReleaseTerminalResponse, error) {
	return acp.ReleaseTerminalResponse{}, acp.NewMethodNotFound("terminal/release")
}

func (c *hermesACPClient) WaitForTerminalExit(context.Context, acp.WaitForTerminalExitRequest) (acp.WaitForTerminalExitResponse, error) {
	return acp.WaitForTerminalExitResponse{}, acp.NewMethodNotFound("terminal/wait_for_exit")
}

var _ acp.Client = (*hermesACPClient)(nil)
