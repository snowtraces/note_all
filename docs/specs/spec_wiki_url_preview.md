# 规范：Wiki 风格 URL 链接预览功能 (Wiki-Style URL Preview)

## 1. Objective (客观目标)

为了提升 Note-All 知识管理系统的“双链百科（Wiki）”化体验，让用户能够在不离开当前阅读或编辑上下文的情况下快速探索关联内容，本项目将新增 **Wiki 风格的 URL 链接预览功能**。

### 核心功能目标
1. **内部笔记链接悬停预览**：
   - 当用户将鼠标悬停在**内部双链笔记链接**（形如 `[📄 笔记标题](/note/id)` 或 `[[note:id|title]]` 的渲染后元素）上时，延迟触发（如 400ms）一个浮动的卡片。
   - 预览卡片应显示：笔记标题、目录归属（L1 / L2）、AI 提炼的摘要（若无则展示前 150 字正文片段）、更新时间等关键元数据。
2. **外部网页链接悬停预览**：
   - 当用户将鼠标悬停在**外部网页链接**（以 `http://` 或 `https://` 开头的标准超链接）上时，同样触发悬浮卡片。
   - 通过后端代理安全抓取目标网页，提取 `Open Graph` 元数据（如标题、描述、OG 图片、网站名称），呈现精美的“网页卡片”预览。
3. **高质感交互与微动画**：
   - 悬浮卡片拥有微缩放与淡入的毛玻璃（Glassmorphism）质感，支持暗色模式。
   - 实现智能鼠标跟随与防抖（Debounce），当鼠标在卡片与链接之间移动时，卡片保持显示，离开后优雅淡出。
   - 在数据加载过程中，展示极具高级感的骨架屏（Skeleton Screen）过渡，而非单调的“加载中”文本。

---

## 2. Tech Stack (技术栈)

### 前端 (Frontend)
- **核心框架**：React 18
- **样式工具**：Tailwind CSS (结合项目现有的 HSL 调色盘与暗色模式)
- **编辑器集成**：Tiptap / ProseMirror（利用事件委托机制拦截 `tiptap-content` 及渲染区域内的链接事件，确保 100% 兼容编辑器与渲染器）
- **图标库**：Lucide-react

### 后端 (Backend)
- **核心框架**：Gin (Go 1.25+)
- **HTML 解析器**：`github.com/PuerkitoBio/goquery`（利用 GORM 已集成的此依赖进行 DOM 节点提取，免去正则表达式带来的漏洞与性能隐患）
- **安全拦截**：`net/http` 配合已有 `isPrivateHost` 工具，阻断外部代理针对局域网（SSRF）的潜在扫描。

---

## 3. Commands (常用命令)

- 启动前端开发服务：`npm run dev` (在 `frontend` 目录下)
- 前端打包构建：`npm run build` (在 `frontend` 目录下)
- 后端编译运行：`go build -tags "fts5" && .\note_all_backend.exe` (在 `backend` 目录下)

---

## 4. API & Route Mapping (接口与路由设计)

为了支撑外部链接的预览，我们需要提供一个安全的后端抓取代理 API。内部链接预览则直接复用已有的 `GET /api/note/:id` 接口。

### 4.1 外部链接元数据抓取接口

