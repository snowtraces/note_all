(function() {
  console.log('Note All: Content script loaded and initializing...');
  window.__NOTE_ALL_LOADED__ = true;
  
  let isShiftDown = false;
  let currentHighlightedElement = null;
  let overlay = null;
  let sendButton = null;

  // Initialize UI elements in a shadow root to avoid CSS conflicts
  const container = document.createElement('div');
  container.id = 'note-all-clipper-container';
  container.style.position = 'absolute';
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '2147483647';
  
  const shadowRoot = container.attachShadow({mode: 'open'});

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    #note-all-clipper-container {
      pointer-events: none !important;
    }
    .highlight-box {
      position: fixed;
      pointer-events: none;
      border: 2px solid #4a90e2;
      background-color: rgba(74, 144, 226, 0.1);
      border-radius: 4px;
      z-index: 2147483646;
      transition: all 0.1s ease-out;
      box-sizing: border-box;
    }
    .send-button {
      position: fixed;
      pointer-events: auto;
      background: #4a90e2;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      cursor: pointer;
      z-index: 2147483647;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: none;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      user-select: none;
    }
    .send-button:hover {
      background: #357abd;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(0,0,0,0.2);
    }
    .send-button:active {
      transform: translateY(0);
    }
    .send-button.success {
      background: #28a745;
    }
    svg {
      flex-shrink: 0;
    }
  `;
  shadowRoot.appendChild(style);

  overlay = document.createElement('div');
  overlay.className = 'highlight-box';
  overlay.style.display = 'none';
  shadowRoot.appendChild(overlay);

  sendButton = document.createElement('button');
  sendButton.className = 'send-button';
  const buttonContent = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
      <polyline points="17 21 17 13 7 13 7 21"></polyline>
      <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
    <span>Send to Note All</span>
  `;
  sendButton.innerHTML = buttonContent;
  shadowRoot.appendChild(sendButton);

  document.documentElement.appendChild(container);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') {
      isShiftDown = true;
      console.log('Note All: Shift Down');
    }
  }, { capture: true, passive: true });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      isShiftDown = false;
      console.log('Note All: Shift Up');
    }
  }, { capture: true, passive: true });

  window.addEventListener('mousemove', (e) => {
    if (!isShiftDown) return;

    // Get element at mouse position
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    let element = null;
    
    // Find the first element that is not our container
    for (const el of elements) {
      if (el !== container && !container.contains(el)) {
        element = el;
        break;
      }
    }

    if (element && element !== currentHighlightedElement) {
      if (element === document.body || element === document.documentElement) return;
      
      console.log('Note All: Hovering element', element);
      currentHighlightedElement = element;
      updateUI(element);
    }
  }, { passive: true });

  function updateUI(element) {
    const rect = element.getBoundingClientRect();
    
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.display = 'block';

    // Position button near the top-right of the element, or top-left if it's too close to the edge
    let btnTop = rect.top - 45;
    let btnLeft = rect.right - 140;

    if (btnTop < 10) btnTop = rect.bottom + 10;
    if (btnLeft < 10) btnLeft = rect.left;
    if (btnLeft + 150 > window.innerWidth) btnLeft = window.innerWidth - 160;

    sendButton.style.top = `${btnTop}px`;
    sendButton.style.left = `${btnLeft}px`;
    sendButton.style.display = 'flex';
  }

  function convertToMarkdown(element) {
    if (!window.TurndownService) {
      console.error('Note All: TurndownService not found');
      return element.innerText;
    }

    const turndownService = new window.TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-'
    });

    // 1. 链接与图片：确保绝对路径，并清理冗余空白；特殊处理 emoji 图片
    turndownService.addRule('linksAndImages', {
      filter: ['a', 'img'],
      replacement: function (content, node) {
        if (node.nodeName === 'A') {
          const href = node.href || node.getAttribute('href');
          if (!href) return content;
          return `[${content.trim()}](${href})`;
        } else if (node.nodeName === 'IMG') {
          const src = node.src || node.getAttribute('src');
          let alt = node.getAttribute('alt') || '';
          if (src && src.includes('/emoji/')) {
            // 如果是 emoji 的图片，则不要按照 markdown 的图片渲染，容易使页面拉长
            // 直接返回原生的 alt 名称（即 emoji 本身），没 alt 就不显示
            return alt;
          }
          return src ? `![${alt}](${src})` : '';
        }
        return content;
      }
    });

    // 2. 换行保留：将 <br> 转换为 Markdown 硬换行（两个空格+换行）
    turndownService.addRule('break', {
      filter: 'br',
      replacement: function () {
        return '  \n';
      }
    });

    // 3. 将 role="link" 的 div 转换为引用块
    turndownService.addRule('roleLinkBlockquote', {
      filter: function (node) {
        return node.nodeName === 'DIV' && node.getAttribute('role') === 'link';
      },
      replacement: function (content) {
        content = content.replace(/^\n+|\n+$/g, '');
        if (!content) return '';
        // 处理正常的换行，以及我们提前注入的换行标记
        content = content.replace(/^/gm, '> ');
        content = content.replace(/---NOTEBR---(?!$)/g, '---NOTEBR---> ');
        return '\n\n' + content + '\n\n';
      }
    });

    // 4. 核心机制：使用标记策略保留 pre-wrap 中的文本换行
    // 这种方法可以绕过 Turndown 内部对文本节点空白符的强制压缩
    const BR_MARKER = '---NOTEBR---';
    const clone = element.cloneNode(true);
    
    const processPreWrap = (orig, cln) => {
      if (orig.nodeType === 1) { // Element
        const style = window.getComputedStyle(orig);
        const isPre = style && (style.whiteSpace.includes('pre') || style.whiteSpace.includes('break-spaces'));
        
        for (let i = 0; i < orig.childNodes.length; i++) {
          const oChild = orig.childNodes[i];
          const cChild = cln.childNodes[i];
          if (!cChild) continue;

          if (oChild.nodeType === 3 && isPre) { // Text node in pre-wrap
            cChild.nodeValue = cChild.nodeValue.replace(/\n/g, BR_MARKER);
          } else if (oChild.nodeType === 1) {
            processPreWrap(oChild, cChild);
          }
        }
      }
    };
    
    // 执行标记预处理
    processPreWrap(element, clone);

    turndownService.remove(['script', 'noscript', 'style', 'iframe', 'canvas', 'video', 'audio', 'button', 'svg']);

    if (window.turndownPluginGfm) {
      turndownService.use(window.turndownPluginGfm.gfm);
    }

    // 5. 执行转换并还原标记
    let markdown = turndownService.turndown(clone);
    // 将标记替换为 Markdown 硬换行
    markdown = markdown.replace(new RegExp(BR_MARKER, 'g'), '  \n');

    // 6. 修复转义不一致问题
    // Turndown 会转义文本开头的特殊字符（如 - 变成 \-），但由于我们用了 BR_MARKER，
    // 只有文本真正的开头被转义了，后续行因未被识别为“开头”而没有转义。
    // 我们在此统一还原这些转义，使摘录内容保持原始的视觉样式。
    return markdown.replace(/\\([-\*\+\#\>\!])/g, '$1');
  }

  sendButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (currentHighlightedElement) {
      console.log("Note All: Starting conversion for", currentHighlightedElement);
      const markdown = convertToMarkdown(currentHighlightedElement);
      
      chrome.runtime.sendMessage({
        action: 'clipText',
        content: markdown,
        url: window.location.href,
        title: document.title
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Note All: Error sending message:", chrome.runtime.lastError);
          sendButton.innerHTML = `<span>Error!</span>`;
          setTimeout(resetUI, 2000);
          return;
        }
        
        if (response && response.status === 'success') {
          // Success Feedback
          sendButton.classList.add('success');
          sendButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Saved!</span>
          `;
        } else {
          sendButton.innerHTML = `<span>Failed!</span>`;
        }
        
        setTimeout(() => {
          resetUI();
        }, 1500);
      });
    }
  });

  // Reset if pressing Escape or clicking elsewhere
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      resetUI();
    }
  });

  window.addEventListener('mousedown', (e) => {
    // If we click on something that isn't the send button or the container, reset
    // We use composedPath() to check if the click target is inside our shadow DOM
    const isInsideClick = e.composedPath().includes(container);
    
    if (!isInsideClick && e.target !== currentHighlightedElement) {
       // Only reset if we are NOT in shift-mode
       if (!isShiftDown) {
           console.log('Note All: Resetting UI due to outside click');
           resetUI();
       }
    }
  });

  // Handle window focus loss to prevent stuck Shift key state
  window.addEventListener('blur', () => {
    isShiftDown = false;
    console.log('Note All: Window lost focus, resetting shift state');
  });

  function resetUI() {
      overlay.style.display = 'none';
      sendButton.style.display = 'none';
      sendButton.classList.remove('success');
      sendButton.innerHTML = buttonContent;
      currentHighlightedElement = null;
  }
})();
