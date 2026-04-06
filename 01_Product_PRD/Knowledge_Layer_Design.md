# 知识层设计文档：note_all 三层知识架构

> 版本：v0.1 | 时间：2026-04-06 | 状态：草稿

## 一、 核心理念：从碎片到知识的分层体系

当前的 `note_all` 将所有内容统一存储为 `NoteItem`，本次设计在此基础上增加**上层知识分类**，构建出清晰的二级体系：

```
┌─────────────────────────────────────────────────────────────┐
│                    上层：知识分类 (Vault)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  知识 / WIKI │  │  文件 / DOC  │  │   照片 / PIC     │  │
│  │  AI 提炼词条 │  │  个人重要文件│  │  纯图像，无文字  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │ 关联/来源
┌────────────────────────────▼────────────────────────────────┐
│                  下层：原始碎片 (Raw Fragments)               │
│            当前的 NoteItem  ——  只增不改的真相来源            │
└─────────────────────────────────────────────────────────────┘
```

**关键设计原则：**
- 原始碎片（`NoteItem`）是不可变的真相来源，永久保留。
- 上层三大分类是原始碎片的**衍生产物和聚合视图**，不替代碎片。
- AI 是知识层内容的主要生产者，人类是策展者和决策者。

---

## 二、 三大分类详细定义

### 2.1 照片 / PIC

**语义**：纯粹的视觉图片记录，没有任何可提取的有效文字内容。

**来源规则（自动判定）：**
- 上传图片时，先走 OCR 管线
  - OCR 提取到有效文字（超过阈值，如正文字数 ≥ 20）→ 归为普通原始碎片（`NoteItem`）
  - OCR 无有效文字，退到 VLM 做图像兜底描述（`ai_summary` = VLM描述） → **自动标记为 PIC 类别**
- 例子：风景照、日常生活记录、截图（仅图形无文字的）

**数据特征：**
- `ocr_text` 为空或极短
- `ai_summary` 来自 VLM（视觉语言模型）描述图像场景
- 无对应的 WIKI 词条关联
- 可按拍摄时间流浏览，类似相册

**用户操作：**
- 系统自动归类，用户无需干预
- 用户可手动将照片"提升"为碎片（如果照片实际上有重要文字内容被误判）
- 支持按时间线浏览、地点聚合（若有 EXIF 信息）

---

### 2.2 文件 / DOC

**语义**：与个人生活密切相关的正式文书类单据，如合同、票据、证书、保险单、报销单等。

**来源规则（自动 + 手动双通道）：**

**自动归类路径：**
- 当碎片的 OCR 或 AI 分析命中以下关键词特征时，AI 自动建议或归类为 DOC：
  - 合同类：合同、协议、甲方、乙方、签字、盖章、有效期
  - 票据类：发票、收据、税号、金额、开具日期、增值税
  - 证件类：身份证、护照、驾驶证、学历、资格证书、营业执照
  - 保险类：保险单、理赔、受益人、免责条款
  - 医疗类：诊断书、检验报告、处方、病历
- 关键词匹配置信度超过阈值，系统自动将该碎片分类为 `doc_type: suggested`，并推送通知。

**手动归类路径：**
- 用户在任意碎片上选择「标记为文件」
- 选择文件子类型：合同 / 票据 / 证书 / 医疗 / 其他

**数据特征：**
- 强调原始文件的完整保存和溯源
- 有明确的**有效期**概念（自动识别并在临近时提醒）
- 有**事件绑定**（如：与某次购房相关的所有文件）

**用户操作：**
- 批量查看所有文件（按类型、按时间过滤）
- 设置有效期提醒
- 按事件/项目将多个文件归组

---

### 2.3 知识 / WIKI

**语义**：对原始碎片的概念提炼与聚合，参照 Wikipedia 词条形式，每条知识词条代表一个「概念」或「主题」，而非某一具体来源。

**来源规则（AI 自动提炼）：**
- 触发时机：
  1. **摄入触发**：新碎片入库后，AI 分析其核心概念，判断是否应创建新词条或扩充已有词条。
  2. **手动触发**：用户提问生成了高价值回答后，可选择「存入知识库」。
  3. **批量整理**：AI 定期巡检碎片池，对高频出现但未成词条的概念，批量推荐创建。

**一条 WIKI 词条的结构（参考 Wikipedia 设计）：**

