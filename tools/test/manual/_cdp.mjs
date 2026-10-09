/**
 * 可复用的 CDP 驱动：启动 headless Edge，打开真实页面，跑一段断言脚本。
 * 仅用于人工验证，不参与站点运行时。
 *
 * 用法：node tools/test/manual/_cdp.mjs <url> <断言脚本文件>
 * 输出：断言脚本里 console.log 的内容原样透出。
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9444;
// 每次用全新的 profile 目录：旧的 headless 进程残留时，会复用缓存页面导致断言看到旧代码。
const PROFILE = process.env.TEMP + '\\edge-cdp-' + Date.now();

const url = process.argv[2];
const scriptFile = process.argv[3];
const preludeFile = process.argv[4];      // 可选：在新文档里先执行的脚本（用于拦截请求）
if (!url || !scriptFile) {
  console.error('用法: node tools/test/manual/_cdp.mjs <url> <断言脚本文件> [前置注入脚本]');
  process.exit(2);
}
const body = readFileSync(scriptFile, 'utf8');
const prelude = preludeFile ? readFileSync(preludeFile, 'utf8') : null;

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + PROFILE,
  '--window-size=1240,1000',
  'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout: ' + method)); } }, 30000);
  });
}

const logs = [];

async function main() {
  await sleep(2500);
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res) => { ws.onopen = res; });

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const t = (m.params.args || []).map((a) => (a.value !== undefined ? a.value : a.description)).join(' ');
      logs.push(t);
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');

  // 前置注入必须在页面脚本之前跑，所以用 addScriptToEvaluateOnNewDocument
  if (prelude) {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: prelude });
  }

  // 先导航，等页面就绪后再注入断言
  await send('Page.navigate', { url });
  await sleep(1500);

  // 等页面真正渲染出来再断言：默认等 #app 里有内容，
  // 可用 CDP_WAIT 传一个返回 boolean 的表达式覆盖。
  const waitExpr = process.env.CDP_WAIT
    || '!!(document.querySelector("#app .hero, #app article, #app .empty, #app .loading"))';
  const deadline = Date.now() + Number(process.env.CDP_WAIT_MS || 20000);
  let ready = false;
  while (Date.now() < deadline) {
    const r = await send('Runtime.evaluate', { expression: waitExpr, returnByValue: true });
    if (r.result && r.result.value) { ready = true; break; }
    await sleep(400);
  }
  if (!ready) console.warn('⚠ 等待条件超时，仍继续跑断言：' + waitExpr);

  // 渲染完后再给一点时间让图片等收尾
  await sleep(Number(process.env.CDP_SETTLE_MS || 1200));

  await send('Runtime.evaluate', {
    expression: body,
    returnByValue: true,
    awaitPromise: true,
  });

  await sleep(Number(process.env.CDP_TAIL_MS || 1500));
}

main()
  .then(() => { logs.forEach((l) => console.log(l)); })
  .catch((e) => { logs.forEach((l) => console.log(l)); console.error('CDP FAILED:', e.message); })
  .finally(() => { try { edge.kill(); } catch { } });
