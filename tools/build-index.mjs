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
import { noteEntry, sortNotes, buildIndexJSON } from './lib/notes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const OUT_FILE = path.join(ROOT, 'data', 'index.json');

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
    notes.push(noteEntry(file.replace(/\.md$/i, ''), raw));
  }
  sortNotes(notes);

  await mkdir(path.dirname(OUT_FILE), { recursive: true });

  // 如果笔记列表没有实质变化，就保持原文件不动。
  // 否则 generated 时间戳每次都会变，导致无意义的提交和多余的 Pages 构建。
  const existing = await readFile(OUT_FILE, 'utf8').catch(() => null);
  if (existing) {
    try {
      const old = JSON.parse(existing);
      if (Array.isArray(old.notes) &&
        JSON.stringify(old.notes) === JSON.stringify(notes)) {
        console.log(`目录清单无变化，跳过写入（共 ${notes.length} 篇）`);
        return;
      }
    } catch { /* 旧文件损坏，按下面正常重写 */ }
  }

  await writeFile(OUT_FILE, buildIndexJSON(notes), 'utf8');
  console.log(`已写入 ${path.relative(ROOT, OUT_FILE)}，共 ${notes.length} 篇：`);
  for (const n of notes) console.log('  - ' + n.slug + '  «' + n.title + '»');
}

main().catch((e) => { console.error(e); process.exit(1); });
