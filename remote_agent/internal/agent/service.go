package agent

import (
	"fmt"
	"log"
	"net/http"
	"remote_agent/internal/crypto"
	"remote_agent/internal/sync"
)

type AgentService struct {
	Manager    *Manager
	SyncClient *sync.Client
	AccessKey  string
	SessionID  string
}

func NewAgentService() *AgentService {
	return &AgentService{
		Manager: NewManager(),
	}
}

// StartRelaySession 模式：连接到远程中继
func (s *AgentService) StartRelaySession(passphrase, relayAddr, sessionID string) error {
	if s.SyncClient != nil {
		s.SyncClient.Close()
	}

	key := crypto.DeriveKey(passphrase, nil)
	s.AccessKey = passphrase
	s.SessionID = sessionID

	client, err := sync.NewSyncClient(relayAddr, key, sessionID, func(sid string, data []byte) error {
		return s.Manager.HandleRemoteCommand(sid, data)
	})
	if err != nil {
		return fmt.Errorf("failed to connect to relay: %w", err)
	}
	s.SyncClient = client
	go s.SyncClient.Start()

	return nil
}

// StartDirectServer 模式：启动本地服务器供直接连接
func (s *AgentService) StartDirectServer(passphrase, port, sessionID string, webDir string) error {
	if s.SyncClient != nil {
		s.SyncClient.Close()
	}

	key := crypto.DeriveKey(passphrase, nil)
	s.AccessKey = passphrase
	s.SessionID = sessionID

	// 创建 DirectClient (它是 WebSocket Handler)
	s.SyncClient = sync.NewDirectClient(key, func(sid string, data []byte) error {
		return s.Manager.HandleRemoteCommand(sid, data)
	})

	// 注册路由
	mux := http.NewServeMux()
	mux.Handle("/sync", s.SyncClient) // WebSocket 接口

	// 配置接口 (供前端自动填单)
	mux.HandleFunc("/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"sid":"%s", "key":"%s", "mode":"direct"}`, sessionID, passphrase)
	})

	// 静态资源接口 (内置前端)
	if webDir != "" {
		mux.Handle("/", http.FileServer(http.Dir(webDir)))
		log.Printf("Serving built-in Web UI from: %s", webDir)
	}

	serverAddr := ":" + port
	log.Printf("--------------------------------------------------")
	log.Printf("🚀 远程控制台已就绪: http://localhost:%s/index.html", port)
	log.Printf("🔑 访问校验私钥: %s", passphrase)
	log.Printf("--------------------------------------------------")

	go func() {
		if err := http.ListenAndServe(serverAddr, mux); err != nil {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	return nil
}

func (s *AgentService) StartAgent(agentCmd string) error {
	if s.SyncClient == nil {
		return fmt.Errorf("sync client not initialized")
	}

	sess, err := s.Manager.StartSession(s.SessionID, agentCmd)
	if err != nil {
		return err
	}

	s.SyncClient.SyncOutput(sess.ID, sess.Stdout)
	log.Printf("Agent %s started (Session: %s)", agentCmd, s.SessionID)
	return nil
}
