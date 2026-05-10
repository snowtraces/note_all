import React, { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, Zap, Check, Mail, Bot, RefreshCw, Server, FileText, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import {
  getCronTasks,
  createCronTask,
  updateCronTask,
  deleteCronTask,
  toggleCronTask,
  runCronTask,
  getCronTaskLogs,
  getCronSettings,
  updateCronSettings
} from '../../api/cronApi';

// ==================== SubTab: CronTasksSubTab ====================
function CronTasksSubTab() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);

  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    task_type: 'crawler',
    schedule_type: 'cron',
    schedule_value: '0 9 * * *',
    config: '{"urls":[],"rate_limit_ms":1500}',
    notification: '{"push_wechat_bot":false,"push_email":false,"email_to":""}'
  });

  // 解析出来的子参数
  const [urlsStr, setUrlsStr] = useState('');
  const [rateLimit, setRateLimit] = useState(1500);
  const [pushEmail, setPushEmail] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [pushWechat, setPushWechat] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    if (activeTask?.id) {
      loadLogs(activeTask.id);
    }
  }, [activeTask?.id]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await getCronTasks();
      setTasks(data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadLogs = async (taskId) => {
    setLogsLoading(true);
    try {
      const res = await getCronTaskLogs(taskId);
      setLogs(res.data || []);
    } catch (e) {
      console.error(e);
    }
    setLogsLoading(false);
  };

  const handleSelectTask = (task) => {
    setActiveTask(task);
    setFormData({
      name: task.name,
      task_type: task.task_type,
      schedule_type: task.schedule_type,
      schedule_value: task.schedule_value,
      config: task.config,
      notification: task.notification
    });

    // 解析配置
    try {
      const cfg = JSON.parse(task.config || '{}');
      setUrlsStr((cfg.urls || []).join('\n'));
      setRateLimit(cfg.rate_limit_ms || 1500);
    } catch (e) {
      setUrlsStr('');
      setRateLimit(1500);
    }

    try {
      const notif = JSON.parse(task.notification || '{}');
      setPushEmail(!!notif.push_email);
      setEmailTo(notif.email_to || '');
      setPushWechat(!!notif.push_wechat_bot);
    } catch (e) {
      setPushEmail(false);
      setEmailTo('');
      setPushWechat(false);
    }
  };

  const handleNewTask = () => {
    setActiveTask({});
    setFormData({
      name: '',
      task_type: 'crawler',
      schedule_type: 'cron',
      schedule_value: '0 9 * * *',
      config: '{"urls":[],"rate_limit_ms":1500}',
      notification: '{"push_wechat_bot":false,"push_email":false,"email_to":""}'
    });
    setUrlsStr('');
    setRateLimit(1500);
    setPushEmail(false);
    setEmailTo('');
    setPushWechat(false);
    setLogs([]);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('任务名称不能为空');
      return;
    }

    setIsSubmitting(true);
    try {
      // 组装配置 JSON
      const urls = urlsStr.split('\n').map(u => u.trim()).filter(u => u !== '');
      // I17: 基础 URL 格式验证
      const invalidUrls = urls.filter(u => !/^https?:\/\/.+/i.test(u));
      if (invalidUrls.length > 0) {
        alert(`以下链接格式不合法，请使用 http:// 或 https:// 开头的完整链接:\n${invalidUrls.join('\n')}`);
        setIsSubmitting(false);
        return;
      }
      const configJson = JSON.stringify({
        urls,
        rate_limit_ms: parseInt(rateLimit) || 1500
      });

      const notificationJson = JSON.stringify({
        push_email: pushEmail,
        email_to: emailTo.trim(),
        push_wechat_bot: pushWechat
      });

      const postData = {
        ...formData,
        config: configJson,
        notification: notificationJson
      };

      if (activeTask && activeTask.id) {
        await updateCronTask(activeTask.id, postData);
      } else {
        await createCronTask(postData);
      }
      setActiveTask(null);
      await loadTasks();
    } catch (e) {
      console.error(e);
      alert('保存任务失败');
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (task) => {
    if (!window.confirm(`确定要彻底删除定时任务 [${task.name}] 吗？对应的运行日志也将一并清除。`)) return;
    try {
      await deleteCronTask(task.id);
      setActiveTask(null);
      await loadTasks();
    } catch (e) {
      console.error(e);
      alert('删除失败');
    }
  };

  const handleToggleStatus = async (task, e) => {
    e.stopPropagation();
    try {
      await toggleCronTask(task.id);
      const data = await getCronTasks();
      setTasks(data || []);
      // I4: 更新详情面板状态
      if (activeTask?.id === task.id) {
        const refreshed = (data || []).find(t => t.id === task.id);
        if (refreshed) handleSelectTask(refreshed);
      }
    } catch (e) {
      console.error(e);
      alert('状态变更失败');
    }
  };

  const handleRunImmediately = async (task) => {
    setIsRunning(true);
    try {
      await runCronTask(task.id);
      alert('任务已在后台下发执行，请稍后刷新日志。');
      setTimeout(() => loadLogs(task.id), 3000);
    } catch (e) {
      console.error(e);
      alert('手动触发失败');
    }
    setIsRunning(false);
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* 侧边栏列表 */}
      <div style={{ backgroundColor: 'var(--bg-sidebar)' }} className="w-1/3 border-r border-borderSubtle flex flex-col p-4 gap-3 overflow-y-auto custom-scrollbar">
        <div className="text-[11px] font-mono uppercase tracking-widest pl-2 mb-1 flex justify-between items-center text-textTertiary">
          <span>计划列表</span>
          <button onClick={handleNewTask} className="text-primeAccent hover:text-primeAccent/70 flex items-center gap-1 bg-primeAccent/10 px-2 py-1.5 rounded transition-colors text-xs font-semibold">
            <Plus size={12} /> 新建任务
          </button>
        </div>

        {loading ? (
          <div className="text-center text-sm py-10 animate-pulse text-textTertiary">加载中...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center text-xs py-10 text-textTertiary">暂无定时任务，点击右上方新建。</div>
        ) : tasks.map(t => (
          <div
            key={t.id}
            onClick={() => handleSelectTask(t)}
            className={`group p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 relative ${activeTask?.id === t.id ? 'bg-bgHover border-borderSubtle' : 'bg-bgSubtle border-borderSubtle hover:bg-bgHover'}`}
          >
            <div className="flex items-center justify-between pr-20">
              <div className="font-semibold text-sm truncate text-textPrimary">{t.name}</div>
            </div>

            <div className="absolute right-3 top-3 flex items-center gap-1.5">
              <button
                onClick={(e) => handleToggleStatus(t, e)}
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-all flex items-center gap-1 ${t.status === 'active' ? 'bg-green-500/20 text-green-500' : 'bg-bgHover text-textSecondary'}`}
              >
                <div className={`w-1 h-1 rounded-full ${t.status === 'active' ? 'bg-green-500' : 'bg-textMuted/50'}`}></div>
                {t.status === 'active' ? '运行中' : '已暂停'}
              </button>
            </div>

            <div className="text-[11px] text-textTertiary font-mono flex flex-col gap-0.5">
              <div>执行类型: {t.task_type === 'crawler' ? '🌍 网页抓取' : t.task_type}</div>
              <div>下一次预计: {t.next_run_time ? new Date(t.next_run_time).toLocaleString() : '暂无'}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 详情及编辑面板 */}
      <div style={{ backgroundColor: 'var(--bg-modal)' }} className="flex-1 p-6 flex flex-col overflow-y-auto custom-scrollbar">
        {activeTask !== null ? (
          <div className="flex flex-col gap-5 h-full">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-textPrimary">{activeTask.id ? '编辑任务' : '创建新定时任务'}</h3>
              {activeTask.id && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowLogsModal(true)}
                    className="text-textSecondary hover:text-primeAccent flex items-center gap-1 text-xs font-semibold bg-bgSubtle border border-borderSubtle px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <FileText size={12} /> 查看执行日志
                  </button>
                  <button
                    disabled={isRunning}
                    onClick={() => handleRunImmediately(activeTask)}
                    className="text-primeAccent hover:text-primeAccent/80 flex items-center gap-1 text-xs font-semibold bg-primeAccent/10 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {isRunning ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />} 立即执行一次
                  </button>
                  <button
                    onClick={() => handleDelete(activeTask)}
                    className="text-red-400 hover:text-red-300 flex items-center gap-1 text-xs font-semibold bg-red-400/10 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Trash2 size={12} /> 删除任务
                  </button>
                </div>
              )}
            </div>

            {/* 基础信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5 col-span-2 md:col-span-1">
                <label className="text-xs font-medium text-textTertiary">任务名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                  className="rounded-xl px-3 py-2 text-xs focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                  placeholder="如：每日热点资讯抓取"
                />
              </div>

              <div className="flex flex-col gap-1.5 col-span-2 md:col-span-1">
                <label className="text-xs font-medium text-textTertiary">任务类别</label>
                <select
                  value={formData.task_type}
                  onChange={(e) => setFormData(p => ({ ...p, task_type: e.target.value }))}
                  className="rounded-xl px-3 py-2 text-xs focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                >
                  <option value="crawler">🌍 网页精准爬虫/剪藏</option>
                </select>
              </div>
            </div>

            {/* 调度设置 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5 col-span-2 md:col-span-1">
                <label className="text-xs font-medium text-textTertiary">调度模式</label>
                <select
                  value={formData.schedule_type}
                  onChange={(e) => setFormData(p => ({ ...p, schedule_type: e.target.value }))}
                  className="rounded-xl px-3 py-2 text-xs focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                >
                  <option value="cron">📆 Cron 表达式</option>
                  <option value="interval">⏱️ 周期时间间隔 (分钟)</option>
                  <option value="daily">📅 每日固定时间点 (HH:MM)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5 col-span-2 md:col-span-1">
                <label className="text-xs font-medium text-textTertiary">调度设定值</label>
                <input
                  type="text"
                  value={formData.schedule_value}
                  onChange={(e) => setFormData(p => ({ ...p, schedule_value: e.target.value }))}
                  className="rounded-xl px-3 py-2 text-xs focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                  placeholder={
                    formData.schedule_type === 'cron'
                      ? '如: 0 9 * * * (每天上午9点)'
                      : formData.schedule_type === 'interval'
                      ? '如: 1440'
                      : '如: 09:30'
                  }
                />
              </div>
            </div>

            {/* 爬虫专属设置 */}
            {formData.task_type === 'crawler' && (
              <div className="flex flex-col gap-3 p-4 rounded-xl bg-bgSubtle border border-borderSubtle">
                <div className="text-xs font-semibold text-textSecondary flex justify-between items-center">
                  <span>🌍 网页精准抽取配置参数</span>
                  <span className="text-[10px] text-textTertiary font-normal">系统会自动基于抽取规则进行正则匹配提取</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium text-textTertiary">采集目标 URL 链接列表 (每行一个)</label>
                  <textarea
                    value={urlsStr}
                    onChange={(e) => setUrlsStr(e.target.value)}
                    className="rounded-xl px-3 py-2 text-xs font-mono resize-none h-24 focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary custom-scrollbar"
                    placeholder="https://example.com/article/1"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium text-textTertiary">单域名友好爬取频率延迟限制 (毫秒)</label>
                  <input
                    type="number"
                    value={rateLimit}
                    onChange={(e) => setRateLimit(e.target.value)}
                    className="rounded-xl px-3 py-2 text-xs focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                    placeholder="默认 1500"
                  />
                </div>
              </div>
            )}

            {/* 通知推送设置 */}
            <div className="flex flex-col gap-3 p-4 rounded-xl bg-bgSubtle border border-borderSubtle">
              <div className="text-xs font-semibold text-textSecondary">📢 任务执行结果推送触点设定</div>
              
              <div className="flex flex-col gap-3">
                {/* 邮件配置 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="pushEmail"
                      checked={pushEmail}
                      onChange={(e) => setPushEmail(e.target.checked)}
                      className="rounded border-[var(--glass-border)] bg-[var(--input-bg)] focus:ring-0"
                    />
                    <label htmlFor="pushEmail" className="text-xs font-medium text-textSecondary cursor-pointer">发信推送 (SMTP)</label>
                  </div>
                  {pushEmail && (
                    <input
                      type="email"
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                      placeholder="收件邮箱地址..."
                      className="rounded-xl px-3 py-1.5 text-xs w-60 focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                    />
                  )}
                </div>

                {/* 微信配置 */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pushWechat"
                    checked={pushWechat}
                    onChange={(e) => setPushWechat(e.target.checked)}
                    className="rounded border-[var(--glass-border)] bg-[var(--input-bg)] focus:ring-0"
                  />
                  <label htmlFor="pushWechat" className="text-xs font-medium text-textSecondary cursor-pointer">微信渠道推送 (将通过您的扫码已激活个人微信 Bot 直接直送)</label>
                </div>
              </div>
            </div>

            {/* 保存动作 */}
            <div className="flex justify-end gap-3 shrink-0">
              <button
                disabled={isSubmitting}
                onClick={handleSave}
                className="px-4 py-2 rounded-xl bg-primeAccent text-white font-semibold text-xs hover:bg-primeAccent/80 transition-all disabled:opacity-30 flex items-center gap-1.5"
              >
                {isSubmitting ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                保存配置
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <Clock size={40} className="mb-4 text-textMuted" />
            <p className="text-sm text-textSecondary font-medium">选择或新建一个定时计划</p>
            <p className="text-xs mt-1 text-textMuted">在左侧列表点击，或按"新建"来创建日常抓取和收集任务。</p>
          </div>
        )}
      </div>

      {/* 执行日志弹窗 */}
      {showLogsModal && activeTask?.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowLogsModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-[520px] max-w-[90vw] max-h-[80vh] rounded-2xl border border-borderSubtle shadow-xl flex flex-col overflow-hidden"
            style={{ backgroundColor: 'var(--bg-modal)' }}
          >
            <div className="shrink-0 px-5 py-3.5 flex items-center justify-between border-b border-borderSubtle">
              <div className="flex items-center gap-2 text-sm font-semibold text-textPrimary">
                <Clock size={15} /> {activeTask.name} — 执行日志简报
              </div>
              <button onClick={() => setShowLogsModal(false)} className="text-textTertiary hover:text-textPrimary transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 custom-scrollbar">
              {logsLoading ? (
                <div className="text-center text-xs py-10 animate-pulse text-textTertiary">日志加载中...</div>
              ) : logs.length === 0 ? (
                <div className="text-center text-xs py-10 text-textTertiary">暂无历史执行报告。</div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="p-3 rounded-xl border border-borderSubtle bg-bgSubtle flex flex-col gap-1.5 text-[11px] leading-relaxed">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-textTertiary">{new Date(log.start_time).toLocaleString()}</span>
                      <span className={`font-bold px-1.5 py-0.5 rounded ${log.status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                        {log.status === 'success' ? 'SUCCESS' : 'FAILURE'}
                      </span>
                    </div>
                    <div className="text-textSecondary font-medium">执行成效：{log.result_summary}</div>
                    {log.error_message && (
                      <div className="p-2 rounded bg-red-500/5 text-red-400 font-mono text-[10px] break-all whitespace-pre-wrap">
                        异常日志：{log.error_message}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== SubTab: CronSettingsSubTab ====================
function CronSettingsSubTab() {
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    smtp_host: '',
    smtp_port: 465,
    smtp_username: '',
    smtp_password: '',
    site_url: ''
  });
  const [hasPassword, setHasPassword] = useState(false);

  const EMAIL_PROVIDERS = [
    { name: '自定义 (Custom)', host: '', port: 465 },
    { name: 'QQ 邮箱', host: 'smtp.qq.com', port: 465 },
    { name: '网易 163 邮箱', host: 'smtp.163.com', port: 465 },
    { name: '网易 126 邮箱', host: 'smtp.126.com', port: 465 },
    { name: '移动 139 邮箱', host: 'smtp.139.com', port: 465 },
    { name: 'Gmail', host: 'smtp.gmail.com', port: 465 },
    { name: 'Outlook / Hotmail', host: 'smtp.office365.com', port: 587 },
    { name: '263 企业邮箱', host: 'smtp.263.net', port: 465 }
  ];

  const getSelectedProvider = () => {
    const matched = EMAIL_PROVIDERS.find(
      p => p.host && p.host.toLowerCase() === (formData.smtp_host || '').toLowerCase() && p.port === formData.smtp_port
    );
    return matched ? matched.name : '自定义 (Custom)';
  };

  const handleProviderChange = (e) => {
    const selectedName = e.target.value;
    const provider = EMAIL_PROVIDERS.find(p => p.name === selectedName);
    if (provider) {
      if (selectedName === '自定义 (Custom)') {
        // 自定义模式，不覆盖现有输入
      } else {
        setFormData(prev => ({
          ...prev,
          smtp_host: provider.host,
          smtp_port: provider.port
        }));
      }
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getCronSettings();
      setHasPassword(data?.has_password || false);
      setFormData({
        smtp_host: data?.smtp_host || '',
        smtp_port: data?.smtp_port || 465,
        smtp_username: data?.smtp_username || '',
        smtp_password: '',
        site_url: data?.site_url || ''
      });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      // I5: 仅在用户实际输入了密码时才发送，否则不发密码字段（后端保留原值）
      const payload = { ...formData };
      if (!payload.smtp_password) {
        delete payload.smtp_password;
      }
      await updateCronSettings(payload);
      alert('全局通知触点设置保存成功！');
      await loadSettings();
    } catch (e) {
      console.error(e);
      alert('保存设置失败');
    }
    setIsSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-center animate-pulse text-textTertiary text-sm">
        加载全局配置中...
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-modal)' }} className="flex-1 p-6 flex flex-col overflow-y-auto custom-scrollbar gap-5">
      <div>
        <h3 className="text-base font-semibold text-textPrimary">📢 配置全局发信与推送服务器</h3>
        <p className="text-xs text-textMuted mt-1">设置 SMTP 服务以向您的目标邮箱发送执行日志简报。系统亦支持通过扫码登录的个人微信 Bot 助手直接向您推送实时任务结果简报。</p>
      </div>

      <div className="flex flex-col gap-4 max-w-2xl">
        {/* SMTP 服务区 */}
        <div className="p-4 rounded-xl border border-borderSubtle bg-bgSubtle flex flex-col gap-3">
          <span className="text-xs font-semibold text-textSecondary flex items-center gap-1"><Mail size={13} /> SMTP 邮箱服务器设置</span>

          {/* 快捷配置下拉选择 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-textTertiary">常用邮箱服务商快捷配置 (Quick Preset)</label>
            <select
              value={getSelectedProvider()}
              onChange={handleProviderChange}
              className="rounded-xl px-3 py-2 text-xs focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
            >
              {EMAIL_PROVIDERS.map(p => (
                <option key={p.name} value={p.name} style={{ backgroundColor: 'var(--bg-modal)' }}>
                  {p.name} {p.host ? `(${p.host}:${p.port})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-textTertiary">SMTP 主机名 (Host)</label>
              <input
                type="text"
                value={formData.smtp_host}
                onChange={(e) => setFormData(p => ({ ...p, smtp_host: e.target.value }))}
                className="rounded-xl px-3 py-2 text-xs focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                placeholder="如: smtp.exmail.qq.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-textTertiary">服务器端口 (Port)</label>
              <input
                type="number"
                value={formData.smtp_port}
                onChange={(e) => setFormData(p => ({ ...p, smtp_port: parseInt(e.target.value) || 465 }))}
                className="rounded-xl px-3 py-2 text-xs focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                placeholder="通常 465"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-textTertiary">发信邮箱账号 (Username)</label>
              <input
                type="text"
                value={formData.smtp_username}
                onChange={(e) => setFormData(p => ({ ...p, smtp_username: e.target.value }))}
                className="rounded-xl px-3 py-2 text-xs focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                placeholder="如: notify@domain.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-textTertiary">邮箱授权密码 / 客户端密码 (Password)</label>
              <input
                type="password"
                value={formData.smtp_password}
                onChange={(e) => setFormData(p => ({ ...p, smtp_password: e.target.value }))}
                className="rounded-xl px-3 py-2 text-xs focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                placeholder={hasPassword ? '已设置密码，留空则保留原密码' : '请输入邮箱授权密码'}
              />
            </div>
          </div>
        </div>

        {/* 微信 Bot 推送提示卡片 */}
        <div className="p-4 rounded-xl border border-borderSubtle bg-bgSubtle flex flex-col gap-2">
          <span className="text-xs font-semibold text-textSecondary flex items-center gap-1.5"><Bot size={13} className="text-primeAccent" /> 微信个人助手推送 (WeChat Bot Direct)</span>
          <p className="text-[11px] text-textMuted leading-relaxed">
            微信推送目前<strong>已完全接入您系统内置的个人微信 Bot 助手</strong>。
            您无需配置任何繁琐的企业微信/钉钉 Webhook。只需在侧边栏的【微信同步】(Bot) 界面扫码登录您的微信，
            当定时任务勾选了"微信推送"时，系统将通过该微信 Bot 助手直接向与您产生过交互记录的微信账号私发通知简报，实现零配置、私密、即时的移动端通知体验！
          </p>
        </div>

        {/* 站点地址配置 */}
        <div className="p-4 rounded-xl border border-borderSubtle bg-bgSubtle flex flex-col gap-3">
          <span className="text-xs font-semibold text-textSecondary flex items-center gap-1.5"><Server size={13} /> 站点访问地址 (Site URL)</span>
          <p className="text-[11px] text-textMuted leading-relaxed">
            配置您的 Note All 站点对外可访问地址，微信推送将自动为任务生成的笔记创建分享链接并附在消息中。
            如不配置，微信推送将仅包含任务名称和时间，不含分享链接。
          </p>
          <input
            type="text"
            value={formData.site_url}
            onChange={(e) => setFormData(p => ({ ...p, site_url: e.target.value }))}
            className="rounded-xl px-3 py-2 text-xs font-mono focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
            placeholder="如: http://192.168.1.5:3344"
          />
        </div>
      </div>

      <div className="flex justify-start gap-3 shrink-0 pt-4 mt-auto">
        <button
          disabled={isSubmitting}
          onClick={handleSave}
          className="px-5 py-2.5 rounded-xl bg-primeAccent text-white font-semibold text-xs hover:bg-primeAccent/80 transition-all disabled:opacity-30 flex items-center gap-1.5"
        >
          {isSubmitting ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
          保存推送触点
        </button>
      </div>
    </div>
  );
}

// ==================== Parent Component: CronTab ====================
export default function CronTab() {
  const [subTab, setSubTab] = useState('tasks'); // tasks, settings
  
  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-[400px]">
      {/* 顶部分类控制 */}
      <div className="shrink-0 flex items-center justify-start gap-2 px-6 py-3 border-b border-borderSubtle bg-bgSubtle">
        <button
          onClick={() => setSubTab('tasks')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${subTab === 'tasks' ? 'bg-primeAccent/20 text-primeAccent' : 'text-textSecondary hover:bg-bgHover'}`}
        >
          任务计划管理
        </button>
        <button
          onClick={() => setSubTab('settings')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${subTab === 'settings' ? 'bg-primeAccent/20 text-primeAccent' : 'text-textSecondary hover:bg-bgHover'}`}
        >
          全局通知触点
        </button>
      </div>
      
      {/* 主体卡片内容 */}
      <div className="flex-1 flex overflow-hidden">
        {subTab === 'tasks' && <CronTasksSubTab />}
        {subTab === 'settings' && <CronSettingsSubTab />}
      </div>
    </div>
  );
}
