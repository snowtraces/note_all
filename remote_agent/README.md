# Remote Agent

Note All 远程代理是一个轻量级的终端管理工具，支持通过 Web 控制台远程控制计算机终端，支持直连和中继两种模式，并提供全链路端到端加密（E2EE）。

## 主要特性

- **双模式支持**：
  - **直连模式 (Direct)**：在局域网内直接访问代理端启动的 Web 服务。
  - **中继模式 (Relay)**：通过外网中继服务器跨越 NAT 进行远程控制。
- **全链路加密**：基于 AES-GCM 的端到端加密，中继服务器无法解密通信内容。
- **内置 Web UI**：代理自持静态页面，无需额外安装控制端。
- **权限管控**：支持针对敏感操作（如执行外部脚本）的二次确认交互。

## 快速开始

### 1. 编译
确保安装了 Go 1.25+ 环境：
```bash
go build -o remote_agent.exe ./cmd/agent
```

### 2. 运行

#### 直连模式 (默认)
在目标机器上启动：
```bash
./remote_agent.exe -mode direct -port 3355
```
启动后会输出：
- 🔑 **校验私钥**：用于解密指令的密钥。
- 🔗 **访问链接**：直接在浏览器打开该链接即可进入控制台。
- 📱 **二维码**：支持手机扫码快速连接。

#### 中继模式
如果你需要通过外网访问，可以连接到中继服务器（需先启动 `remote_relay`）：
```bash
./remote_agent.exe -mode relay -relay your-relay-ip:3366 -sid my-secret-session
```

### 3. 参数说明

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `-mode` | 运行模式: `direct` 或 `relay` | `direct` |
| `-port` | 直连模式下的本地服务端口 | `3355` |
| `-relay` | 中继服务器地址 (仅 relay 模式) | `localhost:3366` |
| `-sid` | 会话 ID，用于在多会话中标识 | `demo-session-001` |
| `-key` | 访问密钥，用于派生加密 Key | `happy-note-all-123` |
| `-cmd` | 要启动的终端命令 | `claude.exe` |

## 安全说明

本项目采用端到端加密设计：
1. 密钥派生：由 `-key` 参数通过 PBKDF2 算法加上盐值派生出 32 字节 AES 密钥。
2. 数据加密：所有指令（Input）和输出（Output）在发出前均由 AES-GCM 算法加密。
3. 身份验证：只有持有相同 Key 的控制端才能解密流量。即便流量被捕获或通过第三方中继，内容也是不可读的。

---
*Powered by Note All Team*
