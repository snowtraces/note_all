import React from 'react';
import { BrainCircuit } from 'lucide-react';

export default function EmptyState() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-silverText/20 bg-[#080808] relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primeAccent/5 rounded-full blur-[100px] pointer-events-none"></div>
      
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-24 h-24 mb-6 rounded-3xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center shadow-2xl">
          <BrainCircuit size={40} className="text-primeAccent/30" />
        </div>
        <h2 className="text-xl font-light tracking-wide mb-3 opacity-60 text-white">等待映射碎片记录</h2>
        <p className="text-[13px] font-mono opacity-40 max-w-xs text-center leading-relaxed">
          在左侧神经流中选择一条记忆碎片，<br/>在此处展开其完整的多维度信息阵列。
        </p>
      </div>
    </div>
  );
}
