import React, { useState, useEffect, useRef } from 'react';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { Image } from '@tiptap/extension-image';
import { getActiveServerUrl } from '../../api/client';

const TiptapImageComponent = ({ node, updateAttributes, editor }) => {
  const isEditable = editor?.isEditable;
  const src = node.attrs.src;
  const width = node.attrs.width || 'auto';
  const activeUrl = getActiveServerUrl();
  const fullSrc = activeUrl && src?.startsWith('/') ? `${activeUrl}${src}` : src;
  const [showSizePicker, setShowSizePicker] = useState(false);
  const pickerRef = useRef(null);

  const sizes = [
    { label: '600px', value: '600px' },
    { label: '900px', value: '900px' },
    { label: '1200px', value: '1200px' },
    { label: '25%', value: '25%' },
    { label: '50%', value: '50%' },
    { label: '75%', value: '75%' },
    { label: '100%', value: '100%' },
    { label: '自适应', value: 'auto' },
  ];

  useEffect(() => {
    if (!showSizePicker) return;
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowSizePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSizePicker]);

  return (
    <NodeViewWrapper className="tiptap-image-wrapper flex justify-start my-4 group">
      <div
        className={`relative max-w-full ${width === 'auto' ? 'w-fit' : ''}`}
        style={width !== 'auto' ? { width } : undefined}
      >
        <img
          src={fullSrc}
          alt={node.attrs.alt || ''}
          className="tiptap-image rounded-lg shadow-sm group-hover:shadow-md transition-shadow duration-300 block"
          style={{ width: width === 'auto' ? 'auto' : '100%', maxHeight: '80vh' }}
          loading="lazy"
        />

        {isEditable && (
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10" contentEditable={false}>
            <button
              onClick={() => setShowSizePicker(!showSizePicker)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-modal border border-borderSubtle text-textPrimary rounded-md text-[11px] font-medium hover:text-primeAccent hover:border-primeAccent transition-all shadow-xl"
            >
              <span>{width === 'auto' ? '自适应' : width}</span>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${showSizePicker ? 'rotate-180' : ''}`}>
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {showSizePicker && (
              <div
                ref={pickerRef}
                className="absolute bottom-full right-0 mb-2 bg-modal border border-borderSubtle rounded-lg shadow-2xl py-1 min-w-[100px] overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-200"
              >
                {sizes.map(s => (
                  <button
                    key={s.value}
                    onClick={() => {
                      updateAttributes({ width: s.value });
                      setShowSizePicker(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-[11px] flex items-center justify-between transition-colors ${width === s.value
                      ? 'bg-primeAccent/15 text-primeAccent font-bold'
                      : 'text-textSecondary hover:bg-primeAccent/5 hover:text-textPrimary'
                      }`}
                  >
                    {s.label}
                    {width === s.value && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: 'auto',
        renderHTML: attributes => ({
          width: attributes.width !== 'auto' ? attributes.width : undefined,
          style: attributes.width !== 'auto' ? `width: ${attributes.width}; height: auto;` : undefined,
        }),
        parseHTML: element => element.getAttribute('width') || element.style.width || 'auto',
      },
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize: (state, node) => {
          const { src, alt, width } = node.attrs;
          if (width && width !== 'auto') {
            state.write(`<img src="${src}" alt="${alt || ''}" width="${width}" />`);
          } else {
            state.write(`![${alt || ''}](${src})`);
          }
          state.closeBlock(node);
        }
      }
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(TiptapImageComponent);
  },
}).configure({
  inline: false,
  allowBase64: true,
});