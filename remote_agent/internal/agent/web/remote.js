/**
 * 基于 xterm.js 的远程终端逻辑 (防重加固版)
 */
const App = {
    ws: null,
    key: null,
    sid: null,
    term: null,
    isInitialized: false,
    resizeTimer: null,

    async init() {
        // 自动填写当前 Host
        document.getElementById('relay-host').value = window.location.host;

        // 1. 优先尝试从 URL 参数获取 (扫码连接)
        const urlParams = new URLSearchParams(window.location.search);
        const urlSid = urlParams.get('sid');
        const urlKey = urlParams.get('key');

        if (urlSid && urlKey) {
            document.getElementById('session-id').value = urlSid;
            document.getElementById('access-key').value = urlKey;
            console.log("Auto-filled from URL parameters");
            // 如果参数齐全，可以尝试自动点击连接
            setTimeout(() => this.connect(), 500); 
            return;
        }

        // 2. 否则尝试从配置接口获取
        try {
            const resp = await fetch('/config');
            if (resp.ok) {
                const cfg = await resp.json();
                document.getElementById('session-id').value = cfg.sid;
                document.getElementById('access-key').value = cfg.key;
            }
        } catch (e) {}
    },

    initTerminal() {
        if (this.isInitialized) return;

        this.term = new Terminal({
            theme: {
                background: '#0a0b0d',
                foreground: '#c9d1d9',
                cursor: '#58a6ff'
            },
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 14,
            cursorBlink: true
        });
        this.term.open(document.getElementById('terminal-container'));
        
        // 只有第一次初始化时绑定监听器
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => this.fitTerminal(), 100);
        });

        this.term.onData(data => {
            this.sendEncrypted(data, 'input');
        });

        this.isInitialized = true;
    },

    async connect() {
        let host = document.getElementById('relay-host').value;
        const sid = document.getElementById('session-id').value;
        const pass = document.getElementById('access-key').value;

        if (!host) {
            // 直连模式下，默认使用当前页面所在的 host:port
            host = window.location.host;
            document.getElementById('relay-host').value = host;
        }

        if (!sid || !pass) return alert("请填写完整信息");

        try {
            this.key = await AgentCrypto.deriveKey(pass);
            this.sid = sid;

            const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
            this.ws = new WebSocket(`${protocol}://${host}/sync?sid=${sid}`);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                // 先显示界面，再初始化终端，确保尺寸计算正确
                document.getElementById('setup-screen').style.display = 'none';
                document.getElementById('terminal-screen').style.display = 'flex';
                document.getElementById('header-sid').innerText = `Session: ${sid}`;
                
                this.initTerminal();
                // 延迟一瞬等待 Flex 布局生效
                setTimeout(() => this.fitTerminal(), 50);
                
                this.term.writeln("\x1b[1;32m[SYSTEM] 指令通道已加密连接\x1b[m");
            };

            this.ws.onmessage = async (evt) => {
                await this.handlePacket(evt.data);
            };

            this.ws.onclose = () => {
                this.term.writeln("\x1b[1;31m[SYSTEM] 链路中断\x1b[m");
            };

        } catch (e) {
            alert("接入失败: " + e.message);
        }
    },

    fitTerminal() {
        if (!this.term) return;
        const charWidth = 9.2; 
        const charHeight = 17;
        const container = document.getElementById('terminal-container');
        
        // 如果容器还没撑开，不执行 resize
        if (container.clientWidth < 100) return;

        const cols = Math.floor((container.clientWidth - 30) / charWidth);
        const rows = Math.floor((container.clientHeight - 20) / charHeight);

        console.log(`Resizing to: ${cols}x${rows}`);
        this.term.resize(cols, rows);
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendEncrypted(JSON.stringify({ cols, rows }), 'resize');
        }
    },

    async handlePacket(data) {
        try {
            let text = typeof data === 'string' ? data : new TextDecoder().decode(data);
            const jsonObjects = text.split(/}\s*{/).map((part, i, arr) => {
                if (arr.length === 1) return part;
                if (i === 0) return part + '}';
                if (i === arr.length - 1) return '{' + part;
                return '{' + part + '}';
            });

            for (const jsonStr of jsonObjects) {
                try {
                    const wrapper = JSON.parse(jsonStr);
                    if (!wrapper.data) continue;
                    const encryptedBytes = Uint8Array.from(atob(wrapper.data), c => c.charCodeAt(0));
                    const decryptedJson = await AgentCrypto.decrypt(encryptedBytes, this.key);
                    const event = JSON.parse(decryptedJson);
                    this.processAgentEvent(event);
                } catch (e) {}
            }
        } catch (e) {}
    },

    processAgentEvent(evt) {
        if (evt.type === 'terminal') {
            this.term.write(evt.content);
        } else if (evt.type === 'permission_request') {
            this.showPermissionModal(evt.content);
        }
    },

    showPermissionModal(desc) {
        document.getElementById('permission-desc').innerText = desc;
        document.getElementById('permission-modal').style.display = 'block';
    },

    async replyPermission(allowed) {
        const cmd = allowed ? "y\n" : "n\n";
        document.getElementById('permission-modal').style.display = 'none';
        await this.sendEncrypted(cmd, 'input');
    },

    async sendEncrypted(text, type = 'input') {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const payload = JSON.stringify({ type, data: text });
        const encrypted = await AgentCrypto.encrypt(payload, this.key);
        const base64 = btoa(String.fromCharCode(...encrypted));
        this.ws.send(JSON.stringify({ sid: this.sid, data: base64 }));
    }
};
