# 知识库 · 在线分享站点

一个**零构建**的知识分享站点。托管在 GitHub Pages 上，自带 `https://` 链接，
可以在网页里直接写笔记，保存后几乎立刻生效，每篇笔记都有独立链接可以分享。

---

## 它长什么样

- **首页**：卡片列表 + 全文搜索 + 标签筛选
- **阅读页**：Markdown 渲染（表格、代码块、引用、任务清单都支持）
- **写笔记**：网页内编辑器，左边写 Markdown 右边实时预览
- **插入图片**：`Ctrl+V` 粘贴、拖拽、或点「📷 插入图片」按钮，图片自动上传到仓库
- **设置页**：填仓库信息和访问令牌

站点没有任何构建步骤 —— 纯 HTML + CSS + JS。改完文件刷新浏览器就是最新效果，
不存在「构建失败」这种问题。

---

## 目录结构

```
knowledge-hub/
├── index.html                  站点入口（单页应用）
├── assets/
│   ├── app.js                  全部逻辑：路由、渲染、GitHub 读写
│   ├── style.css               样式（自动适配深色模式）
│   ├── config.js               站点配置（部署脚本会填 owner/repo）
│   └── vendor/
│       ├── marked.min.js       Markdown 解析（本地内置，不依赖 CDN）
│       └── purify.min.js       HTML 净化，防 XSS
├── content/                    所有笔记，一篇一个 .md 文件
│   ├── welcome.md
│   └── markdown-guide.md
├── data/index.json             目录清单，由脚本或编辑器自动维护
├── tools/
│   ├── build-index.mjs         扫描 content/ 重新生成清单
│   ├── deploy-via-api.mjs      一键部署到 GitHub Pages（纯 API）
│   ├── check-github.mjs        检查 GitHub 网络连通性
│   └── dev-server.mjs          本地预览服务器
└── .github/workflows/
    └── build-index.yml         推送后自动更新目录清单
```

---

## 本地预览

```powershell
cd knowledge-hub
node tools/dev-server.mjs 8080
```

然后浏览器打开 http://localhost:8080/

---

## 部署到 GitHub Pages

### 前置：注册账号

打开 https://github.com/signup 注册。**记住你的用户名**，后面要用。

> 如果 `github.com` 打不开，先运行 `pwsh -File tools\check-github.ps1` 看诊断结果。
> 这个阻断通常是间歇性的，换个网络（比如手机热点）往往就通了。

### 第二步：生成令牌

打开 https://github.com/settings/tokens/new

- **Note**：随便填，比如 `knowledge-hub`
- **Expiration**：建议 90 天
- **Select scopes**：勾选 **`repo`** 和 **`workflow`**

生成后复制那串 `ghp_` 开头的令牌（只显示一次，记得先存好）。

### 第三步：一键部署

```powershell
cd knowledge-hub
node tools/deploy-via-api.mjs --token ghp_你的令牌 --repo knowledge-hub --title "我的知识库"
```

脚本会自动完成：

1. 校验令牌
2. 创建仓库（已存在则更新）
3. 生成内容目录清单
4. 把用户名/仓库名写进 `assets/config.js`
5. 上传全部站点文件
6. 创建提交
7. 开启 GitHub Pages
8. 打印访问链接

**全程只访问 `api.github.com`**，不需要 `git push`，也不需要打开 `github.com` 网页。

### 第四步：开始用

等 1–2 分钟，打开脚本打印的链接：

```
https://<你的用户名>.github.io/knowledge-hub/
```

点右上角 **⚙️ 设置**，填入用户名、仓库名、令牌，保存。
之后就能点 **✏️ 写笔记** 在网页里直接写了，保存即上线。

---

## 插图

在编辑器里有三种方式插入图片：

1. **截图后直接 `Ctrl+V` 粘贴** 到正文框
2. **把图片文件拖拽** 到正文框
3. 点 **「📷 插入图片」** 按钮选文件

图片会自动上传到仓库的 `content/images/` 目录，并插入这样的 Markdown：

```markdown
![图片](content/images/文件名.png)
```

**关于生效时间：**

- 编辑时的**预览区立刻显示**，写的时候不受影响
- 保存后，**你自己**（已配令牌）打开笔记也能立刻看到——脚本会走 API 取原图
- **其他访客**需要等 GitHub Pages 重新构建，通常 1–2 分钟

**关于体积：** 宽度超过 1600px 的图片会自动等比缩小后再上传，避免仓库膨胀。
单张原图上限 25MB。GIF 动图不做处理，保持原始动画；iPhone 的 HEIC 格式会自动转成 JPEG。

---

## 也可以不用网页编辑器

直接在 `content/` 下新建 `.md` 文件也能写：

```markdown
---
title: 我的第一篇笔记
tags: 读书, 方法
date: 2026-02-14
---

正文写在这里，支持 Markdown。
```

然后重新部署一次即可：

```powershell
node tools/build-index.mjs
node tools/deploy-via-api.mjs --token ghp_你的令牌 --repo knowledge-hub
```

`.github/workflows/build-index.yml` 会在每次推送后自动刷新目录清单，
所以如果你用 git 推送，连 `build-index` 都不用手动跑。

---

## 关于「实时更新」的说明

| 场景 | 生效速度 |
| --- | --- |
| 你自己（已填令牌）在网页上编辑后刷新 | **几秒**（走 GitHub API，绕过 CDN 缓存） |
| 其他访客打开链接 | 通常 1–2 分钟（等 GitHub Pages 重新发布 + CDN 刷新） |

这是静态托管的固有特性：没有服务器，就没有真正的「推送」。但对你本人来说，
编辑体验是接近实时的。

---

## 安全须知

- **令牌只存在你自己浏览器的 localStorage 里**，不会提交到仓库，也不会发给第三方。
- 但令牌等同于你账号的密码（`repo` 权限），**不要**把它贴到聊天记录、截图或公开的地方。
- 如果怀疑泄露，立刻到 https://github.com/settings/tokens 撤销。
- 仓库是**公开**的，任何人都能看到内容 —— 这本来就是「分享」的意思。
  如果内容需要保密，不要用这个方案。
- 免费账号的**私有仓库无法使用 GitHub Pages**。

---

## 常见问题

**Q：改动不生效？**
先强制刷新（Ctrl+F5）。GitHub Pages 有缓存，等 1–2 分钟。

**Q：保存时报 403？**
令牌权限不够。重新生成，确保勾选 `repo` 和 `workflow`。

**Q：保存时报 404？**
`assets/config.js` 里的用户名或仓库名拼错了。到设置页检查。

**Q：想改站名？**
设置页里改不了站名，直接编辑 `assets/config.js` 的 `title` 和 `desc`，重新部署。

**Q：想删掉示例笔记？**
在阅读页点「删除」，或用网页编辑器删除 `content/welcome.md` 和 `content/markdown-guide.md`。
