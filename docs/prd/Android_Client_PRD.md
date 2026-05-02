# PRD: Note All - Android 移动端

## 1. 执行摘要 (Executive Summary)

*   **1.1 项目背景**：
    Note All 系统的核心痛点是“跨终端的碎片化知识收集与统一检索”。目前的 PC 端与 Web 端已打通底层链路（基于 PaddleOCR 和 大模型 AI 的自动化摘要与标签提取），但在最容易产生“碎片化信息”的移动场景（手机浏览网页、相册截图、微信文章），缺乏一个极速的收集管道。
*   **1.2 业务目标**：
    构建 Note All Android 客户端，使其成为移动端最轻便、高效的“吸尘器（收集器）”与“阅读器（Consumer）”。实现毫秒级的分享弹层响应与后台静默上传。
*   **1.3 范围与约束**：
    *   ✅ **范围包含 (In Scope)**
        *   **系统级分享接收 (Share Target)**：接收其他应用分享过来的纯文本、网页链接与图片。
        *   **剪贴板嗅探**：App 回到前台时嗅探文本并引导一键录入。
        *   **基础内容检索与消费**：支持瀑布流列表、内容展示以及检索。
        *   **纯文本快捷录入**：跳过 OCR 直接调后端大模型的快速记录通道。
        *   **RAW 模式编辑**：允许用户查看/修改提取的原始 OCR 字面量，触发后端重新打标。
    *   ❌ **范围排除 (Out of Scope)** (在此 MVP 版本不做的)
        *   复杂的本地 OCR 与边缘计算大模型推理（重度依赖服务端）。
        *   完全离线的检索模式（需要服务端网络连接）。
        *   多图片合并拼接上传机制增强。

---

## 2. 功能规格说明 (Functional Specification)

### 2.1 极速碎片收集 (Ingestor)

*   **待解决问题**：用户在第三方应用（如浏览器）看到好内容，将其摘抄存档的操作链路过长，打断当前的心流。
*   **用户故事**：作为**移动用户**，我想要**通过呼出系统底部的分享面板将图文直接扔进 Note All**，以便于**在不中断当前阅读的情况下完成碎片收集**。
*   **验收标准 (Acceptance Criteria - Gherkin)**：
    ```gherkin
    Scenario: 通过系统分享菜单分享文本
    Given 用户在浏览器选中一段文字并点击"系统分享"
    When 用户在分享面板选择 "Note All Share" 图标
    Then 屏幕底部弹出半透明的 Note All 上传确认面板
    And 系统将文本发送至后端 `/api/note/text` 接口
    And 上传成功后，半透明面板提示"上传成功"并在 1 秒后自动关闭，返回浏览器界面
    ```
    ```gherkin
    Scenario: 智能剪贴板嗅探
    Given 用户在外部应用复制了一段文本
    When 用户主动切换回 Note All App 首页
    Then 屏幕底部自动弹出一个 Snackbar/Card，显示 "发现新内容 pasted from clipboard"
    And 用户点击 "Save" 后，直接静默触发文本上传并刷新列表
    ```

### 2.2 知识广场与多维检索 (Consumer)

*   **待解决问题**：存放进去的信息如果没有良好的组织与消费界面，就会变成数字垃圾。
*   **用户故事**：作为**知识库管理者**，我想要**在一个瀑布流列表中看到我所有收集的内容卡片，并能通过标签快速检索**，以便于**复用之前收集的资料**。
*   **验收标准 (Acceptance Criteria - Gherkin)**：
    ```gherkin
    Scenario: 首页瀑布流加载
    Given 用户打开 Note All App 并已配置正确的 Base URL
    When 首页发起 `/api/search` 请求
    Then 列表渲染卡片，卡片包含：顶部图片预览(如有)，中部 AI Summary，底部高频 Tags。
    ```

### 2.3 详情与 RAW 数据编辑 (Detail & RAW Mode)

*   **待解决问题**： OCR 总有识别错漏的时候，需要人工干预并且让 AI 重新学习这块内容。
*   **用户故事**：作为**知识库管理者**，我想要**直接在手机上修改这段图文底层的原始提取文本，并自动让后端重制摘要**，以便于**保持知识库内容的绝对精准**。
*   **验收标准 (Acceptance Criteria - Gherkin)**：
    ```gherkin
    Scenario: RAW 模式编辑回刷
    Given 用户在笔记详情页点击右上角的 "RAW 模式" 开关
    When 用户修改了展示在 EditText 里的底层文本，并点击"保存修改"
    Then App 调用后端相关的更新接口（触发 AI 异步重新分析）
    And App 返回详情主界面，并在此后的几次刷新中拿到最新的 AI Summary。
    ```

### 2.4 设置模块 (Settings)

*   **待解决问题**：系统支持私有化部署，客户端需要能够动态连接用户的个人服务器。
*   **用户故事**：作为**私有化部署用户**，我想要**配置服务器的 Base URL**，以便于**让客户端与我自建的后端集群通信**。

---

## 3. 非功能性需求 (Non-Functional Requirements)

*   **性能**：
    *   **冷启动优化**：Share Target (分享目标页面) 的启动时间必须 < 500ms，需维持 Activity 的极度轻量化，不加载重型 UI 框架多余资源。
    *   **滚动流畅度**：首页列表滑动必须达到稳定的 60FPS，图片加载必须使用懒加载（如 Coil）与合理级别的内存缓存。
*   **安全**：
    *   只允许在配置了安全的 BaseURL 或者本地授信环境中互信传输，避免拦截。
*   **UI/UX**：
    *   遵循 Google Material Design 3 规范，支持深色/浅色模式无缝跟随系统。
    *   遵循全手势导航边界流白 (Edge-To-Edge) 设计。

---

## 4. 数据与技术参考 (Data & Tech Hints)

### 4.1 核心技术栈
*   **工程构建**：Kotlin 1.9+, Gradle 8.2+ (KTS)
*   **UI层**：Jetpack Compose (Material 3)
*   **异步控制**：Kotlin Coroutines + Flow
*   **网络通信**：Retrofit 2.9 + Moshi + OkHttp3
*   **本地存储**：Jetpack DataStore (Preferences)
*   **图片加载**：Coil (专门针对 Compose 优化的库)

### 4.2 客户端核心对象模型
与服务端 `/api/search` 吐出结构一致：
```kotlin
data class NoteItem(
    val id: Int,
    val storage_id: String,     // 用于拼接图片展示 URL: /api/note/file/{storage_id}
    val file_type: String?,     // 如 image/png
    val original_name: String?,
    val ocr_text: String?,      // RAW 纯文本内容
    val ai_summary: String?,    // 卡片展示主标题
    val ai_tags: String?,       // 搜索与过滤关联标识
    val created_at: String?
)
```

### 4.3 核心应用架构 (Architecture)
*   采用 **MVI (Model-View-Intent)** 或简单的 **MVVM (Model-View-ViewModel)** 模式。
*   独立抽出 `ShareReceiveActivity` 与主 `MainActivity` 分离：
    *   `ShareReceiveActivity`：只包含一个背景透明的 Dialog/BottomSheet，完成生命周期后即刻 `finish()` 释放，不长期驻留。
    *   `MainActivity`：承载所有检索、配置与浏览的可视化长生命周期面板。