- **路径**：`GET /api/url/preview`
- **参数**：`url` (string, 需 URL 编码)
- **鉴权**：必须携带有效的 JWT Token（通过 `middleware.AuthRequired()` 中间件）
- **后端执行逻辑**：
  1. 校验 `url` 参数，必须是合法的 `http` 或 `https` 协议。
  2. 利用 `isPrivateHost` 机制校验目标 Host，**绝对禁止**抓取局域网、回环或内网服务（防范 SSRF）。
  3. 使用带 5 秒超时上限的 `http.Client` 发起 GET 请求。
  4. 采用 `io.LimitReader` 限制读取的最大内容体为 **2MB**，防止巨型文件内存炸裂。
  5. 使用 `goquery` 读取 HTML：
     - **Title** 提取顺序：`meta[property="og:title"]` -> `meta[name="twitter:title"]` -> `title` 标签。
     - **Description** 提取顺序：`meta[property="og:description"]` -> `meta[name="description"]` -> `meta[name="twitter:description"]`。
     - **Image** 提取顺序：`meta[property="og:image"]` -> `meta[name="twitter:image"]` -> 页面首张符合尺寸标准的图片（可选）。
     - **SiteName** 提取顺序：`meta[property="og:site_name"]` -> 网页的根域名 Host。
  6. 返回 HTTP 200 及标准化 JSON：
     ```json
     {
       "title": "网页标题",
       "description": "网页简短描述/大纲信息...",
       "image": "https://example.com/og-image.jpg",
       "site_name": "Github / 维基百科",
       "url": "https://github.com/..."
     }
     ```

### 4.2 内部链接接口 (复用)
- **路径**：`GET /api/note/:id`
- **参数**：无
- **返回结果**：使用已有接口返回该笔记的完整详情（包含标题 `Title`、摘要 `Summary`、目录 `FolderL1`/`FolderL2`、更新时间 `UpdatedAt`）。

---

## 5. Frontend Architecture & Visual Style (前端架构与视觉设计)

### 5.1 事件委托与动态定位设计

为了保证开发的高可用度，且不破坏已有的 Tiptap 编辑器逻辑，我们**不修改 Tiptap 原生 DOM 树**。而是在 React 顶层（或在编辑器/渲染器包裹容器）采用**全局事件委托 (Event Delegation)**。

```
[ 用户悬停在 <a> 标签上 ]
       │
       ├─► 触发 mouseover，过滤 href 属性
       │     ├─► 若 href 匹配 `/note/:id` ──► 标记为内部笔记，提取 ID
       │     └─► 若 href 包含 `http://` ───► 标记为外部链接
       │
       ├─► 启动 400ms 定时器防抖 (避免快速滑过时频繁弹窗)
       │
       └─► 触发加载数据 (显示骨架屏)
             │
             └─► 动态计算 <a> 标签的 getBoundingClientRect()，将卡片定位在其上方或下方
