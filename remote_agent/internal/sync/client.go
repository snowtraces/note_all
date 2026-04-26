package sync

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sync"

	"github.com/gorilla/websocket"
	"remote_agent/internal/crypto"
	"remote_agent/internal/protocol"
)

type Message struct {
	SessionID string `json:"sid"`
	Data      []byte `json:"data"`
}

type Client struct {
	conn          *websocket.Conn
	inputCallback func(sid string, data []byte) error
	key           *[32]byte
	sendCh        chan Message
	mu            sync.Mutex
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// NewSyncClient 模式：主动连接中继 (Relay Mode)
func NewSyncClient(relayAddr string, key *[32]byte, sessID string, inputCb func(sid string, data []byte) error) (*Client, error) {
	scheme := "ws"
	u := url.URL{Scheme: scheme, Host: relayAddr, Path: "/sync"}
	q := u.Query()
	q.Set("sid", sessID)
	u.RawQuery = q.Encode()

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("dial relay failed: %w", err)
	}

	return &Client{
		conn:          conn,
		inputCallback: inputCb,
		key:           key,
		sendCh:        make(chan Message, 100),
	}, nil
}

// NewDirectClient 模式：作为服务器等待连接 (Direct Mode)
func NewDirectClient(key *[32]byte, inputCb func(sid string, data []byte) error) *Client {
	return &Client{
		inputCallback: inputCb,
		key:           key,
		sendCh:        make(chan Message, 100),
	}
}

// ServeHTTP 支撑 Direct 模式下的 WebSocket 接入
func (c *Client) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// 直连模式验证 (可选，但建议保留以匹配协议)
	sid := r.URL.Query().Get("sid")
	if sid == "" {
		http.Error(w, "sid is required", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Upgrade error: %v", err)
		return
	}
	c.mu.Lock()
	if c.conn != nil {
		c.conn.Close() // 只允许一个活跃控制端
	}
	c.conn = conn
	c.mu.Unlock()

	log.Println("Direct remote controller connected")
	
	// 为每个连接启动独立的生命周期管理
	c.handleConnection(conn)
}

func (c *Client) handleConnection(conn *websocket.Conn) {
	// 写循环
	go func() {
		for {
			msg, ok := <-c.sendCh
			if !ok {
				return
			}
			
			c.mu.Lock()
			// 如果当前连接已变更，旧的写循环应该退出
			if c.conn != conn {
				c.mu.Unlock()
				return
			}
			err := conn.WriteJSON(msg)
			c.mu.Unlock()
			
			if err != nil {
				return
			}
		}
	}()

	// 读循环
	go func() {
		for {
			var msg Message
			err := conn.ReadJSON(&msg)
			if err != nil {
				log.Printf("Direct sync connection closed")
				c.mu.Lock()
				if c.conn == conn {
					c.conn = nil
				}
				c.mu.Unlock()
				return
			}
			plain, err := crypto.Decrypt(msg.Data, c.key)
			if err == nil && c.inputCallback != nil {
				c.inputCallback(msg.SessionID, plain)
			}
		}
	}()
}

func (c *Client) Start() {
	if c.conn == nil {
		return
	}
	c.handleConnection(c.conn)
}

func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil {
		err := c.conn.Close()
		c.conn = nil
		return err
	}
	return nil
}

func (c *Client) SendEvent(sessID string, event *protocol.Event) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	cipher, err := crypto.Encrypt(payload, c.key)
	if err != nil {
		return err
	}

	select {
	case c.sendCh <- Message{SessionID: sessID, Data: cipher}:
	default:
		// 缓冲区满则丢弃，防止阻塞 Agent
	}
	return nil
}

func (c *Client) SyncOutput(sessID string, stdout io.Reader) {
	scanner := protocol.NewScanner(stdout)
	go func() {
		for {
			event, err := scanner.Next()
			if err != nil {
				return
			}
			c.SendEvent(sessID, event)
		}
	}()
}
