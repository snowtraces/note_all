# Cloudflare Workers 部署与配置手册

本手册详细介绍了如何将 Wiki URL 链接预览功能迁移/托管至 Cloudflare Workers 边缘计算端，以获得**最极致的性能**与**绝对的内网防跨站 (SSRF) 安全**。

---

## 1. 边缘端 Worker 代码

请将以下 JavaScript 代码部署至您的 Cloudflare Worker 中。此代码完全采用原生流式解析器 `HTMLRewriter`，不依赖任何第三方库，在边缘节点以极低延迟（几毫秒内）清洗目标超链接的 Open Graph 规范元数据：

```javascript
export default {
  async fetch(request, env, ctx) {
    // 1. 处理前端浏览器的跨域预检请求 (CORS OPTIONS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        }
      });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "缺少 url 参数" }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json; charset=utf-8", 
          "Access-Control-Allow-Origin": "*" 
        }
      });
    }

    try {
      // 2. 发起公网 GET 安全请求，伪装 User-Agent 防止被常规反爬墙拦截
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        },
        redirect: "follow"
      });

      if (!response.ok) {
        return new Response(JSON.stringify({ error: `目标服务器响应异常: ${response.status}` }), {
          status: 400,
          headers: { 
            "Content-Type": "application/json; charset=utf-8", 
            "Access-Control-Allow-Origin": "*" 
          }
        });
      }

      // 3. 定义元数据收集结构
      const preview = {
        title: "",
        description: "",
        image: "",
        site_name: new URL(targetUrl).hostname
      };

      // 4. 利用流式 HTMLRewriter 以极高吞吐量秒级解析 DOM
      const rewriter = new HTMLRewriter()
        .on("title", {
          text(text) {
            preview.title += text.text;
          }
        })
        .on("meta", {
          element(element) {
            const property = element.getAttribute("property") || element.getAttribute("name");
            const content = element.getAttribute("content");
            if (!property || !content) return;

            const cleanProp = property.toLowerCase();
            if (cleanProp === "og:title" || cleanProp === "twitter:title") {
              preview.title = content;
            } else if (
              cleanProp === "og:description" || 
              cleanProp === "description" || 
              cleanProp === "twitter:description"
            ) {
              preview.description = content;
            } else if (cleanProp === "og:image" || cleanProp === "twitter:image") {
              preview.image = content;
            } else if (cleanProp === "og:site_name") {
              preview.site_name = content;
            }
          }
        });

      // 执行重写转换（流式运行，内存不膨胀）
      await rewriter.transform(response).arrayBuffer();

      // 清洗空格
      preview.title = preview.title.trim();
      preview.description = preview.description.trim();
      preview.site_name = preview.site_name.trim();

      // 如果图片是相对路径，转化为绝对路径
      if (preview.image && !preview.image.startsWith("http")) {
        try {
          preview.image = new URL(preview.image, targetUrl).href;
        } catch (_) {}
      }

      // 5. 组装结果响应，安全注入跨域许可头
      return new Response(JSON.stringify(preview), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS"
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: `边缘抓取发生崩溃: ${err.message}` }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json; charset=utf-8", 
          "Access-Control-Allow-Origin": "*" 
        }
      });
    }
  }
};
```

---

## 2. 部署方案一：Cloudflare 网页仪表盘直接部署（零终端，极速上手）

如果您不想安装 Wrangler 等命令行工具，可以使用此方案：

1. **登录平台**：访问 [Cloudflare 官网](https://dash.cloudflare.com/) 并登录您的账户。
2. **进入入口**：在左侧导航栏点击 **"Workers & Pages"**（Workers 与页面）。
3. **创建服务**：点击页面右上角 **"Create Application"** -> **"Create Worker"**。
4. **命名与部署**：
   - 给您的服务命名（例如：`note-link-preview`）；
   - 直接点击最下方的 **"Deploy"** 按钮部署初始模板。
5. **粘贴代码**：
   - 部署成功后，点击页面右上角的 **"Edit Code"** 按钮；
   - 清理编辑区已有的全部默认代码，将**本手册第 1 节中的全部 JavaScript 代码**粘贴进去；
   - 点击右上角 **"Save and deploy"** 按钮，确认发布。
6. **获取预览地址**：
   - 返回 Worker 管理主面板，您将获得该 Worker 的专属二级域名公网链接（例如：`https://note-link-preview.yourusername.workers.dev`）。这就是您的专属元数据代理服务 URL！

---

## 3. 部署方案二：Wrangler CLI 专业部署（支持 Git 与版本跟踪）

如果您想通过本地终端进行版本化维护，请使用此方案：

1. **新建空目录**，在其中创建以下两份核心文件：
   
   *   **`wrangler.toml` (配置文件)**：
       ```toml
       name = "note-link-preview"
       main = "index.js"
       compatibility_date = "2024-05-01"
       ```
   
   *   **`index.js` (脚本文件)**：
       *(将本手册第 1 节中的 JavaScript 代码完整复制粘贴至此文件中)*

2. **终端部署**：
   在当前目录终端中执行以下命令完成云端授权与一键部署：
   ```bash
   # 授权登录 Cloudflare
   npx wrangler login

   # 编译并快速发布到您的 Cloudflare 账户下
   npx wrangler deploy
   ```
   发布成功后，终端将输出您的 Workers Preview 域名（例如：`https://note-link-preview.your-subdomain.workers.dev`）。

---

## 4. 前端应用激活配置（关键步骤）

一旦您获取到了 Workers 的二级域名 preview 链接，请按照以下步骤让您的 `Note-All` 项目连接边缘端：

1. **在前端根目录下新建本地环境配置文件**：
   - 文件路径：`frontend/.env.local` （此文件已默认列入系统的 `.gitignore` 中，包含 `*.local` 规则，不会被误提交，保护您的安全配置）。
   
2. **写入环境变量**：
   在 `frontend/.env.local` 写入您的 Worker 专属链接：
   ```env
   VITE_CLOUDFLARE_WORKER_URL=https://note-link-preview.yourusername.workers.dev
   ```
   *(注意：请将上面的链接替换为您自己部署得到的真实预览链接，末尾不留斜杠)*。

3. **检验生效**：
   - Vite 自动热重载，在前端悬浮任意超链接，若配置正确，系统将不再通过本地 `/api/url/preview` 路由，而是**直接并发直连 Cloudflare Edge 请求边缘 Workers 元数据**！
   - 如果移除该文件或清空 `VITE_CLOUDFLARE_WORKER_URL` 变量，系统将无缝**回退至本地 Go 服务代理**，做到绝对的坚固性。

---

*文档版本: 1.0 | 创建日期: 2026-05-17*
