#!/usr/bin/env node
/**
 * 扫描 content/ 与 content/pages/，对齐 data/library.json。
 *
 * 用法：node tools/build-index.mjs
 *
 * 只维护 entries 的「结构」信息；以下属于人工维护的内容一律原样保留：
 *   - site 下的任意字段（title / desc / coords / featured / tagMap …）
 *   - 条目的 pin / series / related（由 library.mjs 的 HUMAN_FIELDS 显式搬运）
 *   - note 与 video 的 date / tags / summary
 *
 * GitHub Actions 会在每次推送后自动跑一遍。
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { reconcile, sortItems, buildLibraryJSON, makeSummary } from './lib/library.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'library.json');
const LEGACY = path.join(ROOT, 'data', 'index.json');
const SEARCH_OUT = path.join(ROOT, 'data', 'search-index.json');
const SITE_DIR = path.join(ROOT, 'i');          // 预渲染的静态文章页
const MAX_BODY = 12000;                          // 搜索索引里每篇正文上限（字符）

/** 首次建立索引时的站点默认值；已有字段不会被覆盖 */
const SITE_DEFAULT = {
  title: '',
  desc: '',
  coords: '',
  // 出门票：首页最底部的卡片墙，人工维护、原样保留。
  // 每项形如 { no, title, desc, href, img }
  tickets: [],
};

