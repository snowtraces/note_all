# 规范：前端支持 History 路由

## 1. Objective (客观目标)
当前项目的前端是一个基于 React 的单页应用（SPA），但是其视图切换和笔记/对话的选择完全由组件内的 React State（`viewMode`, `selectedItem`, `showTrash` 等）控制，浏览器地址栏无法反映当前的应用状态（例如无法直达特定笔记，或无法使用浏览器的前进/后退按钮）。

本规范的目标是**为项目引入无刷新、高可用的 History 路由支持**，使得：
- 用户进行切换视图（记忆列表、对话历史、关系矩阵、生图、实验室、回收站）、选择特定笔记或特定对话等操作时，浏览器 URL 实时、无刷更新。
- 支持浏览器前进、后退机制（通过监听 `popstate` 还原应用状态）。
- 登录用户可以通过直接输入 URL（如 `/notes/123` 或 `/graph`）或刷新当前页面，精确还原视图。
- 保持现有的公开分享页面（`/s/:shareId`）免登录直达机制。
- 保护未保存的编辑内容（结合 `hasUnsavedDetail` 进行路由切换拦截）。

## 2. Tech Stack (技术栈)
- **Frontend Core**: React 18, Vite.
- **Backend Core**: Gin (Go), 已配置 `r.NoRoute` 兜底将未匹配路径指向 `index.html`。
- **Routing Implementation**: 为了与项目当前集中管理的 `App.jsx` 状态完美融合、避免大范围重构组件和引入繁重的第三方路由库，我们将采用**基于原生 HTML5 History API 的轻量级路由机制（URL <-> App State 双向同步）**。

## 3. Commands (常用命令)
- 启动前端开发服务：`npm run dev` (在 `frontend` 目录下)
- 前端打包构建：`npm run build` (在 `frontend` 目录下)
- 后端编译运行：`go build -tags "fts5" && .\note_all_backend.exe` (在 `backend` 目录下)

## 4. Route Mapping (路由映射设计)

我们将应用状态与 URL 路径进行如下双向映射：

| 应用状态 (React State) | URL 路径 (Path) | 描述 |
| :--- | :--- | :--- |
| `urlPath.startsWith('/s/')` | `/s/:shareId` | 公开分享页面 (免登录) |
| `viewMode === 'notes' && !showTrash && !selectedItem` | `/` 或 `/notes` | 记忆列表 (默认主页) |
| `viewMode === 'notes' && !showTrash && selectedItem` | `/notes/:id` | 特定笔记详情 |
| `viewMode === 'notes' && showTrash && !selectedItem` | `/trash` | 回收站列表 |
| `viewMode === 'notes' && showTrash && selectedItem` | `/trash/:id` | 回收站选中特定笔记 |
| `viewMode === 'chats' && currentSessionId === 0` | `/chats` | 开启新对话 (Insight Engine) |
| `viewMode === 'chats' && currentSessionId !== 0` | `/chats/:id` | 载入特定对话 Session |
| `viewMode === 'graph'` | `/graph` | 关系矩阵 |
| `viewMode === 'image_gen'` | `/image_gen` | AI 图片生成 |
| `viewMode === 'lab'` | `/lab` | 知识实验室 |

## 5. Code Style & Design (代码风格与设计)

我们将创建一个轻量级的 `useHistoryRouter` hook 或者是封装在 `App.jsx` 中的路由逻辑。因为 `App.jsx` 是全局状态的拥有者，通过在 `App.jsx` 内部维护核心状态并在 `useEffect` 中处理 URL 同步，是侵入性最小、最不容易出错的设计。

### 路由同步核心逻辑 (示意代码)：

