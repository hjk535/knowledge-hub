/**
 * 用 CDP 驱动 headless Edge 做真实交互验证：
 *   1. 点击主题按钮，确认 html[data-theme] 真的被切换
 *   2. 点击主题/类型筛选 chip，确认 URL 与结果真的变化
 *   3. 注入本地 library.json，确认「One Piece 物理海洋知识库」与精选区块能正确渲染
 * 一次性验证脚本，不参与站点运行时。
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const BASE = 'http://localhost:8080/';
const LOCAL_LIB = JSON.parse(readFileSync('data/library.json', 'utf8'));

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.env.TEMP + '\\edge-cdp',
  '--window-size=1240,1150',
  'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();

function send(method, params = {}, sessionId) {
  const id = ++msgId;
  const payload = { id, method, params };
  if (sessionId) payload.sessionId = sessionId;
  ws.send(JSON.stringify(payload));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout: ' + method)); } }, 20000);
  });
}

async function evaluate(sessionId, expr) {
  const r = await send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true,
  }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + JSON.stringify(r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
}

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
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');

  /* ---------- 1) 真实导航 ---------- */
  await send('Page.navigate', { url: BASE });
  await sleep(6500);

  const title1 = await evaluate(undefined, 'document.getElementById("site-title").textContent');
  console.log('1. 首页标题（线上数据）        :', JSON.stringify(title1));

  /* ---------- 2) 点击主题按钮 ---------- */
  const before = await evaluate(undefined, 'document.documentElement.getAttribute("data-theme")');
  const label0 = await evaluate(undefined, 'document.getElementById("btn-theme").getAttribute("aria-label")');
  await evaluate(undefined, 'document.getElementById("btn-theme").click()');
  await sleep(300);
  const after1 = await evaluate(undefined, 'document.documentElement.getAttribute("data-theme")');
  const label1 = await evaluate(undefined, 'document.getElementById("btn-theme").getAttribute("aria-label")');
  await evaluate(undefined, 'document.getElementById("btn-theme").click()');
  await sleep(300);
  const after2 = await evaluate(undefined, 'document.documentElement.getAttribute("data-theme")');
  await evaluate(undefined, 'document.getElementById("btn-theme").click()');
  await sleep(300);
  const after3 = await evaluate(undefined, 'document.documentElement.getAttribute("data-theme")');

  console.log('2. 主题三态循环');
  console.log('   初始                :', before, '|', label0);
  console.log('   点一次              :', after1, '|', label1);
  console.log('   点两次              :', after2);
  console.log('   点三次（回到初始）  :', after3);
  console.log('   结果                :', (after1 === 'light' && after2 === 'dark' && after3 === null) ? '✓ auto→light→dark→auto' : '✗');

  /* ---------- 3) 点击筛选 chip ---------- */
  await send('Page.navigate', { url: BASE });
  await sleep(6000);
  const chipInfo = await evaluate(undefined, `(() => {
    const cs = [...document.querySelectorAll('.chip')];
    return { total: cs.length, labels: cs.map(c => c.textContent.trim()) };
  })()`);
  console.log('3. 筛选 chip                  :', chipInfo.total, '个 ->', chipInfo.labels.join(' | '));

  // 点「参考」这个主题 chip
  const clicked = await evaluate(undefined, `(() => {
    const c = [...document.querySelectorAll('.chip')].find(x => x.textContent.includes('参考'));
    if (!c) return 'not-found';
    c.click(); return 'clicked';
  })()`);
  await sleep(2500);
  const afterClick = await evaluate(undefined, `({
    hash: location.hash,
    heads: [...document.querySelectorAll('.sec-head h2')].map(h => h.textContent),
    stops: [...document.querySelectorAll('.stop h3')].map(h => h.textContent),
    hasHero: !!document.querySelector('.hero'),
    hasFeatured: !!document.querySelector('.featured'),
  })`);
  console.log('   点击「参考」           :', clicked);
  console.log('   URL                    :', afterClick.hash);
  console.log('   区块标题               :', JSON.stringify(afterClick.heads));
  console.log('   结果条目               :', JSON.stringify(afterClick.stops));
  console.log('   宣言/精选是否隐藏      :', (!afterClick.hasHero && !afterClick.hasFeatured) ? '✓ 都已隐藏' : '✗ 仍在');

  /* ---------- 4) 注入本地索引，验证新标题与精选 ---------- */
  // 必须用 addScriptToEvaluateOnNewDocument：它在新文档的页面脚本之前执行，
  // 普通 Runtime.evaluate 注入的补丁会被下一次 Page.navigate 清掉。
  const localJson = JSON.stringify(LOCAL_LIB);
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const orig = window.fetch;
      window.fetch = function (u) {
        const s = String(u);
        if (s.indexOf('api.github.com') >= 0 && s.indexOf('library.json') >= 0) {
          return Promise.resolve(new Response(${JSON.stringify(localJson)}, {
            status: 200, headers: { 'Content-Type': 'application/json' }
          }));
        }
        return orig.apply(this, arguments);
      };
    })();`,
  });

  await send('Page.navigate', { url: BASE });
  await sleep(6000);

  const local = await evaluate(undefined, `({
    docTitle: document.title,
    logo: document.getElementById('site-title').textContent,
    h1: (document.querySelector('.hero h1') || {}).textContent || null,
    coord: (document.querySelector('.hero .coord') || {}).textContent || null,
    sub: (document.querySelector('.hero .sub') || {}).textContent || null,
    stats: [...document.querySelectorAll('.hero .stat')].map(s => s.querySelector('.n').textContent + ' / ' + s.querySelector('.l').textContent),
    featured: [...document.querySelectorAll('.card.feat h3')].map(h => h.textContent),
    featNos: [...document.querySelectorAll('.card.feat .feat-no')].map(h => h.textContent),
    stops: [...document.querySelectorAll('.stop h3')].length,
  })`);

  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });

  console.log('4. 注入本地 index（新品牌与精选）');
  console.log('   页面 <title>           :', JSON.stringify(local.docTitle));
  console.log('   顶栏标识               :', JSON.stringify(local.logo));
  console.log('   H1                     :', JSON.stringify(local.h1));
  console.log('   坐标行                 :', JSON.stringify(local.coord));
  console.log('   副标题                 :', JSON.stringify(String(local.sub).slice(0, 46) + '…'));
  console.log('   统计                   :', JSON.stringify(local.stats));
  console.log('   精选序号               :', JSON.stringify(local.featNos));
  console.log('   精选标题               :', JSON.stringify(local.featured));
  console.log('   航线条目数             :', local.stops);

  const ok =
    local.h1 === 'One Piece 物理海洋知识库' &&
    local.logo === 'One Piece 物理海洋知识库' &&
    local.featNos.length === 3 &&
    local.stops === 3;
  console.log('   判定                   :', ok ? '✓ 本地索引渲染完全正确' : '✗ 有偏差，见上');

  /* ---------- 5) 截下本地索引的真实渲染 ---------- */
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1240, height: 1240, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(600);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync('_mockups/s2-local-brand.png', Buffer.from(shot.data, 'base64'));
  console.log('5. 已截图                   : _mockups/s2-local-brand.png');
}

main()
  .catch((e) => console.error('FAILED:', e.message))
  .finally(() => { try { edge.kill(); } catch { } });
