import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Cpu, Save, Loader2, Copy, Check, Eye, EyeOff, RefreshCw, AlertCircle, Zap, Settings2, ChevronDown, Sparkles } from 'lucide-react';
import { getConfig, updateConfig } from '../../api/configApi';

// ========== 主流大模型上下文参数常量库 ==========
const MODEL_PRESETS = {
  // DeepSeek
  'deepseek-v4-pro': {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    brand: 'DeepSeek',
    contextWindow: 1000000,
    maxOutputTokens: 384000,
    reservedTokens: 400000,
    bufferTokens: 100000,
    apiUrl: 'https://api.deepseek.com/chat/completions'
  },
  'deepseek-v4-flash': {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    brand: 'DeepSeek',
    contextWindow: 1000000,
    maxOutputTokens: 384000,
    reservedTokens: 400000,
    bufferTokens: 100000,
    apiUrl: 'https://api.deepseek.com/chat/completions'
  },

  // OpenAI
  'gpt-4.5': {
    id: 'gpt-4.5',
    name: 'GPT-4.5 (Flagship)',
    brand: 'OpenAI',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    reservedTokens: 8000,
    bufferTokens: 4000,
    apiUrl: 'https://api.openai.com/v1/chat/completions'
  },
  'o1': {
    id: 'o1',
    name: 'OpenAI o1 (Reasoning)',
    brand: 'OpenAI',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    reservedTokens: 90000,
    bufferTokens: 10000,
    apiUrl: 'https://api.openai.com/v1/chat/completions'
  },
  'o3-mini': {
    id: 'o3-mini',
    name: 'OpenAI o3-mini (Reasoning)',
    brand: 'OpenAI',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    reservedTokens: 90000,
    bufferTokens: 10000,
    apiUrl: 'https://api.openai.com/v1/chat/completions'
  },
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o (Omni)',
    brand: 'OpenAI',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    reservedTokens: 8000,
    bufferTokens: 4000,
    apiUrl: 'https://api.openai.com/v1/chat/completions'
  },

  // Anthropic
  'claude-3.7-sonnet': {
    id: 'claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet (Latest)',
    brand: 'Anthropic',
    contextWindow: 200000,
    maxOutputTokens: 128000,
    reservedTokens: 120000,
    bufferTokens: 8000,
    apiUrl: 'https://api.anthropic.com/v1/messages'
  },
  'claude-3.5-sonnet': {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    brand: 'Anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    reservedTokens: 8000,
    bufferTokens: 4000,
    apiUrl: 'https://api.anthropic.com/v1/messages'
  },

  // Google
  'gemini-3.5-flash': {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash (1M)',
    brand: 'Google',
    contextWindow: 1000000,
    maxOutputTokens: 65000,
    reservedTokens: 100000,
    bufferTokens: 40000,
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models'
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash (1M)',
    brand: 'Google',
    contextWindow: 1048576,
    maxOutputTokens: 65535,
    reservedTokens: 100000,
    bufferTokens: 40000,
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models'
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash (Default)',
    brand: 'Google',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    reservedTokens: 16000,
    bufferTokens: 8000,
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models'
  },

  // Alibaba
  'qwen3.7-max': {
    id: 'qwen3.7-max',
    name: 'Qwen3.7 Max (1M Context)',
    brand: 'Alibaba',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    reservedTokens: 100000,
    bufferTokens: 40000,
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  },
  'qwen-max': {
    id: 'qwen-max',
    name: 'Qwen Max (Flagship)',
    brand: 'Alibaba',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    reservedTokens: 8000,
    bufferTokens: 4000,
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  },

  // Zhipu
  'glm-5.1': {
    id: 'glm-5.1',
    name: 'GLM 5.1 (1M Flagship)',
    brand: 'Zhipu AI',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    reservedTokens: 120000,
    bufferTokens: 40000,
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  },
  'glm-5': {
    id: 'glm-5',
    name: 'GLM 5 (200K Flagship)',
    brand: 'Zhipu AI',
    contextWindow: 200000,
    maxOutputTokens: 128000,
    reservedTokens: 120000,
    bufferTokens: 10000,
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  }
};

