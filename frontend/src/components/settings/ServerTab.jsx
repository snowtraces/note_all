import React, { useState, useEffect } from 'react';
import { Server, Wifi, WifiOff, Clock, Check, Loader2, Zap, AlertCircle } from 'lucide-react';
import { getActiveServerUrl, setActiveServerUrl, getSpeedTestResults, setSpeedTestResults } from '../../api/client';
import { fetchAddressesAndTest } from '../../api/serverApi';
import { useTheme } from '../../context/ThemeContext';

export default function ServerTab() {
  const [activeUrl, setActiveUrlState] = useState('');
  const [results, setResults] = useState([]);
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [testBaseUrl, setTestBaseUrl] = useState(''); // 测速基准地址
  const { mode } = useTheme();

  // 初始化：加载缓存数据
  useEffect(() => {
    const cachedUrl = getActiveServerUrl();
    const cachedResults = getSpeedTestResults();
    setActiveUrlState(cachedUrl);
    setResults(cachedResults || []);
    setTestBaseUrl(window.location.origin); // 默认为浏览器当前地址
  }, []);

  // 显示状态消息
  const showStatus = (msg, type) => {
    setStatusMsg({ text: msg, type });
    setTimeout(() => setStatusMsg(''), 3000);
  };

  // 渲染测速结果列表
  const renderResults = (testResults, currentUrl, recommendedUrl = null) => {
    if (!testResults || testResults.length === 0) {
      return (
        <div className="text-center py-6 text-textTertiary">
          暂无测速数据，点击下方按钮开始测速
        </div>
      );
    }

    const successResults = testResults.filter(r => r.success).sort((a, b) => a.latency - b.latency);

    return (
      <div className="space-y-2">
        {testResults.map((r, idx) => {
          const isActive = r.url === currentUrl;
          const isRecommended = r.url === recommendedUrl && !currentUrl;
          const isSuccess = r.success;

          return (
            <div
              key={idx}
              onClick={() => {
                if (isSuccess) {
                  handleSelectUrl(r.url);
                }
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer overflow-hidden ${isActive
                ? 'bg-primeAccent/10 border-primeAccent/30 ring-2 ring-primeAccent/20'
                : isRecommended
                  ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
                  : isSuccess
                    ? 'bg-bgSubtle border-borderSubtle hover:bg-bgHover'
                    : 'bg-red-500/10 border-red-500/20 opacity-60'
                }`}
            >
              {isSuccess ? (
                <Wifi size={14} className={`shrink-0 ${isActive ? 'text-primeAccent' : 'text-textTertiary'}`} />
              ) : (
                <WifiOff size={14} className="shrink-0 text-red-400" />
              )}
              <div className={`flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-mono ${isActive ? 'text-primeAccent font-semibold' : 'text-textSecondary'}`}>
                {r.url}
              </div>
              <div className="shrink-0 flex items-center gap-1 text-[12px] font-mono whitespace-nowrap">
                {isSuccess ? (
                  <>
                    <Clock size={12} className={isActive ? 'text-primeAccent' : 'text-textTertiary'} />
                    <span className={isActive ? 'text-primeAccent' : 'text-textTertiary'}>{r.latency}ms</span>
                  </>
                ) : (
                  <span className="text-red-400">失败</span>
                )}
                {isActive && <Check size={12} className="text-primeAccent" />}
                {isRecommended && !isActive && <span className="text-emerald-500">(推荐)</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // 选择地址
  const handleSelectUrl = (url) => {
    setActiveServerUrl(url);
    setActiveUrlState(url);
    setResults(prev => [...prev]); // 触发重新渲染
    showStatus(`已切换到 ${url}`, 'success');
  };

  // 执行测速
  const handleSpeedTest = async () => {
    setTesting(true);
    setResults([]);
    setStatusMsg({ text: '正在获取地址列表...', type: 'loading' });

    const serverUrl = testBaseUrl.replace(/\/$/, '');

    try {
      const { results: testResults, recommendedUrl } = await fetchAddressesAndTest(serverUrl);
      setResults(testResults);
      setSpeedTestResults(testResults);
      setStatusMsg('');

      if (!testResults.some(r => r.success)) {
        showStatus('所有地址均无法连接', 'error');
      } else {
        showStatus(`测速完成，推荐地址: ${recommendedUrl}`, 'success');
      }
    } catch (e) {
      setStatusMsg('');
      showStatus(e.message || '测速失败', 'error');
    }

    setTesting(false);
  };

  // 清除激活地址（恢复默认）
  const handleClearActiveUrl = () => {
    setActiveServerUrl('');
    setActiveUrlState('');
    setResults(prev => [...prev]); // 触发重新渲染
    showStatus('已恢复默认服务器地址', 'success');
  };

  return (
    <div className="flex flex-1 overflow-hidden min-h-[400px]">
      {/* 左侧：设置项 */}
      <div
        style={{ backgroundColor: 'var(--bg-sidebar)' }}
        className="w-[420px] shrink-0 border-r flex flex-col p-6 gap-5 overflow-y-auto custom-scrollbar backdrop-blur border-borderSubtle"
      >
        {/* 当前激活地址 */}
        <div className="rounded-xl p-4 bg-bgSubtle border border-borderSubtle">
          <div className="text-[11px] uppercase tracking-wider mb-2 font-mono text-textTertiary">当前服务器</div>
          <div className="flex items-center gap-2">
            <Server size={14} className={`shrink-0 ${activeUrl ? 'text-primeAccent' : 'text-textTertiary'}`} />
            <span className={`text-[13px] font-mono truncate flex-1 min-w-0 ${activeUrl ? 'text-primeAccent' : 'text-textTertiary'}`}>
              {activeUrl || '默认 (当前域名)'}
            </span>
            {activeUrl && (
              <button
                onClick={handleClearActiveUrl}
                className="shrink-0 text-[11px] px-2 py-1 rounded-lg transition-colors bg-bgHover hover:bg-bgHover text-textSecondary"
              >
                恢复默认
              </button>
            )}
          </div>
        </div>

        {/* 服务器地址输入 */}
        <div className="rounded-xl p-4 bg-bgSubtle border border-borderSubtle">
          <div className="text-[11px] uppercase tracking-wider mb-2 font-mono text-textTertiary">测速基准地址</div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={testBaseUrl}
              onChange={(e) => setTestBaseUrl(e.target.value)}
              placeholder="http://localhost:3344"
              className="flex-1 rounded-lg px-3 py-2 text-[13px] font-mono outline-none transition-colors bg-bgSubtle text-textSecondary placeholder-textMuted focus:bg-bgHover focus:ring-2 focus:ring-primeAccent/30"
            />
            <button
              onClick={handleSpeedTest}
              disabled={testing || !testBaseUrl}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-[13px] transition-all shrink-0 ${testing || !testBaseUrl
                ? 'bg-bgSubtle text-textTertiary cursor-not-allowed'
                : 'bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 border border-primeAccent/30'
                }`}
            >
              {testing ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  测速中
                </>
              ) : (
                <>
                  <Zap size={12} />
                  开始测速
                </>
              )}
            </button>
          </div>
          <div className="text-[11px] mt-2 text-textTertiary">
            输入服务器地址进行测速，默认为当前浏览器访问地址
          </div>
        </div>

        {/* 状态消息 */}
        {statusMsg && (
          <div className={`rounded-xl p-3 text-[12px] flex items-center gap-2 ${statusMsg.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-500'
            : statusMsg.type === 'error'
              ? 'bg-red-500/10 text-red-400'
              : 'bg-bgSubtle text-textSecondary'
            }`}>
            {statusMsg.type === 'loading' && <Loader2 size={12} className="animate-spin" />}
            {statusMsg.text}
          </div>
        )}

        {/* 使用说明 */}
        <div className="rounded-xl p-4 bg-bgSubtle border border-borderSubtle">
          <div className="text-[11px] leading-relaxed text-textTertiary">
            <div className="flex items-center gap-1.5 mb-2 font-mono uppercase tracking-wider">
              <AlertCircle size={12} className="text-textTertiary" />
              使用说明
            </div>
            <ul className="list-disc list-inside space-y-1 ml-1 text-[12px]">
              <li>测速会向服务器请求所有可用IP地址</li>
              <li>每个地址将并发调用 /ping 测量延迟</li>
              <li>点击右侧列表中的地址可切换服务器</li>
              <li>"恢复默认"将使用当前域名</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 右侧：测速结果 */}
      <div
        style={{ backgroundColor: 'var(--bg-modal)' }}
        className={`flex-1 p-6 flex flex-col backdrop-blur`}
      >
        <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary">
          测速结果
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {renderResults(results, activeUrl)}
        </div>
      </div>
    </div>
  );
}
