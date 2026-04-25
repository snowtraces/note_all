import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { getActiveServerUrl } from '../api/client';

const MarkdownRenderer = React.memo(function MarkdownRenderer({ content, className = '' }) {

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          img: ({ src, ...props }) => {
            const activeUrl = getActiveServerUrl();
            // 相对路径（以 / 开头）需要拼接服务器地址
            const fullSrc = activeUrl && src?.startsWith('/') ? `${activeUrl}${src}` : src;
            return <img src={fullSrc} {...props} />;
          },
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
          h1: ({node, children, ...props}) => {
            const flatten = (children) => {
              return React.Children.toArray(children).map(child => {
                if (typeof child === 'string') return child;
                if (child.props?.children) return flatten(child.props.children);
                return '';
              }).join('');
            };
            const text = flatten(children);
            const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '');
            return <h1 id={id} className="scroll-mt-24 text-2xl font-bold text-textPrimary mt-8 mb-4 tracking-wider pb-2 border-b border-borderSubtle" {...props}>{children}</h1>;
          },
          h2: ({node, children, ...props}) => {
            const flatten = (children) => {
              return React.Children.toArray(children).map(child => {
                if (typeof child === 'string') return child;
                if (child.props?.children) return flatten(child.props.children);
                return '';
              }).join('');
            };
            const text = flatten(children);
            const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '');
            return <h2 id={id} className="scroll-mt-24 text-xl font-semibold text-textPrimary mt-6 mb-3 tracking-wide" {...props}>{children}</h2>;
          },
          h3: ({node, children, ...props}) => {
            const flatten = (children) => {
              return React.Children.toArray(children).map(child => {
                if (typeof child === 'string') return child;
                if (child.props?.children) return flatten(child.props.children);
                return '';
              }).join('');
            };
            const text = flatten(children);
            const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '');
            return <h3 id={id} className="scroll-mt-24 text-lg font-medium text-textPrimary mt-5 mb-2" {...props}>{children}</h3>;
          },
          a: ({node, ...props}) => <a className="text-primeAccent hover:text-primeAccentDim transition-colors underline underline-offset-4 decoration-primeAccent/30" target="_blank" rel="noopener noreferrer" {...props} />,
          p: ({node, ...props}) => <p className="my-3 leading-[1.8] text-textPrimary" {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownRenderer;
