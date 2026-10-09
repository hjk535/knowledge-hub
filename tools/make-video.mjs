/**
 * 把 _video/eof-anim.html 逐帧导出成 mp4。
 *
 * 做法：CDP 打开页面 -> 对每一帧调用 window.__frame(t) -> Page.captureScreenshot
 *       -> 把 PNG 写到 _video/frames/ -> 交给 ffmpeg 编码。
 * 确定性渲染，不依赖真实时间，所以不会掉帧。
 *
 * 用法：node tools/make-video.mjs [fps]
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIDEO_DIR = path.join(ROOT, '_video');
const FRAMES = path.join(VIDEO_DIR, 'frames');
const OUT_DIR = path.join(ROOT, 'content', 'videos');   // 与站点索引一致，部署即可上传
const OUT_MP4 = path.join(OUT_DIR, 'eof-explained.mp4');
const OUT_JPG = path.join(OUT_DIR, 'eof-explained.jpg');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9466;
const FPS = Number(process.argv[2] || 24);
const W = 1280, H = 720;

function findFfmpeg() {
  const base = path.join(ROOT, 'node_modules', '@ffmpeg-installer');
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    const p = path.join(base, d, 'ffmpeg.exe');
    if (existsSync(p)) return p;
  }
  return null;
}

let ws, msgId = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 60000);
  });
}

async function main() {
  const ff = findFfmpeg();
  if (!ff) throw new Error('找不到 ffmpeg。先执行：npm i --no-save @ffmpeg-installer/ffmpeg');

  const profile = process.env.TEMP + '\\edge-video-' + Date.now();
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
    '--user-data-dir=' + profile,
    `--window-size=${W},${H}`,
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    await sleep(2500);
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: 1, mobile: false,
    });

    const fileUrl = 'file:///' + path.join(VIDEO_DIR, 'eof-anim.html').replace(/\\/g, '/');
    await send('Page.navigate', { url: fileUrl });

    // 等素材页就绪
    for (let i = 0; i < 60; i++) {
      const r = await send('Runtime.evaluate', { expression: '!!window.__ready', returnByValue: true });
      if (r.result && r.result.value) break;
      await sleep(300);
    }
    const tot = await send('Runtime.evaluate', { expression: 'window.__TOTAL', returnByValue: true });
    const total = tot.result.value;
    console.log(`时长 ${total}s，fps ${FPS}，共 ${Math.round(total * FPS)} 帧`);

    await rm(FRAMES, { recursive: true, force: true });
    await mkdir(FRAMES, { recursive: true });

    const n = Math.round(total * FPS);
    const t0 = Date.now();
    for (let f = 0; f < n; f++) {
      const t = f / FPS;
      await send('Runtime.evaluate', { expression: `window.__frame(${t})` });
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(FRAMES, String(f).padStart(5, '0') + '.png'),
        Buffer.from(shot.data, 'base64'));
      if (f % 60 === 0 || f === n - 1) {
        const el = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`  ${f + 1}/${n} 帧  ${el}s`);
      }
    }

    const files = await readdir(FRAMES);
    console.log(`帧已导出：${files.length} 张`);

    await mkdir(OUT_DIR, { recursive: true });

    console.log('编码 mp4 …');
    execFileSync(ff, [
      '-y', '-framerate', String(FPS),
      '-i', path.join(FRAMES, '%05d.png'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      OUT_MP4,
    ], { stdio: 'inherit' });

    console.log('导出封面 jpg …');
    execFileSync(ff, [
      '-y', '-i', path.join(FRAMES, '00060.png'),
      '-frames:v', '1', '-q:v', '3', OUT_JPG,
    ], { stdio: 'inherit' });

    const size = statSync(OUT_MP4).size;
    console.log(`\n完成：${OUT_MP4}  (${(size / 1024 / 1024).toFixed(2)} MB)`);
  } finally {
    try { ws && ws.close(); } catch { }
    edge.kill();
  }
}

main().catch((e) => { console.error('失败：', e.message); process.exit(1); });
