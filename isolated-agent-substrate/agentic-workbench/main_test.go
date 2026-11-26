package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFileSurvivesColdStartAndTaskProgressDoesNot(t *testing.T) {
	dir := t.TempDir()
	start := func() http.Handler {
		t.Helper()
		app, err := newWorkbench(dir)
		if err != nil {
			t.Fatal(err)
		}
		return app.routes()
	}
	request := func(handler http.Handler, method, path, body string) sessionState {
		t.Helper()
		resp := httptest.NewRecorder()
		handler.ServeHTTP(resp, httptest.NewRequest(method, path, strings.NewReader(body)))
		if resp.Code != http.StatusOK || resp.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("%s %s: status %d, headers %v, body %s", method, path, resp.Code, resp.Header(), resp.Body)
		}
		var state sessionState
		if err := json.Unmarshal(resp.Body.Bytes(), &state); err != nil {
			t.Fatal(err)
		}
		return state
	}

	handler := start()
	initial := request(handler, http.MethodGet, "/api/session", "")
	const edit = "checkpointed value"
	request(handler, http.MethodPut, "/api/file", edit)
	request(handler, http.MethodPost, "/api/advance", "")
	request(handler, http.MethodPost, "/api/advance", "")
	reopened := request(handler, http.MethodGet, "/api/session", "")
	if reopened.SessionID == "" || reopened.SessionID != initial.SessionID || reopened.Step != 3 || reopened.Content != edit {
		t.Fatalf("reopened session = %+v, initial session = %+v", reopened, initial)
	}

	restarted := request(start(), http.MethodGet, "/api/session", "")
	if restarted.SessionID == "" || restarted.SessionID == initial.SessionID || restarted.Step != 1 || restarted.Content != edit {
		t.Fatalf("restarted session = %+v, initial session = %+v", restarted, initial)
	}
}

func TestWorkbenchServesPageAssetsAndReadiness(t *testing.T) {
	app, err := newWorkbench(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	handler := app.routes()
	for path, contains := range map[string]string{
		"/":          "Agent Workbench",
		"/app.js":    "/api/session",
		"/style.css": ".panels",
		"/readyz":    "",
	} {
		t.Run(path, func(t *testing.T) {
			resp := httptest.NewRecorder()
			handler.ServeHTTP(resp, httptest.NewRequest(http.MethodGet, path, nil))
			if resp.Code != http.StatusOK || !strings.Contains(resp.Body.String(), contains) {
				t.Fatalf("GET %s: status %d, missing %q", path, resp.Code, contains)
			}
		})
	}
}
