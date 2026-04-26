# Remote Relay

Note All 远程中继服务器是 `remote_agent` 的中间件，用于在复杂的网络环境（如 NAT 后面）下建立控制端与代理端之间的连接。它充当一个加密流量的盲转发器，确保数据能够穿透局域网。

## 主要特性

- **盲转发**：中继服务器仅根据 `SessionID` 进行流量转发，不参与解密，确保端到端安全。
- **多会话支持**：支持多个代理端和控制端同时通过同一中继服务器进行通信。
- **轻量级**：基于 Go 原生 HTTP 和 Gorilla WebSocket，高性能、低消耗。
- **自持状态页面**：提供中继状态的可视化查看功能（可选）。

## 运行中继服务器

### 1. 编译
```bash
go build -o remote_relay.exe ./cmd
```

### 2. 启动
```bash
./remote_relay.exe -port 3366
```

启动后会监听两个接口：
- `ws://host:port/sync?sid=xxx`：WebSocket 同步接口。
- `http://host:port/index.html`：内置的中继控制台页面。

## 工作原理

1. **注册**：代理端（Agent）连接到中继，携带 `SessionID`。
2. **接入**：控制端（Browser）连接到相同的 `SessionID`。
3. **转发**：中继服务器将来自 Agent 的消息广播给该 `SessionID` 下的所有 Client，反之亦然。
4. **加密**：中继服务器对传输的 `data` 负载不可见，因为数据在 Agent 和 Browser 之间已经过 AES-GCM 加密。

---
*Powered by Note All Team*
