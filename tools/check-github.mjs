#!/usr/bin/env node
/**
 * 检查 GitHub 各通道的连通性。
 *
 * 用法：node tools/check-github.mjs
 *
 * 判定标准：
 *   github.com 通   → 可以去注册账号了
 *   github.com 不通 → 换网络（手机热点等）或稍后再试，这类阻断常是间歇性的
 */

const targets = [
  { name: 'github.com 网页（注册/登录）', url: 'https://github.com', required: true },
  { name: 'api.github.com（部署用）', url: 'https://api.github.com', required: false },
  { name: '*.github.io（分享链接）', url: 'https://microsoft.github.io', required: false },
];

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

async function probe(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    return { ok: true, status: res.status, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - started, error: e.name };
  }
}

async function main() {
  console.log('');
  console.log('正在检查 GitHub 各通道连通性…');
  console.log('─'.repeat(56));

  let webOk = false;

  for (const t of targets) {
    const r = await probe(t.url);
    if (t.required) webOk = r.ok;

    const status = r.ok
      ? `${GREEN}通${RESET}  ${DIM}HTTP ${r.status} · ${r.ms}ms${RESET}`
      : `${RED}不通${RESET} ${DIM}(${r.error || 'timeout'})${RESET}`;

    console.log(`  ${t.name.padEnd(30)} ${status}`);
  }

  console.log('─'.repeat(56));
  console.log('');

  if (webOk) {
    console.log(`${GREEN}github.com 可以访问，可以开始注册了。${RESET}`);
    console.log('');
    console.log(`${YELLOW}接下来做两件事：${RESET}`);
    console.log('  1. 打开 https://github.com/signup 注册账号，记住用户名');
    console.log('  2. 打开 https://github.com/settings/tokens/new');
    console.log('     - Note 随便填，比如 knowledge-hub');
    console.log('     - Expiration 建议 90 天');
    console.log(`     - 勾选 scopes：${YELLOW}repo${RESET} 和 ${YELLOW}workflow${RESET}`);
    console.log('     - 生成后复制 ghp_ 开头的那串令牌（只显示一次）');
    console.log('');
    console.log('然后把「用户名 + 令牌」给到我，我用 API 完成建仓库、上传、开启 Pages。');
  } else {
    console.log(`${RED}github.com 仍然不通。${RESET}`);
    console.log('');
    console.log(`${YELLOW}可以试试：${RESET}`);
    console.log('  - 切换到手机热点（蜂窝网络路由不同，经常就通了）');
    console.log('  - 隔一段时间再试，这类阻断常常是间歇性的');
    console.log('  - 换一台机器或换个网络环境');
    console.log('');
    console.log(`${DIM}注意：api.github.com 和 *.github.io 通常是通的，`);
    console.log(`所以一旦拿到账号和令牌，部署和访问都不受影响。${RESET}`);
  }
  console.log('');
}

main();