/** 不抛异常的 JSON.parse；顺带去掉可能存在的 BOM */
function safeParse(text) {
  try {
    return JSON.parse(String(text).replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

/** 读 JSON，坏了就返回 null（不让一个坏文件炸掉整个构建） */
async function readJSON(file) {
  const raw = await readFile(file, 'utf8').catch(() => null);
  return raw == null ? null : safeParse(raw);
}

/* ================================================================== *
 * 全文搜索索引
 * ================================================================== */

/** 把 HTML 变成可搜索的纯文本 */
function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** 去掉 Markdown 标记，留下可搜索文本 */
function mdToText(md) {
  return String(md || '')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')   // front matter
    .replace(/(`{3,})[\s\S]*?\1/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 为每个条目抽正文，生成 data/search-index.json */
async function buildSearchIndex(items, files) {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const out = [];

  for (const it of items) {
    let body = '';
    const raw = byPath.get(it.path);

    if (it.type === 'note' && raw != null) {
      body = mdToText(raw);
    } else if (it.type === 'page' && raw != null) {
      body = htmlToText(raw);
    } else if (it.type === 'video') {
      // 视频没有正文，靠标题/摘要/标签，再补上同名的说明（若有 md）
      body = '';
    }

    // 标题常常也出现在正文里，去掉避免重复高亮
    if (it.title && body.indexOf(it.title) === 0) body = body.slice(it.title.length).trim();

    out.push({
      id: it.id,
      title: it.title || '',
      type: it.type,
      tags: it.tags || [],
      date: it.date || '',
      summary: it.summary || '',
      body: body.slice(0, MAX_BODY),
      truncated: body.length > MAX_BODY,
    });
  }

  const payload = {
    generated: new Date().toISOString(),
    count: out.length,
    items: out,
  };
  await writeFile(SEARCH_OUT, JSON.stringify(payload), 'utf8');
  const bytes = JSON.stringify(payload).length;
  console.log(`已写入 data/search-index.json（${out.length} 篇，${(bytes / 1024).toFixed(1)} KB）`);
  return payload;
}

/* ================================================================== *
 * 静态预渲染：让爬虫与分享预览看到真实内容
 * ================================================================== */
let _marked = null;
function getMarked() {
  if (_marked) return _marked;
  const require = createRequire(import.meta.url);
  // marked 的 UMD 包在 Node 里 require 之后，是把自身挂到 globalThis.marked 上，
  // 返回的模块对象是空的 —— 必须先看 globalThis，否则会拿到 {} 而渲染失败。
  require(path.join(ROOT, 'assets', 'vendor', 'marked.min.js'));
  const m = globalThis.marked;
  if (!m || typeof m.parse !== 'function') {
    throw new Error('无法加载 assets/vendor/marked.min.js（预渲染需要它把 Markdown 转成 HTML）');
  }
  _marked = m;
  return _marked;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** 站点首页的绝对地址，用于 canonical / og:url */
function siteBase(site) {
  const custom = (site && site.baseUrl) || '';
  if (custom) return custom.replace(/\/+$/, '') + '/';
  const owner = (site && site.owner) || 'hjk535';
  const repo = (site && site.repo) || 'knowledge-hub';
  return `https://${owner}.github.io/${repo}/`;
}

function renderNoteHTML(md) {
  const m = getMarked();
  const html = m.parse(String(md || ''), { gfm: true, breaks: false });
  if (!html || !html.trim()) {
    // 不静默退化：预渲染出空正文等于 SEO 白做
    throw new Error('Markdown 渲染结果为空，预渲染会产出空壳页面');
  }
  return html;
}

async function buildStaticPages(site, items, files) {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const base = siteBase(site);
  const shell = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const MARK = '<main id="app"></main>';
  if (!shell.includes(MARK)) {
    throw new Error('index.html 里找不到 `' + MARK + '`，预渲染无法注入正文');
  }

  await mkdir(SITE_DIR, { recursive: true });

  /**
   * 预渲染页位于 i/ 子目录，所以：
   *   - 所有相对资源（assets/…）必须补 "../"，否则会去请求 /i/assets/… 而 404
   *   - 站内 hash 链接（#/…）必须补站点根路径，否则从 /i/xxx.html 点回首页会丢一层目录
   */
  const reAbs = /(href|src)="(assets\/|content\/|data\/)/g;
  // "#/" 与页面自身的 "#" 都要补站点根：否则从 /i/xxx.html 回首页会落到 /i/ 上
  const reHash = /(href|src)="(#(?:\/|"))/g;
  const absify = (html) => html
    .replace(reAbs, '$1="../$2')
    .replace(reHash, '$1="' + base + '$2');

  let wrote = 0;
  for (const it of items) {
    const raw = byPath.get(it.path);
    let article = '';

    if (it.type === 'note' && raw != null) {
      const body = String(raw).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      article = '<div class="prose">' + renderNoteHTML(body) + '</div>';
    } else if (it.type === 'video') {
      article = '<div class="frame-wrap"><video src="../' + esc(it.path) +
        '" controls preload="metadata" playsinline></video></div>';
    } else if (it.type === 'image') {
      article = '<figure class="figure"><img src="../' + esc(it.path) + '" alt="' + esc(it.title || '') + '"></figure>';
    } else if (it.type === 'page') {
      article = '<p><a href="../' + esc(it.path) + '">打开交互页面 →</a></p>' +
        '<div class="frame-wrap"><iframe src="../' + esc(it.path) + '" loading="lazy" ' +
        'title="' + esc(it.title || '') + '"></iframe></div>';
    }

    const desc = it.summary || it.title || '';
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': it.type === 'video' ? 'VideoObject' : 'Article',
      headline: it.title || '',
      description: desc,
      datePublished: it.date || undefined,
      inLanguage: 'zh-CN',
      url: base + 'i/' + it.id + '.html',
      publisher: { '@type': 'Organization', name: site.title || '' },
    });

    let page = shell
      .replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(it.title) + ' · ' + esc(site.title || '') + '</title>')
      .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + esc(desc) + '$2')
      .replace('<main id="app"></main>',
        '<main id="app" data-static="1" data-item="' + esc(it.id) + '">' +
        '<button class="back" id="back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">' +
        '<path d="m15 18-6-6 6-6"/></svg>返回</button>' +
        '<article class="article"><header><h1>' + esc(it.title) + '</h1>' +
        '<div class="meta"><span>' + esc(it.date || '') + '</span></div></header>' +
        article +
        '<div class="article-foot"><a class="btn sm" href="' + base + '#/i/' + encodeURIComponent(it.id) +
        '">在站点中打开</a></div></article></main>')
      .replace('</head>',
        '<link rel="canonical" href="' + esc(base + 'i/' + it.id + '.html') + '">\n' +
        '<meta property="og:type" content="article">\n' +
        '<meta property="og:title" content="' + esc(it.title) + '">\n' +
        '<meta property="og:description" content="' + esc(desc) + '">\n' +
        '<meta property="og:url" content="' + esc(base + 'i/' + it.id + '.html') + '">\n' +
        '<meta property="og:site_name" content="' + esc(site.title || '') + '">\n' +
        '<meta name="twitter:card" content="summary_large_image">\n' +
        '<script type="application/ld+json">' + jsonLd.replace(/</g, '\\u003c') + '<\/script>\n' +
        '</head>');

    page = absify(page);

    await writeFile(path.join(SITE_DIR, it.id + '.html'), page, 'utf8');
    wrote++;
  }

  if (!items.length) {
    // 至少让 i/ 存在，避免 sitemap 指向空目录
    await writeFile(path.join(SITE_DIR, '.gitkeep'), '', 'utf8');
  }
  console.log(`已预渲染 ${wrote} 个静态页到 i/`);
}

