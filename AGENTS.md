# 代理人开发指南 (AGENTS.md)

本文件是面向 AI 代理人（Agents）及开发者的开发说明及前端 UI 样式约束指南。**在开始任何开发、构建、命令运行或前端修改前，您必须完整阅读本指南。**

---

## 📖 项目概述与架构

全栈知识管理应用，核心理念"无感收集、AI 即刻懂"。支持碎片化信息采集、AI 自动分析、向量相似度检索。

### 1. 技术栈
- **前端**: React 18 + Vite 5 + Tailwind CSS
- **后端**: Go + Gin + GORM + SQLite (FTS5)
- **向量嵌入**: Python Flask + sentence-transformers (BGE-small-zh-v1.5)
- **SSE 推送**: SSEBus

### 2. 重要文档存放位置

| 目录/文件 | 用途 |
|-----------|------|
| `docs/specs/` | 功能规格文档（Phase A/B/C 各阶段 spec） |
| `docs/design/` | 设计文档（架构决策、数据模型、协议设计） |
| `docs/prd/` | 产品需求文档 |
| `docs/` | 综合文档（使用说明、安装指南、API 参考） |
| `ROADMAP.md` | 研发路线图 |
| `CONTRIBUTING.md` | 贡献指南 |
| `readme.md` | 项目说明 |

---


## 🚀 核心工作流程

每次您收到涉及前端界面修改、新组件编写或样式调整的任务时，必须遵循以下步骤：

1. **第一步：加载设计系统规范**
   - 立即读取项目根目录下的设计系统字典：[DESIGN.md](./DESIGN.md)。
   - 熟悉当前项目的主题色、间距比例、圆角规则和组件交互细节。
2. **第二步：声明合规性**
   - 在您的分析或首个回复中，明确提及您已阅读并比对了 [DESIGN.md](./DESIGN.md) 中的规范，并承诺在接下来的代码修改中严格遵循其中的变量和类名。
3. **第三步：精细化编码**
   - 拒绝随意编写临时样式（Ad-hoc Styles）或硬编码 Hex/RGB 颜色。
   - 优先使用已定义的语义化 Tailwind 类和 CSS 变量。
4. **第四步：交付前自查**
   - 在完成编码并准备交付前，对照本指南下方的 **[交付前自查清单]** 逐项核对。

---

## 🎨 前端 UI 构建四大原则

为了确保界面的高端质感（Premium Aesthetics）与视觉一致性，所有代码修改必须贯彻以下原则：

### 1. 绝对禁止硬编码颜色 (Zero Hardcoded Colors)
- **规则**：严禁在 JSX 或 CSS 中直接写入形如 `bg-[#1a1a1a]`、`text-red-500`、`border-gray-200` 等硬编码的颜色值。
- **正规做法**：必须使用语义化色彩变量（如 `bg-sidebar`、`text-textPrimary`、`border-borderSubtle`）。
- **例外**：仅允许使用系统预设的全局常量类（如强制在深浅模式下都为白色的文字 `.text-white-fixed` 或特定警告状态颜色，且必须符合 [DESIGN.md](./DESIGN.md) 中的例外定义）。

### 2. 层级圆角与间距一致性 (Hierarchical Geometry)
- **规则**：页面中所有元素的圆角（Radius）与间距（Spacing/Gap）必须表现出清晰的层级递进关系，不可随意混用。
- **正规做法**：
  - **圆角**：弹窗与浮窗级用 `rounded-2xl`，卡片级用 `rounded-xl`，按钮与输入框用 `rounded-lg`，小选项用 `rounded-md`，标签/微标用 `rounded`。
  - **间距**：页面级边距用 `px-4 md:px-5 pt-6 pb-4`，卡片内边距用 `p-4`，元素紧凑 Gap 用 `gap-1.5` 或 `gap-2`，中等 Gap 用 `gap-3`，大 Gap 用 `gap-4`。

### 3. 多主题与多模式完美适配 (Cross-Theme Compatibility)
- **规则**：项目支持 Dark/Light 双模式，以及 Cyber（赛博青）、Blue（午夜蓝）、Forest（森林绿）三大主题。您编写的 UI 组件必须能在这 2x3=6 种组合下完美呈现。
- **正规做法**：
  - 背景色和文字色必须基于 CSS 变量（Tailwind 中的 `bg-base`、`text-textPrimary` 等）。
  - 在暗色模式下，普通黑色阴影是不可见的。必须使用 `index.css` 重载过的 `.shadow-sm` 到 `.shadow-2xl` 发光阴影，或者使用卡片边框增强方案 `.card-rim`。

### 4. 极致交互微动效 (Micro-Animations & Transitions)
- **规则**：静态的界面是死板的。所有可交互的元素（按钮、卡片、输入框、下拉项）在 Hover 或 Active 时必须有顺滑的反馈。
- **正规做法**：
  - 必须添加 `transition-all duration-300` 或 `duration-200` 等过渡效果。
  - 点击时应具有微缩放反馈，如 `active:scale-[0.98]`。
  - 输入框聚焦时应具有发光动画（参见 [DESIGN.md](./DESIGN.md) 中的输入框规范）。

---

## 🔍 代理人交付前自查清单 (Pre-delivery Checklist)

在宣布您的代码修改完成之前，请闭环自查以下问题，确保完全合规：

* [ ] **颜色合规**：我是否在代码中硬编码了任何 Hex、RGB 或非语义化的 Tailwind 颜色类？
* [ ] **双色适配**：在亮色模式（`data-mode="light"`）和暗色模式（`data-mode="dark"`）下，文字与背景的对比度是否足够？是否有文字在特定模式下变透明或不可见？
* [ ] **间距层级**：新加的间距和 Padding 是否符合以 4px (1rem = 16px) 为基准的步进规范？是否有奇奇怪怪的自定义 `px-[13px]` 或非标准 Gap？
* [ ] **圆角对齐**：组件的圆角是否遵循了“外大内小、大组件大圆角、小组件小圆角”的几何规律？
* [ ] **交互动效**：所有的点击事件源（Buttons / Clickable Cards）是否都配置了 `transition-all` 和 `active:scale-[0.98]`？
* [ ] **暗色阴影**：如果是卡片或浮窗，在暗色模式下是否调用了特殊的 `.shadow-md`、`.shadow-lg` 或 `.card-rim` 边框，以防止边缘融进黑色背景？
* [ ] **滚动条规范**：如果产生了局部滚动区域，是否正确使用了 `.custom-scrollbar` 或 `.scrollbar-none` 进行样式约束？
