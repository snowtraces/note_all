# 纯文本设计系统规范 (DESIGN.md)

本文件是 **Note All** 项目前端界面的唯一权威样式字典与视觉规范。所有 UI 组件的设计、重构与修改，必须严格对应并应用本规范中定义的 CSS 变量、Tailwind 类名和交互标准。

---

## 🎨 一、色彩与主题系统 (Colors & Themes)

项目采用基于 **CSS 变量** 驱动的多主题与双模式配色体系。共有 **3种主题**（Cyber, Blue, Forest）和 **2种模式**（Dark, Light），共计 6 种视觉组合。

### 1. 核心品牌重音色与通道值 (Accent & RGB System)

根据当前激活的 `data-theme` 与 `data-mode` 动态切换，用于核心按钮、焦点边框、高亮文字以及关键的动态发光阴影。

> [!IMPORTANT]
> - 为了使发光阴影（Shadows）的散射颜色在暗色模式下完美适应当前主题，请配合使用 RGB 通道变量 `--prime-accent-rgb`。
> - 绝对禁止将青色 `rgba(102, 252, 241, ...)` 硬编码写入全局阴影中，以防在切换至午夜蓝或森林绿主题时出现颜色冲突。

| 主题 (`data-theme`) | 模式 (`data-mode`) | 霓虹重音色 (CSS `var(--prime-accent)`) | RGB 通道值 (CSS `var(--prime-accent-rgb)`) | 辅助暗调色 (CSS `var(--prime-accent-dim)`) |
| :--- | :--- | :--- | :--- | :--- |
| **Cyber (赛博青)** | `dark` (默认) | `rgb(102, 252, 241)` (霓虹青) | `102, 252, 241` | `#45a29e` |
| | `light` | `#0891b2` (深青) | `8, 145, 178` | `#0e7490` |
| **Blue (午夜蓝)** | `dark` | `rgb(59, 130, 246)` (明蓝) | `59, 130, 246` | `#2563eb` |
| | `light` | `#2563eb` (深蓝) | `37, 99, 235` | `#1d4ed8` |
| **Forest (森林绿)** | `dark` | `rgb(16, 185, 129)` (翠绿) | `16, 185, 129` | `#059669` |
| | `light` | `#059669` (深绿) | `5, 150, 105` | `#047857` |

### 2. 语义化背景色映射表 (Semantic Backgrounds)

在编写组件背景时，**禁止直接写 Hex 颜色值**，必须使用对应的 Tailwind 映射类名：

| 语义化背景 (CSS 变量) | 暗色模式值 (`data-mode="dark"`) | 亮色模式值 (`data-mode="light"`) | Tailwind 映射类名 | 适用场景说明 |
| :--- | :--- | :--- | :--- | :--- |
| `--bg-base` | `#050505` | `#f8fafc` | `bg-base` | 最底层的全局页面背景 |
| `--bg-main` | `#070707` | `#ffffff` | `bg-main` | 主内容区域背景 |
| `--bg-sidebar` | `#080808` | `#f8fafc` | `bg-sidebar` | 侧边栏整体背景 |
| `--bg-card` | `#121212` | `#ffffff` | `bg-card` | 独立卡片、列表项背景 |
| `--bg-panel` | `#181818` | `#ffffff` | `bg-panel` | 功能控制面板、操作浮层 |
| `--bg-modal` | `rgba(15,15,15,0.98)` | `#ffffff` | `bg-modal` | 弹窗、模态对话框背景 |
| `--bg-header` | `rgba(20,20,20,0.85)` | `#ffffff` | `bg-header` | 顶部导航栏、独立区块页眉 |
| `--bg-code` | `#121212` | `#f8fafc` | `bg-code` | 代码块容器背景 |
| `--bg-code-header` | `#1a1a1a` | `#f1f5f9` | `bg-codeHeader`| 代码块顶部操作栏背景 |
| `--bg-graph` | `#050505` | `#ffffff` | `bg-graph` | 图谱、画布类底层背景 |

