package main

import (
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const maxFileSize = 64 << 10

//go:embed web
var assets embed.FS

type workbench struct {
	mu        sync.Mutex
	file      string
	sessionID string
	step      int
}

type sessionState struct {
	SessionID string `json:"sessionId"`
	Step      int    `json:"step"`
	Content   string `json:"content"`
}

func main() {
	dir := os.Getenv("WORKSPACE_DIR")
	if dir == "" {
		dir = "./workspace"
	}
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8080"
	}
	app, err := newWorkbench(dir)
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{
		Addr:              addr,
		Handler:           app.routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("workbench listening on %s", addr)
	log.Fatal(server.ListenAndServe())
}

func newWorkbench(dir string) (*workbench, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	app := &workbench{
		file: filepath.Join(dir, "task.md"),
		step: 1,
	}
	var sessionID [8]byte
	rand.Read(sessionID[:])
	app.sessionID = hex.EncodeToString(sessionID[:])
	if _, err := os.Stat(app.file); errors.Is(err, os.ErrNotExist) {
		const starter = "# Review the release\n\n- Check the release notes\n- Record your findings\n- Hand off the review\n"
		if err := app.save([]byte(starter)); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	return app, nil
}

func (a *workbench) routes() http.Handler {
	web, err := fs.Sub(assets, "web")
	if err != nil {
		panic(err)
	}
	mux := http.NewServeMux()
	mux.Handle("GET /", http.FileServerFS(web))
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("GET /api/session", a.getSession)
	mux.HandleFunc("PUT /api/file", a.putFile)
	mux.HandleFunc("POST /api/advance", a.advance)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		mux.ServeHTTP(w, r)
	})
}

func (a *workbench) getSession(w http.ResponseWriter, _ *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.writeSession(w)
}

func (a *workbench) putFile(w http.ResponseWriter, r *http.Request) {
	content, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxFileSize))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			http.Error(w, "task.md must be 64 KiB or smaller", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "could not read file contents", http.StatusBadRequest)
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := a.save(content); err != nil {
		log.Printf("save task.md: %v", err)
		http.Error(w, "could not save task.md", http.StatusInternalServerError)
		return
	}
	a.writeSession(w)
}

func (a *workbench) advance(w http.ResponseWriter, _ *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.step < 3 {
		a.step++
	}
	a.writeSession(w)
}

func (a *workbench) writeSession(w http.ResponseWriter) {
	content, err := os.ReadFile(a.file)
	if err != nil {
		log.Printf("read task.md: %v", err)
		http.Error(w, "could not read task.md", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	state := sessionState{SessionID: a.sessionID, Step: a.step, Content: string(content)}
	if err := json.NewEncoder(w).Encode(state); err != nil {
		log.Printf("write session: %v", err)
	}
}

func (a *workbench) save(content []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(a.file), ".task-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	_, writeErr := tmp.Write(content)
	if err := errors.Join(writeErr, tmp.Close()); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), a.file); err != nil {
		return fmt.Errorf("replace task.md: %w", err)
	}
	return nil
}
