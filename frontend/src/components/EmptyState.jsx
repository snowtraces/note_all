import React, { useEffect, useState } from 'react';
import { BrainCircuit, Tag } from 'lucide-react';
import { getTags } from '../api/noteApi';

export default function EmptyState({ onTagClick }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTags()
      .then(data => setTags(data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // 根据 count 映射字体大小：最小 11px，最大 22px
  const counts = tags.map(t => t.count);
  const maxCount = Math.max(...counts, 1);
  const minCount = Math.min(...counts, 1);
  const getFontSize = (count) => {
    if (maxCount === minCount) return 14;
    const ratio = (count - minCount) / (maxCount - minCount);
    return Math.round(11 + ratio * 11);
  };

  // 根据 count 映射透明度：0.45 ~ 1
  const getOpacity = (count) => {
    if (maxCount === minCount) return 0.7;
    const ratio = (count - minCount) / (maxCount - minCount);
    return parseFloat((0.45 + ratio * 0.55).toFixed(2));
  };

  // 根据 count 映射色彩权重，高频标签更亮
  const getColorClass = (count) => {
    if (maxCount === minCount) return 'text-primeAccent/60';
    const ratio = (count - minCount) / (maxCount - minCount);
    if (ratio > 0.66) return 'text-primeAccent';
    if (ratio > 0.33) return 'text-primeAccent/70';
    return 'text-silverText/50';
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-silverText/20 bg-[#080808] relative overflow-hidden">
      {/* 背景光晕 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primeAccent/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center w-full max-w-2xl px-8">
        {/* 图标 + 标题区 */}
        <div className="w-20 h-20 mb-5 rounded-3xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center shadow-2xl">
          <BrainCircuit size={36} className="text-primeAccent/30" />
        </div>
        <h2 className="text-xl font-light tracking-wide mb-2 opacity-60 text-white">等待映射碎片记录</h2>
        <p className="text-[12px] font-mono opacity-35 text-center leading-relaxed mb-10">
          在左侧神经流中选择一条记忆碎片，<br />在此处展开其完整的多维度信息阵列。
        </p>

        {/* 词云区 */}
        {!loading && tags.length > 0 && (
          <div className="w-full">
            <div className="flex items-center justify-center gap-1.5 mb-4 opacity-40">
              <Tag size={11} className="text-primeAccent" />
              <span className="text-[10px] font-mono text-silverText/60 tracking-widest uppercase">知识标签云</span>
            </div>

            <div className="flex flex-wrap justify-center gap-x-4 gap-y-3">
              {tags.map((t) => (
                <button
                  key={t.tag}
                  onClick={() => onTagClick?.(t.tag)}
                  style={{ fontSize: `${getFontSize(t.count)}px`, opacity: getOpacity(t.count) }}
                  className={`
                    ${getColorClass(t.count)}
                    font-medium tracking-wide
                    transition-all duration-200
                    hover:opacity-100 hover:text-primeAccent hover:scale-110
                    cursor-pointer select-none
                    relative group
                  `}
                >
                  <span className="text-primeAccent/40 text-[0.7em] mr-0.5">#</span>{t.tag}
                  {/* 悬停时显示次数 */}
                  <span className="
                    absolute -top-5 left-1/2 -translate-x-1/2
                    bg-black/80 text-white/70 text-[9px] font-mono px-1.5 py-0.5 rounded
                    opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none
                    whitespace-nowrap
                  ">
                    {t.count} 条
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && tags.length === 0 && (
          <p className="text-[11px] font-mono opacity-25 text-center">
            暂无标签数据，上传文件后将自动提取...
          </p>
        )}
      </div>
    </div>
  );
}