### 3. 语义化文字色映射表 (Semantic Typography Colors)

控制文字对比度与视觉信息层级，亮色模式已优化为更具高级感与护眼对比度的冷灰色（Slate 色系）：

| 语义化文字 (CSS 变量) | 暗色模式值 | 亮色模式值 | Tailwind 映射类名 | 适用场景说明 |
| :--- | :--- | :--- | :--- | :--- |
| `--text-primary` | `#ffffff` | `#0f172a` (Slate 900) | `text-textPrimary` | 主标题、正文、重要文字输入（避免纯黑 `#000000` 刺眼） |
| `--text-secondary` | `rgba(255,255,255,0.8)` | `#334155` (Slate 700) | `text-textSecondary`| 次要描述、卡片摘要、非聚焦状态 |
| `--text-tertiary` | `rgba(255,255,255,0.5)` | `#64748b` (Slate 500) | `text-textTertiary` | 时间戳、标签、辅助提示文字 |
| `--text-muted` | `rgba(255,255,255,0.3)` | `#9ca3af` (Gray 400) | `text-textMuted` | 占位符(placeholder)、禁用态文字 |

### 4. 辅助边界与交互状态色 (Borders & Interactive States)

| 语义化变量 | 暗色模式值 | 亮色模式值 | Tailwind 映射类名 | 适用场景说明 |
| :--- | :--- | :--- | :--- | :--- |
| `--border-subtle` | `rgba(255,255,255,0.2)` | `#e5e7eb` | `border-borderSubtle` | 默认超细分割线、卡片边框 |
| `--bg-hover` | `rgba(255,255,255,0.1)` | `rgba(15,23,42,0.05)` | `bg-bgHover` | 列表/按钮 Hover 悬停背景 |
| `--bg-subtle` | `rgba(255,255,255,0.05)`| `rgba(15,23,42,0.03)` | `bg-bgSubtle` | 极淡的静态背景装饰 |
| `--bg-overlay` | `rgba(0,0,0,0.8)` | `rgba(255,255,255,0.95)`| `bg-bgOverlay` | 全屏遮罩、遮罩层背景 |

---

## 🔠 二、排版与字体系统 (Typography & Scale)

### 1. 全局字体族栈 (Font Stack)
- 全局使用抗锯齿配置：Tailwind `antialiased`
- 字体族优先序列：`"Microsoft YaHei"`, `"Noto Sans SC"`, `"PingFang SC"`, `system-ui`, `sans-serif`

### 2. 标准字体尺寸与字重阶梯 (Font Size & Weight Scale)

> [!WARNING]
> - **浏览器中文 12px 物理渲染限制**：大多数现代浏览器对中文有最小 12px（`text-xs`）字号的渲染硬限制。
> - 如果在包含中文的界面元素（如“无标签”文字、重要主按钮等）中使用 `text-[10px]` 或 `text-[9px]`，浏览器将强行放大到 12px，这将导致原本预设的按钮 Padding 空间不足，发生**容器排版挤压形变或文字折行溢出**的严重 Bug。
> - **硬性标准**：所有包含中文的文字和主按钮，**最低字号必须为 `text-xs` (12px)**。`text-[10px]` 等超小字号仅限在纯英文、代码徽章、数字时间戳中使用。

| 等级名称 | Tailwind 类名组合 | 物理尺寸 | 行高/字重 | 适用组件/场景 |
| :--- | :--- | :--- | :--- | :--- |
| **超大标题** | `text-lg md:text-xl font-extrabold tracking-tight` | 18px / 20px | 紧凑 / Extra Bold | 侧边栏大标题、主页面核心 Header |
| **标准标题** | `text-[14px] font-bold` | 14px | 默认 / Bold | 碎片卡片标题、侧栏分类标题 |
| **正文/描述** | `text-xs` (12px) 到 `text-sm` (14px) | 12px / 14px | `1.625` / Normal | markdown 正文、卡片摘要、聊天文字、主按钮文字 |
| **辅助微标** | `text-[10px] font-medium` | 10px | 默认 / Medium | **（仅限纯英数）** 纯英文标签 tag、数字时间戳、辅助状态微标 |
| **超微注释** | `text-[9px] font-extrabold` | 9px | 默认 / Extra Bold | **（仅限纯英数）** Wiki 纯英文缩写徽标、纯数字状态计数器 |

