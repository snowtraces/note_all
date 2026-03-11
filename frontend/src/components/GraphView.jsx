import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { getGraph } from '../api/noteApi';
import { BrainCircuit, Expand, Share2, Eye, ShieldAlert, X } from 'lucide-react';

export default function GraphView({ onNodeClick, onClose, data: initialData, onDataLoad, active }) {
  const containerRef = useRef(null);
  const fgRef = useRef();
  
  const [graphData, setGraphData] = useState(initialData || { nodes: [], links: [] });
  const [loading, setLoading] = useState(!initialData);
  const [hoverNode, setHoverNode] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  const highlightNodes = useRef(new Set());
  const highlightLinks = useRef(new Set());

  // 1. 数据加载逻辑
  useEffect(() => {
    if (initialData) {
        setGraphData(initialData);
        setLoading(false);
        return;
    }

    let mounted = true;
    setLoading(true);
    getGraph().then(res => {
      if(mounted){
          setGraphData(res);
          setLoading(false);
          if (onDataLoad) onDataLoad(res);
          // 首次冷启动加载时执行一次自动对齐
          setTimeout(() => {
              fgRef.current?.zoomToFit(600, 100);
          }, 300);
      }
    }).catch(err => {
        console.error("Graph fetch error:", err);
        setLoading(false);
    });
    return () => { mounted = false; };
  }, [initialData, onDataLoad]);

  // 2. 尺寸监听逻辑 (ResizeObserver)
  useEffect(() => {
    if (!containerRef.current) return;
    
    let frameId;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          cancelAnimationFrame(frameId);
          frameId = requestAnimationFrame(() => {
            setDimensions({ width, height });
          });
        }
      }
    });

    observer.observe(containerRef.current);
    
    // 初始探测
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0) {
      setDimensions({ width: rect.width, height: rect.height });
    }

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameId);
    };
  }, []);

  // 3. 激活状态响应 (从切换回来时强制适应尺寸)
  useEffect(() => {
    if (active && containerRef.current) {
        // 给 300ms 宽限期等待 App.jsx 的 transition 动画
        const timer = setTimeout(() => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                if (rect.width > 0) {
                    setDimensions({ width: rect.width, height: rect.height });
                    if (fgRef.current) {
                        fgRef.current.zoomToFit(400, 100);
                    }
                }
            }
        }, 300); 
        return () => clearTimeout(timer);
    }
  }, [active]);

  // 4. 力导向参数配置
  useEffect(() => {
    if (fgRef.current && !loading) {
        fgRef.current.d3Force('charge').strength(-300).distanceMax(1000);
    }
  }, [loading, graphData]);

  // Obsidian 风格样式常量
  const TAG_SIZE_MIN = 6;
  const TAG_SIZE_MAX = 15;
  const TAG_SIZE_BASE = 6;
  const TAG_SIZE_SCALE = 2.6;
  const TAG_LABEL_SCALE = 0.9;
  const TAG_LABEL_COUNT_THRESHOLD = 6;

  const getTagSize = useCallback((count = 0) => {
    const scaled = TAG_SIZE_BASE + TAG_SIZE_SCALE * Math.log1p(Math.max(count, 0));
    return Math.min(Math.max(scaled, TAG_SIZE_MIN), TAG_SIZE_MAX);
  }, []);

  const tagDegree = useMemo(() => {
    const degree = new Map();
    graphData.links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      if (typeof sourceId === 'string' && sourceId.startsWith('tag_')) {
        degree.set(sourceId, (degree.get(sourceId) || 0) + 1);
      }
      if (typeof targetId === 'string' && targetId.startsWith('tag_')) {
        degree.set(targetId, (degree.get(targetId) || 0) + 1);
      }
    });
    return degree;
  }, [graphData.links]);

  const paintNode = useCallback((node, ctx, globalScale) => {
    const isTag = node.type === 'tag';
    const isHovered = node === hoverNode;
    const isHighlighted = hoverNode ? highlightNodes.current.has(node) : false;
    const isDimmed = hoverNode && !isHighlighted;
    
    ctx.beginPath();
    if (isTag) {
        const size = getTagSize(node.count);
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
        ctx.fillStyle = isDimmed ? 'rgba(80, 200, 120, 0.15)' : (isHighlighted ? 'rgba(80, 200, 120, 1)' : 'rgba(80, 200, 120, 0.9)'); 
        ctx.fill();

        const shouldShowTagLabel = isHighlighted || isHovered || globalScale >= TAG_LABEL_SCALE || (node.count || 0) >= TAG_LABEL_COUNT_THRESHOLD;
        if (shouldShowTagLabel && !isDimmed) {
            const fontSize = isHighlighted ? 14 / globalScale : 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isHighlighted ? 'rgba(255, 255, 255, 1)' : 'rgba(210, 210, 210, 0.9)';
            ctx.fillText(node.name || '?', node.x, node.y + size + 4 + fontSize/2);
        }
    } else {
        const size = isHighlighted ? 8 : 6;
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
        if (isDimmed) ctx.fillStyle = 'rgba(80, 80, 80, 0.15)';
        else if (isHighlighted) ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        else ctx.fillStyle = 'rgba(210, 210, 210, 0.8)';
        ctx.fill();

        if (isHovered) {
             ctx.beginPath();
             ctx.arc(node.x, node.y, size + 3, 0, 2 * Math.PI, false);
             ctx.strokeStyle = 'rgba(80, 200, 120, 1)';
             ctx.lineWidth = 1.5 / globalScale;
             ctx.stroke();
        }
    }
  }, [hoverNode, getTagSize]);

  const handleNodeHover = useCallback(node => {
     highlightNodes.current.clear();
     highlightLinks.current.clear();
     if (node) {
         highlightNodes.current.add(node);
         graphData.links.forEach(link => {
             const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
             const targetId = typeof link.target === 'object' ? link.target.id : link.target;
             if (sourceId === node.id || targetId === node.id) {
                 highlightLinks.current.add(link);
                 if (typeof link.source === 'object') highlightNodes.current.add(link.source);
                 if (typeof link.target === 'object') highlightNodes.current.add(link.target);
             }
         });
     }
     setHoverNode(node || null);
     if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'default';
  }, [graphData]);

  const handleNodeClick = useCallback(node => {
     if (node.type === 'note' && onNodeClick) {
         onNodeClick({ id: node.note_id, ...node });
     } else if (node.type === 'tag') {
        fgRef.current?.centerAt(node.x, node.y, 400);
        fgRef.current?.zoom(4, 400);
     }
  }, [onNodeClick]);

  if (loading && !initialData) {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center text-silverText/60 bg-[#050505]">
            <BrainCircuit size={48} className="animate-spin mb-4 text-primeAccent/40" />
            <span className="text-sm tracking-widest uppercase">Initializing Knowledge Matrix...</span>
        </div>
    );
  }

  return (
    <div className="w-full h-full relative bg-[#050505] overflow-hidden" ref={containerRef}>
        {/* 指标展示 */}
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-3 pointer-events-none">
            <h2 className="text-xl font-extrabold text-white tracking-widest uppercase flex items-center gap-2">
                <Share2 className="text-primeAccent" size={20} />
                Knowledge Graph
            </h2>
            <p className="text-silverText/50 text-xs font-mono mt-1">
                Nodes: {graphData.nodes.length} | Links: {graphData.links.length}
            </p>
        </div>

        {/* 控制按钮 */}
        <div className="absolute bottom-6 right-6 z-10 flex gap-2 pointer-events-auto">
            <button 
                onClick={() => fgRef.current?.zoomToFit(500, 100)}
                className="p-3 bg-white/5 border border-white/10 rounded-full text-white/70 hover:bg-primeAccent/20 hover:text-primeAccent transition-colors group"
                title="Reset View"
            >
                <Expand size={16} />
            </button>
            {onClose && (
               <button 
                   onClick={onClose}
                   className="p-3 bg-red-500/10 border border-red-500/20 rounded-full text-red-500/70 hover:bg-red-500/20 hover:text-red-500 transition-colors group"
                   title="Close Graph"
               >
                   <X size={16} />
               </button>
            )}
        </div>

        {/* Legend */}
        <div className="absolute bottom-6 left-6 z-10 pointer-events-none flex flex-col gap-2">
             <div className="flex items-center gap-2 text-[11px] text-white/50">
                 <div className="w-3 h-3 rounded-full bg-[rgba(80,200,120,0.9)]"></div>
                 Concept Tag
             </div>
             <div className="flex items-center gap-2 text-[11px] text-white/50">
                 <div className="w-2 h-2 rounded-full bg-[rgba(210,210,210,0.8)] ml-0.5 mt-0.5"></div>
                 Note Fragment
             </div>
        </div>

        {graphData.nodes.length === 0 && !loading && (
             <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none text-center">
                <ShieldAlert size={48} className="text-white/10 mb-4" />
                <p className="text-white/40 text-sm">No data available in graph matrix.</p>
             </div>
        )}

        {dimensions.width > 0 && (
            <div className="absolute inset-0 z-0" style={{ pointerEvents: 'auto' }}>
                <ForceGraph2D
                    ref={fgRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={graphData}
                    nodeCanvasObject={paintNode}
                    nodePointerAreaPaint={(node, color, ctx) => {
                        const size = node.type === 'tag' ? getTagSize(node.count) + 4 : 8;
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
                        ctx.fill();
                    }}
                    linkColor={link => hoverNode
                      ? (highlightLinks.current.has(link) ? 'rgba(80, 200, 120, 0.9)' : 'rgba(80, 80, 80, 0.05)')
                      : 'rgba(100, 100, 100, 0.4)'}
                    linkWidth={link => hoverNode && highlightLinks.current.has(link) ? 2.2 : 0.8}
                    onNodeHover={handleNodeHover}
                    onNodeClick={handleNodeClick}
                    nodeLabel={(node) => {
                        if (node.type === 'tag') {
                            return `<div class="bg-black/90 text-primeAccent px-2 py-1 rounded text-xs border border-white/10 font-mono shadow-xl backdrop-blur-sm">#${node.name} (${node.count})</div>`;
                        }
                        return `<div class="bg-black/95 text-white/80 p-3 rounded-lg max-w-[280px] border border-white/10 text-[13px] shadow-2xl leading-relaxed backdrop-blur-md">
                                    <span class="block mb-1.5 font-bold truncate text-primeAccent tracking-wide text-[14px]">${node.name}</span>
                                    <span class="line-clamp-3 text-white/60">${node.summary || '暂无摘要'}</span>
                                </div>`;
                    }}
                    d3VelocityDecay={0.4}
                    d3AlphaDecay={0.02}
                    onEngineStop={() => {
                        // 结束时如果是首次冷启动，由于 zoomToFit 可能由于 dimensions 还没稳定而失效，补一次
                        if (!initialData) {
                            fgRef.current?.zoomToFit(600, 100);
                        }
                    }} 
                />
            </div>
        )}
    </div>
  );
}
