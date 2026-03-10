const DEFAULT_API_URL = "http://localhost:8080/api/note/text";

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
  const settings = await chrome.storage.local.get(["apiUrl"]);
  apiUrlInput.value = settings.apiUrl || DEFAULT_API_URL;

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
    const newApiUrl = apiUrlInput.value.trim();
    if (newApiUrl) {
      await chrome.storage.local.set({ apiUrl: newApiUrl });
      showStatus("设置已保存", "success");
      setTimeout(() => {
        settingsView.style.display = "none";
        mainView.style.display = "block";
      }, 500);
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

    const currentSettings = await chrome.storage.local.get(["apiUrl"]);
    const targetUrl = currentSettings.apiUrl || DEFAULT_API_URL;

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
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
