const DEFAULT_SERVER_URL = "http://localhost:3344";

// ========== 获取当前激活URL ==========

async function getActiveUrl() {
  const storage = await chrome.storage.local.get([
    'serverUrl', 'activeUrl', 'speedTestExpiry'
  ]);

  // 检查缓存是否过期
  if (storage.speedTestExpiry && Date.now() >= storage.speedTestExpiry) {
    console.log('Note All: Speed test cache expired');
    // 返回serverUrl作为fallback，但不触发自动测速（由popup处理）
    return storage.serverUrl || DEFAULT_SERVER_URL;
  }

  // 使用activeUrl或serverUrl
  return storage.activeUrl || storage.serverUrl || DEFAULT_SERVER_URL;
}

// ========== 扩展原有功能 ==========

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "note-all-clip",
    title: "发送到 Note All",
    contexts: ["selection", "image"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "note-all-clip") {
    // 场景 A: 右键点击的是图片
    if (info.mediaType === "image" && info.srcUrl) {
      console.log("Clipping image from frontend:", info.srcUrl);
      clipImageFromFrontend(info.srcUrl);
      return;
    }

    // 场景 B: 右键点击的是选中文本
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'turndown-plugin-gfm.js']
      });

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const container = document.createElement("div");
            for (let i = 0; i < selection.rangeCount; i++) {
              container.appendChild(selection.getRangeAt(i).cloneContents());
            }

            const baseUrl = window.location.href;
            container.querySelectorAll('a').forEach(a => {
              const href = a.getAttribute('href');
              if (href) {
                try { a.href = new URL(href, baseUrl).href; } catch(e){}
              }
            });
            container.querySelectorAll('img').forEach(img => {
              const src = img.getAttribute('src');
              if (src) {
                try { img.src = new URL(src, baseUrl).href; } catch(e){}
              }
            });

            if (window.TurndownService) {
              const turndownService = new window.TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced'
              });

              if (window.turndownPluginGfm) {
                turndownService.use(window.turndownPluginGfm.gfm);
              }

              turndownService.remove(['script', 'noscript', 'style', 'iframe', 'canvas', 'video', 'audio']);

              return turndownService.turndown(container.innerHTML);
            }
          }
          return null;
        }
      });

      let markdown = results && results[0] ? results[0].result : null;

      if (!markdown && info.selectionText) {
        markdown = info.selectionText;
      }

      if (markdown) {
        const footer = `\n\n---\n来源: [${tab.title || '无标题'}](${tab.url})`;
        markdown += footer;
        clipToNoteAll(markdown, "text");
      }
    } catch (err) {
      console.error("Script injection failed. Fallback to plain text.", err);
      if (info.selectionText) {
        const footer = `\n\n---\n来源: [${tab.title || '无标题'}](${tab.url})`;
        clipToNoteAll(info.selectionText + footer, "text");
      }
    }
  }
});

async function clipImageFromFrontend(srcUrl) {
  try {
    const serverUrl = await getActiveUrl();
    const result = await chrome.storage.local.get(["apiToken"]);
    const apiUrl = `${serverUrl}/api/upload`;
    const token = result.apiToken || "";

    const imageResp = await fetch(srcUrl);
    const blob = await imageResp.blob();

    let filename = "web_image.jpg";
    try {
      const urlObj = new URL(srcUrl);
      const pathParts = urlObj.pathname.split('/');
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart && lastPart.includes('.')) {
        filename = lastPart;
      }
    } catch(e) {}

    const formData = new FormData();
    formData.append("file", blob, filename);

    const headers = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: headers,
      body: formData
    });

    if (response.ok) {
      console.log("Image clip successful");
      chrome.action.setBadgeText({ text: "OK" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
    } else {
      throw new Error(await response.text());
    }
  } catch (error) {
    console.error("Image Clip Error:", error);
    chrome.action.setBadgeText({ text: "FAIL" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Note All: Received message', message);

  if (message.action === 'clipText') {
    const footer = `\n\n---\n来源: [${message.title || '无标题'}](${message.url})`;
    const contentWithFooter = message.content + footer;

    clipToNoteAll(contentWithFooter, "text").then(success => {
      sendResponse({ status: success ? 'success' : 'error' });
    });
    return true;
  }

  if (message.action === 'getActiveUrl') {
    getActiveUrl().then(url => {
      sendResponse({ activeUrl: url });
    });
    return true;
  }
});

async function clipToNoteAll(content, type = "text") {
  const serverUrl = await getActiveUrl();
  const result = await chrome.storage.local.get(["apiToken"]);
  const apiUrl = `${serverUrl}/api/note/text`;
  const token = result.apiToken || "";

  console.log('Note All: Sending data to API', apiUrl);
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ text: content })
    });

    if (response.ok) {
      console.log("Note All: Clip successful");
      chrome.action.setBadgeText({ text: "OK" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
      return true;
    } else {
      const errorText = await response.text();
      console.error("Note All: Clip failed with status:", response.status, errorText);
      chrome.action.setBadgeText({ text: "ERR" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
      return false;
    }
  } catch (error) {
    console.error("Note All: Request Error:", error);
    chrome.action.setBadgeText({ text: "FAIL" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
    return false;
  }
}