// 查找与输入内容匹配的预设
const findMatchedPreset = (modelId) => {
  if (!modelId) return null;
  const normalized = modelId.toLowerCase().trim();
  if (normalized === '') return null;

  // 1. 精确匹配
  if (MODEL_PRESETS[normalized]) {
    return MODEL_PRESETS[normalized];
  }

  // 2. 模糊匹配：如果输入值达到一定长度，支持模糊匹配推荐
  if (normalized.length >= 3) {
    const matchedKeys = Object.keys(MODEL_PRESETS).filter(key =>
      key.includes(normalized) || normalized.includes(key)
    );
    if (matchedKeys.length > 0) {
      // 优先选择长度最接近的
      matchedKeys.sort((a, b) => Math.abs(a.length - normalized.length) - Math.abs(b.length - normalized.length));
      return MODEL_PRESETS[matchedKeys[0]];
    }
  }
  return null;
};

// ========== 外部定义的输入组件（避免每次渲染重新创建） ==========

// 文本输入组件
function TextInput({ label, value, onChange, placeholder, highlighted }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-[12px] text-textTertiary font-mono w-[100px] shrink-0">{label}</div>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-mono outline-none transition-all duration-500 border ${highlighted
          ? 'bg-primeAccent/15 border-primeAccent text-primeAccent ring-1 ring-primeAccent/30'
          : 'bg-bgSubtle text-textSecondary border-borderSubtle placeholder-textMuted focus:bg-bgHover focus:ring-2 focus:ring-primeAccent/30'
          }`}
        placeholder={placeholder || '未配置'}
      />
    </div>
  );
}

// Token 输入组件
function TokenInput({ label, value, onChange, visible, onToggleVisibility, onCopy, highlighted }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-[12px] text-textTertiary font-mono w-[100px] shrink-0">{label}</div>
      <div className="flex gap-2 items-center flex-1">
        <input
          type={visible ? 'text' : 'password'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-mono outline-none transition-all duration-500 border ${highlighted
            ? 'bg-primeAccent/15 border-primeAccent text-primeAccent ring-1 ring-primeAccent/30'
            : 'bg-bgSubtle text-textSecondary border-borderSubtle placeholder-textMuted focus:bg-bgHover focus:ring-2 focus:ring-primeAccent/30'
            }`}
          placeholder="未配置"
        />
        <button
          onClick={onToggleVisibility}
          className="p-1.5 rounded-lg transition-colors text-textTertiary hover:text-textPrimary hover:bg-bgHover"
          title={visible ? '隐藏' : '显示'}
        >
          {visible ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
        <button
          onClick={onCopy}
          className="p-1.5 rounded-lg transition-colors text-textTertiary hover:text-textPrimary hover:bg-bgHover"
          title="复制"
        >
          <Copy size={12} />
        </button>
      </div>
    </div>
  );
}

