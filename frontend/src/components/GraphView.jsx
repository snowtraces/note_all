import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { getGraph } from '../api/noteApi';
import { BrainCircuit, Expand, Share2, ShieldAlert, X, Settings } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function GraphView({ onNodeClick, onClose, data: initialData, onDataLoad, active }) {
  const containerRef = useRef(null);
  const fgRef = useRef();
  const { mode } = useTheme();
  const isLight = mode === 'light';

  // 主题响应的颜色映射
  const GRAPH_COLORS = useMemo(() => ({
    dark: {
      notes: '#8b949e',      // 经典灰
      tags: '#4caf50',       // 草绿
      hover: '#c9d1d9',      // 亮白
      ghost: '#4b5563',      // 幽灵节点
      label: '#8b949e',      // 标签文字
      labelHover: '#f0f6fc', // hover 标签
      tagHover: '#69f0ae',   // tag hover
      link: 'rgba(139, 148, 158, 0.25)',
      linkHighlight: 'rgba(200, 209, 217, 0.6)',
      linkDim: 'rgba(139, 148, 158, 0.05)',
      tagDim: 'rgba(76, 175, 80, 0.05)',
      ghostDim: 'rgba(75, 85, 99, 0.05)',
      noteDim: 'rgba(139, 148, 158, 0.05)',
    },
    light: {
      notes: '#64748b',      // slate-500
      tags: '#059669',       // emerald-600
      hover: '#334155',      // slate-700
      ghost: '#94a3b8',      // slate-400
      label: '#64748b',      // 标签文字
      labelHover: '#0f172a', // hover 标签
      tagHover: '#10b981',   // tag hover (emerald-500)
      link: 'rgba(100, 116, 139, 0.25)',
      linkHighlight: 'rgba(51, 65, 85, 0.6)',
      linkDim: 'rgba(100, 116, 139, 0.05)',
      tagDim: 'rgba(5, 150, 105, 0.05)',
      ghostDim: 'rgba(148, 163, 184, 0.05)',
      noteDim: 'rgba(100, 116, 139, 0.05)',
    }
  }), []);

  const colors = GRAPH_COLORS[mode] || GRAPH_COLORS.dark;

  const [graphData, setGraphData] = useState(initialData || { nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [hoverNode, setHoverNode] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Obsidian 图谱的高级配置项 (多维度状态)
  const [showSettings, setShowSettings] = useState(false);
  const [repelForce, setRepelForce] = useState(120);
  const [linkDistance, setLinkDistance] = useState(45);
  const [nodeSizeMultiplier, setNodeSizeMultiplier] = useState(1.0);
  const [linkThicknessMultiplier, setLinkThicknessMultiplier] = useState(1.0);
  const [showTags, setShowTags] = useState(true);
  const [showOrphans, setShowOrphans] = useState(true);
  
  const highlightNodes = useRef(new Set());
  const highlightLinks = useRef(new Set());
  const initialZoomDone = useRef(false);

  // 1. 核心网络状态重载引擎：只要 active 变向为真（用户切换到这张图），立刻触发底层刷新，获得并网落点
  useEffect(() => {
    // 无论是首屏可见还是后期的热切换，只要该视图激活，就执行图谱轮询确保它是最新状态
    if (!active) return;
    
    let mounted = true;

    // 当本身什么都没有时开启 loading（否则就是静默覆盖数据）
    if (graphData.nodes.length === 0) {
        setLoading(true);
    }

    getGraph().then(res => {
      if(mounted){
          setGraphData(res);
          setLoading(false);
          if (onDataLoad) onDataLoad(res);
      }
    }).catch(err => {
        console.error("Graph fetch error:", err);
        if (mounted) setLoading(false);
    });
    
    return () => { mounted = false; };
  }, [active, onDataLoad]);

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
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0) {
      setDimensions({ width: rect.width, height: rect.height });
    }

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameId);
    };
  }, []);

  // 3. 激活状态响应 (跳转缩放适应)
  useEffect(() => {
    if (active && containerRef.current) {
        const timer = setTimeout(() => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                if (rect.width > 0) {
                    setDimensions({ width: rect.width, height: rect.height });
                    // 为了保留用户缩放操作，此处取消从内容阅读返回后的 zoomToFit 重置
                }
            }
        }, 300); 
        return () => clearTimeout(timer);
    }
  }, [active]);

  // 【核心】：根据 Obsidian 过滤配置动态计算最终渲染数据
  const renderedData = useMemo(() => {
     let nodes = [...graphData.nodes];
     let links = [...graphData.links];

     // 过滤标签设定
     if (!showTags) {
         nodes = nodes.filter(n => n.type !== 'tag');
         const tagIds = new Set(graphData.nodes.filter(n => n.type === 'tag').map(n => n.id));
         links = links.filter(l => {
             const sId = typeof l.source === 'object' ? l.source.id : l.source;
             const tId = typeof l.target === 'object' ? l.target.id : l.target;
             return !tagIds.has(sId) && !tagIds.has(tId);
         });
     }

     // 过滤孤立节点设定
     if (!showOrphans) {
         const degrees = new Map();
         links.forEach(l => {
            const sId = typeof l.source === 'object' ? l.source.id : l.source;
            const tId = typeof l.target === 'object' ? l.target.id : l.target;
            degrees.set(sId, (degrees.get(sId) || 0) + 1);
            degrees.set(tId, (degrees.get(tId) || 0) + 1);
         });
         // 如果连线数为0，则视为孤岛，过滤掉
         nodes = nodes.filter(n => (degrees.get(n.id) || 0) > 0);
     }

     return { nodes, links };
  }, [graphData, showTags, showOrphans]);

  // 4. 力导向参数配置 (动态响应配置面板)
  useEffect(() => {
    if (fgRef.current && !loading && renderedData.nodes.length > 0) {
        const engine = fgRef.current;
        
        // 动态接入面板参数
        engine.d3Force('charge').strength(-repelForce).distanceMax(600);
        engine.d3Force('link').distance(linkDistance);
        engine.d3Force('collide', null);

        engine.d3ReheatSimulation();
    }
  }, [loading, renderedData, repelForce, linkDistance]);

  // 预计算节点度数（连接数），用于对数映射点大小
  const nodeDegrees = useMemo(() => {
    const degrees = new Map();
    renderedData.links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      degrees.set(sourceId, (degrees.get(sourceId) || 0) + 1);
      degrees.set(targetId, (degrees.get(targetId) || 0) + 1);
    });
    return degrees;
  }, [renderedData.links]);

  // Obsidian Canvas 原生级渲染
  const paintNode = useCallback((node, ctx, globalScale) => {
    const isTag = node.type === 'tag';
    const isGhost = node.type === 'ghost';
    const degree = nodeDegrees.get(node.id) || 1;

    // 基础对数半径，并叠加密集设置里的倍率调节
    // Ghost节点固定更小
    const defaultRadius = isGhost ? 1.5 : (2.5 + Math.log1p(degree) * 1.5);
    const radius = defaultRadius * nodeSizeMultiplier;

    const isHovered = node === hoverNode;
    const isNeighbor = hoverNode && highlightNodes.current.has(node);
    const isDimmed = hoverNode && !isHovered && !isNeighbor;

    // 使用主题响应的颜色
    if (isDimmed) {
        ctx.fillStyle = isTag ? colors.tagDim : (isGhost ? colors.ghostDim : colors.noteDim);
    } else if (isHovered || isNeighbor) {
        ctx.fillStyle = isTag ? colors.tagHover : colors.hover;
    } else {
        ctx.fillStyle = isTag ? colors.tags : (isGhost ? colors.ghost : colors.notes);
    }
    ctx.fill();

    // 1. 绘制实体点
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);

    if (isDimmed) {
        ctx.fillStyle = isTag ? colors.tagDim : (isGhost ? colors.ghostDim : colors.noteDim);
    } else if (isHovered || isNeighbor) {
        ctx.fillStyle = isTag ? colors.tagHover : colors.hover;
    } else {
        ctx.fillStyle = isTag ? colors.tags : (isGhost ? colors.ghost : colors.notes);
    }
    ctx.fill();

    // 2. 绘制 Hover 的光晕边框
    if (isHovered) {
        ctx.beginPath();
        // Hover 外圈尺寸也受到乘数修正，保持匀称
        ctx.arc(node.x, node.y, (radius + 4)/globalScale, 0, 2 * Math.PI, false);
        ctx.strokeStyle = isTag ? colors.tagHover : colors.hover;
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
    }

    // 3. 绘制标签文本 (无需跟随鼠标，直接融合在 Canvas 中)
    const showLabel = isHovered || isNeighbor || (globalScale > 1.5 && degree > 2) || (globalScale > 2.5);

    if (showLabel && !isDimmed) {
        const labelText = isTag ? `# ${node.name}` : (node.name || '');
        const fontSize = ((isHovered ? 11 : 9) / globalScale) * Math.max(0.8, Math.min(nodeSizeMultiplier, 1.5));
        ctx.font = `${fontSize}px "Inter", sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = (isHovered || isNeighbor) ? colors.labelHover : colors.label;

        // 靠近点边缘绘制文字
        ctx.fillText(labelText, node.x + radius + (3 / globalScale), node.y);
    }
  }, [hoverNode, nodeDegrees, nodeSizeMultiplier, colors]);

  const handleNodeHover = useCallback(node => {
     highlightNodes.current.clear();
     highlightLinks.current.clear();
     if (node) {
         highlightNodes.current.add(node);
         renderedData.links.forEach(link => {
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
  }, [renderedData]);

  const handleNodeClick = useCallback(node => {
     if (node.type === 'note' && onNodeClick) {
         onNodeClick({ ...node, id: node.note_id });
     } else if (node.type === 'ghost') {
         // Ghost 节点处理: 如果系统有创建笔记的机制，可以在这里触发
         fgRef.current?.centerAt(node.x, node.y, 800);
         fgRef.current?.zoom(3.5, 800);
     } else {
         fgRef.current?.centerAt(node.x, node.y, 800);
         fgRef.current?.zoom(3.5, 800);
     }
  }, [onNodeClick]);

  return (
    <div className="w-full h-full relative bg-base0 overflow-hidden" ref={containerRef}>
        
        {/* 全屏加载指示器，取代原本粗暴的 return 拦截从而保护下方容器能被 ResizeObserver 检测 */}
        {loading && graphData.nodes.length === 0 && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center text-textTertiary bg-base0">
                <BrainCircuit size={48} className="animate-spin mb-4 text-primeAccent/40" />
                <span className="text-sm tracking-widest uppercase">Initializing Canvas...</span>
            </div>
        )}

        {/* 数据面板与卡片 */}
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-4 pointer-events-none opacity-90">
            <div>
                <h2 className="text-xl font-bold tracking-wide flex items-center gap-2 text-textPrimary">
                    <Share2 className="text-primeAccent" size={18} />
                    Graph View
                </h2>
                <p className="text-xs font-mono mt-1 text-textTertiary">
                    {renderedData.nodes.length} nodes · {renderedData.links.length} links
                </p>
            </div>

            {/* 个体信息卡片展示 */}
            {hoverNode && (
                <div className="backdrop-blur-md border p-3.5 rounded-xl shadow-2xl max-w-[280px] animate-in fade-in slide-in-from-left-2 duration-300 bg-bgOverlay border-borderSubtle">
                     <p className="font-semibold mb-1.5 leading-snug text-textPrimary">
                        {hoverNode.type === 'tag' ? '#' + hoverNode.name : hoverNode.name}
                     </p>
                     {hoverNode.type === 'note' && hoverNode.summary && (
                         <p className="text-xs leading-relaxed line-clamp-3 text-textSecondary">
                             {hoverNode.summary}
                         </p>
                     )}
                     <div className="mt-2.5 text-[10px] uppercase tracking-wider text-primeAccent font-mono">
                         Connections: {nodeDegrees.get(hoverNode.id) || 1}
                     </div>
                </div>
            )}
        </div>

        {/* 交互右侧控制面板与按钮 */}
        <div className="absolute top-6 right-6 z-30 flex flex-col items-end gap-3 pointer-events-auto">
            {!showSettings && (
               <button
                  onClick={() => setShowSettings(true)}
                  className="p-2.5 border rounded-lg transition-colors backdrop-blur-md shadow-xl bg-bgOverlay border-borderSubtle text-textTertiary hover:bg-bgHover hover:text-textPrimary"
                  title="Graph Settings"
               >
                  <Settings size={18} />
               </button>
            )}

            {/* Obsidian 风格属性调节面板 */}
            {showSettings && (
                <div className="w-64 backdrop-blur-xl border rounded-xl p-4 shadow-2xl animate-in fade-in slide-in-from-right-2 duration-300 bg-bgOverlay border-borderSubtle">
                    <div className="flex justify-between items-center mb-5">
                        <h3 className="font-semibold flex items-center gap-2 text-sm text-textPrimary"><Settings size={14}/> Graph Settings</h3>
                        <button onClick={() => setShowSettings(false)} className="text-textTertiary hover:text-textPrimary"><X size={16}/></button>
                    </div>

                    {/* Filters 过滤视图 */}
                    <div className="space-y-3.5 mb-6">
                        <h4 className="text-[10px] uppercase text-primeAccent font-bold tracking-widest border-b pb-1 border-borderSubtle">Filters</h4>

                        <label className="flex items-center justify-between text-xs cursor-pointer transition-colors text-textSecondary hover:text-textPrimary">
                            <span>Tags</span>
                            <div className="relative inline-flex items-center">
                                <input type="checkbox" checked={showTags} onChange={e => setShowTags(e.target.checked)} className="sr-only peer" />
                                <div className="w-7 h-4 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:rounded-full after:h-3 after:w-3 after:transition-all bg-bgHover after:bg-white after:border-borderSubtle after:border peer-checked:bg-primeAccent"></div>
                            </div>
                        </label>

                        <label className="flex items-center justify-between text-xs cursor-pointer transition-colors text-textSecondary hover:text-textPrimary">
                            <span>Orphans</span>
                            <div className="relative inline-flex items-center">
                                <input type="checkbox" checked={showOrphans} onChange={e => setShowOrphans(e.target.checked)} className="sr-only peer" />
                                <div className="w-7 h-4 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:rounded-full after:h-3 after:w-3 after:transition-all bg-bgHover after:bg-white after:border-borderSubtle after:border peer-checked:bg-primeAccent"></div>
                            </div>
                        </label>
                    </div>

                    {/* Forces 物理受力模拟 */}
                    <div className="space-y-4 mb-6">
                        <h4 className="text-[10px] uppercase text-primeAccent font-bold tracking-widest border-b pb-1 border-borderSubtle">Forces</h4>

                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[11px] text-textTertiary">
                                <span>Repel Force</span>
                                <span className="font-mono">{repelForce}</span>
                            </div>
                            <input type="range" min="10" max="400" value={repelForce} onChange={e => setRepelForce(Number(e.target.value))} className="w-full h-1 rounded-lg appearance-none cursor-pointer transition-all bg-bgHover accent-primeAccent"/>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[11px] text-textTertiary">
                                <span>Link Distance</span>
                                <span className="font-mono">{linkDistance}</span>
                            </div>
                            <input type="range" min="10" max="150" value={linkDistance} onChange={e => setLinkDistance(Number(e.target.value))} className="w-full h-1 rounded-lg appearance-none cursor-pointer transition-all bg-bgHover accent-primeAccent"/>
                        </div>
                    </div>

                    {/* Display 显示标度 */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] uppercase text-primeAccent font-bold tracking-widest border-b pb-1 border-borderSubtle">Display</h4>

                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[11px] text-textTertiary">
                                <span>Node Size</span>
                                <span className="font-mono">{nodeSizeMultiplier.toFixed(1)}x</span>
                            </div>
                            <input type="range" min="0.3" max="3" step="0.1" value={nodeSizeMultiplier} onChange={e => setNodeSizeMultiplier(Number(e.target.value))} className="w-full h-1 rounded-lg appearance-none cursor-pointer transition-all bg-bgHover accent-primeAccent"/>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[11px] text-textTertiary">
                                <span>Link Thickness</span>
                                <span className="font-mono">{linkThicknessMultiplier.toFixed(1)}x</span>
                            </div>
                            <input type="range" min="0.3" max="3" step="0.1" value={linkThicknessMultiplier} onChange={e => setLinkThicknessMultiplier(Number(e.target.value))} className="w-full h-1 rounded-lg appearance-none cursor-pointer transition-all bg-bgHover accent-primeAccent"/>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* 底部功能控制与重拉视角 */}
        <div className="absolute bottom-6 right-6 z-10 flex gap-2 pointer-events-auto">
            <button
                onClick={() => fgRef.current?.zoomToFit(800, 50)}
                className="p-2.5 border rounded-lg transition-colors backdrop-blur-sm shadow-xl bg-bgOverlay border-borderSubtle text-textTertiary hover:bg-bgHover hover:text-textPrimary"
                title="Reset View"
            >
                <Expand size={16} />
            </button>
            {onClose && (
               <button
                   onClick={onClose}
                   className="p-2.5 bg-white/5 border border-red-500/10 rounded-lg text-red-500/60 hover:bg-red-500/20 hover:text-red-400 transition-colors backdrop-blur-sm shadow-xl"
                   title="Close Graph"
               >
                   <X size={16} />
               </button>
            )}
        </div>

        {/* 图例 Legend */}
        <div className="absolute bottom-6 left-6 z-10 pointer-events-none flex flex-col gap-2 opacity-80 backdrop-blur-md p-3 rounded-xl border bg-bgOverlay border-borderSubtle">
             <div className="flex items-center gap-2.5 text-[11px] font-medium tracking-wide text-textSecondary">
                 <div className="w-2.5 h-2.5 rounded-full bg-primeAccent"></div>
                 Tag Concept
             </div>
             <div className="flex items-center gap-2.5 text-[11px] font-medium tracking-wide text-textSecondary">
                 <div className="w-2.5 h-2.5 rounded-full bg-textTertiary"></div>
                 Note Fragment
             </div>
             <div className="flex items-center gap-2.5 text-[11px] font-medium tracking-wide text-textSecondary">
                 <div className="w-2.5 h-2.5 rounded-full bg-textMuted"></div>
                 Ghost (Not Created)
             </div>
        </div>

        {renderedData.nodes.length === 0 && !loading && (
             <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none text-center">
                <ShieldAlert size={48} className="text-textMuted mb-4" />
                <p className="text-textTertiary text-sm">No connections formed yet.</p>
             </div>
        )}

        {dimensions.width > 0 && (
            <div className="absolute inset-0 z-0" style={{ pointerEvents: 'auto' }}>
                <ForceGraph2D
                    ref={fgRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={renderedData}
                    nodeCanvasObject={paintNode}
                    nodePointerAreaPaint={(node, color, ctx) => {
                        const degree = nodeDegrees.get(node.id) || 1;
                        const defaultRadius = 2.5 + Math.log1p(degree) * 1.5;
                        const radius = defaultRadius * nodeSizeMultiplier;

                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, radius + 3, 0, 2 * Math.PI, false);
                        ctx.fill();
                    }}
                    // 连线色彩模拟 Obsidian 的虚空细线风格
                    linkColor={link => {
                        if (hoverNode) {
                            return highlightLinks.current.has(link) ? colors.linkHighlight : colors.linkDim;
                        }
                        return colors.link;
                    }}
                    linkWidth={link => {
                        const baseWidth = link.type === 'tag' ? 0.3 : 0.7;
                        return ((hoverNode && highlightLinks.current.has(link)) ? 1.6 : baseWidth) * linkThicknessMultiplier;
                    }}
                    onNodeHover={handleNodeHover}
                    onNodeClick={handleNodeClick}
                    d3VelocityDecay={0.15} 
                    onEngineStop={() => {
                        if (!initialZoomDone.current && fgRef.current) {
                            // 第一次加载图形系统稳定后进行适应缩放
                            fgRef.current.zoomToFit(600, 50);
                            initialZoomDone.current = true;
                        }
                    }} 
                />
            </div>
        )}
    </div>
  );
}
