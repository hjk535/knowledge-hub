/**
 * 素材库的公共逻辑：解析笔记、把仓库里的文件对齐成一份 library.json。
 * build-index.mjs（读本地）和 deploy-via-api.mjs（读线上）共用。
 */

/** 解析 Markdown 开头的 front matter */
export function parseFrontMatter(text) {
  const meta = {};
  let body = text;
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (m) {
    body = text.slice(m[0].length);
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const key = line.slice(0, i).trim().toLowerCase();
      const val = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!key) continue;
      if (key === 'tags' || key === 'tag') {
        meta.tags = val.replace(/^\[|\]$/g, '').split(/[,，]/).map((t) => t.trim()).filter(Boolean);
      } else {
        meta[key] = val;
      }
    }
  }
  return { meta, body };
}

/** 去掉代码块；外层可能用 4 个反引号包住内层 3 个，所以按同长度配对 */
function stripFences(s) {
  return String(s || '').replace(/(`{3,})([\s\S]*?)\1/g, ' ');
}

/** 从正文生成摘要 */
export function makeSummary(md, title, len = 96) {
  let t = stripFences(md)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')                // 表格行整行丢掉
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, ' ') // 分隔线
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const tt = String(title || '').trim();
  if (tt && t.indexOf(tt) === 0) t = t.slice(tt.length).trim();
  return t.length > len ? t.slice(0, len) + '…' : t;
}

/** 取正文里第一张本地图片作为封面；代码块里的示例要排除 */
function firstImage(md) {
  const clean = stripFences(md).replace(/`[^`]*`/g, ' ');
  const m = /!\[[^\]]*\]\(([^)\s]+)/.exec(clean);
  if (!m) return null;
  const src = m[1];
  if (/^https?:/i.test(src)) return null;
  if (!/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(src) && src.indexOf('/') < 0) return null;
  return src;
}

function htmlTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ''));
  return m ? m[1].trim() : '';
}

/**
 * 只属于「人工维护」的字段：构建时若缺省一律沿用旧值。
 *
 * 这些字段无法从文件内容推导，一旦丢失就只能靠人重填，所以必须显式搬运。
 * 区别于 title / date / tags：那几项 Markdown 的 front matter 里有权威值，
 * front matter 说了算，旧值只作兜底。
 *
 * 加新的人工字段时，往这里加一行即可（series / related 已按此约定预留）。
 */
const HUMAN_FIELDS = ['pin', 'series', 'related'];

/** 把旧条目里存在的人工字段搬到新条目上 */
function carryHuman(old, item) {
  for (const k of HUMAN_FIELDS) {
    const v = old && old[k];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && !v.length) continue;
    item[k] = v;
  }
  return item;
}

/**
 * 把仓库里的文件对齐成 items 数组。
 *
 * @param {Array} prevItems       现有的 items（保留其中的元信息与顺序）
 * @param {Array} files           仓库文件：[{ path, content? }]，content 为文本，二进制可省略
 * @returns {Array} 新的 items
 */
export function reconcile(prevItems, files) {
  const prev = Array.isArray(prevItems) ? prevItems : [];
  const list = Array.isArray(files) ? files : [];
  const byPath = new Map();
  for (const it of prev) if (it && it.path) byPath.set(it.path, it);

  const kept = new Map();   // path -> item
  const now = new Date().toISOString().slice(0, 10);

  for (const f of list) {
    if (!f || !f.path) continue;
    const path = f.path;

    // 笔记：content/xxx.md（不含子目录）
    if (/^content\/[^/]+\.md$/i.test(path)) {
      const slug = path.replace(/^content\//, '').replace(/\.md$/i, '');
      const old = byPath.get(path);
      const { meta, body } = parseFrontMatter(f.content || '');
      const item = {
        id: (old && old.id) || slug,
        type: 'note',
        title: meta.title || (old && old.title) || slug,
        date: meta.date || (old && old.date) || '',
        tags: meta.tags || (old && old.tags) || [],
        summary: makeSummary(body, meta.title || (old && old.title) || slug),
        path,
      };
      const cover = firstImage(body);
      if (cover) item.cover = cover;
      kept.set(path, carryHuman(old, item));
      continue;
    }

    // 页面：content/pages/xxx.html
    if (/^content\/pages\/.+\.html?$/i.test(path)) {
      const old = byPath.get(path);
      kept.set(path, carryHuman(old, {
        id: (old && old.id) || path.replace(/^content\/pages\//, '').replace(/\.html?$/i, ''),
        type: 'page',
        title: (old && old.title) || htmlTitle(f.content) || path.split('/').pop(),
        date: (old && old.date) || now,
        tags: (old && old.tags) || [],
        summary: (old && old.summary) || '',
        path,
      }));
      continue;
    }

    // 视频：content/videos/xxx.mp4
    if (/^content\/videos\/.+\.(mp4|webm|mov|m4v)$/i.test(path)) {
      const old = byPath.get(path);
      const base = path.replace(/^content\/videos\//, '').replace(/\.[^.]+$/, '');
      const item = {
        id: (old && old.id) || base,
        type: 'video',
        title: (old && old.title) || base,
        date: (old && old.date) || now,
        tags: (old && old.tags) || [],
        summary: (old && old.summary) || '',
        path,
      };
      const poster = 'content/videos/' + base + '.jpg';
      if (files.some((f) => f.path === poster)) item.cover = poster;
      kept.set(path, carryHuman(old, item));
      continue;
    }

    // 图片：content/images/xxx（只有在 items 里登记过的才算独立条目）
    if (/^content\/images\//i.test(path) && byPath.has(path)) {
      kept.set(path, byPath.get(path));
    }
  }

  // 保留没有对应文件、但仍需存在的条目？不保留——文件没了条目就该消失。
  // 但 items 里手工登记、路径非上述三类的一律保留（例如将来扩展）。
  for (const it of prev) {
    if (!it || !it.path) continue;
    if (kept.has(it.path)) continue;
    if (/^content\//i.test(it.path)) continue;   // content 下的文件已不存在
    kept.set(it.path, it);
  }

  return Array.from(kept.values());
}

export function sortItems(items) {
  return items.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export function buildLibraryJSON(site, items) {
  return JSON.stringify({
    generated: new Date().toISOString(),
    site: site || {},
    items: sortItems(items),
  }, null, 2) + '\n';
}