```
词条名称（Concept）
│
├── 一句话摘要（Summary）         ← AI 生成，人类可修改
├── 正文内容（Body）              ← AI 编纂，支持 Markdown
│    ├── 背景与定义
│    ├── 关键属性/特征
│    ├── 子概念或分类
│    └── 相关故事/案例（来自碎片）
│
├── 来源碎片列表（Sources）       ← 关联多个 NoteItem
├── 关联词条（See Also）          ← 双向链接其他 WIKI 词条
├── 标签（Tags）
└── 历史版本记录（Versions）      ← LLM 编辑有完整 Changelog
```

**特别说明：**
- WIKI 词条"来源碎片"字段是对应原始 `NoteItem` 的多对多关联，保证溯源能力。
- AI 在编辑词条时只能追加或修订不准确信息，不能删除有引用来源的内容。
- 人类可以对词条提出修改意见，AI 执行修改并记录 Diff。

---

## 三、 数据模型设计

### 3.1 NoteItem 扩展（原始碎片新增字段）

在现有 `NoteItem` 基础上新增：

```go
// 新增字段：碎片的上层分类
CategoryType string `gorm:"size:16;default:'fragment'" json:"category_type"`
// 可选值：
//   "fragment"  - 默认，普通原始碎片
//   "pic"       - 系统自动判定为照片（OCR无有效文字）
//   "doc"       - 用户手动或AI自动归类为个人文件
//   "doc_suggested" - AI建议归为文件，等待用户确认

// 文件子类型（category_type = "doc" 时有效）
DocSubType string `gorm:"size:32" json:"doc_sub_type"`
// 可选值："contract", "invoice", "certificate", "medical", "insurance", "other"

// 文件有效期（DOC 类型使用）
DocExpireAt *time.Time `json:"doc_expire_at"`
```

### 3.2 新表：WikiEntry（知识词条）

```go
// WikiEntry 知识词条：AI 提炼并维护的概念聚合体
type WikiEntry struct {
    ID        uint           `gorm:"primaryKey" json:"id"`
    CreatedAt time.Time      `json:"created_at"`
    UpdatedAt time.Time      `json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at"`

    // 词条核心内容
    Title     string `gorm:"size:255;not null;uniqueIndex" json:"title"`    // 词条标题（概念名）
    Summary   string `gorm:"size:1024" json:"summary"`                       // 一句话摘要（AI生成）
    Body      string `gorm:"type:text" json:"body"`                          // 正文 Markdown（AI编纂）
    Status    string `gorm:"size:32;default:'draft'" json:"status"`          // draft / published / archived

    // 溯源关联（多对多）
    Sources  []NoteItem  `gorm:"many2many:wiki_sources;" json:"sources"`

    // 词条间双向链接（多对多，自关联）
    LinkedEntries []WikiEntry `gorm:"many2many:wiki_links;joinForeignKey:WikiID;joinReferences:LinkedID" json:"linked_entries"`

    // 标签
    Tags []WikiTag `gorm:"foreignKey:WikiID" json:"tags"`

    // AI 编辑元信息
    LastAiEditAt *time.Time `json:"last_ai_edit_at"`  // 上次 AI 修订时间
    EditCount    int        `gorm:"default:0" json:"edit_count"` // 总修订次数
}

// WikiTag 词条标签
type WikiTag struct {
    ID     uint   `gorm:"primaryKey" json:"id"`
    WikiID uint   `gorm:"not null;index;uniqueIndex:uidx_wiki_tag" json:"wiki_id"`
    Tag    string `gorm:"size:64;not null;index;uniqueIndex:uidx_wiki_tag" json:"tag"`
}

// WikiVersion 词条历史版本（记录每次 AI 或人工修改）
type WikiVersion struct {
    ID        uint      `gorm:"primaryKey" json:"id"`
    WikiID    uint      `gorm:"not null;index" json:"wiki_id"`
    CreatedAt time.Time `json:"created_at"`
    
    BodySnapshot string `gorm:"type:text" json:"body_snapshot"`  // 该版本正文快照
    EditSummary  string `gorm:"size:512" json:"edit_summary"`     // 修改说明（AI自填）
    EditedBy     string `gorm:"size:16" json:"edited_by"`         // "ai" | "user"
}
```

### 3.3 关联表汇总

| 关联表名 | 说明 |
|---|---|
| `wiki_sources` | WIKI 词条 ↔ NoteItem（多对多，溯源） |
| `wiki_links` | WIKI 词条 ↔ WIKI 词条（双向链接，自关联） |

---

## 四、 关键业务流程

### 4.1 图片上传判定流程（PIC vs Fragment）

```
用户上传图片
     │
     ▼
  OCR 处理
     │
     ├─ [有效文字 ≥ 阈值] ──────────→  归为普通 NoteItem（fragment）
     │                                   继续走 AI 分析管线
     │
     └─ [无有效文字 / 字符数 < 阈值] ─→  VLM 兜底描述图像内容
                                          │
                                          ▼
                                    存入 NoteItem
                                    category_type = "pic"
                                    ai_summary = VLM场景描述
                                    （不进入 WIKI 提炼管线）