/** sitemap.xml + robots.txt */
async function buildSitemapAndRobots(site, items) {
  const base = siteBase(site);
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: base, pri: '1.0' },
    ...items.map((it) => ({ loc: base + 'i/' + it.id + '.html', pri: it.pin ? '0.8' : '0.6', date: it.date })),
  ];
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => '  <url>\n' +
      '    <loc>' + esc(u.loc) + '</loc>\n' +
      '    <lastmod>' + esc(u.date || today) + '</lastmod>\n' +
      '    <priority>' + u.pri + '</priority>\n' +
      '  </url>').join('\n') +
    '\n</urlset>\n';
  await writeFile(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');

  const robots = 'User-agent: *\nAllow: /\n\nSitemap: ' + base + 'sitemap.xml\n';
  await writeFile(path.join(ROOT, 'robots.txt'), robots, 'utf8');

  console.log(`已写入 sitemap.xml（${urls.length} 条）与 robots.txt`);
}


async function collect() {
  const files = [];
  const contentDir = path.join(ROOT, 'content');
  if (!existsSync(contentDir)) return files;

  for (const name of await readdir(contentDir)) {
    const full = path.join(contentDir, name);
    if (/\.md$/i.test(name)) {
      files.push({ path: 'content/' + name, content: await readFile(full, 'utf8') });
    }
  }
  const pagesDir = path.join(contentDir, 'pages');
  if (existsSync(pagesDir)) {
    for (const name of await readdir(pagesDir)) {
      if (!/\.html?$/i.test(name)) continue;
      files.push({ path: 'content/pages/' + name, content: await readFile(path.join(pagesDir, name), 'utf8') });
    }
  }
  const vidDir = path.join(contentDir, 'videos');
  if (existsSync(vidDir)) {
    for (const name of await readdir(vidDir)) {
      files.push({ path: 'content/videos/' + name });
    }
  }
  const imgDir = path.join(contentDir, 'images');
  if (existsSync(imgDir)) {
    for (const name of await readdir(imgDir)) {
      files.push({ path: 'content/images/' + name });
    }
  }
  return files;
}

async function main() {
  const files = await collect();

  const existingRaw = await readFile(OUT, 'utf8').catch(() => null);
  let existing = existingRaw ? safeParse(existingRaw) : null;
  if (existingRaw && !existing) {
    console.warn('⚠ data/library.json 不是合法 JSON，本次按「空索引」重建。');
    console.warn('  人工维护的 site 配置与条目人工字段无法从文件内容恢复。');
  }
  if (!existing && existsSync(LEGACY)) {
    existing = await readJSON(LEGACY);
    if (existing) console.log('（已读取旧版 data/index.json 作为对齐依据）');
  }

  const items = reconcile(existing && existing.items, files);

  // site 以磁盘上的为准，只补默认值；绝不覆盖人工字段
  const mergedSite = Object.assign({}, SITE_DEFAULT, existing && existing.site);
  const json = buildLibraryJSON(mergedSite, items);

  await mkdir(path.dirname(OUT), { recursive: true });

  // 比对必须同时覆盖 site 与 items：
  // 否则「只改站点标题、不动任何内容文件」会被判为无变化而静默丢弃。
  const same = existing &&
    JSON.stringify(existing.site || {}) === JSON.stringify(mergedSite) &&
    JSON.stringify(sortItems(existing.items || [])) === JSON.stringify(sortItems(items));

  if (same) {
    console.log(`素材库无变化（共 ${items.length} 项）`);
  } else {
    await writeFile(OUT, json, 'utf8');
    console.log(`已写入 data/library.json，共 ${items.length} 项：`);
    for (const it of sortItems(items)) console.log(`  [${it.type}] ${it.title}  → ${it.path}`);
  }

  // 派生产物每次都重建：
  // 它们不进 git 比对（内容大、噪音多），所以不能靠「有没有变化」决定是否生成。
  await buildSearchIndex(sortItems(items), files);
  await buildStaticPages(mergedSite, sortItems(items), files);
  await buildSitemapAndRobots(mergedSite, sortItems(items));
}

main().catch((e) => { console.error(e); process.exit(1); });
