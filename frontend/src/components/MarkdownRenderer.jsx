import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';

export default function MarkdownRenderer({ content, className = '' }) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          code({node, className, children, ...props}) {
            const match = /language-(\w+)/.exec(className || '')
            const isBlock = match || String(children).includes('\n')
            return isBlock ? (
              <div className="bg-[#1e1e1e] rounded-lg border border-white/10 my-4 overflow-hidden shadow-lg">
                <div className="bg-[#2a2a2a] px-4 py-2 flex items-center justify-between border-b border-white/10">
                  <span className="text-[11px] text-silverText/60 font-mono lowercase">{match ? match[1] : 'code'}</span>
                </div>
                <pre className="p-4 overflow-x-auto custom-scrollbar text-[13px] font-mono leading-relaxed" {...props}>
                  <code className={className} style={{background: 'transparent', padding: 0}}>
                    {children}
                  </code>
                </pre>
              </div>
            ) : (
              <code className="text-primeAccent font-mono bg-[#1e1e1e] px-1.5 py-0.5 rounded text-[0.9em] mx-0.5" {...props}>
                {children}
              </code>
            )
          },
          blockquote: ({node, ...props}) => (
            <blockquote className="border-l-4 border-primeAccent/60 bg-gradient-to-r from-primeAccent/10 to-transparent pl-4 py-2 my-4 rounded-r-lg text-silverText/90 italic" {...props} />
          ),
          ul: ({node, ...props}) => <ul className="list-disc my-4 space-y-1.5 ml-6 opacity-90 marker:text-primeAccent" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal my-4 space-y-1.5 ml-6 opacity-90 marker:text-primeAccent" {...props} />,
          li: ({node, ...props}) => <li className="pl-1" {...props} />,
          h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-primeAccent mt-8 mb-4 tracking-wider pb-2 border-b border-white/10" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-xl font-semibold text-primeAccent mt-6 mb-3 tracking-wide" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-lg font-medium text-white/90 mt-5 mb-2" {...props} />,
          a: ({node, ...props}) => <a className="text-primeAccent hover:text-[#45a29e] underline underline-offset-4 decoration-primeAccent/30 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
          p: ({node, ...props}) => <p className="my-3 leading-[1.8]" {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
