# 我的空间

一个托管在 GitHub Pages 上的个人内容站。文字、图片、可交互的 HTML 页面，
都在同一个界面里管理，浏览器打开就能改，改完几秒生效。

没有构建步骤 —— 纯 HTML + CSS + JS。

---

## 网址结构

| 路径 | 内容 |
| --- | --- |
| `/` | 站点首页（内容列表） |
| `/#/i/<id>` | 某一条内容 |
| `/#/new` | 新建 |
| `/#/settings` | 设置 |
| `/content/images/…` | 上传的图片 |
| `/content/pages/…` | 上传的 HTML 页面 |

---

## 三种内容

| 类型 | 说明 |
| --- | --- |
| **文字** | Markdown 排版。图片可以直接粘贴或拖进编辑框，会自动上传。 |
| **图片** | 单张图片作为一个条目，卡片上直接显示。 |
| **页面** | 带交互的 HTML，详情页里用 iframe 内嵌运行，也可以新窗口打开。 |

在「新建」里选类型，填完保存即可。「设置」页一次配置好仓库和令牌之后，
日常使用不需要再碰任何命令行。

---

## 目录结构

```
├── index.html                  站点入口
├── assets/
│   ├── app.js                  全部逻辑
│   ├── style.css               样式
│   ├── config.js               仓库配置（部署脚本会填）
│   └── vendor/                 marked + DOMPurify（本地内置，不依赖 CDN）
├── content/
│   ├── *.md                    文字内容
│   ├── images/                 图片
│   └── pages/                  交互页面
├── data/library.json           内容索引（自动维护，不要手改）
├── tools/
│   ├── lib/library.mjs         解析与对齐逻辑
│   ├── build-index.mjs         扫描 content/ 对齐索引
│   ├── deploy-via-api.mjs      部署（纯 API）
│   ├── check-github.mjs        网络连通性检查
│   └── dev-server.mjs          本地预览
└── .github/workflows/
    └── build-index.yml         推送后自动对齐索引
```

---

## 本地预览

```powershell
node tools/dev-server.mjs 8080
```

打开 http://localhost:8080/

---

## 部署

```powershell
node tools/deploy-via-api.mjs --repo <仓库名>
```

会依次完成：校验令牌 → 创建或更新仓库 → 按线上内容重建索引 → 上传文件 →
提交 → 开启 Pages → 打印访问链接。全程只访问 `api.github.com`。

**令牌**：classic token，勾选 `repo` 和 `workflow` 两项。

**索引保护**：`data/library.json` 永远根据线上真实内容重建，
不会用本地那份覆盖，所以网页上新增的内容不会丢。

---

## 内容数据

`data/library.json` 由脚本或编辑器自动维护，结构如下：

```json
{
  "site": { "title": "…", "desc": "…" },
  "items": [
    { "id": "…", "type": "note|image|page", "title": "…",
      "date": "2026-01-01", "tags": [], "summary": "…",
      "path": "content/…", "cover": "content/images/…" }
  ]
}
```

`build-index.mjs` 会依据 `content/` 下的真实文件对齐 `note` 与 `page` 条目，
并保留图片条目和站点信息。

**人工维护的字段不会被构建覆盖**，放心手改：

- `site` 下的任意字段（`title` / `desc` / `coords` / `featured` / `tickets` …）
- 条目的 `pin`（精选排序）、`series`（航线分组）、`related`（继续航行）

---

## 出门票

首页最底部的卡片墙，用来把各人的作品汇总到一页。
数据放在 `data/library.json` 的 `site.tickets`，**自己复制粘贴**即可：

```json
"tickets": [
  {
    "no": 1,
    "title": "混合层热收支",
    "desc": "用浮标数据算一遍混合层热量平衡",
    "href": "content/tickets/1.pdf",
    "img": "content/images/ticket-1.jpg"
  }
]
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `no` | 否 | 编号，会显示成 `01`、`02`；不填按顺序自动编号 |
| `title` | 否 | 标题；不填显示「出门票 N」 |
| `desc` | 否 | 一行说明，最多显示 3 行 |
| `href` | 否 | 链接（PDF 或网页）。有则整张卡可点，**没有也不会出现死链** |
| `img` | 否 | 封面图路径，建议 `content/images/…`；不填就不显示图 |

留空数组时，首页会显示一行「这里还没有内容」的提示，不会出现空白区块。

---

## 换成自己的域名

仓库 Settings → Pages → Custom domain 填入域名，
然后在域名商处把 CNAME 指向 `<用户名>.github.io`。
