#!/usr/bin/env node
/**
 * 本地预览用的极简静态服务器（仅用于开发测试，不会部署）。
 *
 * 用法：node tools/dev-server.mjs [端口]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';

    const filePath = path.join(ROOT, rel);
    if (!filePath.startsWith(ROOT)) {           // 防目录穿越
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      console.log(`404  ${rel}`);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      return;
    }

    const body = await readFile(filePath);
    console.log(`200  ${rel}`);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(body);
  } catch (e) {
    console.error(e);
    res.writeHead(500).end('500');
  }
});

server.listen(PORT, () => {
  console.log(`本地预览已启动：http://localhost:${PORT}/`);
  console.log(`根目录：${ROOT}`);
});
