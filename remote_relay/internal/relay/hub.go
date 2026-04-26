package relay

import (
	"sync"
	"github.com/gorilla/websocket"
)

type Client struct {
	UID       string 
	SessionID string
	Conn      *websocket.Conn
	Send      chan []byte
	Hub       *Hub
}

type Hub struct {
	sessions map[string]map[*Client]bool
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		sessions:   make(map[string]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if h.sessions[client.SessionID] == nil {
				h.sessions[client.SessionID] = make(map[*Client]bool)
			}
			h.sessions[client.SessionID][client] = true
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.sessions[client.SessionID]; ok {
				delete(h.sessions[client.SessionID], client)
				if len(h.sessions[client.SessionID]) == 0 {
					delete(h.sessions, client.SessionID)
				}
				close(client.Send)
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) BroadcastToSession(sender *Client, message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	clients := h.sessions[sender.SessionID]
	for client := range clients {
		if client != sender && client.UID != sender.UID {
			select {
			case client.Send <- message:
			default:
				go func(c *Client) { h.unregister <- c }(client)
			}
		}
	}
}