```javascript
// 1. 从 URL 初始化状态
const parseUrlToState = async () => {
  const path = window.location.pathname;
  if (path.startsWith('/s/')) return; // 分享页直接渲染，不由主App处理

  if (path === '/' || path === '/notes') {
    setViewMode('notes');
    setShowTrash(false);
    setSelectedItem(null);
  } else if (path.startsWith('/notes/')) {
    const id = path.split('/')[2];
    setViewMode('notes');
    setShowTrash(false);
    // 从 API 或者是已有的 results 中寻找该笔记并载入
    loadNoteDetail(id);
  } else if (path === '/trash') {
    setViewMode('notes');
    setShowTrash(true);
    setSelectedItem(null);
  } else if (path.startsWith('/trash/')) {
    const id = path.split('/')[2];
    setViewMode('notes');
    setShowTrash(true);
    loadNoteDetail(id);
  } else if (path === '/chats') {
    setViewMode('chats');
    setShowTrash(false);
    setChatHistory([]);
    setCurrentSessionId(0);
  } else if (path.startsWith('/chats/')) {
    const id = path.split('/')[2];
    setViewMode('chats');
    setShowTrash(false);
    loadChatSession(id);
  } else if (path === '/graph') {
    setViewMode('graph');
    setShowTrash(false);
    setSelectedItem(null);
  } else if (path === '/image_gen') {
    setViewMode('image_gen');
    setShowTrash(false);
    setSelectedItem(null);
  } else if (path === '/lab') {
    setViewMode('lab');
    setShowTrash(false);
    setSelectedItem(null);
  }
};

// 2. 状态改变时，无刷更新 URL (pushState)
const syncStateToUrl = (viewMode, showTrash, selectedItem, currentSessionId) => {
  let targetPath = '/';
  
  if (viewMode === 'notes') {
    if (showTrash) {
      targetPath = selectedItem ? `/trash/${selectedItem.id}` : '/trash';
    } else {
      targetPath = selectedItem ? `/notes/${selectedItem.id}` : '/notes';
    }
  } else if (viewMode === 'chats') {
    targetPath = currentSessionId ? `/chats/${currentSessionId}` : '/chats';
  } else if (viewMode === 'graph') {
    targetPath = '/graph';
  } else if (viewMode === 'image_gen') {
    targetPath = '/image_gen';
  } else if (viewMode === 'lab') {
    targetPath = '/lab';
  }

  if (window.location.pathname !== targetPath) {
    window.history.pushState({ viewMode, showTrash, selectedId: selectedItem?.id, currentSessionId }, '', targetPath);
  }
};
```

## 6. Boundaries (边界约束)
- **Always do**:
  - 在监听 `popstate` 时，务必考虑有未保存详情（`hasUnsavedDetail`）时的拦截。如果在回退时存在未保存数据，需要撤销浏览器的 URL 改变（可以用 `pushState` 重新压入当前状态，或者提示用户保存/丢弃后再改变状态）。
  - 处理鉴权（`isLoggedIn`）与路由加载的先后顺序：只有当 `isLoggedIn` 校验完毕且成功时，才从 URL 解析并初始化数据。
- **Ask first**:
  - 如果要添加新的全局大页面视图，需要首先扩充路由映射。
- **Never do**:
  - 不要引入带有严重底层依赖和破坏性重构的前端路由组件（如老版本 react-router 带有 `<BrowserRouter>` 强制组件嵌套），这会破坏现有的布局和状态架构。
  - 绝不破坏公开分享页 `/s/:shareId` 的直接渲染流程。

## 7. Success Criteria (验收标准)
1. **视图无刷同步**：点击 `NavRail`（记忆列表、对话历史、关系矩阵、生图、实验室、回收站），浏览器 URL 分别无刷变化为 `/notes`（或 `/`）、`/chats`、`/graph`、`/image_gen`、`/lab`、`/trash`。
2. **详情无刷同步**：在列表中选中某篇笔记，URL 变为 `/notes/:id`；在对话列表中载入某个 Session，URL 变为 `/chats/:id`。
3. **前进后退高可用**：在应用内做一连串操作后，点击浏览器“后退”和“前进”按钮，应用视图和选中状态完美跟随，没有任何崩溃、白屏。
4. **刷新及直接打开支持**：
   - 登录状态下，在新标签页输入 `/graph` 直接进入关系图页面。
   - 登录状态下，输入 `/notes/123` 直接加载并打开 ID 为 `123` 的笔记。
   - 登录状态下，输入 `/chats/45` 直接打开并载入 ID 为 `45` 的对话。
