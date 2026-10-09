/**
 * 用 CDP 截图：打开页面 -> 切到指定 hash -> 等渲染 -> 截图落盘。
 * 仅用于人工验证。
 *
 * 用法：node tools/test/manual/_shot.mjs <url> <hash> <输出文件> [高] [滚到Y]
 */
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9455;
// 每次用全新 profile，避免残留进程复用缓存页面
const PROFILE = process.env.TEMP + '\\edge-shot-' + Date.now();

const [url, hash, outFile, height = '1300', scrollY = '0'] = process.argv.slice(2);
if (!url || !outFile) {
  console.error('用法: node tools/test/manual/_shot.mjs <url> <hash> <输出文件> [高] [滚到Y]');
  process.exit(2);
}

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE,
  'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 30000);
  });
}

async function main() {
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
    width: 1240, height: Number(height), deviceScaleFactor: 1, mobile: false,
  });

  // 可选前置注入（用于在页面脚本之前替换数据源）
  if (process.env.CDP_PRELUDE) {
    const src = readFileSync(process.env.CDP_PRELUDE, 'utf8');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
  }

  await send('Page.navigate', { url });
  await sleep(1500);

  // 等真正渲染出来（默认等 #app 内出现内容）
  const waitExpr = process.env.CDP_WAIT || '!!document.querySelector("#app .hero, #app article, #app .empty")';
  const deadline = Date.now() + Number(process.env.CDP_WAIT_MS || 20000);
  while (Date.now() < deadline) {
    const r = await send('Runtime.evaluate', { expression: waitExpr, returnByValue: true });
    if (r.result && r.result.value) break;
    await sleep(400);
  }
  await sleep(1200);

  // hash 传 NOOP / - 表示「不要改 hash」，用于截纯净的预渲染页
  if (hash && hash !== 'NOOP' && hash !== '-') {
    await send('Runtime.evaluate', { expression: 'location.hash = ' + JSON.stringify(hash) });
    await sleep(4000);
  } else {
    await sleep(1500);
  }

  if (Number(scrollY) > 0) {
    await send('Runtime.evaluate', { expression: 'window.scrollTo(0,' + Number(scrollY) + ')' });
    await sleep(900);
  } else {
    await send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' });
    await sleep(500);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(outFile, Buffer.from(shot.data, 'base64'));

  // 诊断：确认截的到底是哪个页面（截图工具本身出过「抓错页」的坑）
  const info = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      url: location.href,
      title: document.title,
      staticAttr: document.getElementById('app') ? document.getElementById('app').dataset.static || '' : '(无#app)',
      chars: document.getElementById('app') ? document.getElementById('app').textContent.length : 0
    })`,
    returnByValue: true,
  });
  console.log('OK ' + outFile + '  ' + info.result.value);
}

main().catch((e) => console.error('FAILED: ' + e.message)).finally(() => { try { edge.kill(); } catch { } });
