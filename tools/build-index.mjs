#!/usr/bin/env node
/**
 * 扫描 content/ 与 content/pages/，对齐 data/library.json。
 *
 * 用法：node tools/build-index.mjs
 *
 * 只会补充/更新笔记与页面条目，image 条目和站点信息会原样保留。
 * GitHub Actions 会在每次推送后自动跑一遍。
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcile, sortItems, buildLibraryJSON } from './lib/library.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'library.json');

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
  let prev = null;
  if (existingRaw) {
    try { prev = JSON.parse(existingRaw); } catch { /* 损坏则重建 */ }
  }
  if (!prev && existsSync(path.join(ROOT, 'data', 'index.json'))) {
    try { prev = JSON.parse(await readFile(path.join(ROOT, 'data', 'index.json'), 'utf8')); } catch { }
  }

  const items = reconcile(prev && prev.items, files);
  const site = (prev && prev.site) || {};
  const json = buildLibraryJSON(site, items);

  await mkdir(path.dirname(OUT), { recursive: true });

  const same = existingRaw &&
    JSON.stringify(JSON.parse(existingRaw).items) === JSON.stringify(sortItems(items));
  if (same) {
    console.log(`素材库无变化，跳过写入（共 ${items.length} 项）`);
    return;
  }

  await writeFile(OUT, json, 'utf8');
  console.log(`已写入 data/library.json，共 ${items.length} 项：`);
  for (const it of sortItems(items)) console.log(`  [${it.type}] ${it.title}  → ${it.path}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
