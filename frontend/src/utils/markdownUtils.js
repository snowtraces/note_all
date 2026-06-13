export function convertHtmlTablesToMarkdown(text) {
  if (!text || !text.includes('<table')) return text;

  // 匹配所有 <table>...</table> 标签
  const tableRegex = /<table[\s\S]*?<\/table>/gi;

  return text.replace(tableRegex, (match) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(match, 'text/html');
      const table = doc.querySelector('table');
      if (!table) return match;

      let markdown = '\n';
      const rows = Array.from(table.querySelectorAll('tr'));
      
      if (rows.length === 0) return match;

      // 解析表头（第一行通常被认为是表头，如果没有 <thead> 或者是 <tbody> 里的第一行）
      const firstRowCells = Array.from(rows[0].querySelectorAll('th, td'));
      const colCount = firstRowCells.length;
      
      rows.forEach((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        let rowStr = '|';
        cells.forEach(cell => {
          // 为了避免潜在的 XSS 攻击，直接使用由 DOMParser 解析出来的安全节点进行克隆操作，不使用 innerHTML 插入未过滤内容
          const clone = cell.cloneNode(true);
          
          // 将 br 标签替换为换行符
          const brs = Array.from(clone.querySelectorAll('br'));
          brs.forEach(br => br.replaceWith(document.createTextNode('\n')));
          
          // 给块级元素末尾追加换行符
          const blocks = Array.from(clone.querySelectorAll('p, div'));
          blocks.forEach(block => block.append(document.createTextNode('\n')));
          
          // 安全地提取纯文本
          let cellText = clone.textContent || '';

          // 将所有的连续换行符替换为 <br> 标签，并转义管道符
          cellText = cellText.replace(/\n+/g, '<br>').replace(/\|/g, '\\|').trim();
          
          // 如果开头或结尾有多余的 <br>，可以考虑去掉（可选，这里 trim() 已经去除了首尾空格，但没去 <br>，暂时保留或简单处理）
          cellText = cellText.replace(/^(?:<br>)+|(?:<br>)+$/g, '');

          rowStr += ` ${cellText} |`;
        });
        
        // 如果该行单元格数不足，补齐
        while (cells.length < colCount) {
          rowStr += '  |';
          cells.push(null);
        }
        
        markdown += rowStr + '\n';
        
        // 在第一行之后插入分隔行
        if (rowIndex === 0) {
          let sepStr = '|';
          for (let i = 0; i < colCount; i++) {
            sepStr += '---|';
          }
          markdown += sepStr + '\n';
        }
      });

      return markdown + '\n';
    } catch (e) {
      console.error("Failed to convert table to markdown", e);
      return match; // 发生异常则保持原样
    }
  });
}
