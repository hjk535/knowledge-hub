/**
 * 笔记解析的公共逻辑，供 build-index.mjs 和 deploy-via-api.mjs 共用。
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
        meta.tags = val.replace(/^\[|\]$/g, '')
          .split(/[,，]/).map((t) => t.trim()).filter(Boolean);
      } else {
        meta[key] = val;
      }
    }
  }
  return { meta, body };
}

/** 从正文生成摘要 */
export function makeSummary(md, len = 110) {
  const t = String(md || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > len ? t.slice(0, len) + '…' : t;
}

/** 由 slug + Markdown 原文得到目录条目 */
export function noteEntry(slug, text) {
  const { meta, body } = parseFrontMatter(text);
  const entry = {
    slug,
    title: meta.title || slug,
    tags: meta.tags || [],
    date: meta.date || '',
  };
  const summary = meta.summary || makeSummary(body);
  if (summary) entry.summary = summary;
  return entry;
}

/** 按日期倒序排列 */
export function sortNotes(notes) {
  return notes.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/** 组装最终的 index.json 文本 */
export function buildIndexJSON(notes) {
  return JSON.stringify({ generated: new Date().toISOString(), notes }, null, 2) + '\n';
}