5. **未保存拦截**：当正在编辑某篇笔记且有未保存修改（`hasUnsavedDetail` 为 true）时，点击浏览器后退或点击 Sidebar 切换至其他视图，应用应正确弹出保存确认对话框，且 URL 不应静默切换到新页面（或在取消时能优雅恢复）。

## 8. Implementation Plan (实施计划)
1. **构建核心 Hook (`useHistoryRouter`)**
   - 提取原本在 `App.jsx` 中的路由逻辑，将其封装为一个名为 `useHistoryRouter` 的自定义 Hook（放置于 `hooks/useHistoryRouter.js`）。
   - 该 Hook 将负责监听 `popstate` 事件，并通过暴露的 `syncStateToUrl` 方法允许组件向外同步状态。
   - 依赖注入：需要接收 `App.jsx` 的状态 setter（`setViewMode`, `setShowTrash`, `setSelectedItem`, `setCurrentSessionId`）以及 `getNote` 和 `loadChatSession` 方法，以便在 URL 发生变动时驱动数据加载和状态改变。
2. **改造 `App.jsx` 接入路由**
   - 在 `App.jsx` 中引入并使用 `useHistoryRouter`。
   - 首次挂载时（`useEffect` 结合 `isLoggedIn`），调用 Hook 内部的初始化方法解析当前 URL，恢复视图与特定详情数据（如果是带 ID 的 URL 则需要调用 `getNote` 获取笔记详情并设置到 `selectedItem`）。
   - 在触发视图切换、详情选中的关键操作（如 `guardedSetSelectedItem`、`setViewMode` 切换时）主动调用 `syncStateToUrl`。
3. **未保存拦截优化**
   - 重写或增强浏览器回退时的拦截。如果用户在有未保存数据的情况下点击了后退按钮（触发了 `popstate`），我们要弹出保存确认，同时为了维持 URL 状态一致性，可以使用 `history.pushState` 把弹窗前的 URL 再压回去，或者等到用户选择取消后回退，选择保存/丢弃后继续前进。
   - 由于原生 `popstate` 无法被真正 cancel，所以在 `useHistoryRouter` 中需要对存在 `hasUnsavedDetail` 的情况进行特殊判断。

## 9. Tasks (任务拆解)

- [x] Task 1: 创建 `useHistoryRouter` hook
  - Acceptance: 能监听 `popstate` 事件，根据路径正确推导状态，暴露出 `syncStateToUrl` 和 `parseUrlToState` 方法。
  - Verify: 单元测试或人肉确认代码已按设计提取完毕，不报错。
  - Files: `src/hooks/useHistoryRouter.js`

- [x] Task 2: 在 `App.jsx` 中集成路由并适配首次加载
  - Acceptance: `App.jsx` 移除旧的强制 `setViewMode('notes')` 逻辑，改由 URL 初始化状态；如果访问 `/notes/:id` 能自动调用 `getNote` 加载详情并展示。分享页不受影响。
  - Verify: 运行 `npm run dev`，直接在浏览器地址栏输入 `/graph`，进入系统后应处于关系图页面；输入 `/trash` 应处于回收站页面。
  - Files: `src/App.jsx`, `src/hooks/useHistoryRouter.js`

- [x] Task 3: 在 `App.jsx` 中适配状态变化到 URL 的同步
  - Acceptance: 在界面中点击左侧导航栏、选中某篇笔记等操作发生时，URL 能实时变为对应的路径（无刷新）。
  - Verify: 在界面操作，观察浏览器地址栏的变动是否符合 Route Mapping 定义。
  - Files: `src/App.jsx`

- [x] Task 4: 处理带未保存修改的回退拦截
  - Acceptance: 编辑某篇笔记且有修改时，点击浏览器后退按钮，弹出 `SaveConfirmModal` 且视图不崩溃，选择取消能维持当前页面状态。
  - Verify: 手工测试回退拦截逻辑。
  - Files: `src/App.jsx`, `src/hooks/useHistoryRouter.js`
