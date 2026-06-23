import React, { useEffect, useState } from 'react';
import { getPendingWikiTasks, compileWikiTask, rejectWikiTask } from '../api/wikiApi';
import { useSSE } from '../hooks/useSSE';

const WikiPrompt = () => {
  const [tasks, setTasks] = useState([]);
  const [isOpen, setIsOpen] = useState(true);

  const fetchTasks = async () => {
    try {
      const data = await getPendingWikiTasks();
      setTasks(data || []);
    } catch (e) {
      console.error('Failed to fetch pending wiki tasks', e);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  useSSE({
    url: '/api/stream',
    enabled: true,
    onMessage: (data) => {
      if (data === 'wiki_sniffed') {
        fetchTasks();
        setIsOpen(true);
      }
    }
  });

  const handleCompile = async (taskId) => {
    try {
      await compileWikiTask(taskId);
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (e) {
      console.error(e);
    }
  };

  const handleReject = async (taskId) => {
    try {
      await rejectWikiTask(taskId);
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen || tasks.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-80 bg-modal border border-borderSubtle rounded-2xl shadow-2xl overflow-hidden card-rim flex flex-col transition-all duration-300">
      <div className="bg-bgSubtle px-4 py-3 flex items-center justify-between border-b border-borderSubtle">
        <div className="flex items-center gap-2 text-textPrimary font-semibold text-sm">
          <svg className="w-4 h-4 text-primeAccent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          知识发现引擎
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="text-textTertiary hover:text-textSecondary transition-colors duration-200 cursor-pointer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div className="p-4 flex flex-col gap-3 max-h-60 overflow-y-auto custom-scrollbar">
        <p className="text-xs text-textSecondary leading-relaxed">
          助手在您最近收集的笔记中嗅探到了以下潜在核心概念，是否授权系统进行“全库炼金”并生成结构化词条？
        </p>
        <div className="flex flex-col gap-2">
          {tasks.map(t => (
            <div key={t.id} className="flex items-center justify-between bg-base border border-borderSubtle rounded-xl p-2 transition-all duration-200 hover:border-primeAccent/30 hover:shadow-sm">
              <span className="text-sm font-medium text-textPrimary truncate flex-1 px-1">{t.concept_name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button 
                  onClick={() => handleCompile(t.id)}
                  className="px-2 py-1 text-xs bg-primeAccent text-white-fixed rounded-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 font-medium cursor-pointer"
                >
                  编纂
                </button>
                <button 
                  onClick={() => handleReject(t.id)}
                  className="px-2 py-1 text-xs bg-bgHover border border-borderSubtle text-textSecondary rounded-lg hover:bg-borderSubtle hover:text-textPrimary active:scale-[0.98] transition-all duration-200 cursor-pointer"
                >
                  忽略
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WikiPrompt;