```

### 5.2 极致质感的悬浮卡片 (WOW Factor)

我们将开发一个全局统一的 `<LinkPreviewPortal />` 组件，该组件利用 React Portal 挂载在 `body` 节点下，绝对定位，以避开任何容器级 `overflow-hidden` 遮挡。

#### 1. 骨架屏 (Skeleton Loading State)
- 使用 `animate-pulse` 特效。
- 提供多级不同宽度的圆角灰色色条（代表标题和描述），营造行云流水的加载感。

#### 2. 内部链接预览卡片（翡翠绿微光）
- **主色调**：浅绿/翡翠绿边框、微弱的背景漫反射。
- **图标**：`FileText` 辅以半透明绿色背衬。
- **内容布局**：
  - **顶部栏**：展示当前分类，例如 `📁 开发笔记 / 前端`，小巧而别致。
  - **标题**：粗体中文字体，色彩分明。
  - **正文**：最多展示三行高品质的摘要，超出截断。
  - **底部栏**：显示微弱的更新时间（例如 `🕒 更新于 2 小时前`）。

#### 3. 外部链接预览卡片（深邃蓝/靛蓝）
- **主色调**：淡雅蓝边框。
- **图标**：根据链接展示 `Globe` 或者是提取出来的 `site_name` 特色文字。
- **内容布局**：
  - **顶部栏**：半透明徽章展示提取的 `site_name` 或网站域名（如 `github.com`）。
  - **左/右半区分离**（如果存在有效 `og:image`）：
    - **左侧**：标题与详细描述。
    - **右侧**：一张宽比例（或者小方形）圆角缩略图，自带 `object-cover` 适配。

#### 4. 暗色模式兼容 (Dark Mode)
- **Light 模式**：`bg-white/80 border-slate-200/50 shadow-[0_10px_30px_rgba(0,0,0,0.08)]`
- **Dark 模式**：`bg-slate-900/80 border-slate-800/80 shadow-[0_10px_30px_rgba(0,0,0,0.5)]`
- **通用**：全段采用 `backdrop-blur-md`（毛玻璃效果）。

---

## 6. Boundaries (边界约束)

- **Always do**:
  - 必须对外部抓取 URL 进行 SSRF 安全过滤，严防扫描本地内网资产。
  - 前端监听的 `mouseover`/`mouseleave` 事件在组件销毁或页面跳转时**必须彻底清除定时器与事件监听**，防范内存泄露。
  - 触发预览的 DOM 定位必须使用 Portal 渲染，且对边界溢出（Viewport 溢出检测）进行智能修正：若链接靠上，卡片展示在链接下方；若靠下，展示在上方；左右对齐同样逻辑。
- **Ask first**:
  - 目前内部笔记详情 API （`GET /api/note/:id`）会返回完整正文，如果觉得数据包过大，可考虑是否需要单独增加一个轻量的 `/api/note/:id/preview` 路由。但鉴于系统目前的极速响应和单机环境，复用现有接口是开发更具可靠性的首选。
- **Never do**:
  - **千万不要**在每次鼠标移入时都发起请求，前端必须维护一个轻量级的 **`Map` 缓存 (Cache)**。在同一会话中，如果已经加载过某个 URL 的元数据，再次悬停时直接秒开展示，保障行云流水的敏捷体验。
  - 不要让悬停卡片遮挡了原本超链接的点击跳转行为，卡片应设计有微弱偏移，并在鼠标滑入卡片本身时保持不消失。

---

## 7. Success Criteria (验收标准)

1. **悬停智能防抖**：当用户用鼠标在笔记/编辑器中快速扫过多个超链接时，不会疯狂弹出多张卡片，只有当鼠标在某一链接悬停停留超 400ms 时才展现。
2. **多态骨架屏加载**：首次悬浮加载时，先平滑显现带有毛玻璃毛边的骨架屏卡片，API 响应后卡片无缝、无抖动地替换为真实内容。
3. **内容无缝复用与秒开**：再次悬停到同一链接时，卡片瞬间（0ms 延迟）渲染出缓存的内容。
4. **内部双链完美呈现**：悬停于 `[[note:123|XXX]]`（展现为 `/note/123`）上，卡片完美展示该笔记的“主分类目录路径”、“系统分析的 Summary”及“更新时间”。
5. **外部网站 OG 预览**：悬停于如 `https://github.com`、`https://news.ycombinator.com` 等网页时，能正确代理获取其 OG 标题、描述与封面图（如有）。
6. **网络安全防护**：输入 `http://localhost:3344` 等内部敏感路由，API 能够精准拦截并报告 `400 Bad Request`，卡片显示“无法预览此敏感链接”。
7. **极佳交互跟随**：用户从链接滑入预览卡片本身，卡片稳定存在；一旦移出卡片与链接，卡片以 `scale-95 opacity-0` 的过渡在 150ms 内完全淡出销毁。

---

## 8. Open Questions (待确认的问题)

1. **缓存大小与生命周期**：前端缓存是否仅存留在当前会话的内存 Map 中？（如果是，刷新页面缓存会被重置，这已经能提供非常棒的单次浏览体验，且逻辑最为精炼稳定）。
2. **正文片段兜底**：当内部笔记没有 AI 提炼的 Summary 时，直接截取其 markdown 正文的前 150 个字，并过滤掉 Markdown 语法标签（如 `#`、`*` 等）以保持排版整洁。这部分截取与过滤由前端渲染还是后端清洗完成？
   *→ 建议：前端可以通过简单的正则或者直接使用 editor 的纯文本提取，更灵活且不增加后端负担。*

---

## 9. Tasks (任务拆解)

