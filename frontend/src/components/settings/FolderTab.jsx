import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  X, 
  Lock,
  ChevronRight,
  FolderOpen,
  HelpCircle,
  FolderPlus
} from 'lucide-react';
import { 
  getFolderTree,
  createFolder, 
  updateFolder, 
  deleteFolder,
  updateSubfolder,
  deleteSubfolder
} from '../../api/folderApi';

const PRESET_EMOJIS = ['📁', '📥', '💡', '📝', '🌐', '📚', '⚙️', '🧪', '💬', '🎨', '🚀', '🔒', '📅', '🛒', '⚡', '📊'];

export default function FolderTab() {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 新建一级目录表单
  const [newL1Name, setNewL1Name] = useState('');
  const [newL1Icon, setNewL1Icon] = useState('📁');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  // 新建二级目录表单 (挂载在一级分类 ID 下)
  const [addingL2ToL1Id, setAddingL2ToL1Id] = useState(null);
  const [newL2Name, setNewL2Name] = useState('');

  // 编辑一级目录
  const [editingL1Id, setEditingL1Id] = useState(null);
  const [editL1Name, setEditL1Name] = useState('');
  const [editL1Icon, setEditL1Icon] = useState('📁');
  const [showEditL1EmojiPicker, setShowEditL1EmojiPicker] = useState(false);

  // 编辑二级目录
  // 我们使用 "L1Name-L2Name" 作为唯一标识
  const [editingL2Key, setEditingL2Key] = useState(null);
  const [editL2Name, setEditL2Name] = useState('');

  const loadTree = async () => {
    try {
      const data = await getFolderTree();
      setTree(data || []);
    } catch (e) {
      console.error('Failed to load folder tree:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTree();
  }, []);

  const triggerUpdateEvent = () => {
    window.dispatchEvent(new Event('folders-updated'));
  };

  // 1. 创建一级目录
  const handleCreateL1 = async (e) => {
    if (e) e.preventDefault();
    if (!newL1Name.trim()) return;
    try {
      await createFolder({
        name: newL1Name.trim(),
        icon: newL1Icon
      });
      setNewL1Name('');
      setNewL1Icon('📁');
      setShowEmojiPicker(false);
      await loadTree();
      triggerUpdateEvent();
    } catch (e) {
      alert('创建目录失败: ' + e.message);
    }
  };

  // 2. 保存编辑一级目录
  const handleSaveL1 = async (id) => {
    if (!editL1Name.trim()) return;
    try {
      await updateFolder(id, {
        name: editL1Name.trim(),
        icon: editL1Icon
      });
      setEditingL1Id(null);
      setShowEditL1EmojiPicker(false);
      await loadTree();
      triggerUpdateEvent();
    } catch (e) {
      alert('保存目录失败: ' + e.message);
    }
  };

  // 3. 删除一级目录 (不允许删除有数据的分类)
  const handleDeleteL1 = async (folder) => {
    if (folder.is_special) return;
    
    // 安全校验：不允许删除有数据的分类
    if (folder.count > 0) {
      alert(`⚠️ 无法删除：「${folder.name}」分类下当前包含 ${folder.count} 条文档记录。为了保障您的数据安全，请先在列表中将这些文档迁往其他分类，清空该分类后再进行删除。`);
      return;
    }

    const confirmMsg = `确定要删除分类「${folder.name}」吗？\n该操作不可撤销！`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteFolder(folder.id);
      await loadTree();
      triggerUpdateEvent();
    } catch (e) {
      alert('删除目录失败: ' + e.message);
    }
  };

  // 4. 一级目录升降排序
  const handleMoveL1 = async (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === tree.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const currentFolder = tree[index];
    const targetFolder = tree[targetIndex];

    try {
      const response = await fetch('/api/folders');
      const flatFolders = await response.json();
      
      const currentFlat = flatFolders.find(f => f.id === currentFolder.id);
      const targetFlat = flatFolders.find(f => f.id === targetFolder.id);

      if (currentFlat && targetFlat) {
        const tempOrder = currentFlat.sort_order;
        await updateFolder(currentFolder.id, { sort_order: targetFlat.sort_order });
        await updateFolder(targetFolder.id, { sort_order: tempOrder });
        await loadTree();
        triggerUpdateEvent();
      }
    } catch (e) {
      console.error('Failed to swap sort order:', e);
    }
  };

  // 5. 手动创建/增加二级子目录
  const handleCreateL2 = async (folder) => {
    if (!newL2Name.trim()) return;
    try {
      // 解析出该一级的当前 subfolders JSON
      let subfoldersList = [];
      if (folder.subfolders) {
        try {
          subfoldersList = JSON.parse(folder.subfolders);
        } catch (e) {
          subfoldersList = [];
        }
      }
      
      const targetL2 = newL2Name.trim();
      if (subfoldersList.includes(targetL2)) {
        alert('该二级分类已存在，请勿重复添加。');
        return;
      }

      subfoldersList.push(targetL2);
      const subfoldersStr = JSON.stringify(subfoldersList);

      // 调用接口保存
      await updateFolder(folder.id, { subfolders: subfoldersStr });
      
      setAddingL2ToL1Id(null);
      setNewL2Name('');
      await loadTree();
      triggerUpdateEvent();
    } catch (e) {
      alert('手动创建二级分类失败: ' + e.message);
    }
  };

  // 6. 手动修改/重命名二级目录
  const handleStartEditL2 = (l1Name, l2Name) => {
    setEditingL2Key(`${l1Name}-${l2Name}`);
    setEditL2Name(l2Name);
  };

  const handleSaveL2 = async (folder, oldL2Name) => {
    const formattedNewL2 = editL2Name.trim();
    if (!formattedNewL2 || formattedNewL2 === oldL2Name) {
      setEditingL2Key(null);
      return;
    }
    try {
      // Step A: 更新数据库中所有属于旧二级分类的文档
      await updateSubfolder(folder.name, oldL2Name, formattedNewL2);

      // Step B: 更新当前一级目录的 subfolders 字段中的配置项
      let subfoldersList = [];
      if (folder.subfolders) {
        try {
          subfoldersList = JSON.parse(folder.subfolders);
        } catch (e) {
          subfoldersList = [];
        }
      }
      const idx = subfoldersList.indexOf(oldL2Name);
      if (idx !== -1) {
        subfoldersList[idx] = formattedNewL2;
      } else {
        subfoldersList.push(formattedNewL2);
      }
      
      await updateFolder(folder.id, { subfolders: JSON.stringify(subfoldersList) });

      setEditingL2Key(null);
      await loadTree();
      triggerUpdateEvent();
    } catch (e) {
      alert('修改二级目录失败: ' + e.message);
    }
  };

  // 7. 删除二级目录 (不允许删除有数据的分类)
  const handleDeleteL2 = async (folder, child) => {
    // 安全校验：不允许删除有数据的分类
    if (child.count > 0) {
      alert(`⚠️ 无法删除：「${folder.name} ➔ ${child.name}」二级分类下当前包含 ${child.count} 条文档记录。为了保障数据安全，请先在列表视图中将这些文档迁往其他分类，空载后才能删除此分类。`);
      return;
    }

    const confirmMsg = `确定要删除「${folder.name}」下的二级分类「${child.name}」吗？`;
    if (!window.confirm(confirmMsg)) return;

    try {
      // Step A: 清空数据库中可能残留该二级分类文档的字段
      await deleteSubfolder(folder.name, child.name);

      // Step B: 从该一级的 subfolders 配置中剔除
      let subfoldersList = [];
      if (folder.subfolders) {
        try {
          subfoldersList = JSON.parse(folder.subfolders);
        } catch (e) {
          subfoldersList = [];
        }
      }
      const updatedList = subfoldersList.filter(name => name !== child.name);
      await updateFolder(folder.id, { subfolders: JSON.stringify(updatedList) });

      await loadTree();
      triggerUpdateEvent();
    } catch (e) {
      alert('删除二级目录失败: ' + e.message);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center animate-pulse text-textTertiary text-sm">
        加载目录结构配置中...
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto custom-scrollbar bg-bgSubtle">
      <div className="max-w-5xl mx-auto">
        
        {/* 2-Column 左右舒适分割布局 (gap-8 大间距，提供足够的呼吸空间) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          
          {/* 左栏 (col-span-2)：创建操作、使用指南与安全说明 */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* 新建一级分类模块 (饱满舒适的卡片内边距 p-5) */}
            <div className="rounded-xl border border-borderSubtle bg-sidebar/40 p-5 space-y-4 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-2.5">
                <FolderPlus size={18} className="text-primeAccent" />
                <h3 className="font-bold text-[14px] text-textPrimary">新建一级分类</h3>
              </div>
              
              <form onSubmit={handleCreateL1} className="flex gap-2.5 relative">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="w-10 h-10 bg-sidebar border border-borderSubtle hover:border-primeAccent/40 hover:bg-bgHover rounded-lg flex items-center justify-center text-xl transition-all shadow-inner"
                  >
                    {newL1Icon}
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute top-full left-0 mt-1.5 p-2 bg-header border border-borderSubtle rounded-lg shadow-2xl z-50 grid grid-cols-4 gap-2 w-44">
                      {PRESET_EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            setNewL1Icon(emoji);
                            setShowEmojiPicker(false);
                          }}
                          className="text-lg hover:bg-bgHover p-1.5 rounded-md transition-all active:scale-95"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <input
                  type="text"
                  value={newL1Name}
                  onChange={(e) => setNewL1Name(e.target.value)}
                  placeholder="如：技术、灵感、工作..."
                  className="flex-1 bg-sidebar border border-borderSubtle rounded-lg px-3.5 text-[13.5px] text-textPrimary focus:outline-none focus:border-primeAccent/30 focus:ring-1 focus:ring-primeAccent/15 placeholder-textMuted transition-all"
                />

                {/* 高级配色按钮 */}
                <button
                  type="submit"
                  disabled={!newL1Name.trim()}
                  className={`px-4 rounded-lg font-bold text-[13px] flex items-center gap-1.5 transition-all border ${
                    newL1Name.trim()
                      ? 'bg-primeAccent/10 text-primeAccent border-primeAccent/25 hover:bg-primeAccent/20 hover:border-primeAccent/40 shadow-sm active:scale-[0.98]'
                      : 'bg-bgHover/40 text-textMuted cursor-not-allowed border-borderSubtle/50'
                  }`}
                >
                  <Plus size={14} />
                  创 建
                </button>
              </form>
            </div>

            {/* 安全与机制文案面板 (宽松精致的段落排版) */}
            <div className="rounded-xl border border-borderSubtle/60 bg-sidebar/10 p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2.5 text-textSecondary border-b border-borderSubtle/40 pb-2.5">
                <HelpCircle size={16} className="text-primeAccent/85" />
                <span className="text-[12px] font-bold uppercase tracking-wider font-mono">目录管理规范</span>
              </div>
              
              <div className="space-y-3.5 text-[12.5px] text-textTertiary leading-relaxed">
                <div className="flex gap-2.5">
                  <span className="text-red-400 select-none text-sm shrink-0">🚨</span>
                  <p>
                    <strong className="text-textPrimary font-medium">数据删除保护机制</strong>：为避免误操作导致知识遗失，系统禁止直接删除包含文档分类。只有当分类中的文档数量为 0 时，删除按钮才可激活生效。
                  </p>
                </div>
                
                <div className="flex gap-2.5">
                  <span className="text-primeAccent select-none text-sm shrink-0">⚡</span>
                  <p>
                    <strong className="text-textPrimary font-medium">二级子目录随心规划</strong>：点击一级的 <span className="font-mono px-1 py-0.2 bg-sidebar/50 border border-borderSubtle rounded text-[11px] text-textSecondary">+</span> 按钮，可在其下方随时创建全新的二级分类，满足预规划 taxonomy 需要。
                  </p>
                </div>

                <div className="flex gap-2.5">
                  <span className="text-primeAccent select-none text-sm shrink-0">📁</span>
                  <p>
                    <strong className="text-textPrimary font-medium">重命名联动更新</strong>：修改分类名称时，系统后台将自动对该分类下的所有文档进行批量重命名映射调整，确保检索逻辑完全不受损害。
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* 右栏 (col-span-3)：采用大方、得体、卡片化分栏的目录配置树 */}
          <div className="lg:col-span-3 space-y-4">
            
            <div className="flex justify-between items-center px-1">
              <div className="flex flex-col">
                <span className="text-[13px] font-bold text-textPrimary tracking-wide">知识层级架构配置</span>
                <span className="text-[10px] text-textMuted font-mono">Hierarchical Taxonomy Settings</span>
              </div>
              <span className="text-[11px] text-textTertiary bg-sidebar/60 border border-borderSubtle/50 px-2.5 py-0.8 rounded-full font-mono">
                {tree.length} 个一级分类
              </span>
            </div>

            {/* 一级分类作为独立精致卡片（彻底解决过度紧凑、提升整体视觉质感） */}
            <div className="space-y-4">
              {tree.map((folder, index) => {
                const isEditingL1 = editingL1Id === folder.id;
                const isAddingL2 = addingL2ToL1Id === folder.id;
                
                return (
                  <div 
                    key={folder.id} 
                    className="rounded-xl border border-borderSubtle bg-sidebar/30 shadow-sm p-4 space-y-3 transition-all hover:border-borderSubtle/80 hover:bg-sidebar/40"
                  >
                    
                    {/* 一级分类首行：行高与 padding 极具呼吸感 */}
                    <div className="flex items-center justify-between pb-2 border-b border-borderSubtle/20">
                      {isEditingL1 ? (
                        // 一级：编辑状态 (更宽裕的交互行)
                        <div className="flex-1 flex gap-2 relative">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowEditL1EmojiPicker(!showEditL1EmojiPicker)}
                              className="w-8 h-8 bg-sidebar border border-borderSubtle rounded-lg flex items-center justify-center text-base hover:bg-bgHover"
                            >
                              {editL1Icon}
                            </button>
                            {showEditL1EmojiPicker && (
                              <div className="absolute top-full left-0 mt-1.5 p-2 bg-header border border-borderSubtle rounded-lg shadow-2xl z-50 grid grid-cols-4 gap-1.5 w-44">
                                {PRESET_EMOJIS.map(emoji => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => {
                                      setEditL1Icon(emoji);
                                      setShowEditL1EmojiPicker(false);
                                    }}
                                    className="text-lg hover:bg-bgHover p-1 rounded"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          
                          <input
                            type="text"
                            value={editL1Name}
                            onChange={(e) => setEditL1Name(e.target.value)}
                            className="flex-1 bg-sidebar border border-borderSubtle rounded-lg px-2.5 py-1 text-[13px] text-textPrimary focus:outline-none"
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveL1(folder.id)}
                            autoFocus
                          />
                          
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleSaveL1(folder.id)}
                              className="p-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-lg transition-all"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => {
                                setEditingL1Id(null);
                                setShowEditL1EmojiPicker(false);
                              }}
                              className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        // 一级：浏览状态 (按钮常驻显示，大小和间距全面优化)
                        <>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-base shrink-0 w-8 h-8 bg-sidebar rounded-lg flex items-center justify-center border border-borderSubtle/60 shadow-sm">
                              {folder.icon || '📁'}
                            </span>
                            <span className="text-[13.5px] font-bold text-textPrimary truncate">{folder.name}</span>
                            <span className={`text-[10px] font-mono px-2 py-0.2 rounded-full border ${
                              folder.count > 0 
                                ? 'bg-primeAccent/10 text-primeAccent border-primeAccent/15 font-bold shadow-sm' 
                                : 'bg-bgHover/60 text-textTertiary border-transparent'
                            }`}>
                              {folder.count} 篇文档
                            </span>
                            {folder.is_special && (
                              <span className="text-[8.5px] px-1.5 py-0.2 bg-textMuted/10 text-textMuted border border-borderSubtle/50 rounded-md font-mono scale-90 select-none">
                                SYSTEM
                              </span>
                            )}
                          </div>

                          {/* 精致的操作控制区（常驻显示，易点大图标） */}
                          <div className="flex items-center gap-1 shrink-0">
                            
                            {/* 手动追加二级子分类 (L2维护核心) */}
                            <button
                              onClick={() => {
                                setAddingL2ToL1Id(folder.id);
                                setNewL2Name('');
                              }}
                              className="p-1.5 rounded-lg text-textTertiary hover:text-primeAccent hover:bg-bgHover transition-all border border-transparent hover:border-borderSubtle/40"
                              title="在此分类下追加二级子目录"
                            >
                              <Plus size={13} />
                            </button>

                            <button
                              onClick={() => handleMoveL1(index, 'up')}
                              disabled={index === 0}
                              className={`p-1.5 rounded-lg text-textTertiary transition-all border border-transparent ${
                                index === 0 ? 'text-textMuted/15 cursor-not-allowed' : 'hover:text-textPrimary hover:bg-bgHover hover:border-borderSubtle/40'
                              }`}
                              title="上移"
                            >
                              <ArrowUp size={13} />
                            </button>
                            
                            <button
                              onClick={() => handleMoveL1(index, 'down')}
                              disabled={index === tree.length - 1}
                              className={`p-1.5 rounded-lg text-textTertiary transition-all border border-transparent ${
                                index === tree.length - 1 ? 'text-textMuted/15 cursor-not-allowed' : 'hover:text-textPrimary hover:bg-bgHover hover:border-borderSubtle/40'
                              }`}
                              title="下移"
                            >
                              <ArrowDown size={13} />
                            </button>

                            {!folder.is_special ? (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingL1Id(folder.id);
                                    setEditL1Name(folder.name);
                                    setEditL1Icon(folder.icon || '📁');
                                  }}
                                  className="p-1.5 rounded-lg text-textTertiary hover:text-primeAccent hover:bg-bgHover transition-all border border-transparent hover:border-borderSubtle/40"
                                  title="重命名该一级分类"
                                >
                                  <Edit3 size={13} />
                                </button>
                                
                                <button
                                  onClick={() => handleDeleteL1(folder)}
                                  className={`p-1.5 rounded-lg transition-all border border-transparent ${
                                    folder.count > 0 
                                      ? 'text-textMuted/20 hover:text-textMuted/30 hover:border-borderSubtle/20 cursor-help' 
                                      : 'text-textTertiary hover:text-red-500 hover:bg-red-500/5 hover:border-red-500/15'
                                  }`}
                                  title={folder.count > 0 ? `当前含有 ${folder.count} 篇文档，锁定删除` : "删除此一级分类"}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            ) : (
                              <div className="p-1.5 text-textMuted/35" title="系统核心分类，禁止重命名与删除">
                                <Lock size={12} />
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* 二级创建输入弹框（内嵌在一级卡片内部，宽敞、优雅） */}
                    {isAddingL2 && (
                      <div className="pl-9 pr-3 py-2 flex gap-2 items-center relative my-1.5 animate-in slide-in-from-left-3 duration-200 bg-sidebar/50 border border-primeAccent/15 rounded-lg">
                        <div className="absolute top-0 bottom-1/2 left-4.5 w-3.5 border-l border-b border-borderSubtle/60 rounded-bl-lg pointer-events-none"></div>
                        
                        <input
                          type="text"
                          value={newL2Name}
                          onChange={(e) => setNewL2Name(e.target.value)}
                          placeholder="输入新增二级分类名称（如：React、算法）..."
                          className="flex-1 bg-sidebar border border-borderSubtle focus:border-primeAccent/30 rounded-lg px-3 py-1 text-[12px] text-textPrimary focus:outline-none"
                          onKeyDown={(e) => e.key === 'Enter' && handleCreateL2(folder)}
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleCreateL2(folder)}
                            className="p-1.5 bg-primeAccent/15 hover:bg-primeAccent/25 text-primeAccent rounded-lg transition-all"
                            title="确认保存"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={() => setAddingL2ToL1Id(null)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/15 text-red-500 rounded-lg transition-all"
                            title="取消"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 二级分类渲染列表 (宽容舒适的垂直行距，pl-9 提供极佳的层级归属感) */}
                    <div className="flex flex-col space-y-1.5">
                      {(folder.children || []).length === 0 && !isAddingL2 ? (
                        <div className="pl-9 py-1.5 text-[11.5px] text-textMuted italic flex items-center gap-1.5">
                          <span>📁</span>
                          <span>暂无配置二级子目录，点击右上角 “+” 手动添加</span>
                        </div>
                      ) : (
                        (folder.children || []).map((child) => {
                          const l2Key = `${folder.name}-${child.name}`;
                          const isEditingL2 = editingL2Key === l2Key;

                          return (
                            <div 
                              key={child.name} 
                              className="pl-9 pr-3 py-1.5 flex items-center justify-between hover:bg-bgHover/20 rounded-lg relative transition-all"
                            >
                              {/* 层级树枝连接线 */}
                              <div className="absolute top-0 bottom-1/2 left-4.5 w-3.5 border-l border-b border-borderSubtle/50 rounded-bl-lg pointer-events-none"></div>
                              {child.name && (
                                <div className="absolute top-1/2 bottom-0 left-4.5 border-l border-borderSubtle/50 pointer-events-none last-of-type:hidden"></div>
                              )}

                              {isEditingL2 ? (
                                // 二级分类：编辑状态
                                <div className="flex-1 flex gap-2 pl-1.5 my-0.5">
                                  <input
                                    type="text"
                                    value={editL2Name}
                                    onChange={(e) => setEditL2Name(e.target.value)}
                                    className="flex-1 bg-sidebar border border-borderSubtle focus:border-primeAccent/30 rounded-lg px-2.5 py-1 text-[12px] text-textPrimary focus:outline-none"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveL2(folder, child.name)}
                                    autoFocus
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleSaveL2(folder, child.name)}
                                      className="p-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-lg transition-all"
                                    >
                                      <Check size={12} />
                                    </button>
                                    <button
                                      onClick={() => setEditingL2Key(null)}
                                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                // 二级分类：正常状态 (按钮默认常驻)
                                <>
                                  <div className="flex items-center gap-2 min-w-0 pl-1.5">
                                    <ChevronRight size={11} className="text-textTertiary" />
                                    <span className="text-[12.5px] text-textSecondary font-semibold truncate">{child.name}</span>
                                    <span className={`text-[9.5px] font-mono px-2 py-0.2 rounded-full border ${
                                      child.count > 0 
                                        ? 'bg-primeAccent/10 text-primeAccent border-primeAccent/15 font-bold shadow-sm' 
                                        : 'bg-bgHover/40 text-textTertiary/50 border-transparent'
                                    }`}>
                                      {child.count} 篇
                                    </span>
                                  </div>

                                  {/* 默认常驻显示的操作图标 */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => handleStartEditL2(folder.name, child.name)}
                                      className="p-1.5 rounded-lg text-textTertiary hover:text-primeAccent hover:bg-bgHover transition-all border border-transparent hover:border-borderSubtle/40"
                                      title="重命名二级分类"
                                    >
                                      <Edit3 size={11} />
                                    </button>
                                    
                                    <button
                                      onClick={() => handleDeleteL2(folder, child)}
                                      className={`p-1.5 rounded-lg transition-all border border-transparent ${
                                        child.count > 0 
                                          ? 'text-textMuted/20 hover:text-textMuted/30 hover:border-borderSubtle/20 cursor-help' 
                                          : 'text-textTertiary hover:text-red-500 hover:bg-red-500/5 hover:border-red-500/15'
                                      }`}
                                      title={child.count > 0 ? `二级分类含有 ${child.count} 篇文档，锁定删除` : "删除二级分类"}
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                  </div>
                );
              })}
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
