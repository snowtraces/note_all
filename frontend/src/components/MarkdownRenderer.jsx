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
              <div className="bg-code rounded-lg border border-borderSubtle my-4 overflow-hidden shadow-lg">
                <div className="bg-code-header px-4 py-2 flex items-center justify-between border-b border-borderSubtle">
                  <span className="text-[11px] text-textSecondary font-mono lowercase">{match ? match[1] : 'code'}</span>
                </div>
                <pre className="p-4 overflow-x-auto custom-scrollbar text-[13px] font-mono leading-relaxed" {...props}>
                  <code className={className} style={{background: 'transparent', padding: 0}}>
                    {children}
                  </code>
                </pre>
              </div>
            ) : (
              <code className="text-textPrimary font-mono bg-code border border-borderSubtle px-1.5 py-0.5 rounded text-[0.9em] mx-0.5" {...props}>
                {children}
              </code>
            )
          },
          blockquote: ({node, ...props}) => (
            <blockquote className="border-l-4 border-primeAccent/60 bg-gradient-to-r from-primeAccent/10 to-transparent pl-4 py-2 my-4 rounded-r-lg text-textSecondary italic" {...props} />
          ),
          ul: ({node, ...props}) => <ul className="list-disc my-4 space-y-1.5 ml-6 opacity-90" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal my-4 space-y-1.5 ml-6 opacity-90" {...props} />,
          li: ({node, ...props}) => <li className="pl-1" {...props} />,
          h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-textPrimary mt-8 mb-4 tracking-wider pb-2 border-b border-borderSubtle" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-xl font-semibold text-textPrimary mt-6 mb-3 tracking-wide" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-lg font-medium text-textPrimary mt-5 mb-2" {...props} />,
          a: ({node, ...props}) => <a className="text-primeAccent hover:text-primeAccentDim transition-colors underline underline-offset-4 decoration-primeAccent/30" target="_blank" rel="noopener noreferrer" {...props} />,
          p: ({node, ...props}) => <p className="my-3 leading-[1.8] text-textPrimary" {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