- [ ] **Task 1: 实现后端抓取代理 API 与路由安全拦截**
  - **验收标准**：
    - 外部请求 `GET /api/url/preview?url=...` 自动接入 JWT 鉴权并通过。
    - 拦截检测：请求 `http://127.0.0.1:3344` 等局域网敏感地址，API 精准返回 `400 Bad Request` 并提示 `不允许访问内网地址`。
    - HTML 元数据解析：请求常见公网站点（如 `https://github.com`），能成功抓取页面、使用 `goquery` 抽取 OG 及标题字段、限制最大数据流 2MB 且 5 秒超时，返回标准的 JSON 格式，无中文乱码。
  - **验证方式**：编译启动后端，用 curl 或编写独立 Go 测试对该端点进行多项请求测试（内网 IP、常规公网站点、非法 URL），查看返回状态码与响应体。
  - **涉及文件**：
    - `backend/router/router.go`
    - `backend/api/note.go`

- [ ] **Task 2: 开发前端高质感 Portal 预览卡片与骨架屏组件**
  - **验收标准**：
    - 创建 React Portal 悬浮卡片 `<LinkPreviewPortal />`，在 `document.body` 根节点挂载。
    - 全面适配亮色和暗色模式，卡片采用磨砂玻璃背景（`backdrop-blur-md`）、圆角细腻边框及防溢出阴影，具备平滑缩放淡入动画。
    - **加载状态**：展示圆角条块脉冲骨架屏。
    - **内部笔记状态**：翡翠绿分类徽章、图标、大标题、三行截断纯净正文摘要及时间信息。
    - **外部链接状态**：深邃蓝域名徽章、标题、多行详细描述、以及高质感圆角首图缩略图（若有）。
  - **验证方式**：在页面中注入临时固定状态，切换 `loading`、`internal`、`external` 各模式，肉眼精细审查两套主题视觉体验，确保符合 Wow Factor。
  - **涉及文件**：
    - `frontend/src/components/LinkPreviewPortal.jsx`

- [ ] **Task 3: 构建全局事件委托与防抖定位 Hook**
  - **验收标准**：
    - 创建自定义 Hook `useLinkPreview.js`，在全局监听 `mouseover` 和 `mouseout` 事件委托。
    - 智能过滤：识别包含 `href` 属性且匹配 `/note/:id`（内部）或以 `http` 开头（外部）的 `a` 标签，延迟 400ms 触发，避免鼠标快速滑过时疯狂发请求。
    - **定位算法**：调用 `rect.getBoundingClientRect()` 叠加滚距，精确计算卡片出现坐标；加入视口边缘智能防溢出调整。
    - **生存控制**：实现滑入卡片本身不消失，滑出两者在 150ms 延时后淡出销毁。
    - **高效缓存**：内置 Map 会话级内存缓存，同链接再次悬浮实现 0ms 秒开。
  - **验证方式**：在控制台打印悬浮响应与缓存状态，测试连击、滑越、快速滑出时，卡片行为稳定，不漏报不报错，清理器在 unmount 时正常解绑 Listener。
  - **涉及文件**：
    - `frontend/src/hooks/useLinkPreview.js`

- [ ] **Task 4: 全局注册预览系统与全路径调优打磨**
  - **验收标准**：
    - 在 `frontend/src/App.jsx` 顶层完美挂载 `<LinkPreviewPortal />` 并运行 `useLinkPreview`。
    - 针对内部链接无摘要情况，编写正则清洗函数，将原始 markdown 除去 `#`、`*`、图片和链接等，提炼出前 150 字纯净文本用于摘要兜底。
    - 对内网拦截错误、加载超时错误，卡片能以优雅的“无法预览该地址”进行降级提示。
  - **验证方式**：整体编译系统启动，在笔记视图、编辑器输入等多种场景下进行实际鼠标交互悬停，确认整体功能行云流水，无可挑剔。
  - **涉及文件**：
    - `frontend/src/App.jsx`

