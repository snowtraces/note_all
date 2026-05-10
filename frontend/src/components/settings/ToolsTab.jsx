import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Check, Code, RefreshCw, Wrench, Globe, Sparkles } from 'lucide-react';
import {
  getExtractorRules,
  createExtractorRule,
  updateExtractorRule,
  deleteExtractorRule,
  testExtractorRule
} from '../../api/cronApi';

// 工具类别配置列表
const TOOL_CATEGORIES = [
  { id: 'extractor', name: '网页内容抽取', icon: Globe, description: '管理网站精准抓取提纯 CSS 规则' },
  { id: 'assistant', name: '系统辅助工具', icon: Wrench, description: '剪贴板同步与通用辅助效率小工具', comingSoon: true }
];

export default function ToolsTab() {
  const [activeCategory, setActiveCategory] = useState('extractor');
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRule, setActiveRule] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // 测试提取规则相关状态
  const [testUrl, setTestUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleCopyTestResult = () => {
    if (!testResult || !testResult.markdown) return;
    navigator.clipboard.writeText(testResult.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [formData, setFormData] = useState({
    name: '',
    url_pattern: '',
    rule_type: 'detail',
    item_selector: '',
    link_selector: '',
    title_selector: '',
    body_selector: '',
    date_selector: '',
    exclude_selectors: ''
  });

  useEffect(() => {
    if (activeCategory === 'extractor') {
      loadRules();
    }
  }, [activeCategory]);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await getExtractorRules();
      setRules(data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSelectRule = (rule) => {
    setActiveRule(rule);
    setIsConfirmingDelete(false);
    setTestUrl('');
    setTestResult(null);
    setTestError(null);
    setFormData({
      name: rule.name,
      url_pattern: rule.url_pattern,
      rule_type: rule.rule_type || 'detail',
      item_selector: rule.item_selector || '',
      link_selector: rule.link_selector || '',
      title_selector: rule.title_selector,
      body_selector: rule.body_selector,
      date_selector: rule.date_selector || '',
      exclude_selectors: rule.exclude_selectors || ''
    });
  };

  const handleNewRule = () => {
    setActiveRule({});
    setIsConfirmingDelete(false);
    setTestUrl('');
    setTestResult(null);
    setTestError(null);
    setFormData({
      name: '',
      url_pattern: '',
      rule_type: 'detail',
      item_selector: '',
      link_selector: '',
      title_selector: '',
      body_selector: '',
      date_selector: '',
      exclude_selectors: ''
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.url_pattern.trim() || !formData.title_selector.trim() || !formData.body_selector.trim()) {
      alert('所有星号标记的字段均为必填项');
      return;
    }
    if (formData.rule_type === 'list') {
      if (!formData.item_selector.trim() || !formData.link_selector.trim()) {
        alert('列表聚合模式下，单项容器与超链接选择器均为必填项');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (activeRule && activeRule.id) {
        await updateExtractorRule(activeRule.id, formData);
      } else {
        await createExtractorRule(formData);
      }
      setActiveRule(null);
      await loadRules();
    } catch (e) {
      console.error(e);
      alert('保存抽取规则失败，请检查正则表达式是否合法或命名重复。');
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (rule) => {
    if (!rule || !rule.id) return;
    setIsSubmitting(true);
    try {
      await deleteExtractorRule(rule.id);
      setActiveRule(null);
      setIsConfirmingDelete(false);
      await loadRules();
    } catch (e) {
      console.error(e);
      alert('删除失败');
    }
    setIsSubmitting(false);
  };

  const handleTestRule = async () => {
    if (!testUrl.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const res = await testExtractorRule({
        url: testUrl.trim(),
        rule_type: formData.rule_type,
        item_selector: formData.item_selector,
        link_selector: formData.link_selector,
        title_selector: formData.title_selector,
        body_selector: formData.body_selector,
        date_selector: formData.date_selector,
        exclude_selectors: formData.exclude_selectors
      });
      setTestResult(res);
    } catch (e) {
      console.error(e);
      setTestError(e.message || '抓取页面或规则匹配测试异常，请确认链接可访问。');
    }
    setIsTesting(false);
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* 第一列：工具目录 (Column 1: Tool Category Directory) */}
      <div
        style={{ backgroundColor: 'var(--bg-sidebar)' }}
        className="w-[210px] border-r border-borderSubtle flex flex-col p-4 gap-2.5 overflow-y-auto custom-scrollbar shrink-0"
      >
        <div className="text-[11px] font-mono uppercase tracking-widest pl-1 mb-1 text-textTertiary">
          工具目录
        </div>

        {TOOL_CATEGORIES.map(cat => (
          <div
            key={cat.id}
            onClick={() => !cat.comingSoon && setActiveCategory(cat.id)}
            className={`p-3 rounded-xl border transition-all flex flex-col gap-1 relative ${cat.comingSoon ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${activeCategory === cat.id ? 'bg-bgHover border-borderSubtle' : 'bg-transparent border-transparent hover:bg-bgHover/50'}`}
          >
            <div className="flex items-center gap-2">
              <cat.icon size={13} className={activeCategory === cat.id ? 'text-primeAccent' : 'text-textSecondary'} />
              <span className={`text-xs font-semibold ${activeCategory === cat.id ? 'text-textPrimary' : 'text-textSecondary'}`}>
                {cat.name}
              </span>
            </div>
            <div className="text-[10px] text-textTertiary leading-snug">
              {cat.description}
            </div>
            {cat.comingSoon && (
              <span className="absolute right-2 top-2 text-[8px] px-1.5 py-0.5 rounded bg-primeAccent/10 text-primeAccent font-bold scale-90">
                WIP
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 动态渲染第二、三列 */}
      {activeCategory === 'extractor' ? (
        <>
          {/* 第二列：规则匹配列表 (Column 2: Rule Pattern List) */}
          <div
            style={{ backgroundColor: 'var(--bg-sidebar)' }}
            className="w-[250px] border-r border-borderSubtle flex flex-col p-4 gap-3 overflow-y-auto custom-scrollbar shrink-0"
          >
            <div className="text-[11px] font-mono uppercase tracking-widest pl-2 mb-1 flex justify-between items-center text-textTertiary">
              <span>匹配模式</span>
              <button
                onClick={handleNewRule}
                className="text-primeAccent hover:text-primeAccent/70 flex items-center gap-1 bg-primeAccent/10 px-2 py-1 rounded transition-colors text-xs font-semibold scale-95 origin-right"
              >
                <Plus size={11} /> 添加
              </button>
            </div>

            {loading ? (
              <div className="text-center text-sm py-10 animate-pulse text-textTertiary">加载中...</div>
            ) : rules.length === 0 ? (
              <div className="text-center text-xs py-10 text-textTertiary">暂无自定义规则，默认采用 Reader 剪藏。</div>
            ) : rules.map(r => (
              <div
                key={r.id}
                onClick={() => handleSelectRule(r)}
                className={`group p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-1.5 ${activeRule?.id === r.id ? 'bg-bgHover border-borderSubtle' : 'bg-bgSubtle border-borderSubtle hover:bg-bgHover'}`}
              >
                <div className="font-semibold text-xs truncate text-textPrimary">{r.name}</div>
                <div className="text-[9px] font-mono truncate text-textTertiary">{r.url_pattern}</div>
              </div>
            ))}
          </div>

          {/* 第三列：规则编辑面板 (Column 3: Configuration Editor Panel) */}
          <div style={{ backgroundColor: 'var(--bg-modal)' }} className="flex-1 p-6 flex flex-col overflow-y-auto custom-scrollbar">
            {activeRule !== null ? (
              <div className="flex flex-col gap-5 h-full">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-textPrimary">{activeRule.id ? '编辑匹配抽取规则' : '创建新网页抽取规则'}</h3>
                  <div className="flex items-center gap-2">
                    {activeRule.id && (
                      <>
                        {isConfirmingDelete ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setIsConfirmingDelete(false)}
                              className="text-textSecondary hover:text-textPrimary text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-borderSubtle transition-all"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleDelete(activeRule)}
                              className="text-white bg-red-500 hover:bg-red-600 flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all shadow-sm animate-in zoom-in-95 duration-100"
                            >
                              <Trash2 size={11} /> 确认删除
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsConfirmingDelete(true)}
                            className="text-red-400 hover:text-red-300 flex items-center gap-1 text-[11px] font-semibold bg-red-400/10 px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            <Trash2 size={11} /> 移除规则
                          </button>
                        )}
                      </>
                    )}
                    <button
                      disabled={isSubmitting}
                      onClick={handleSave}
                      className="px-4 py-1.5 rounded-xl bg-primeAccent text-white font-semibold text-xs hover:bg-primeAccent/80 transition-all disabled:opacity-30 flex items-center gap-1.5"
                    >
                      {isSubmitting ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                      保存规则
                    </button>
                  </div>
                </div>

                {/* ── 基础配置 ── */}
                <div className="flex flex-col gap-4">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-primeAccent/70 pl-1">基础配置</div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-textTertiary">规则名称 <span className="text-red-400">*</span></label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                        className="rounded-xl px-3 py-2.5 text-sm focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                        placeholder="如：知乎专栏"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-textTertiary">提取类型 <span className="text-red-400">*</span></label>
                      <div className="flex gap-1 bg-[var(--input-bg)] border border-[var(--glass-border)] p-0.5 rounded-xl h-[38px] items-center">
                        <button
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, rule_type: 'detail' }))}
                          className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-all ${formData.rule_type === 'detail' ? 'bg-primeAccent text-white shadow-sm' : 'text-textSecondary hover:bg-bgHover'}`}
                        >
                          单网页明细
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, rule_type: 'list' }))}
                          className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-all ${formData.rule_type === 'list' ? 'bg-primeAccent text-white shadow-sm' : 'text-textSecondary hover:bg-bgHover'}`}
                        >
                          列表页聚合
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-textTertiary">
                      URL 正则匹配 <span className="text-red-400">*</span>
                      <span className="text-[10px] text-textMuted ml-1.5">Go 标准正则语法</span>
                    </label>
                    <input
                      type="text"
                      value={formData.url_pattern}
                      onChange={(e) => setFormData(p => ({ ...p, url_pattern: e.target.value }))}
                      className="rounded-xl px-3 py-2.5 text-sm font-mono focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                      placeholder={formData.rule_type === 'list' ? "如: ^https://finance\\.eastmoney\\.com/yaowen\\.html$" : "如: ^https://zhuanlan\\.zhihu\\.com/"}
                    />
                  </div>
                </div>

                {/* ── 列表聚合专属字段 ── */}
                {formData.rule_type === 'list' && (
                  <div className="flex flex-col gap-4 border-l-2 border-primeAccent/40 pl-4 animate-in fade-in-50 slide-in-from-left-2 duration-150">
                    <div className="text-[11px] font-mono uppercase tracking-widest text-textTertiary pl-1">列表聚合配置</div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-textTertiary">单项容器 <span className="text-red-400">*</span></label>
                        <input
                          type="text"
                          value={formData.item_selector}
                          onChange={(e) => setFormData(p => ({ ...p, item_selector: e.target.value }))}
                          className="rounded-xl px-3 py-2.5 text-sm font-mono focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                          placeholder="如: .artitleList2 > ul > li"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-textTertiary">项内超链接 <span className="text-red-400">*</span></label>
                        <input
                          type="text"
                          value={formData.link_selector}
                          onChange={(e) => setFormData(p => ({ ...p, link_selector: e.target.value }))}
                          className="rounded-xl px-3 py-2.5 text-sm font-mono focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                          placeholder="如: .title a"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── CSS 选择器配置 ── */}
                <div className="flex flex-col gap-4">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-primeAccent/70 pl-1">
                    CSS 选择器配置
                    <span className="text-[10px] text-textMuted ml-1.5 normal-case tracking-normal font-sans">目标元素定位，基于标准 CSS Selector 语法</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-textTertiary">
                        {formData.rule_type === 'list' ? '项标题' : '文章标题'} <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.title_selector}
                        onChange={(e) => setFormData(p => ({ ...p, title_selector: e.target.value }))}
                        className="rounded-xl px-3 py-2.5 text-sm font-mono focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                        placeholder={formData.rule_type === 'list' ? "如: .title a" : "如: h1.Post-Title"}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-textTertiary">
                        {formData.rule_type === 'list' ? '项内容/简介' : '正文内容'} <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.body_selector}
                        onChange={(e) => setFormData(p => ({ ...p, body_selector: e.target.value }))}
                        className="rounded-xl px-3 py-2.5 text-sm font-mono focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                        placeholder={formData.rule_type === 'list' ? "如: .info" : "如: .Post-RichTextContainer"}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-textTertiary">
                        {formData.rule_type === 'list' ? '项时间' : '发布时间'}
                      </label>
                      <input
                        type="text"
                        value={formData.date_selector}
                        onChange={(e) => setFormData(p => ({ ...p, date_selector: e.target.value }))}
                        className="rounded-xl px-3 py-2.5 text-sm font-mono focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                        placeholder="如: .publish-time, .time"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-textTertiary">
                        干扰排除
                        <span className="text-[10px] text-textMuted ml-1.5">匹配节点在转换前移除，逗号分隔</span>
                      </label>
                      <input
                        type="text"
                        value={formData.exclude_selectors}
                        onChange={(e) => setFormData(p => ({ ...p, exclude_selectors: e.target.value }))}
                        className="rounded-xl px-3 py-2.5 text-sm font-mono focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                        placeholder="如: .advertisement, .comment-box, svg"
                      />
                    </div>
                  </div>
                </div>

                {/* ── 实时提取测试 ── */}
                <div className="border border-borderSubtle bg-bgSubtle/50 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-textPrimary">
                      <Sparkles size={13} className="text-primeAccent animate-pulse" />
                      实时提取测试
                    </div>
                    <span className="text-[10px] text-textTertiary">免保存，即刻验证规则有效性</span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={testUrl}
                      onChange={(e) => setTestUrl(e.target.value)}
                      className="flex-1 rounded-xl px-3 py-2 text-sm focus:border-primeAccent/50 focus:outline-none bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                      placeholder="输入测试目标 URL"
                    />
                    <button
                      type="button"
                      disabled={isTesting || !testUrl.trim()}
                      onClick={handleTestRule}
                      className="px-4 py-2 rounded-xl bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 disabled:opacity-30 text-xs font-semibold transition-all flex items-center gap-1 shrink-0"
                    >
                      {isTesting && <RefreshCw size={11} className="animate-spin" />}
                      {isTesting ? '提取中...' : '测试规则'}
                    </button>
                  </div>

                  {testResult && (
                    <div className="flex flex-col gap-2 rounded-xl bg-[var(--bg-modal)] border border-borderSubtle p-3 animate-in fade-in-50 duration-200">
                      <div className="flex justify-between items-center text-[10px] text-textTertiary border-b border-borderSubtle pb-1.5">
                        <span className="font-medium text-textSecondary">提取结果反馈</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleCopyTestResult}
                            className={`px-2 py-0.5 rounded transition-all font-medium ${copied ? 'text-green-400 bg-green-400/5' : 'text-primeAccent hover:text-primeAccent/80'}`}
                          >
                            {copied ? '✓ 已复制全部' : '复制全部'}
                          </button>
                          <span className="text-borderSubtle">|</span>
                          <button
                            type="button"
                            onClick={() => setTestResult(null)}
                            className="hover:text-textPrimary"
                          >
                            清空
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 text-xs">
                        <div className="font-semibold text-textPrimary text-xs truncate">
                          提取标题: <span className="font-normal text-textSecondary">{testResult.title || '（未获取到标题）'}</span>
                        </div>
                        <div className="flex flex-col gap-1 mt-1">
                          <span className="text-[10px] text-textTertiary font-mono">
                            Markdown 完整预览 ({testResult.markdown ? testResult.markdown.length : 0} 字符):
                          </span>
                          <pre className="max-h-[300px] overflow-y-auto p-3 bg-bgSubtle rounded-lg font-mono text-[10px] leading-relaxed text-textSecondary custom-scrollbar border border-borderSubtle whitespace-pre-wrap break-all select-text">
                            {testResult.markdown || '（无正文提取内容）'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}

                  {testError && (
                    <div className="p-3 bg-red-500/5 border border-red-500/10 text-red-400 rounded-xl text-[10px] font-mono leading-relaxed break-all whitespace-pre-wrap animate-in fade-in-50 duration-200">
                      提取测试失败: {testError}
                    </div>
                  )}
                </div>

                              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Code size={40} className="mb-4 text-textMuted" />
                <p className="text-sm text-textSecondary font-medium">配置网站抓取净化样式</p>
                <p className="text-xs mt-1 text-textMuted">为特定文章详情页编写高效的 CSS Selector 提纯规则，防止采集不必要的干扰页眉、页脚及广告。</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-modal)' }} className="flex-1 p-10 flex flex-col items-center justify-center text-center">
          <Sparkles size={48} className="mb-4 text-primeAccent animate-pulse" />
          <p className="text-base font-semibold text-textPrimary">通用辅助效率工具</p>
          <p className="text-xs mt-2 text-textMuted max-w-sm leading-relaxed">
            包括剪贴板跨端同步、外部编辑器调用协议以及自动化流媒体处理器等扩展配置。功能正在深度定制研发中，敬请期待！
          </p>
        </div>
      )}
    </div>
  );
}