---

## 📐 三、间距与布局规范 (Spacing & Layout)

项目严格执行 **4px 为基准的步进间距系统**。在 Flex 与 Grid 容器中，必须使用以下标准间距，避免引入不规范的奇数值间距：

| 间距代号 | Tailwind 类名 | 物理像素值 | 适用场景说明 |
| :--- | :--- | :--- | :--- |
| **超微间距** | `gap-0.5` / `p-0.5` | 2px | 极紧凑的并排控制钮组件组（如编辑器模式切换栏） |
| **微型间距** | `gap-1` / `p-1` | 4px | 紧凑图标微章并排、列表小元数据之间间隔 |
| **标准小间距**| `gap-2` / `p-2` | 8px | 小型下拉选项框间距、常规按钮组内衬 Padding / 元素间距 |
| **标准中等** | `gap-3` / `p-3` | 12px | 输入框内联按钮、常规弹窗内部元素纵向间距 |
| **标准大值** | `gap-4` / `p-4` | 16px | 列表卡片内边距 (`p-4`)、卡片之间的纵向间距 (`gap-4`) |
| **布局级内距**| `px-4 md:px-5 pt-6 pb-4` | 16px-20px | 侧边栏/详情页主体内容区的容器内衬 Padding |

> [!NOTE]
> - 在个别需要对齐或超紧凑辅栏的例外场景中，允许使用 `gap-1.5` / `p-1.5` (6px)，但不应作为通用布局间距推广。

---

## 🟢 四、圆角几何规范 (Border Radius)

圆角必须遵循外大内小的包含比例，以维护高级几何美感：

- **`rounded-2xl` (16px)**：用于顶级浮层、Portal 弹窗、主预览浮层容器（如实验室悬浮卡片预览）。
- **`rounded-xl` (12px)**：用于中间层级，包括所有的碎片卡片、对话历史项、下拉联想框、主内容框等。
- **`rounded-lg` (8px)**：用于功能组件，如按钮（Button）、文件上传区、输入框（Input）、文本域（Textarea）。
- **`rounded-md` (6px)**：用于微小选项，如 Wiki 选择下拉列表中的单个选项项。
- **`rounded` / `rounded-sm` (4px)**：用于最小元素，如行内代码（`code`）、标签（Tags）、Toast 提示框、滚动条滑块。

---

## 🌓 五、阴影与发光系统 (Shadows)

在暗色模式下，重载阴影类以排除脏感，依靠动态变量合成实现主题联动：

### 1. 暗色模式动态发光阴影 (Dark Mode Accent-adaptive Shadows)

当 `data-mode="dark"` 时，阴影将呈现出**发光边框**与**与激活主题颜色一致的漫射散射**：

| 阴影类名 | 物理 box-shadow 实现 | 视觉呈现效果 |
| :--- | :--- | :--- |
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.8), 0 0 1px rgba(255,255,255,0.05)` | 带有超细高光上边缘的紧贴阴影 |
| `shadow` | `0 2px 4px rgba(0,0,0,0.9), 0 0 1px rgba(255,255,255,0.05)` | 标准微卡片悬浮 |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.9), 0 0 2px rgba(255,255,255,0.05)` | 普通浮动面板悬浮 |
| `shadow-lg` | `0 10px 25px -5px rgba(0,0,0,0.9), 0 0 10px rgba(var(--prime-accent-rgb), 0.05)`| **动态跟随主题色** 的大范围漫射 |
| `shadow-xl` | `0 20px 40px -10px rgba(0,0,0,1), 0 0 15px rgba(var(--prime-accent-rgb), 0.08)` | 强主题重音色深邃漫射 |
| `shadow-2xl`| `0 25px 60px -12px rgba(0,0,0,1), 0 0 25px rgba(var(--prime-accent-rgb), 0.12)`| 强主题重音色超大漫射（模态弹窗专用）|
| `shadow-inner`| `inset 0 2px 4px rgba(0,0,0,0.4), inset 0 0 2px rgba(255,255,255,0.05)` | 内凹凹槽质感 |

