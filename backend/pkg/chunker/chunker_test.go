package chunker

import (
	"fmt"
	"testing"

	"note_all_backend/models"
)

func TestChunkTextWithMarkdown(t *testing.T) {
	// 读取 test.md 文件内容
	testContent := `# AI绘画提示词实战指南：从品牌VI到儿童节海报再到科普插画

## 前言

本文整合了三个真实的AI图像生成项目案例，分别涉及品牌文创周边VI展示图、儿童节海报的图层拆分与PSD拼合、少儿科幻科普细胞剖面图。所有案例均使用ChatGPT-Image2或其他AI绘图工具完成，旨在展示如何通过结构化的提示词工程，生成商业级、可编辑的高质量视觉作品。每个案例都包含完整的提示词原文、设计逻辑和后期处理策略，适合设计师、运营人员和对AI绘图感兴趣的学习者参考。

---

## 案例一：品牌文创周边VI展示图

### 项目目标

以一张暖咖色陶壶为视觉原点，生成3:4竖版、高级品牌提案式的完整VI展示图。画面需同时包含写实3D产品陈列和扁平矢量信息模块，用于品牌视觉系统说明。

### 核心提示词

` + "```" + `
生成品牌文创周边VI展示图，商业级写实3D渲染风格，现代简约、明亮干净、高级质感。45°斜角俯视构图，摄影棚陈列场景，暖黄色背景墙+白色哑光台面，空间干净无杂物。整体采用有秩序的陈列布局(半网格排版)，物品分层排列，整齐对齐，间距均匀，层级清晰。上方展示品牌LOGO:采用黑色粗体无衬线字体，笔画厚重，整体略向右倾斜，作为记忆点。品牌配色统一暖咖色为主色，灰色为点缀色，黑白为辅助色。画面高清、整洁、统一、具有高级设计感。下方为模块化信息区:设计灵感、LOGO构成、、品牌配色(、视觉语言、图案系统、字体设计、LOGO延展。扁平矢量风格，高饱和点缀，无阴影或极弱阴影，边缘干净利落，留白充足，版式理性有节奏。3:4竖版，高级品牌提案视觉。
` + "```" + `

**提示词拆解要点：**

- **任务定义**：明确是"品牌文创周边VI展示图"，而非单一商品图。
- **视觉风格**：商业级写实3D+现代简约高级质感。
- **场景与构图**：45°斜角俯视、摄影棚陈列、半网格布局，保证多物品展示的秩序感。
- **品牌识别**：黑色粗体无衬线LOGO，略右倾斜以强化记忆点。
- **配色系统**：暖咖主色+灰色点缀+黑白辅助，与陶壶材质统一。
- **信息层级**：上半部分写实陈列，下半部分矢量模块化信息区，形成两种表现语言的分区。

### 产出与应用

最终生成一张可直接用于提案的展示图，既呈现了产品质感，又完整说明了品牌视觉规范，适合社交媒体发布或打印提案册。

---

## 案例二：儿童节海报的分层设计与PSD拼合

### 项目目标

生成一张9:16竖版儿童节海报，并拆分为8个独立图层，保持元素位置绝对对齐，最终在Photoshop中拼合成可编辑PSD文件。

### 主海报生成提示词

` + "```" + `
Create a brand-new Children's Day poster in a cute, high-end, polished design style. Image A is a style and composition reference only. Use it to capture the overall feeling: a cheerful young child in a bright indoor playroom, playful doodle illustration overlays, soft pastel colors, and a lively poster layout. Do not simply copy Image A; make an original poster.

Design a vertical 9:16 poster for International Children's Day. Main subject: a smiling little child sitting on a small stool in a cozy classroom or playroom, surrounded by colorful building blocks and toys. Add whimsical white hand-drawn doodles around the child, especially a playful astronaut suit outline over the child's body, plus stars, sparkles, curved motion lines, and a small cartoon planet. The mood should be joyful, innocent, imaginative, and full of童趣.

Typography: prominently feature large Chinese text "童趣61" near the top, with energetic rounded lettering. Also include the English subtitle "Happy Children's Day" in a fun brush-stroke banner style. Add a smaller Chinese tagline near the bottom: "心怀童真 一如少年". Ensure all text is clean, legible, well-spaced, and beautifully integrated into the poster design.

Visual style: premium children's poster, bright and friendly, soft blue/yellow palette with colorful toy accents, subtle depth-of-field background, crisp subject focus, cute doodle graphics, balanced layout, refined typography, commercial-quality finish.
` + "```" + `

### 图层拆分策略

海报被拆分为8个独立图层，每个图层均保持9:16画布尺寸，元素位置与主海报完全对齐：

1. **背景游戏室**：保留墙壁、窗户、货架、地毯等场景，移除所有前景元素。
2. **儿童与木凳**：仅包含小孩和黄色木凳，其余区域为纯白底（后续去底）。
3. **宇航员线稿**：白色手绘宇航服轮廓及动态线条，去底后转为透明。
4. **顶部标题**：中文"童趣61"、英文副标题及装饰星点。
5. **微笑行星**：黄色微笑行星与蓝色光环。
6. **前景玩具积木**：火箭玩具、积木塔、散落玩具块。
7. **底部标语**："心怀童真 一如少年"横幅及星星。
8. **装饰涂鸦**：剩余独立星点、弧线等漂浮元素。

**白底去除技巧**：

- 彩色图层（如小孩、标题）通过识别与画布边缘连通的白色区域并转为透明，保留白色衣物等细节。
- 白色线稿图层（宇航员线稿、装饰涂鸦）则提取浅灰差异，将线稿转换为白色像素，背景透明，避免线条消失。

### PSD拼合层级

从底到顶依次为：背景游戏室 → 前景玩具积木 → 微笑行星 → 儿童与木凳 → 宇航员线稿 → 顶部标题 → 底部标语 → 装饰涂鸦。该结构允许设计师随时隐藏、替换或调整局部元素。

### 产出

最终交付物包括：分层的PSD源文件、透明PNG图层备份包、合成预览图，完全满足二次编辑和不同尺寸适配的需求。

---

## 案例三：少儿科幻科普细胞剖面图

### 项目目标

生成一张适合儿童观看的9:16竖版科普海报，采用科幻风格3D插画，展示动物细胞的外部形态、内部结构及功能分区，并附带知识标注。

### 完整提示词（精简版）

` + "```" + `
竖版 9:16，生成一张儿童友好的科幻科普海报，主题为「科幻科普——细胞剖面图」。深蓝色宇宙科技背景，霓虹 HUD 界面、星光粒子、未来感边框。中央为大型动物细胞 3D 剖面图，外层细胞膜半透明，内部清晰展示细胞核、核仁、线粒体、核糖体、内质网、高尔基体、溶酶体、液泡、中心体和细胞质。左右两侧设置编号信息卡片，用发光引导线连接对应结构，并加入简短中文功能解释。底部增加「外部形态」「内部结构」「功能分区」三个知识模块，以及「小知识：细胞是生命活动的基本单位，人体由无数个细胞组成。」加入可爱机器人、宇航员和星球装饰。商业级 3D 科普插画，少儿科幻杂志风格，高清、精致、丰富但不杂乱，无水印。
` + "```" + `

**设计要点**：

- 背景采用深蓝宇宙科技风，加入HUD边框和霓虹光效，营造探索感。
- 细胞器造型既保持科学拟真，又进行卡通化简化，如橙红色豆荚状线粒体、粉色层叠高尔基体。
- 信息标注以未来科技卡片+发光引导线连接，左右分栏，清晰不遮挡主体。
- 底部三个知识模块配合可爱图标强化记忆。
- 装饰元素（机器人、宇航员、星球）增强童趣。

**负面限制词**：避免文字乱码、结构混乱、过度写实恐怖感、英文替代中文等，确保儿童友好。

**进阶应用**：提供SVG矢量重绘提示词，可将生成图像转为分层可编辑的矢量文件，便于在Illustrator或Figma中继续优化。

---

## 通用方法论总结

从以上三个案例中可以提炼出一套AI绘画提示词工程的有效方法：

1. **明确任务类型**：区分是产品展示、叙事海报还是信息图表，决定整体构成。
2. **分层描述结构**：将画面拆分为背景、主体、装饰、文字等层级，在提示词中分别描述，便于AI理解主次关系。
3. **色彩与材质控制**：通过指定主色、点缀色、背景色和材质特质（哑光、半透明、霓虹等），建立统一视觉语言。
4. **构图与透视**：给出精确的画幅比例、视角（如45°俯视）和排列方式（如半网格），确保元素对齐。
5. **文字与排版**：对文字内容、字体风格、位置和版式做出清晰指令，避免生成乱码。
6. **后期可编辑性**：当需要灵活调整时，可先生成整体图，再通过拆分提示词获取独立图层，配合PSD或SVG工作流。
7. **负面限制词**：明确不要的元素（如水印、低清晰度、错误文字），提高成品率。

持续练习和积累不同场景的提示词模板，可以大幅提升AI绘图的专业度和实用性。

---

*本文所有案例的原始提示词均保留自真实项目，可直接复制使用或根据需求微调。*`

	config := models.DefaultChunkConfig()
	chunks := ChunkText(testContent, config)

	fmt.Printf("\n========== 分片结果统计 ==========\n")
	fmt.Printf("文档总字符数: %d (rune count)\n", len([]rune(testContent)))
	fmt.Printf("分片总数: %d\n", len(chunks))
	fmt.Printf("\n配置参数:\n")
	fmt.Printf("  MaxChunkSize: %d\n", config.MaxChunkSize)
	fmt.Printf("  MinChunkSize: %d\n", config.MinChunkSize)
	fmt.Printf("  OverlapSize: %d\n", config.OverlapSize)
	fmt.Printf("  MaxChunksPerDoc: %d\n", config.MaxChunksPerDoc)

	fmt.Printf("\n========== 各分片详情 ==========\n")
	for i, chunk := range chunks {
		runes := []rune(chunk.Content)
		fmt.Printf("\n[分片 %d]\n", i+1)
		fmt.Printf("  类型: %s\n", chunk.ChunkType)
		fmt.Printf("  章节: %s\n", chunk.Heading)
		fmt.Printf("  位置: [%d, %d]\n", chunk.StartPos, chunk.EndPos)
		fmt.Printf("  字符数: %d\n", len(runes))
		fmt.Printf("  内容预览 (前100字): %s...\n", truncate(runes, 100))
	}
}

func truncate(runes []rune, maxLen int) string {
	if len(runes) <= maxLen {
		return string(runes)
	}
	return string(runes[:maxLen])
}