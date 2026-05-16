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
  const [formData, setFormData] = useState({ name: '', schedule_type: 'cron', schedule_value: '0 9 * * *' });
  const [steps, setSteps] = useState([{ step: 1, name: '爬取页面', action: 'web_crawl', input: { source: 'fixed', config: { urls: [], rate_limit_ms: 1500 } }, config: {} }]);
  const [pushEmail, setPushEmail] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [pushWechat, setPushWechat] = useState(false);

  useEffect(() => { loadTasks(); }, []);
  useEffect(() => { if (activeTask?.id) loadLogs(activeTask.id); }, [activeTask?.id]);

  const loadTasks = async () => { setLoading(true); try { setTasks(await getCronTasks() || []); } catch(e) { console.error(e); } setLoading(false); };
  const loadLogs = async (id) => { setLogsLoading(true); try { const r = await getCronTaskLogs(id); setLogs(r.data || []); } catch(e) { console.error(e); } setLogsLoading(false); };

  const parseStepsFromTask = (task) => {
    try { const s = JSON.parse(task.steps || '[]'); if (s.length > 0) return s; } catch(e) {}
    try {
      const cfg = JSON.parse(task.config || '{}');
      return [{ step: 1, name: '爬取页面', action: 'web_crawl', input: { source: 'fixed', config: { urls: cfg.urls || [], rate_limit_ms: cfg.rate_limit_ms || 1500 } }, config: {} }];
    } catch(e) {}
    return [{ step: 1, name: '步骤1', action: 'web_crawl', input: { source: 'fixed', config: { urls: [], rate_limit_ms: 1500 } }, config: {} }];
  };

  const handleSelectTask = (task) => {
    setActiveTask(task);
    setFormData({ name: task.name, schedule_type: task.schedule_type, schedule_value: task.schedule_value });
    setSteps(parseStepsFromTask(task));
    try { const n = JSON.parse(task.notification || '{}'); setPushEmail(!!n.push_email); setEmailTo(n.email_to||''); setPushWechat(!!n.push_wechat_bot); } catch(e) { setPushEmail(false); setEmailTo(''); setPushWechat(false); }
  };

  const handleNewTask = () => {
    setActiveTask({});
    setFormData({ name: '', schedule_type: 'cron', schedule_value: '0 9 * * *' });
    setSteps([{ step: 1, name: '步骤1', action: 'web_crawl', input: { source: 'fixed', config: { urls: [], rate_limit_ms: 1500 } }, config: {} }]);
    setPushEmail(false); setEmailTo(''); setPushWechat(false); setLogs([]);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { alert('任务名称不能为空'); return; }
    setIsSubmitting(true);
    try {
      const stepsJson = JSON.stringify(steps.map((s, i) => ({ ...s, step: i + 1 })));
      const notifJson = JSON.stringify({ push_email: pushEmail, email_to: emailTo.trim(), push_wechat_bot: pushWechat });
      const postData = { name: formData.name, schedule_type: formData.schedule_type, schedule_value: formData.schedule_value, steps: stepsJson, notification: notifJson };
      if (activeTask?.id) await updateCronTask(activeTask.id, postData);
      else await createCronTask(postData);
      setActiveTask(null); await loadTasks();
    } catch(e) { console.error(e); alert('保存失败'); }
    setIsSubmitting(false);
  };

  const handleDelete = async (task) => { if (!confirm(`确定删除 [${task.name}]？`)) return; try { await deleteCronTask(task.id); setActiveTask(null); await loadTasks(); } catch(e) { alert('删除失败'); } };
  const handleToggle = async (task, e) => { e.stopPropagation(); try { await toggleCronTask(task.id); const d = await getCronTasks(); setTasks(d||[]); if (activeTask?.id===task.id) { const r=(d||[]).find(t=>t.id===task.id); if(r) handleSelectTask(r); } } catch(err) { alert('状态变更失败'); } };
  const handleRun = async (task) => { setIsRunning(true); try { await runCronTask(task.id); alert('已下发执行'); setTimeout(()=>loadLogs(task.id),3000); } catch(err) { alert('触发失败'); } setIsRunning(false); };

  const updateStep = (idx, field, value) => { const s = [...steps]; s[idx] = { ...s[idx], [field]: value }; setSteps(s); };
  const updateStepInputConfig = (idx, key, val) => { const s = [...steps]; s[idx] = { ...s[idx], input: { ...s[idx].input, config: { ...(s[idx].input.config||{}), [key]: val } } }; setSteps(s); };
  const updateStepConfig = (idx, key, val) => { const s = [...steps]; s[idx] = { ...s[idx], config: { ...(s[idx].config||{}), [key]: val } }; setSteps(s); };
  const updateStepInput = (idx, updates) => { const s = [...steps]; s[idx] = { ...s[idx], input: { ...s[idx].input, ...updates } }; setSteps(s); };

  const addStep = () => {
    if (steps.length >= 4) { alert('最多 4 个步骤'); return; }
    setSteps([...steps, { step: steps.length+1, name: `步骤${steps.length+1}`, action: 'ai_process', input: { source: 'step', step_ref: steps.length }, config: { prompt: '请分析以下内容：\n{{input}}' } }]);
  };
  const removeStep = (idx) => { if (steps.length <= 1) return; setSteps(steps.filter((_,i)=>i!==idx).map((st,i)=>({...st, step:i+1}))); };

  const onActionChange = (idx, action) => {
    const s = [...steps];
    if (action === 'web_crawl') {
      s[idx] = { ...s[idx], action, input: { source: idx===0?'fixed':'step', config: { urls: [], rate_limit_ms: 1500 }, step_ref: idx }, config: {} };
    } else {
      s[idx] = { ...s[idx], action, input: { source: idx===0?'fixed':'step', step_ref: idx, config: {} }, config: { prompt: '请分析以下内容：\n{{input}}' } };
    }
    setSteps(s);
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* 侧边列表 */}
      <div style={{ backgroundColor: 'var(--bg-sidebar)' }} className="w-1/3 border-r border-borderSubtle flex flex-col p-4 gap-3 overflow-y-auto custom-scrollbar">
        <div className="text-[11px] font-mono uppercase tracking-widest pl-2 mb-1 flex justify-between items-center text-textTertiary">
          <span>计划列表</span>
          <button onClick={handleNewTask} className="text-primeAccent hover:text-primeAccent/70 flex items-center gap-1 bg-primeAccent/10 px-2 py-1.5 rounded transition-colors text-xs font-semibold"><Plus size={12} /> 新建</button>
        </div>
        {loading ? <div className="text-center text-sm py-10 animate-pulse text-textTertiary">加载中...</div>
        : tasks.length === 0 ? <div className="text-center text-xs py-10 text-textTertiary">暂无定时任务</div>
        : tasks.map(t => (
          <div key={t.id} onClick={() => handleSelectTask(t)} className={`group p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 relative ${activeTask?.id===t.id?'bg-bgHover border-borderSubtle':'bg-bgSubtle border-borderSubtle hover:bg-bgHover'}`}>
            <div className="flex items-center justify-between pr-20"><div className="font-semibold text-sm truncate text-textPrimary">{t.name}</div></div>
            <div className="absolute right-3 top-3">
              <button onClick={(e)=>handleToggle(t,e)} className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${t.status==='active'?'bg-green-500/20 text-green-500':'bg-bgHover text-textSecondary'}`}>
                <div className={`w-1 h-1 rounded-full ${t.status==='active'?'bg-green-500':'bg-textMuted/50'}`}></div>{t.status==='active'?'运行中':'已暂停'}
              </button>
            </div>
            <div className="text-[11px] text-textTertiary font-mono">下次: {t.next_run_time ? new Date(t.next_run_time).toLocaleString() : '暂无'}</div>
          </div>
        ))}
      </div>

      {/* 编辑面板 */}
      <div style={{ backgroundColor: 'var(--bg-modal)' }} className="flex-1 p-6 flex flex-col overflow-y-auto custom-scrollbar">
        {activeTask !== null ? (
          <div className="flex flex-col gap-5 h-full">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-textPrimary">{activeTask.id ? '编辑任务' : '创建新任务'}</h3>
              {activeTask.id && (
                <div className="flex gap-2">
                  <button onClick={()=>setShowLogsModal(true)} className="text-textSecondary hover:text-primeAccent flex items-center gap-1 text-xs font-semibold bg-bgSubtle border border-borderSubtle px-3 py-1.5 rounded-lg"><FileText size={12}/> 日志</button>
                  <button disabled={isRunning} onClick={()=>handleRun(activeTask)} className="text-primeAccent flex items-center gap-1 text-xs font-semibold bg-primeAccent/10 px-3 py-1.5 rounded-lg">
                    {isRunning?<RefreshCw size={12} className="animate-spin"/>:<Zap size={12}/>} 执行
                  </button>
                  <button onClick={()=>handleDelete(activeTask)} className="text-red-400 flex items-center gap-1 text-xs font-semibold bg-red-400/10 px-3 py-1.5 rounded-lg"><Trash2 size={12}/> 删除</button>
                </div>
              )}
            </div>

            {/* 基础信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-textTertiary">任务名称</label>
                <input type="text" value={formData.name} onChange={e=>setFormData(p=>({...p,name:e.target.value}))} className="rounded-xl px-3 py-2 text-xs focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary" placeholder="每日热点分析"/>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-textTertiary">调度模式</label>
                <select value={formData.schedule_type} onChange={e=>setFormData(p=>({...p,schedule_type:e.target.value}))} className="rounded-xl px-3 py-2 text-xs focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary">
                  <option value="cron">📆 Cron</option><option value="interval">⏱️ 间隔(分)</option><option value="daily">📅 每日</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-textTertiary">调度值</label>
              <input type="text" value={formData.schedule_value} onChange={e=>setFormData(p=>({...p,schedule_value:e.target.value}))} className="rounded-xl px-3 py-2 text-xs focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary" placeholder={formData.schedule_type==='cron'?'0 9 * * *':'1440'}/>
            </div>

            {/* 管道节点 */}
            <div className="flex flex-col gap-3 p-4 rounded-xl bg-bgSubtle border border-borderSubtle">
              <div className="text-xs font-semibold text-textSecondary flex justify-between"><span>⚡ 管道节点 ({steps.length}/4)</span>
                {steps.length<4 && <button onClick={addStep} className="text-primeAccent flex items-center gap-1 text-[11px] font-semibold"><Plus size={11}/> 添加</button>}
              </div>
              {steps.map((st, idx) => (
                <div key={idx} className="flex flex-col gap-2.5 p-3 rounded-lg border border-borderSubtle bg-[var(--bg-modal)] relative">
                  {idx>0 && <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-textMuted text-[10px]">↓</div>}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-primeAccent bg-primeAccent/10 px-1.5 py-0.5 rounded">#{idx+1}</span>
                      <input type="text" value={st.name} onChange={e=>updateStep(idx,'name',e.target.value)} className="rounded px-2 py-1 text-xs bg-transparent border-b border-borderSubtle focus:outline-none text-textPrimary w-32"/>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={st.action} onChange={e=>onActionChange(idx,e.target.value)} className="rounded px-2 py-1 text-[11px] bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary">
                        <option value="web_crawl">🌍 网页爬虫</option><option value="ai_process">🤖 AI 处理</option>
                      </select>
                      {steps.length>1 && <button onClick={()=>removeStep(idx)} className="text-red-400"><X size={13}/></button>}
                    </div>
                  </div>
                  {idx>0 && st.action!=='web_crawl' && (
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-textTertiary">输入:</label>
                      <select value={st.input.step_ref||idx} onChange={e=>updateStepInput(idx,{source:'step',step_ref:parseInt(e.target.value)})} className="rounded px-2 py-1 text-[11px] bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary">
                        {Array.from({length:idx},(_,i)=><option key={i} value={i+1}>Step {i+1} 输出</option>)}
                      </select>
                    </div>
                  )}
                  {st.action==='web_crawl' && (
                    <div className="flex flex-col gap-2">
                      <textarea value={(st.input.config?.urls||[]).join('\n')} onChange={e=>updateStepInputConfig(idx,'urls',e.target.value.split('\n').map(u=>u.trim()).filter(Boolean))} className="rounded-lg px-3 py-2 text-xs font-mono resize-none h-20 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary" placeholder="每行一个 URL"/>
                      <div className="flex items-center gap-2"><label className="text-[10px] text-textTertiary">频率(ms):</label>
                        <input type="number" value={st.input.config?.rate_limit_ms||1500} onChange={e=>updateStepInputConfig(idx,'rate_limit_ms',parseInt(e.target.value)||1500)} className="rounded px-2 py-1 text-xs w-24 bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"/>
                      </div>
                    </div>
                  )}
                  {st.action==='ai_process' && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-textTertiary">{'提示词 (用 {{input}} 引用输入)'}</label>
                      <textarea value={st.config?.prompt||''} onChange={e=>updateStepConfig(idx,'prompt',e.target.value)} className="rounded-lg px-3 py-2 text-xs font-mono resize-none h-24 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary" placeholder={'请分析以下内容：\n{{input}}'}/>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 推送配置 */}
            <div className="flex flex-col gap-3 p-4 rounded-xl bg-bgSubtle border border-borderSubtle">
              <div className="text-xs font-semibold text-textSecondary">📢 推送</div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-textSecondary cursor-pointer"><input type="checkbox" checked={pushEmail} onChange={e=>setPushEmail(e.target.checked)} className="rounded"/>邮件</label>
                {pushEmail && <input type="email" value={emailTo} onChange={e=>setEmailTo(e.target.value)} placeholder="收件邮箱" className="rounded-xl px-3 py-1.5 text-xs w-60 bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"/>}
              </div>
              <label className="flex items-center gap-2 text-xs text-textSecondary cursor-pointer"><input type="checkbox" checked={pushWechat} onChange={e=>setPushWechat(e.target.checked)} className="rounded"/>微信</label>
            </div>

            <div className="flex justify-end shrink-0">
              <button disabled={isSubmitting} onClick={handleSave} className="px-4 py-2 rounded-xl bg-primeAccent text-white font-semibold text-xs hover:bg-primeAccent/80 disabled:opacity-30 flex items-center gap-1.5">
                {isSubmitting?<RefreshCw size={12} className="animate-spin"/>:<Check size={12}/>} 保存
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center"><Clock size={40} className="mb-4 text-textMuted"/><p className="text-sm text-textSecondary">选择或新建定时计划</p></div>
        )}
      </div>

      {/* 日志弹窗 */}
      {showLogsModal && activeTask?.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={()=>setShowLogsModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
          <div onClick={e=>e.stopPropagation()} className="relative w-[520px] max-w-[90vw] max-h-[80vh] rounded-2xl border border-borderSubtle shadow-xl flex flex-col overflow-hidden" style={{backgroundColor:'var(--bg-modal)'}}>
            <div className="shrink-0 px-5 py-3.5 flex items-center justify-between border-b border-borderSubtle">
              <span className="text-sm font-semibold text-textPrimary">{activeTask.name} — 执行日志</span>
              <button onClick={()=>setShowLogsModal(false)} className="text-textTertiary hover:text-textPrimary"><X size={16}/></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 custom-scrollbar">
              {logsLoading ? <div className="text-center text-xs py-10 text-textTertiary">加载中...</div>
              : logs.length===0 ? <div className="text-center text-xs py-10 text-textTertiary">暂无日志</div>
              : logs.map(log=>(
                <div key={log.id} className="p-3 rounded-xl border border-borderSubtle bg-bgSubtle flex flex-col gap-1.5 text-[11px]">
                  <div className="flex justify-between"><span className="font-mono text-textTertiary">{new Date(log.start_time).toLocaleString()}</span>
                    <span className={`font-bold px-1.5 py-0.5 rounded ${log.status==='success'?'bg-green-500/10 text-green-500':'bg-red-500/10 text-red-500'}`}>{log.status==='success'?'SUCCESS':'FAILURE'}</span>
                  </div>
                  <div className="text-textSecondary">{log.result_summary}</div>
                  {log.step_results && (() => { try { return JSON.parse(log.step_results).map((s,i)=>(
                    <div key={i} className={`text-[10px] px-2 py-1 rounded ${s.status==='success'?'bg-green-500/5 text-green-400':'bg-red-500/5 text-red-400'}`}>
                      Step {s.step} [{s.action}] {s.status} ({s.duration_ms}ms)
                    </div>)); } catch(err) { return null; } })()}
                  {log.error_message && <div className="p-2 rounded bg-red-500/5 text-red-400 font-mono text-[10px] whitespace-pre-wrap">{log.error_message}</div>}
                </div>))}
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