// 数字输入组件
function NumberInput({ label, value, onChange, min, max, step, highlighted }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-[12px] text-textTertiary font-mono w-[100px] shrink-0">{label}</div>
      <input
        type="number"
        value={value || 0}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        min={min}
        max={max}
        step={step || 1}
        className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-mono outline-none transition-all duration-500 border ${highlighted
          ? 'bg-primeAccent/15 border-primeAccent text-primeAccent ring-1 ring-primeAccent/30'
          : 'bg-bgSubtle text-textSecondary border-borderSubtle focus:bg-bgHover focus:ring-2 focus:ring-primeAccent/30'
          }`}
      />
    </div>
  );
}

// 带推荐预设的模型 ID 输入组件
function ModelIdInput({ label, value, onChange, onApplyPreset, placeholder, highlighted }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 按品牌对模型进行分组
  const groupedPresets = {};
  Object.values(MODEL_PRESETS).forEach(preset => {
    if (!groupedPresets[preset.brand]) {
      groupedPresets[preset.brand] = [];
    }
    groupedPresets[preset.brand].push(preset);
  });

  return (
    <div className="flex items-center gap-3 relative" ref={dropdownRef}>
      <div className="text-[12px] text-textTertiary font-mono w-[100px] shrink-0">{label}</div>
      <div className="flex-1 relative flex items-center">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          className={`w-full rounded-lg pl-3 pr-8 py-1.5 text-[13px] font-mono outline-none transition-all duration-500 border ${highlighted
            ? 'bg-primeAccent/15 border-primeAccent text-primeAccent ring-1 ring-primeAccent/30'
            : 'bg-bgSubtle text-textSecondary border-borderSubtle placeholder-textMuted focus:bg-bgHover focus:ring-2 focus:ring-primeAccent/30'
            }`}
          placeholder={placeholder || '未配置'}
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2 text-textTertiary hover:text-textPrimary transition-colors"
          title="常用模型预设推荐"
        >
          <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* 悬浮预设下拉框 */}
        {isOpen && (
          <div
            className="absolute top-full left-0 right-0 mt-1 z-50 max-h-72 overflow-y-auto rounded-xl border border-borderSubtle shadow-2xl p-2.5 custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-150"
            style={{ backgroundColor: 'var(--bg-modal)' }}
          >
            <div className="text-[10px] text-textTertiary font-mono px-2.5 py-1.5 mb-1.5 border-b border-borderSubtle/50 flex items-center gap-1.5">
              <Sparkles size={11} className="text-primeAccent animate-pulse" />
              主流大语言模型推荐预设 (点击一键配置)
            </div>
            {Object.entries(groupedPresets).map(([brandName, presets]) => (
              <div key={brandName} className="mb-2.5 last:mb-0">
                <div className="text-[10px] font-bold text-primeAccent px-2.5 py-1 font-mono uppercase tracking-wider bg-primeAccent/5 rounded-md mb-1">
                  {brandName}
                </div>
                <div className="space-y-0.5">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        onApplyPreset(preset);
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] transition-colors hover:bg-bgHover flex flex-col gap-0.5 group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-textPrimary group-hover:text-primeAccent transition-colors">{preset.id}</span>
                        <span className="text-[10px] text-textTertiary bg-bgSubtle px-1.5 py-0.5 rounded">{preset.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-textTertiary mt-0.5">
                        <span>窗口: <strong className="text-textSecondary">{(preset.contextWindow >= 1000000) ? `${preset.contextWindow / 1000000}M` : `${preset.contextWindow / 1000}K`}</strong></span>
                        <span>输出上限: <strong className="text-textSecondary">{(preset.maxOutputTokens >= 1000) ? `${preset.maxOutputTokens / 1000}K` : preset.maxOutputTokens}</strong></span>
                        {preset.apiUrl && <span className="truncate max-w-[120px] ml-auto text-textMuted/60" title={preset.apiUrl}>API 官方地址</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ========== 主组件 ==========

export default function ModelConfigTab() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);
  const [visibleTokens, setVisibleTokens] = useState({});
  const [highlightedFields, setHighlightedFields] = useState({});

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const data = await getConfig();
        setConfig(data.data || data);
      } catch (e) {
        showToast(e.message, 'error');
      }
      setLoading(false);
    };
    loadConfig();
  }, []);

  // Toast 提示
  const showToast = useCallback((msg, type) => {
    setToast({ text: msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // 复制到剪贴板
  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('已复制到剪贴板', 'success');
    } catch (e) {
      showToast('复制失败', 'error');
    }
  }, [showToast]);

  // 切换 Token 显示
  const toggleTokenVisibility = useCallback((key) => {
    setVisibleTokens(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // 更新配置值 - 使用 useCallback 保持引用稳定
  const updateValue = useCallback((key, value) => {
    setConfig(prev => {
      if (!prev) return prev;
      return { ...prev, [key]: value };
    });
  }, []);

  // 一键应用推荐的模型参数规格
  const handleApplyPreset = useCallback((preset) => {
    if (!preset) return;

    setConfig(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        llm_model_id: preset.id,
        llm_context_window: preset.contextWindow,
        llm_max_output_tokens: preset.maxOutputTokens,
        llm_reserved_tokens: preset.reservedTokens,
        llm_buffer_tokens: preset.bufferTokens
      };

      // 如果 API 地址未配置，才自动补全官方 API 地址（避免覆盖用户的反代或私有部署地址）
      if (!prev.llm_api_url || prev.llm_api_url === '') {
        updated.llm_api_url = preset.apiUrl;
        setHighlightedFields(prevFields => ({ ...prevFields, llm_api_url: true }));
      }
      return updated;
    });

    // 触发生效的联动字段闪烁高亮动效
    setHighlightedFields(prevFields => ({
      ...prevFields,
      llm_model_id: true,
      llm_context_window: true,
      llm_max_output_tokens: true,
      llm_reserved_tokens: true,
      llm_buffer_tokens: true
    }));

    // 1.5秒后自动清除高亮，形成柔和的淡出感
    setTimeout(() => {
      setHighlightedFields({});
    }, 1500);

    showToast(`已成功应用 ${preset.name} 的推荐参数配置`, 'success');
  }, [showToast]);

  // 保存配置
  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await updateConfig(config);
      showToast('配置已保存并生效', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
    setSaving(false);
  };

  // 刷新配置
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await getConfig();
      setConfig(data.data || data);
      showToast('配置已刷新', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
    setRefreshing(false);
  };

  // 智能分析输入匹配：当用户手动输入的内容模糊匹配某个模型，但当前参数与官方推荐不符时，显示快捷应用条
  const matchedPreset = findMatchedPreset(config?.llm_model_id);
  const hasParameterMismatch = matchedPreset && (
    config?.llm_context_window !== matchedPreset.contextWindow ||
    config?.llm_max_output_tokens !== matchedPreset.maxOutputTokens ||
    config?.llm_reserved_tokens !== matchedPreset.reservedTokens ||
    config?.llm_buffer_tokens !== matchedPreset.bufferTokens
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center animate-pulse text-textTertiary">
        加载中...
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-bgPage">
      {/* Toast 提示 */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-[13px] flex items-center gap-2 shadow-lg animate-in slide-in-from-right ${toast.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'
          }`}>
          {toast.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.text}
        </div>
      )}

      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-[15px] font-bold text-textPrimary flex items-center gap-2">
            <Cpu size={16} className="text-primeAccent animate-pulse" />
            模型配置管理
          </h3>
          <p className="text-[12px] text-textTertiary mt-1">
            管理 API 密钥、上下文窗口联动参数与文档分片策略
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-[13px] transition-all ${saving
              ? 'bg-bgSubtle text-textTertiary cursor-not-allowed'
              : 'bg-primeAccent text-white hover:bg-primeAccent/90'
              }`}
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                保存中
              </>
            ) : (
              <>
                <Save size={14} />
                保存
              </>
            )}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-[13px] transition-all ${refreshing
              ? 'bg-bgSubtle text-textTertiary cursor-not-allowed'
              : 'bg-bgSubtle text-textSecondary hover:bg-bgHover hover:text-textPrimary'
              }`}
          >
            {refreshing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                刷新中
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                刷新
              </>
            )}
          </button>
        </div>
      </div>

      {/* 两列布局（宽屏） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 左列：LLM + 上下文 + VLM */}
        <div className="space-y-6">
          {/* LLM + 上下文窗口（组合卡片） */}
          <div className="rounded-xl bg-bgSubtle border border-borderSubtle relative">
            {/* LLM API 部分 */}
            <div className="p-4">
              <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary flex items-center gap-1.5">
                <Zap size={12} className="text-primeAccent" />
                LLM API (语言模型)
              </div>
              <div className="space-y-3">
                <TextInput label="API 地址" value={config?.llm_api_url} onChange={(v) => updateValue('llm_api_url', v)} placeholder="https://api.deepseek.com/chat/completions" highlighted={highlightedFields['llm_api_url']} />
                <TokenInput label="API Token" value={config?.llm_api_token} onChange={(v) => updateValue('llm_api_token', v)} visible={visibleTokens['llm_api_token']} onToggleVisibility={() => toggleTokenVisibility('llm_api_token')} onCopy={() => copyToClipboard(config?.llm_api_token || '')} />
                <ModelIdInput label="模型 ID" value={config?.llm_model_id} onChange={(v) => updateValue('llm_model_id', v)} onApplyPreset={handleApplyPreset} placeholder="deepseek-v4-flash" highlighted={highlightedFields['llm_model_id']} />

                {/* 智能匹配提示条 */}
                {hasParameterMismatch && (
                  <div className="p-2.5 rounded-lg border border-primeAccent/25 bg-primeAccent/5 flex items-center justify-between gap-3 text-[11px] text-textSecondary animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={12} className="text-primeAccent shrink-0 animate-pulse" />
                      <span>
                        检测到模型 ID 匹配 <strong>{matchedPreset.name}</strong>，是否应用其推荐的上下文配置？
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyPreset(matchedPreset)}
                      className="shrink-0 bg-primeAccent hover:bg-primeAccent/90 text-white font-medium px-2 py-0.5 rounded text-[10px] transition-colors"
                    >
                      一键应用
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 分隔线 */}
            <div className="border-t border-borderSubtle" />

            {/* 上下文窗口部分 */}
            <div className="p-4 bg-primeAccent/5 rounded-b-xl">
              <div className="text-[11px] uppercase tracking-wider mb-2.5 font-mono text-primeAccent flex items-center gap-1.5">
                <Settings2 size={12} />
                上下文窗口联动参数
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <NumberInput label="上下文窗口" value={config?.llm_context_window} onChange={(v) => updateValue('llm_context_window', v)} min={32000} max={2000000} step={1000} highlighted={highlightedFields['llm_context_window']} />
                <NumberInput label="输出上限" value={config?.llm_max_output_tokens} onChange={(v) => updateValue('llm_max_output_tokens', v)} min={1000} max={500000} step={1000} highlighted={highlightedFields['llm_max_output_tokens']} />
                <NumberInput label="输出预留" value={config?.llm_reserved_tokens} onChange={(v) => updateValue('llm_reserved_tokens', v)} min={1000} max={500000} step={1000} highlighted={highlightedFields['llm_reserved_tokens']} />
                <NumberInput label="恢复预留" value={config?.llm_buffer_tokens} onChange={(v) => updateValue('llm_buffer_tokens', v)} min={1000} max={200000} step={1000} highlighted={highlightedFields['llm_buffer_tokens']} />
              </div>
              {/* 实时计算阈值 */}
              {config?.llm_context_window !== undefined && config?.llm_reserved_tokens !== undefined && config?.llm_buffer_tokens !== undefined && (
                <div className="mt-3.5 p-2.5 rounded-lg bg-bgSubtle text-[12px] font-mono text-textSecondary flex items-center justify-between">
                  <span>输入阈值: <span className="text-primeAccent font-semibold">{(config.llm_context_window - config.llm_reserved_tokens - config.llm_buffer_tokens).toLocaleString()}</span> tokens</span>
                  <span className="text-textTertiary">RAG: {config?.rag_context_limit || 12000} 字符</span>
                </div>
              )}
            </div>
          </div>

          {/* VLM API 配置 */}
          <div className="rounded-xl p-4 bg-bgSubtle border border-borderSubtle">
            <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary">
              VLM API (视觉语言模型)
            </div>
            <div className="space-y-2.5">
              <TextInput label="API 地址" value={config?.vlm_api_url} onChange={(v) => updateValue('vlm_api_url', v)} />
              <TokenInput label="API Token" value={config?.vlm_api_token} onChange={(v) => updateValue('vlm_api_token', v)} visible={visibleTokens['vlm_api_token']} onToggleVisibility={() => toggleTokenVisibility('vlm_api_token')} onCopy={() => copyToClipboard(config?.vlm_api_token || '')} />
              <TextInput label="模型 ID" value={config?.vlm_model_id} onChange={(v) => updateValue('vlm_model_id', v)} />
            </div>
          </div>

          {/* Embedding 配置 */}
          <div className="rounded-xl p-4 bg-bgSubtle border border-borderSubtle">
            <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary">
              Embedding (向量嵌入)
            </div>
            <div className="space-y-2.5">
              <TextInput label="模型 ID" value={config?.embedding_model_id} onChange={(v) => updateValue('embedding_model_id', v)} />
              <TextInput label="本地 API" value={config?.embedding_api_url} onChange={(v) => updateValue('embedding_api_url', v)} placeholder="http://127.0.0.1:8001/v1/embeddings" />
              <TextInput label="云端 API" value={config?.embedding_api_url_cloud} onChange={(v) => updateValue('embedding_api_url_cloud', v)} />
            </div>
          </div>
        </div>

        {/* 右列：Paddle + 图片 + 分片 */}
        <div className="space-y-6">
          {/* Paddle OCR 配置 */}
          <div className="rounded-xl p-4 bg-bgSubtle border border-borderSubtle">
            <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary">
              Paddle OCR (文档解析)
            </div>
            <div className="space-y-2.5">
              <TextInput label="API 地址" value={config?.paddle_api_url} onChange={(v) => updateValue('paddle_api_url', v)} />
              <TokenInput label="API Token" value={config?.paddle_token} onChange={(v) => updateValue('paddle_token', v)} visible={visibleTokens['paddle_token']} onToggleVisibility={() => toggleTokenVisibility('paddle_token')} onCopy={() => copyToClipboard(config?.paddle_token || '')} />
            </div>
          </div>

          {/* 图片生成配置 */}
          <div className="rounded-xl p-4 bg-bgSubtle border border-borderSubtle">
            <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary">
              图片生成
            </div>
            <div className="space-y-2.5">
              <TextInput label="API 地址" value={config?.image_api_url} onChange={(v) => updateValue('image_api_url', v)} />
              <TokenInput label="API Token" value={config?.image_api_token} onChange={(v) => updateValue('image_api_token', v)} visible={visibleTokens['image_api_token']} onToggleVisibility={() => toggleTokenVisibility('image_api_token')} onCopy={() => copyToClipboard(config?.image_api_token || '')} />
            </div>
          </div>

          {/* 分片配置 */}
          <div className="rounded-xl p-4 bg-bgSubtle border border-borderSubtle">
            <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary">
              文档分片配置
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <NumberInput label="单片最大" value={config?.chunk_max_size} onChange={(v) => updateValue('chunk_max_size', v)} min={100} max={2000} />
              <NumberInput label="单片最小" value={config?.chunk_min_size} onChange={(v) => updateValue('chunk_min_size', v)} min={50} max={500} />
              <NumberInput label="重叠字符" value={config?.chunk_overlap} onChange={(v) => updateValue('chunk_overlap', v)} min={0} max={200} />
              <NumberInput label="最大分片" value={config?.chunk_max_per_doc} onChange={(v) => updateValue('chunk_max_per_doc', v)} min={10} max={500} />
            </div>
          </div>

          {/* RAG 上下文限制 */}
          <div className="rounded-xl p-4 bg-bgSubtle border border-borderSubtle">
            <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary">
              RAG 检索配置
            </div>
            <NumberInput label="上下文限制" value={config?.rag_context_limit} onChange={(v) => updateValue('rag_context_limit', v)} min={5000} max={100000} step={1000} />
            <div className="text-[11px] text-textTertiary mt-2">
              RAG 检索时构建上下文的最大字符数
            </div>
          </div>
        </div>

      </div>

      {/* 说明 */}
      <div className="mt-3 rounded-xl p-3 bg-bgSubtle border border-borderSubtle">
        <div className="text-[11px] text-textTertiary">
          <span className="font-mono uppercase tracking-wider mb-1 flex items-center gap-1">
            <AlertCircle size={10} />
            说明
          </span>
          <ul className="list-disc list-inside space-y-0.5 ml-1 text-[11px] mt-1">
            <li>配置保存后立即生效并热加载至后端存储</li>
            <li>联动规则：选择模型或侦测匹配后，自动适配上下文窗口、输出上限及双预留参数</li>
            <li>计算公式：输入阈值 = 上下文窗口 - 输出预留 - 恢复预留</li>
          </ul>
        </div>
      </div>

    </div>
  );
}