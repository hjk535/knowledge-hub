#!/usr/bin/env node
/**
 * 扫描 content/*.md，生成 data/index.json 目录清单。
 *
 * 用法：node tools/build-index.mjs
 *
 * 在线编辑器保存时会自己更新这个文件；这个脚本是给「本地写 Markdown 然后 push」
 * 的工作流用的，GitHub Actions 也会在每次推送后自动跑一遍。
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const OUT_FILE = path.join(ROOT, 'data', 'index.json');

function parseFrontMatter(text) {
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

function makeSummary(md, len = 110) {
  const t = String(md || '')
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

async function main() {
  if (!existsSync(CONTENT_DIR)) {
    console.error('找不到 content 目录：' + CONTENT_DIR);
    process.exit(1);
  }

  const files = (await readdir(CONTENT_DIR))
    .filter((f) => /\.md$/i.test(f) && !f.startsWith('.'));

  const notes = [];
  for (const file of files) {
    const raw = await readFile(path.join(CONTENT_DIR, file), 'utf8');
    const { meta, body } = parseFrontMatter(raw);
    const slug = file.replace(/\.md$/i, '');
    notes.push({
      slug,
      title: meta.title || slug,
      tags: meta.tags || [],
      date: meta.date || '',
      summary: meta.summary || makeSummary(body),
    });
  }

  notes.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  const json = JSON.stringify({ generated: new Date().toISOString(), notes }, null, 2) + '\n';
  await writeFile(OUT_FILE, json, 'utf8');

  console.log(`已写入 ${path.relative(ROOT, OUT_FILE)}，共 ${notes.length} 篇：`);
  for (const n of notes) console.log('  - ' + n.slug + '  «' + n.title + '»');
}

main().catch((e) => { console.error(e); process.exit(1); });