### 2. 暗色核心识别边框 (`.card-rim`)
- **使用场景**：在深色模式下，当卡片与更深背景邻近时，为避免视觉融合，必须添加 `card-rim` 类。
- **视觉原理**：提供了一道透明度 0.25 的顶部亮白高光线，并在 hover 时顺滑过渡至 0.35 透明度。

---

## 🛠️ 六、核心组件与交互标准 (Components & States)

### 1. 按钮交互标准 (Button Rules)

- **主按钮 (Primary Call-to-Action)**
  - 包含细微发光与品牌色半透明底色，且**中文内容最低使用 `text-xs` (12px) 限制**：
    `bg-primeAccent/20 text-primeAccent hover:bg-primeAccent hover:text-white-fixed border border-primeAccent/30 backdrop-blur transition-all duration-300 rounded-lg text-xs font-bold active:scale-[0.98]`
  - 特殊情况下可直接使用品牌色实体：`bg-primeAccent text-white-fixed`。
- **辅助/工具栏按钮 (Secondary / Icon Buttons)**
  - 采用轻淡的 hover 样式，保持信息层级简洁：
    `text-textTertiary hover:text-textPrimary hover:bg-primeAccent/10 p-1.5 rounded-md transition-all duration-200 active:scale-[0.98]`
- **危险/删除按钮 (Destructive Actions)**
  - 默认微红，悬停红底，点击二次确认高亮：
    `text-red-400/80 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-md transition-all duration-200`
    如需触发二次确认删除，需在点击后添加 `bg-red-500 text-white-fixed shadow-lg shadow-red-500/20`，并带有 `animate-pulse` 缩放效果。

### 2. 输入域交互标准 (Input & Textarea Rules)

- **标准输入框 (Standard Inputs)**
  - `bg-sidebar/50 border border-borderSubtle focus:border-primeAccent/50 focus:outline-none focus:ring-0 text-textPrimary placeholder-textMuted rounded-lg transition-colors duration-200`
- **玻璃质感高亮输入框 (Glass Inputs)**
  - 适用于高对比度或 AI 对话框：可以使用 `.glass-input` 类。
  - 聚焦状态：当触发 `:focus` 时，边框渐变至高亮品牌色，并辐射 `0 0 15px rgba(prime-accent, 0.15)` 的发光光晕。

### 3. 模态框与磨砂面板标准 (Modal & Glass Panel)

- 统一采用 **Glass Panel** 方案：
  - 类名：`.glass-panel`
  - CSS 特性：`background: var(--bg-modal); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid var(--border-subtle);`
  - 确保内部文本在磨砂玻璃背景下清晰可辨。

### 4. 滚动条美化规范 (Scrollbars)

- 全局滚动条必须使用美化定义以防系统默认粗黑条破坏设计美感：
  - 滚动条宽度限制为 `6px`，轨道背景透明。
  - 滚动条滑块颜色使用 `color-mix(in srgb, var(--text-primary), transparent 80%)`，Hover 时加深至 `60%`。
  - 禁用滚动的特殊场景，必须添加类 `.scrollbar-none`。

### 5. 图片懒加载占位标准 (Lazy Images)

- 图片容器统一使用：`.lazy-image-wrapper`
- 未加载时，`.lazy-image-placeholder` 触发 2 秒周期的渐变呼吸动画（`.pulse-placeholder`），防止白屏。
- 加载成功后通过 `opacity 0.4s ease-out` 渐显，失败时以虚线框回显并展示优雅的“加载失败”浮层。
