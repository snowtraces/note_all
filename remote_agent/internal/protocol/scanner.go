package protocol

import (
	"bufio"
	"io"
	"strings"
	"time"
)

type EventType string

const (
	EventTerminalOutput EventType = "terminal"
	EventPermissionReq  EventType = "permission_request"
	EventThought         EventType = "thought"
	EventDone            EventType = "done"
)

type Event struct {
	Type    EventType `json:"type"`
	Content string    `json:"content"`
	Data    any       `json:"data,omitempty"`
}

type Scanner struct {
	reader *bufio.Reader
}

func NewScanner(r io.Reader) *Scanner {
	return &Scanner{
		reader: bufio.NewReader(r),
	}
}

func (s *Scanner) Next() (*Event, error) {
	buf := make([]byte, 4096)
	n, err := s.reader.Read(buf)
	if err != nil {
		return nil, err
	}
	time.Sleep(10 * time.Millisecond)
	content := string(buf[:n])

	if strings.Contains(content, "[y/N]") || strings.Contains(content, "Allow this command?") {
		return &Event{
			Type:    EventPermissionReq,
			Content: content,
		}, nil
	}

	return &Event{
		Type:    EventTerminalOutput,
		Content: content,
	}, nil
}
