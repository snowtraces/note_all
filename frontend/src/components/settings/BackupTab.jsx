import React, { useState } from 'react';
import { Download, Upload, FileText, AlertCircle, Loader2, Database, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { exportNotesZip, importNotesZip, importSingleMD } from '../../api/systemApi';
import { useToast } from '../../context/ToastContext';

export default function BackupTab() {
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [importingZip, setImportingZip] = useState(false);
  const [importingMd, setImportingMd] = useState(false);
  const [resultMsg, setResultMsg] = useState(null);

  // 处理导出 Notes ZIP
  const handleExportZip = async () => {
    setExporting(true);
    setResultMsg(null);
    try {
      const blob = await exportNotesZip();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `note_all_export_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast('数据导出成功', { type: 'success', title: '成功' });
    } catch (e) {
      console.error(e);
      showToast('数据导出失败: ' + e.message, { type: 'error', title: '错误' });
    } finally {
      setExporting(false);
    }
  };

  // 处理导入 Notes ZIP
  const handleImportZip = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingZip(true);
    setResultMsg(null);
    try {
      const res = await importNotesZip(file);
      showToast('批量 ZIP 导入成功', { type: 'success', title: '成功' });
      setResultMsg({
        type: 'success',
        text: res.message || `导入成功，共导入 ${res.imported_count || 0} 个笔记，${res.attachment_count || 0} 个附件。`,
      });
    } catch (e) {
      console.error(e);
      showToast('批量 ZIP 导入失败: ' + e.message, { type: 'error', title: '错误' });
      setResultMsg({
        type: 'error',
        text: '批量导入失败: ' + e.message,
      });
    } finally {
      setImportingZip(false);
      // 清空 file input 值以允许重复选择同一文件
      e.target.value = '';
    }
  };

  // 处理导入单个 MD
  const handleImportMd = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingMd(true);
    setResultMsg(null);
    try {
      const res = await importSingleMD(file);
      showToast('单个 MD 导入成功', { type: 'success', title: '成功' });
      setResultMsg({
        type: 'success',
        text: `导入笔记成功: "${res.data?.original_name || '未命名'}"。AI 提炼任务已在后台启动。`,
      });
    } catch (e) {
      console.error(e);
      showToast('单个 MD 导入失败: ' + e.message, { type: 'error', title: '错误' });
      setResultMsg({
        type: 'error',
        text: '导入单个 MD 失败: ' + e.message,
      });
    } finally {
      setImportingMd(false);
      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden min-h-[400px]">
      {/* 左侧：数据导出 & 说明 */}
      <div
        style={{ backgroundColor: 'var(--bg-sidebar)' }}
        className="w-[420px] shrink-0 border-r flex flex-col p-6 gap-5 overflow-y-auto custom-scrollbar backdrop-blur border-borderSubtle"
      >
        {/* 数据导出 */}
        <div className="rounded-xl p-5 bg-bgSubtle border border-borderSubtle space-y-4">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-primeAccent" />
            <h4 className="text-[13px] font-bold text-textPrimary uppercase tracking-wider font-mono">
              全量数据导出 (Backup)
            </h4>
          </div>
          <p className="text-[12px] text-textSecondary leading-relaxed">
            将当前系统中的所有非回收站笔记、相关的附件（图片、文档）、标签、双链关系、AI 提炼成果以及用户批注，完整打包为一个标准的 <b>ZIP</b> 压缩文件下载。
          </p>
          <button
            onClick={handleExportZip}
            disabled={exporting}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-[13px] transition-all ${
              exporting
                ? 'bg-bgHover text-textTertiary cursor-not-allowed'
                : 'bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 border border-primeAccent/30'
            }`}
          >
            {exporting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                正在打包生成 ZIP 文件...
              </>
            ) : (
              <>
                <Download size={14} />
                导出全量数据 ZIP
              </>
            )}
          </button>
        </div>

        {/* 说明说明 */}
        <div className="rounded-xl p-4 bg-bgSubtle border border-borderSubtle">
          <div className="text-[11px] leading-relaxed text-textTertiary">
            <div className="flex items-center gap-1.5 mb-2 font-mono uppercase tracking-wider">
              <AlertCircle size={12} className="text-textTertiary" />
              数据安全提示 (Data Safety)
            </div>
            <ul className="list-disc list-inside space-y-1.5 ml-1 text-[12px] text-textSecondary">
              <li>
                导出的 Markdown 文件内含标准的 YAML Frontmatter，支持在 Obsidian 等离线阅读器中直接解析。
              </li>
              <li>
                导出的附件将存储在压缩包的 <code>attachments/</code> 文件夹中。
              </li>
              <li>
                导入 ZIP 文件时，系统将自动合并写入。如果附件 ID 已存在，则不会重复上传覆盖，以保障数据安全性。
              </li>
              <li>
                请勿修改导出的 ZIP 文件内部的结构目录，否则可能导致重新导入失败。
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* 右侧：数据导入 */}
      <div
        style={{ backgroundColor: 'var(--bg-modal)' }}
        className="flex-1 p-6 flex flex-col backdrop-blur overflow-y-auto custom-scrollbar"
      >
        <div className="text-[11px] uppercase tracking-wider mb-4 font-mono text-textTertiary">
          数据恢复与导入 (Restore & Import)
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ZIP 批量导入 */}
          <div className="rounded-xl p-5 border border-borderSubtle bg-bgSubtle flex flex-col justify-between min-h-[180px] hover:border-primeAccent/20 transition-colors">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className="text-primeAccent" />
                <h5 className="text-[13px] font-bold text-textPrimary">导入全量/批量 ZIP 备份</h5>
              </div>
              <p className="text-[12px] text-textSecondary leading-relaxed">
                选择一个之前从此系统导出的标准备份 ZIP 压缩包上传。系统会自动解压，导入所有的 markdown 笔记、相关附件文件，并完美重建双向链接和标签体系。
              </p>
            </div>
            <div className="mt-4">
              <label
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-[13px] font-semibold transition-all text-center cursor-pointer ${
                  importingZip
                    ? 'bg-bgHover border-borderSubtle text-textTertiary cursor-not-allowed'
                    : 'bg-primeAccent/10 text-primeAccent border-primeAccent/30 hover:bg-primeAccent/20'
                }`}
              >
                {importingZip ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    正在上传并解压导入中...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    选择并导入 ZIP 文件
                  </>
                )}
                <input
                  type="file"
                  accept=".zip"
                  onChange={handleImportZip}
                  disabled={importingZip}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* 单个 MD 导入 */}
          <div className="rounded-xl p-5 border border-borderSubtle bg-bgSubtle flex flex-col justify-between min-h-[180px] hover:border-primeAccent/20 transition-colors">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-primeAccent" />
                <h5 className="text-[13px] font-bold text-textPrimary">导入单个 Markdown (.md)</h5>
              </div>
              <p className="text-[12px] text-textSecondary leading-relaxed">
                上传单个 <code>.md</code> 文件。系统会优先解析内部的 YAML Frontmatter（标题、标签、总结等），无 YAML 的话将默认使用文件名作为标题，并异步唤醒 AI 引擎提炼摘要。
              </p>
            </div>
            <div className="mt-4">
              <label
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-[13px] font-semibold transition-all text-center cursor-pointer ${
                  importingMd
                    ? 'bg-bgHover border-borderSubtle text-textTertiary cursor-not-allowed'
                    : 'bg-primeAccent/10 text-primeAccent border-primeAccent/30 hover:bg-primeAccent/20'
                }`}
              >
                {importingMd ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    正在上传并导入中...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    选择并导入 MD 文件
                  </>
                )}
                <input
                  type="file"
                  accept=".md"
                  onChange={handleImportMd}
                  disabled={importingMd}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* 结果显示 */}
        {resultMsg && (
          <div
            className={`mt-6 rounded-xl p-4 flex gap-3 items-start border ${
              resultMsg.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}
          >
            {resultMsg.type === 'success' ? (
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            )}
            <div className="text-[12px] leading-relaxed">
              <span className="font-bold block mb-1">
                {resultMsg.type === 'success' ? '操作成功 completed' : '操作失败 failed'}
              </span>
              {resultMsg.text}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