```

**阈值建议：** 正文有效字符数 ≥ 20（去除标点符号、空格），且这些字符中文字比例超过 60%，才视为"有有效文字"。

### 4.2 文件自动识别流程（DOC）

```
NoteItem 入库完成（status = "analyzed"）
     │
     ▼
  DOC 关键词规则匹配
     │
     ├─ [匹配置信度 ≥ 80%] ──────────→  自动标记 category_type = "doc"
     │                                    自动推测 doc_sub_type
     │                                    推送通知给用户确认
     │
     ├─ [匹配置信度 40%~80%] ─────────→  标记 category_type = "doc_suggested"
     │                                    在下次用户进入 App 时提示
     │
     └─ [匹配置信度 < 40%] ───────────→  保持 category_type = "fragment"
```

### 4.3 WIKI 词条提炼流程（自动）

```
NoteItem 摄入完成
     │
     ▼
  AI 提取核心概念列表（可多个）
     │
  对每个概念：
     │
     ├─ [已存在同名或近义词条] ──────→  AI 阅读新碎片内容
     │                                   更新词条 Body（追加/修订）
     │                                   在 wiki_sources 新增关联
     │                                   记录 WikiVersion（diff + 说明）
     │
     └─ [概念全新，无对应词条] ──────→  创建新 WikiEntry（status = "draft"）
                                          AI 编写初始 Summary + Body
                                          关联当前 NoteItem 为来源
                                          推送"新词条已创建"通知
```

### 4.4 手动创建 WIKI 词条

用户在对话/查询得到高价值回答后：
1. 点击「存入知识库」
2. 输入词条标题（或使用 AI 推荐标题）
3. AI 将回答内容格式化为 WIKI 格式
4. 关联对话中引用的所有 NoteItem 作为来源

---

## 五、 UI 视图设计建议

### 5.1 主导航改造

当前单一列表 → 增加顶部分区 Tab：

```
[全部碎片]  [知识 WIKI]  [文件 DOC]  [照片 PIC]
```

### 5.2 WIKI 词条视图

参考 Wikipedia 风格，展示：
- 词条标题 + 一句话摘要
- 正文（Markdown 渲染，支持内部词条链接 [[概念A]]）
- 右侧信息栏：来源碎片数、最后更新时间、相关词条
- 历史版本 Tab（类似 Git Diff 展示）

### 5.3 DOC 文件视图

- 卡片式列表，按子类型分组（合同、票据、证书…）
- 卡片显示：文件名、子类型图标、有效期（红色警告：临期）、来源原图缩略图
- 支持按有效期排序

### 5.4 PIC 照片视图

- 瀑布流或网格相册视图
- 按月份时间轴分组
- 点击展开 VLM 描述（ai_summary）

---

## 六、 演进路线建议

| 阶段 | 内容 | 优先级 |
|---|---|---|
| **P0** | NoteItem 新增 `category_type` 和 `doc_sub_type` 字段 | 立即 |
| **P0** | 图片上传判定逻辑（OCR 字符阈值 → PIC 标记） | 立即 |
| **P0** | DOC 关键词规则匹配（静态规则集） | 立即 |
| **P1** | WikiEntry + WikiVersion 数据表建立 | 短期 |
| **P1** | AI 自动从碎片中提炼 WIKI 词条的后台任务 | 短期 |
| **P1** | 前端三大分类 Tab 视图 | 短期 |
| **P2** | WIKI 词条双向链接（[[概念A]] 语法渲染） | 中期 |
| **P2** | DOC 有效期追踪与提醒 | 中期 |
| **P2** | `index.md` 风格的全局索引 + `log.md` 操作记录 | 中期 |
| **P3** | WIKI 词条历史版本 Diff 视图 | 长期 |
| **P3** | 词条质量巡检 Lint 后台任务 | 长期 |
