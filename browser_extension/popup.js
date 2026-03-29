const DEFAULT_SERVER_URL = "http://localhost:3344";

document.addEventListener("DOMContentLoaded", async () => {
  const noteContent = document.getElementById("note-content");
  const saveNoteBtn = document.getElementById("save-note");
  const showSettingsBtn = document.getElementById("show-settings");
  const backToMainBtn = document.getElementById("back-to-main");
  const saveSettingsBtn = document.getElementById("save-settings");
  const mainView = document.getElementById("main-view");
  const settingsView = document.getElementById("settings-view");
  const apiUrlInput = document.getElementById("api-url");
  const statusMsg = document.getElementById("status-msg");

  // Load Saved Settings
  const settings = await chrome.storage.local.get(["serverUrl", "apiToken", "rawPassword"]);
  const serverUrlInput = document.getElementById("server-url");
  serverUrlInput.value = settings.serverUrl || DEFAULT_SERVER_URL;
  document.getElementById("api-token").value = settings.rawPassword || "";

  // Try to get selected text from current tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabs[0].id },
        func: () => window.getSelection().toString()
      },
      (results) => {
        if (results && results[0] && results[0].result) {
          noteContent.value = results[0].result;
        }
      }
    );
  });

  // Switch to Settings
  showSettingsBtn.addEventListener("click", () => {
    mainView.style.display = "none";
    settingsView.style.display = "block";
  });

  // Back to Main
  backToMainBtn.addEventListener("click", () => {
    settingsView.style.display = "none";
    mainView.style.display = "block";
  });

  // Save Settings
  saveSettingsBtn.addEventListener("click", async () => {
    let newServerUrl = serverUrlInput.value.trim();
    if (newServerUrl.endsWith("/")) {
      newServerUrl = newServerUrl.slice(0, -1);
    }
    const pwd = document.getElementById("api-token").value.trim();
    
    // JWT 升级：保存设置时先进行 Login 换取 Token
    saveSettingsBtn.disabled = true;
    saveSettingsBtn.textContent = "正在验证...";
    
    try {
      const resp = await fetch(`${newServerUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });

      if (!resp.ok) {
        throw new Error("密码错误或服务器无法连接");
      }

      const data = await resp.json();
      if (!data.token) {
        throw new Error("服务器未返回有效 Token");
      }

      await chrome.storage.local.set({ 
        serverUrl: newServerUrl,
        apiToken: data.token, // 此时保存的是 JWT
        rawPassword: pwd     // 保存原始密码以便后续刷新或显示（选做，这里为了回填显示）
      });
      
      showStatus("设置已保存并登录成功", "success");
      setTimeout(() => {
        settingsView.style.display = "none";
        mainView.style.display = "block";
      }, 800);
    } catch (err) {
      showStatus(`❌ ${err.message}`, "error");
    } finally {
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.textContent = "保存设置";
    }
  });

  // Save Note
  saveNoteBtn.addEventListener("click", async () => {
    const text = noteContent.value.trim();
    if (!text) {
      showStatus("内容不能为空", "error");
      return;
    }

    saveNoteBtn.disabled = true;
    saveNoteBtn.textContent = "发送中...";

    const currentSettings = await chrome.storage.local.get(["serverUrl", "apiToken"]);
    const serverUrl = currentSettings.serverUrl || DEFAULT_SERVER_URL;
    const targetUrl = `${serverUrl}/api/note/text`;
    const token = currentSettings.apiToken || "";

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ text: text })
      });

      if (response.ok) {
        showStatus("✅ 录入成功！", "success");
        noteContent.value = "";
      } else {
        const errorData = await response.json();
        showStatus(`❌ 失败: ${errorData.error || "未知原因"}`, "error");
      }
    } catch (err) {
      showStatus("❌ 无法连接到后端服务器", "error");
    } finally {
      saveNoteBtn.disabled = false;
      saveNoteBtn.textContent = "保存笔记";
    }
  });

  function showStatus(msg, type) {
    statusMsg.textContent = msg;
    statusMsg.className = `status status-${type}`;
    setTimeout(() => {
      statusMsg.textContent = "";
      statusMsg.className = "status";
    }, 3000);
  }
});
