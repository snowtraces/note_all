package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"

	"github.com/UserExistsError/conpty"
)

type Session struct {
	ID        string
	cpty      *conpty.ConPty
	Stdin     io.Writer
	Stdout    io.Reader
	cancel    context.CancelFunc
	wg        sync.WaitGroup
	IsRunning bool
}

type Manager struct {
	sessions map[string]*Session
	mu       sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		sessions: make(map[string]*Session),
	}
}

func (m *Manager) StartSession(id string, command string) (*Session, error) {
	fullPath, err := exec.LookPath(command)
	if err != nil {
		return nil, fmt.Errorf("command not found: %s", command)
	}

	cpty, err := conpty.Start(fullPath)
	if err != nil {
		return nil, err
	}
	cpty.Resize(80, 40)

	ctx, cancel := context.WithCancel(context.Background())
	sess := &Session{
		ID:        id,
		cpty:      cpty,
		Stdin:     cpty,
		Stdout:    cpty,
		cancel:    cancel,
		IsRunning: true,
	}

	m.mu.Lock()
	m.sessions[id] = sess
	m.mu.Unlock()

	go func() {
		defer cancel()
		sess.cpty.Wait(ctx)
		sess.IsRunning = false
	}()

	return sess, nil
}

func (m *Manager) StopSession(id string) error {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	delete(m.sessions, id)
	m.mu.Unlock()

	if !ok || sess == nil {
		return nil
	}
	sess.cancel()
	return sess.cpty.Close()
}

type RemoteCommand struct {
	Type string `json:"type"`
	Data string `json:"data"`
}

func (m *Manager) HandleRemoteCommand(id string, rawData []byte) error {
	var cmd RemoteCommand
	if err := json.Unmarshal(rawData, &cmd); err != nil {
		return m.WriteInput(id, rawData)
	}

	switch cmd.Type {
	case "input":
		return m.WriteInput(id, []byte(cmd.Data))
	case "resize":
		var dims struct {
			Cols int `json:"cols"`
			Rows int `json:"rows"`
		}
		if err := json.Unmarshal([]byte(cmd.Data), &dims); err == nil {
			return m.ResizeSession(id, dims.Cols, dims.Rows)
		}
	}
	return nil
}

func (m *Manager) WriteInput(id string, data []byte) error {
	m.mu.RLock()
	sess, ok := m.sessions[id]
	m.mu.RUnlock()

	if !ok || !sess.IsRunning {
		return io.ErrClosedPipe
	}
	_, err := sess.Stdin.Write(data)
	return err
}

func (m *Manager) ResizeSession(id string, cols, rows int) error {
	m.mu.RLock()
	sess, ok := m.sessions[id]
	m.mu.RUnlock()

	if !ok || !sess.IsRunning {
		return nil
	}
	return sess.cpty.Resize(cols, rows)
}
