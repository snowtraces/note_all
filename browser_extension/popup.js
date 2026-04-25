const DEFAULT_SERVER_URL = "http://localhost:3344";
const SPEED_TEST_TIMEOUT = 5000;

document.addEventListener("DOMContentLoaded", async () => {
  const noteContent = document.getElementById("note-content");
  const saveNoteBtn = document.getElementById("save-note");
  const showSettingsBtn = document.getElementById("show-settings");
  const backToMainBtn = document.getElementById("back-to-main");
  const saveSettingsBtn = document.getElementById("save-settings");
  const mainView = document.getElementById("main-view");
  const settingsView = document.getElementById("settings-view");
  const statusMsg = document.getElementById("status-msg");
  const serverUrlInput = document.getElementById("server-url");
  const runSpeedTestBtn = document.getElementById("run-speed-test");
  const speedResultsDiv = document.getElementById("speed-results");
  const activeUrlDisplay = document.getElementById("active-url-display");

  // 加载保存的设置
  const settings = await chrome.storage.local.get([
    "serverUrl", "apiToken", "rawPassword", "activeUrl", "speedTestResults"
  ]);

  serverUrlInput.value = settings.serverUrl || DEFAULT_SERVER_URL;
  document.getElementById("api-token").value = settings.rawPassword || "";
  updateActiveUrlDisplay(settings.activeUrl || settings.serverUrl);
  renderSpeedResults(settings.speedTestResults || [], settings.activeUrl);

  // 更新当前激活地址显示
  function updateActiveUrlDisplay(url) {
    activeUrlDisplay.textContent = `当前使用: ${url || "未设置"}`;
  }

  // 渲染测速结果
  function renderSpeedResults(results, activeUrl) {
    speedResultsDiv.innerHTML = "";
    if (!results || results.length === 0) {
      const p = document.createElement("p");
      p.style.color = "var(--secondary-text)";
      p.style.fontSize = "12px";
      p.textContent = "暂无测速数据";
      speedResultsDiv.appendChild(p);
      return;
    }

    results.forEach(r => {
      const item = document.createElement("div");
      const isActive = r.url === activeUrl;
      const statusClass = r.success ? (isActive ? "active" : "") : "failed";
      item.className = `speed-result-item ${statusClass}`;

      const urlSpan = document.createElement("span");
      urlSpan.textContent = r.url;

      const latencySpan = document.createElement("span");
      const latencyText = r.success ? `${r.latency}ms` : "失败";
      latencySpan.textContent = isActive ? `${latencyText} ✓` : latencyText;

      item.appendChild(urlSpan);
      item.appendChild(latencySpan);
      speedResultsDiv.appendChild(item);
    });
  }

  // 测速单个URL
  async function measureUrlSpeed(url) {
    const startTime = Date.now();
    try {
      const response = await fetch(`${url}/ping`, {
        method: 'GET',
        signal: AbortSignal.timeout(SPEED_TEST_TIMEOUT)
      });
      const latency = Date.now() - startTime;
      return { url, latency, success: response.ok };
    } catch {
      return { url, latency: -1, success: false };
    }
  }

  // 并发测速并选择最快
  async function selectFastestUrl(urls) {
    const results = await Promise.all(urls.map(measureUrlSpeed));
    const successResults = results.filter(r => r.success).sort((a, b) => a.latency - b.latency);
    const activeUrl = successResults.length > 0 ? successResults[0].url : urls[0];
    return { activeUrl, results };
  }

  // 从服务器获取候选地址并测速
  async function fetchAddressesAndTest(serverUrl) {
    speedResultsDiv.innerHTML = "";
    const loadingP = document.createElement("p");
    loadingP.style.color = "var(--secondary-text)";
    loadingP.style.fontSize = "12px";
    loadingP.textContent = "正在获取地址列表...";
    speedResultsDiv.appendChild(loadingP);

    try {
      // 获取候选地址列表
      const resp = await fetch(`${serverUrl}/api/server/addresses`, {
        method: 'GET',
        signal: AbortSignal.timeout(SPEED_TEST_TIMEOUT)
      });

      if (!resp.ok) {
        throw new Error("无法获取地址列表");
      }

      const data = await resp.json();
      const addresses = data.addresses || [];

      if (addresses.length === 0) {
        throw new Error("服务器未返回地址");
      }

      // 并发测速
      loadingP.textContent = "正在测速...";
      const { activeUrl, results } = await selectFastestUrl(addresses);

      // 缓存结果
      await chrome.storage.local.set({
        serverUrl,
        activeUrl,
        speedTestResults: results,
        speedTestExpiry: Date.now() + 12 * 60 * 60 * 1000
      });

      renderSpeedResults(results, activeUrl);
      updateActiveUrlDisplay(activeUrl);

      return { activeUrl, results };
    } catch (err) {
      speedResultsDiv.innerHTML = "";
      const p = document.createElement("p");
      p.style.color = "#ef4444";
      p.style.fontSize = "12px";
      p.textContent = err.message;
      speedResultsDiv.appendChild(p);
      return null;
    }
  }

  // 立即测速按钮
  runSpeedTestBtn.addEventListener("click", async () => {
    runSpeedTestBtn.disabled = true;
    runSpeedTestBtn.textContent = "测速中...";

    const serverUrl = serverUrlInput.value.trim().replace(/\/$/, "");
    await fetchAddressesAndTest(serverUrl);

    runSpeedTestBtn.disabled = false;
    runSpeedTestBtn.textContent = "🔄 重新测速";
  });

  // 尝试获取当前标签页的选中文本
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

  // 切换到设置
  showSettingsBtn.addEventListener("click", async () => {
    mainView.style.display = "none";
    settingsView.style.display = "block";

    // 刷新测速状态
    const currentSettings = await chrome.storage.local.get(["activeUrl", "speedTestResults"]);
    updateActiveUrlDisplay(currentSettings.activeUrl);
    renderSpeedResults(currentSettings.speedTestResults || [], currentSettings.activeUrl);
  });

  // 返回主界面
  backToMainBtn.addEventListener("click", () => {
    settingsView.style.display = "none";
    mainView.style.display = "block";
  });

  // 保存设置
  saveSettingsBtn.addEventListener("click", async () => {
    let serverUrl = serverUrlInput.value.trim();
    if (serverUrl.endsWith("/")) {
      serverUrl = serverUrl.slice(0, -1);
    }
    if (!serverUrl) {
      showStatus("请输入服务器地址", "error");
      return;
    }

    const pwd = document.getElementById("api-token").value.trim();

    saveSettingsBtn.disabled = true;
    saveSettingsBtn.textContent = "正在验证...";

    try {
      // 验证密码
      const resp = await fetch(`${serverUrl}/api/auth/login`, {
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

      // 保存基础设置
      await chrome.storage.local.set({
        serverUrl,
        apiToken: data.token,
        rawPassword: pwd
      });

      // 获取候选地址并测速
      const testResult = await fetchAddressesAndTest(serverUrl);
      if (!testResult) {
        showStatus("地址验证成功，但测速失败", "error");
      } else {
        showStatus("设置已保存，已选择最优地址", "success");
        setTimeout(() => {
          settingsView.style.display = "none";
          mainView.style.display = "block";
        }, 800);
      }
    } catch (err) {
      showStatus(`❌ ${err.message}`, "error");
    } finally {
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.textContent = "保存设置";
    }
  });

  // 保存笔记
  saveNoteBtn.addEventListener("click", async () => {
    const text = noteContent.value.trim();
    if (!text) {
      showStatus("内容不能为空", "error");
      return;
    }

    saveNoteBtn.disabled = true;
    saveNoteBtn.textContent = "发送中...";

    const currentSettings = await chrome.storage.local.get(["activeUrl", "serverUrl", "apiToken"]);
    const serverUrl = currentSettings.activeUrl || currentSettings.serverUrl || DEFAULT_SERVER_URL;
    const token = currentSettings.apiToken || "";

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${serverUrl}/api/note/text`, {
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