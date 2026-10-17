package main

import (
	"context"
	"testing"

	acp "github.com/coder/acp-go-sdk"
	harnessruntime "github.com/kagent-dev/kagent/go/harness/runtime"
)

type recordingSink struct {
	text   string
	call   harnessruntime.ToolCall
	result harnessruntime.ToolResult
}

func (*recordingSink) SessionStarted(harnessruntime.SessionStarted) error { return nil }
func (s *recordingSink) TextDelta(delta harnessruntime.TextDelta) error {
	s.text += delta.Text
	return nil
}
func (s *recordingSink) ToolCall(call harnessruntime.ToolCall) error { s.call = call; return nil }
func (s *recordingSink) ToolResult(result harnessruntime.ToolResult) error {
	s.result = result
	return nil
}
func (*recordingSink) ModelCall(harnessruntime.ModelCall) {}

func TestHermesACPClientForwardsText(t *testing.T) {
	t.Parallel()
	sink := &recordingSink{}
	client := newHermesACPClient()
	client.setSink(sink)
	err := client.SessionUpdate(context.Background(), acp.SessionNotification{Update: acp.UpdateAgentMessageText("hello")})
	if err != nil {
		t.Fatal(err)
	}
	if sink.text != "hello" {
		t.Fatalf("got %q, want hello", sink.text)
	}
}

func TestHermesACPClientRejectsPermission(t *testing.T) {
	t.Parallel()
	client := newHermesACPClient()
	response, err := client.RequestPermission(context.Background(), acp.RequestPermissionRequest{Options: []acp.PermissionOption{{
		OptionId: "deny", Kind: acp.PermissionOptionKindRejectOnce, Name: "Reject",
	}}})
	if err != nil {
		t.Fatal(err)
	}
	if response.Outcome.Selected == nil || response.Outcome.Selected.OptionId != "deny" {
		t.Fatalf("unexpected response: %#v", response)
	}
}
