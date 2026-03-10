const DEFAULT_API_URL = "http://localhost:8080/api/note/text";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "note-all-clip",
    title: "发送到 Note All",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "note-all-clip") {
    try {
      // 1. Inject Turndown library and GFM plugin into the page
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'turndown-plugin-gfm.js']
      });

      // 2. Execute a function to grab HTML and convert to Markdown
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const container = document.createElement("div");
            for (let i = 0; i < selection.rangeCount; i++) {
              container.appendChild(selection.getRangeAt(i).cloneContents());
            }

            // Deal with relative URLs (convert them to absolute)
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

            // Convert using TurndownService (should be global now)
            if (window.TurndownService) {
              const turndownService = new window.TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced'
              });

              // Add Github Flavored Markdown (tables, checklists, strikethrough)
              if (window.turndownPluginGfm) {
                turndownService.use(window.turndownPluginGfm.gfm);
              }

              // Strip unnecessary unseen elements
              turndownService.remove(['script', 'noscript', 'style', 'iframe', 'canvas', 'video', 'audio']);

              return turndownService.turndown(container.innerHTML);
            }
          }
          return null; // Fallback will be triggered
        }
      });

      let markdown = results && results[0] ? results[0].result : null;

      // 3. Fallback to info.selectionText if Turndown fails or gives nothing
      if (!markdown && info.selectionText) {
        markdown = info.selectionText;
      }

      // 4. Send to Note All
      if (markdown) {
        clipToNoteAll(markdown);
      }
    } catch (err) {
      console.error("Script injection failed. Fallback to plain text.", err);
      // Fallback: If we couldn't inject script (e.g., chrome:// pages or no permission)
      if (info.selectionText) {
        clipToNoteAll(info.selectionText);
      }
    }
  }
});

async function clipToNoteAll(text) {
  const settings = await chrome.storage.local.get(["apiUrl"]);
  const apiUrl = settings.apiUrl || DEFAULT_API_URL;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: text })
    });

    if (response.ok) {
      console.log("Clip successful");
      // Optional: Show notification
      chrome.action.setBadgeText({ text: "OK" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
    } else {
      console.error("Clip failed:", await response.text());
      chrome.action.setBadgeText({ text: "ERR" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
    }
  } catch (error) {
    console.error("Request Error:", error);
    chrome.action.setBadgeText({ text: "FAIL" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
  }
}
