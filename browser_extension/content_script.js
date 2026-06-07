(function () {
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

  const shadowRoot = container.attachShadow({ mode: 'open' });

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

    // 4. 标题处理：提取纯文本内容，避免内部 div/span 导致多余换行
    turndownService.addRule('heading', {
      filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      replacement: function (content, node) {
        // 清理内容中的多余换行和空白
        content = content.replace(/\n+/g, ' ').trim();
        if (!content) return '';
        const level = node.nodeName.charAt(1);
        return '\n\n' + '#'.repeat(parseInt(level)) + ' ' + content + '\n\n';
      }
    });

    // 5. 处理所有 <pre>：最外层包裹成代码块，嵌套的只返回内容（跳过 Turndown 默认处理）
    //    尝试提取第一行短文本作为语言标识（如 "Bash", "Python" 等）
    turndownService.addRule('fencedCodeBlock', {
      filter: 'pre',
      replacement: function (content, node) {
        // 去除 BR_MARKER 首尾标记，避免残留为多余空行
        const stripMarker = (s) => {
          s = s.trim();
          while (s.startsWith(BR_MARKER)) s = s.slice(BR_MARKER.length);
          while (s.endsWith(BR_MARKER)) s = s.slice(0, -BR_MARKER.length);
          return s;
        };
        // 检查是否有 pre 祖先（嵌套情况）
        let parent = node.parentNode;
        while (parent) {
          if (parent.nodeName === 'PRE') {
            // 嵌套的 pre，只返回内容，不包裹
            return stripMarker(content) + '\n';
          }
          parent = parent.parentNode;
        }
        // 最外层 pre，处理语言标识并包裹成代码块
        content = stripMarker(content);
        if (content.startsWith('```')) return '\n\n' + content + '\n\n';

        // 尝试提取第一行作为语言标识（常见语言名列表）
        const lines = content.split('\n');
        const firstLine = lines[0].trim();
        const commonLanguages = ['bash', 'python', 'javascript', 'js', 'typescript', 'ts', 'java', 'c', 'cpp', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'sql', 'html', 'css', 'json', 'yaml', 'xml', 'markdown', 'shell', 'powershell', 'cmd', 'dockerfile', 'toml', 'ini', 'sh', 'zsh', 'bat'];

        if (commonLanguages.includes(firstLine.toLowerCase())) {
          // 第一行是语言标识，移除它并用作代码块标记
          const restContent = lines.slice(1).join('\n').trim();
          return '\n\n```' + firstLine + '\n' + restContent + '\n```\n\n';
        }

        return '\n\n```\n' + content + '\n```\n\n';
      }
    });

    // 6. 核心机制：使用标记策略保留 pre-wrap 中的文本换行
    // 这种方法可以绕过 Turndown 内部对文本节点空白符的强制压缩
    const BR_MARKER = '---NOTEBR---';
    const clone = element.cloneNode(true);

    // 6a. 通用 div 表格预处理：将各种 div 模拟的表格结构转换为真实 <table> 元素
    //
    //     覆盖的识别模式（按优先级）：
    //     [A] ARIA Grid 模式：role="grid/treegrid" 容器 + role="row" + role="gridcell/columnheader"
    //         这是最标准的无障碍 div 表格写法，TFS/Azure DevOps/Jira 等常用
    //     [B] 仅 role="row" 模式：无显式 grid 容器，但多个同级 div 都有 role="row"
    //         一些精简实现直接在父 div 里写 row，不加 grid 容器
    //
    //     行列顺序规范化：
    //       - 优先使用 aria-rowindex / aria-colindex 属性排序（与 DOM 顺序无关）
    //       - 其次使用 CSS top / left 位置排序（绝对定位 div 表格）
    //       - 最后回退到 DOM 顺序
    //
    //     表头识别（按优先级）：
    //       1. 行内含有 role="columnheader" 的行
    //       2. aria-rowindex="1" 的行
    //       3. 在当前 grid 容器的兄弟/父级中查找 columnheader 行（虚拟滚动固定表头）
    //       4. 强制使用第一行（无表头时降级）
    //
    //     单元格文本提取（通用策略，无站点专属选择器）：
    //       - 移除 aria-hidden="true" 的纯装饰节点
    //       - 移除 role="button/img/separator" 等交互/图标节点
    //       - 保留 aria-label 作为文字（当节点只有图标无文字时）
    //       - 有 <a> 链接时取链接文字；否则取 innerText
    function convertAriaGridToTable(root) {

      // ── 工具函数 ──────────────────────────────────────────────────

      // 从 CSS style 或 computed style 解析 top/left 数值（px）
      function getPosValue(el, prop) {
        const inline = el.style && el.style[prop];
        if (inline && inline.endsWith('px')) return parseFloat(inline);
        return NaN;
      }

      // 行排序键：aria-rowindex > CSS top > DOM 顺序（index 作为参数传入）
      function rowSortKey(row, domIndex) {
        const ariaIdx = parseInt(row.getAttribute('aria-rowindex'));
        if (!isNaN(ariaIdx)) return ariaIdx;
        const top = getPosValue(row, 'top');
        if (!isNaN(top)) return top;
        return domIndex;
      }

      // 单元格排序键：aria-colindex > CSS left > DOM 顺序
      function cellSortKey(cell, domIndex) {
        const ariaIdx = parseInt(cell.getAttribute('aria-colindex'));
        if (!isNaN(ariaIdx)) return ariaIdx;
        const left = getPosValue(cell, 'left');
        if (!isNaN(left)) return left;
        return domIndex;
      }

      // 通用单元格文本提取：只依赖 ARIA 标准属性，无站点专属 CSS 类
      function extractCellText(cellEl) {
        const c = cellEl.cloneNode(true);

        // 1. 移除纯装饰/交互节点（标准 ARIA role）
        const decorativeRoles = ['button', 'img', 'separator', 'presentation', 'none'];
        c.querySelectorAll(decorativeRoles.map(r => `[role="${r}"]`).join(','))
          .forEach(n => n.remove());

        // 2. 移除 aria-hidden="true" 的节点（屏幕阅读器跳过的纯视觉装饰）
        c.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove());

        // 3. 有 <a> 链接时优先取链接文字（可能包含多个链接，用逗号分隔）
        const links = c.querySelectorAll('a');
        if (links.length > 0) {
          const texts = Array.from(links)
            .map(a => (a.getAttribute('aria-label') || a.innerText || '').trim())
            .filter(Boolean);
          if (texts.length > 0) return texts.join(', ');
        }

        // 4. 取节点自身的 aria-label（某些单元格只有图标+aria-label）
        const selfLabel = cellEl.getAttribute('aria-label');
        if (selfLabel) return selfLabel.trim();

        // 5. 普通文本
        return (c.innerText || c.textContent || '').replace(/\s+/g, ' ').trim();
      }

      // 将一组行+表头信息构建为 <table> 元素
      function buildTable(headerRow, dataRows) {
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');

        // 表头行
        const htr = document.createElement('tr');
        const hCellsRaw = Array.from(
          headerRow.querySelectorAll('[role="gridcell"],[role="columnheader"],[role="rowheader"]')
        );
        // 若没有标准单元格，用所有直接子元素（降级）
        const hSource = hCellsRaw.length > 0
          ? hCellsRaw.sort((a, b) => cellSortKey(a, hCellsRaw.indexOf(a)) - cellSortKey(b, hCellsRaw.indexOf(b)))
          : Array.from(headerRow.children);
        hSource.forEach(cell => {
          const th = document.createElement('th');
          th.textContent = extractCellText(cell);
          htr.appendChild(th);
        });
        thead.appendChild(htr);
        table.appendChild(thead);

        // 数据行
        dataRows.forEach(row => {
          const tr = document.createElement('tr');
          const dCellsRaw = Array.from(
            row.querySelectorAll('[role="gridcell"],[role="columnheader"],[role="rowheader"]')
          );
          const dSource = dCellsRaw.length > 0
            ? dCellsRaw.sort((a, b) => cellSortKey(a, dCellsRaw.indexOf(a)) - cellSortKey(b, dCellsRaw.indexOf(b)))
            : Array.from(row.children);
          dSource.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = extractCellText(cell);
            tr.appendChild(td);
          });
          if (tr.cells.length > 0) tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        return table;
      }

      // 在某个容器（及其兄弟/祖先兄弟）中寻找 columnheader 行（虚拟滚动固定表头）
      function findExternalHeaderRow(gridContainer) {
        // 向上最多查 3 层祖先，在每层的所有子孙中找 role=columnheader 的行
        let ancestor = gridContainer.parentElement;
        for (let depth = 0; depth < 3 && ancestor; depth++) {
          const candidateRows = ancestor.querySelectorAll('[role="row"]');
          for (const row of candidateRows) {
            // 不在 gridContainer 内部
            if (gridContainer.contains(row)) continue;
            if (row.querySelector('[role="columnheader"]')) return row;
          }
          ancestor = ancestor.parentElement;
        }
        return null;
      }

      // ── 主流程 ──────────────────────────────────────────────────
      //
      // Phase 1：优先处理显式 role="grid"/"treegrid" 容器。
      //          这些容器可能把表头行和数据行分散在不同的子容器中（如 grid-header
      //          和 grid-canvas），必须作为原子单元整体处理，否则分组后会互相覆盖。
      //
      // Phase 2：fallback 处理不在任何 grid 容器内的独立 role="row" 行，
      //          按直接父元素分组（兼容无 grid 容器的精简写法）。

      const processedGridEls = []; // 记录已处理的 grid 容器，用 contains() 判断归属

      // ── Phase 1：处理 role="grid" / role="treegrid" 原子容器 ──────

      // 收集所有 grid 容器（包括 root 本身）
      const gridContainerSelector = '[role="grid"],[role="treegrid"]';
      const gridContainers = Array.from(root.querySelectorAll(gridContainerSelector));
      if (root.getAttribute && (root.getAttribute('role') === 'grid' || root.getAttribute('role') === 'treegrid')) {
        gridContainers.unshift(root);
      }

      for (const gridEl of gridContainers) {
        if (processedGridEls.some(g => g === gridEl || g.contains(gridEl))) continue; // 嵌套 grid 跳过

        // 收集该 grid 容器内所有含单元格的行（跨子容器）
        const allGridRows = Array.from(gridEl.querySelectorAll('[role="row"]'))
          .filter(r => r.querySelector('[role="gridcell"],[role="columnheader"],[role="rowheader"]'));

        if (allGridRows.length === 0) continue;

        // 按行排序键排序
        const sortedRows = allGridRows
          .map((r, i) => ({ row: r, key: rowSortKey(r, i) }))
          .sort((a, b) => a.key - b.key)
          .map(x => x.row);

        // 确定表头行（三级回退）
        let headerRow = sortedRows.find(r => r.querySelector('[role="columnheader"]'));
        if (!headerRow) headerRow = sortedRows.find(r => r.getAttribute('aria-rowindex') === '1');
        const useFirstRowAsHeader = !headerRow;
        if (!headerRow) headerRow = sortedRows[0];

        const dataRows = useFirstRowAsHeader
          ? sortedRows.slice(1)
          : sortedRows.filter(r => r !== headerRow);

        const table = buildTable(headerRow, dataRows);

        // 记录已处理的 grid 容器
        processedGridEls.push(gridEl);

        // 替换整个 grid 容器
        if (gridEl === root) {
          while (root.firstChild) root.removeChild(root.firstChild);
          root.appendChild(table);
          return; // root 已被替换，无需继续
        } else {
          gridEl.parentElement.replaceChild(table, gridEl);
        }
      }

      // ── Phase 2：fallback — 按直接父元素分组处理独立 role="row" ──

      // 只处理不在已处理 grid 容器内的行
      const allRows = Array.from(root.querySelectorAll('[role="row"]'))
        .filter(r => !processedGridEls.some(g => g.contains(r)));

      const parentMap = new Map();
      for (const row of allRows) {
        const hasCells = row.querySelector('[role="gridcell"],[role="columnheader"],[role="rowheader"]');
        if (!hasCells) continue;
        const parent = row.parentElement;
        if (!parent || processedGridEls.some(g => g.contains(parent))) continue;
        if (!parentMap.has(parent)) parentMap.set(parent, []);
        parentMap.get(parent).push(row);
      }

      for (const [parent, rows] of parentMap) {
        if (rows.length < 1) continue;

        const sortedRows = rows
          .map((r, i) => ({ row: r, key: rowSortKey(r, i) }))
          .sort((a, b) => a.key - b.key)
          .map(x => x.row);

        // 确定表头行（四级回退，包含外部兄弟查找）
        let headerRow = sortedRows.find(r => r.querySelector('[role="columnheader"]'));
        if (!headerRow) headerRow = sortedRows.find(r => r.getAttribute('aria-rowindex') === '1');
        if (!headerRow) headerRow = findExternalHeaderRow(parent);
        const useFirstRowAsHeader = !headerRow;
        if (!headerRow) headerRow = sortedRows[0];

        const dataRows = useFirstRowAsHeader
          ? sortedRows.slice(1)
          : sortedRows.filter(r => r !== headerRow);

        const table = buildTable(headerRow, dataRows);

        if (parent.parentElement) {
          parent.parentElement.replaceChild(table, parent);
        } else if (parent === root) {
          while (root.firstChild) root.removeChild(root.firstChild);
          root.appendChild(table);
        }
      }
    }

    // 对克隆元素执行通用 div 表格预处理
    convertAriaGridToTable(clone);

    const processPreWrap = (orig, cln) => {
      if (orig.nodeType === 1) { // Element
        const style = window.getComputedStyle(orig);
        const isPre = style && (style.whiteSpace.includes('pre') || style.whiteSpace.includes('break-spaces'));

        let clnIndex = 0;
        for (let i = 0; i < orig.childNodes.length; i++) {
          const oChild = orig.childNodes[i];
          const cChild = cln.childNodes[clnIndex];
          if (!cChild) break;

          if (oChild.nodeType === 3) {
            if (isPre) {
              // 无论是否在代码块中，只要是 pre-wrap 样式，都使用标记保留换行
              cChild.nodeValue = cChild.nodeValue.replace(/\n/g, BR_MARKER);
            }
          } else if (oChild.nodeType === 1) {
            let nextCChild = cChild;
            const cStyle = window.getComputedStyle(oChild);
            let isInline = false;
            let isFlexRowChild = false;

            if (cStyle) {
              const display = cStyle.display;
              if (display === 'inline' || display === 'inline-block' || display === 'inline-flex') {
                isInline = true;
              }
              if (style && (style.display === 'flex' || style.display === 'inline-flex') && style.flexDirection.includes('row')) {
                isInline = true;
                isFlexRowChild = true;
              }
            }

            // 将 block 元素伪装成 span，让 Turndown 认为它是内联元素
            if (isInline) {
              const blockTags = ['DIV', 'P', 'LI', 'ARTICLE', 'SECTION', 'ASIDE', 'NAV', 'HEADER', 'FOOTER'];
              if (blockTags.includes(cChild.nodeName)) {
                const span = document.createElement('span');
                Array.from(cChild.attributes).forEach(attr => span.setAttribute(attr.name, attr.value));
                while (cChild.firstChild) span.appendChild(cChild.firstChild);
                cChild.parentNode.replaceChild(span, cChild);
                nextCChild = span;
              }
            }

            processPreWrap(oChild, nextCChild);

            // 为 flex row 子元素之间增加一个空格，防止文本挤在一起
            if (isFlexRowChild && i < orig.childNodes.length - 1) {
              nextCChild.parentNode.insertBefore(document.createTextNode(' '), nextCChild.nextSibling);
              clnIndex++;
            }
          }
          clnIndex++;
        }
      }
    };

    // 执行标记预处理
    processPreWrap(element, clone);

    turndownService.remove(['script', 'noscript', 'style', 'iframe', 'canvas', 'video', 'audio', 'button', 'svg']);

    if (window.turndownPluginGfm) {
      turndownService.use(window.turndownPluginGfm.gfm);
    }

    // 7. 执行转换并还原标记
    let markdown = turndownService.turndown(clone);
    // 将标记替换为换行符
    // 注意：在代码块外，Markdown 通常需要两个空格+换行来表示硬换行，
    // 但在代码块内，简单的 \n 即可。为了兼容性，我们统一先换回 \n。
    markdown = markdown.replace(new RegExp(BR_MARKER, 'g'), '\n');

    // 8. 修复转义问题：还原被 Turndown 自动转义的常用字符，确保代码块和正文中的视觉一致性
    return markdown.replace(/\\([-\*\+\#\>\!\_\[\]\(\)\`\.])/g, '$1');
  }

  // 提取选区中的标题作为 original_name
  function extractTitleFromElement(element) {
    // 特例规则：针对特定网站的结构化标题元素，优先匹配
    const specialCases = [
      '[data-testid="twitter-article-title"]',  // Twitter 文章标题
    ];
    for (const selector of specialCases) {
      const specialEl = element.querySelector(selector);
      if (specialEl) {
        const text = specialEl.innerText.trim();
        if (text) {
          return text;
        }
      }
    }

    // 通用规则：查找选区内所有标题元素，按级别排序（h1 > h2 > ... > h6）
    const headingSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    for (const selector of headingSelectors) {
      const headings = element.querySelectorAll(selector);
      if (headings.length > 0) {
        // 取该级别第一个标题的纯文本
        const text = headings[0].innerText.trim();
        if (text) {
          return text;
        }
      }
    }
    // 找不到标题，取选区第一个有意义文本行
    const getFirstMeaningfulLine = (el) => {
      // 过滤常见噪音标签
      const noiseTags = ['BUTTON', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'INPUT', 'LABEL', 'A'];
      const clone = el.cloneNode(true);
      noiseTags.forEach(tag => clone.querySelectorAll(tag).forEach(n => n.remove()));
      // 取第一行非空文本
      const lines = clone.innerText.trim().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && trimmed.length > 2) {  // 忽略过短的碎片
          return trimmed;
        }
      }
      return '';
    };
    const firstLine = getFirstMeaningfulLine(element);
    if (firstLine.length > 30) {
      return firstLine.substring(0, 30) + '...';
    }
    return firstLine || '网页摘录';
  }

  sendButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (currentHighlightedElement) {
      console.log("Note All: Starting conversion for", currentHighlightedElement);
      const markdown = convertToMarkdown(currentHighlightedElement);
      const originalName = extractTitleFromElement(currentHighlightedElement);

      chrome.runtime.sendMessage({
        action: 'clipText',
        content: markdown,
        url: window.location.href,
        title: document.title,
        original_name: originalName
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
