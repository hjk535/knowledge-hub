#!/usr/bin/env node
/**
 * 用 GitHub REST API 一键部署到 GitHub Pages。
 *
 * 全程只访问 api.github.com —— 不需要 git push，也不需要打开 github.com 网页。
 * 会完成：创建仓库 → 上传全站文件 → 重建素材库 → 提交 → 开启 Pages → 打印链接。
 *
 * 用法：
 *   node tools/deploy-via-api.mjs --token ghp_xxx --repo my-space
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcile, sortItems, buildLibraryJSON } from './lib/library.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.github.com';

const SKIP_DIRS = new Set(['.git', 'node_modules', '.vscode', '.idea']);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db', 'tools/dev-server.mjs']);
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.zip', '.mp4', '.webm']);

/* 早期版本留下的文件，部署时顺手清掉 */
const LEGACY_FILES = ['data/index.json', 'kb.html', 'demo.html'];

/* ---------------- 参数 ---------------- */
function parseArgs(argv) {
  const out = { branch: 'main', private: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--token') out.token = argv[++i];
    else if (a === '--repo') out.repo = argv[++i];
    else if (a === '--owner') out.owner = argv[++i];
    else if (a === '--title') out.title = argv[++i];
    else if (a === '--desc') out.desc = argv[++i];
    else if (a === '--branch') out.branch = argv[++i];
    else if (a === '--private') out.private = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

function printHelp() {
  console.log(`
部署到 GitHub Pages（纯 API）

  node tools/deploy-via-api.mjs --repo <仓库名> [选项]

必填：
  --repo        仓库名
  --token       GitHub 令牌（classic，勾选 repo + workflow）
                也可用环境变量 KB_TOKEN，或不传由脚本交互式询问

可选：
  --owner       归属账号，默认取令牌所属用户
  --title       站点标题
  --desc        站点副标题
  --branch      分支名，默认 main
  --private     建私有仓库（免费账号私有仓库不能用 Pages）
  --dry-run     只检查，不写入
`);
}

async function promptToken() {
  if (!process.stdin.isTTY) {
    console.error('缺少令牌。请用 --token，或设置环境变量 KB_TOKEN。');
    process.exit(1);
  }
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const t = (await rl.question('请粘贴 GitHub 令牌后按回车：')).trim();
  rl.close();
  console.log('');
  return t;
}

if (args.help) { printHelp(); process.exit(0); }
if (!args.token) args.token = process.env.KB_TOKEN || '';
if (!args.token) args.token = await promptToken();
if (!args.token || !args.repo) { printHelp(); process.exit(1); }

/* ---------------- HTTP ---------------- */
async function api(method, ep, body) {
  const res = await fetch(API + ep, {
    method,
    headers: {
      Authorization: 'Bearer ' + args.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'site-deployer',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`GitHub API ${method} ${ep} → ${res.status} ${(data && data.message) || text}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function rawFile(owner, repoRelPath) {
  const res = await fetch(
    `${API}/repos/${owner}/${args.repo}/contents/${encodeURI(repoRelPath)}?ref=${encodeURIComponent(args.branch)}&t=${Date.now()}`,
    {
      headers: {
        Authorization: 'Bearer ' + args.token,
        Accept: 'application/vnd.github.raw+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'site-deployer',
      },
      cache: 'no-store',
    }
  );
  if (!res.ok) {
    const e = new Error(`读取 ${repoRelPath} 失败：HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.text();
}

/* 依据线上真实内容重建素材库 —— 绝不能用本地那份覆盖，
   否则会丢掉网页上新增/编辑的内容。 */
async function rebuildRemoteLibrary(owner) {
  let tree;
  try {
    tree = await api('GET', `/repos/${owner}/${args.repo}/git/trees/${encodeURIComponent(args.branch)}?recursive=1`);
  } catch (e) {
    if (e.status === 404 || e.status === 409) return null;
    throw e;
  }
  const paths = (tree.tree || []).filter((n) => n.type === 'blob').map((n) => n.path);

  const textPaths = paths.filter((p) =>
    /^content\/[^/]+\.md$/i.test(p) || /^content\/pages\/.+\.html?$/i.test(p));
  const imagePaths = paths.filter((p) => /^content\/images\//i.test(p));

  const files = [];
  for (const p of textPaths) files.push({ path: p, content: await rawFile(owner, p) });
  for (const p of imagePaths) files.push({ path: p });

  let prev = null;
  try { prev = JSON.parse(await rawFile(owner, 'data/library.json')); } catch { /* 还没有 */ }
  if (!prev) { try { prev = JSON.parse(await rawFile(owner, 'data/index.json')); } catch { /* 旧格式也没有 */ } }

  const items = reconcile(prev && prev.items, files);
  const site = (prev && prev.site) || {};
  return { json: buildLibraryJSON(site, items), count: items.length };
}

/* ---------------- 文件收集 ---------------- */
async function collectFiles(dir, base = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out.push(...await collectFiles(path.join(dir, e.name), rel));
    } else if (e.isFile()) {
      if (SKIP_FILES.has(rel)) continue;
      if (e.name.endsWith('.log')) continue;
      out.push(rel);
    }
  }
  return out;
}

function step(n, msg) { console.log(`\n[${n}] ${msg}`); }

/* ---------------- 主流程 ---------------- */
async function main() {
  step(1, '校验令牌…');
  const me = await api('GET', '/user');
  const owner = args.owner || me.login;
  console.log(`    ✓ ${me.login} → ${owner}/${args.repo}`);

  if (args.dryRun) { console.log('\n--dry-run：仅校验通过。'); return; }

  step(2, '检查仓库…');
  let created = false;
  try {
    await api('GET', `/repos/${owner}/${args.repo}`);
    console.log('    ✓ 仓库已存在');
  } catch (e) {
    if (e.status !== 404) throw e;
    await api('POST', owner === me.login ? '/user/repos' : `/orgs/${owner}/repos`, {
      name: args.repo,
      description: args.desc || '我的空间',
      private: !!args.private,
      has_issues: true, has_wiki: false, auto_init: false,
    });
    created = true;
    console.log('    ✓ 已创建');
  }

  step(3, '确保仓库已初始化…');
  try {
    await api('GET', `/repos/${owner}/${args.repo}/git/ref/heads/${args.branch}`);
    console.log('    ✓ 已有提交历史');
  } catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;
    const bootstrap = Buffer.from(`# ${args.repo}\n`, 'utf8').toString('base64');
    await api('PUT', `/repos/${owner}/${args.repo}/contents/README.md`, {
      message: '初始化仓库', content: bootstrap, branch: args.branch,
    });
    console.log('    ✓ 已初始化');
  }

  step(4, '生成素材库…');
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-index.mjs')], {
      cwd: ROOT, stdio: 'inherit',
    });
  } catch { console.log('    ! 跳过'); }

  step(5, '写入站点配置…');
  const cfgPath = path.join(ROOT, 'assets', 'config.js');
  let cfg = await readFile(cfgPath, 'utf8');
  cfg = cfg.replace(/owner:\s*"[^"]*"/, `owner: "${owner}"`)
    .replace(/repo:\s*"[^"]*"/, `repo: "${args.repo}"`)
    .replace(/branch:\s*"[^"]*"/, `branch: "${args.branch}"`);
  if (args.title) cfg = cfg.replace(/title:\s*"[^"]*"/, `title: "${args.title.replace(/"/g, '\\"')}"`);
  if (args.desc) cfg = cfg.replace(/desc:\s*"[^"]*"/, `desc: "${args.desc.replace(/"/g, '\\"')}"`);
  await writeFile(cfgPath, cfg, 'utf8');
  console.log(`    ✓ ${owner}/${args.repo}`);

  step(6, '上传站点文件…');
  const overrides = {};
  try {
    const lib = await rebuildRemoteLibrary(owner);
    if (lib) {
      overrides['data/library.json'] = lib.json;
      console.log(`    ✓ 素材库按线上内容重建（${lib.count} 项）`);
    } else {
      console.log('    · 线上还没有内容');
    }
  } catch (e) {
    console.log(`    ! 重建素材库失败（${e.message}），本次不改动线上那一份`);
  }
  if (overrides['data/library.json'] === undefined) {
    const local = await readFile(path.join(ROOT, 'data', 'library.json'), 'utf8').catch(() => null);
    if (local != null) overrides['data/library.json'] = local;
  }

  // 清掉早期版本遗留的文件
  const remoteTree = await api('GET', `/repos/${owner}/${args.repo}/git/trees/${encodeURIComponent(args.branch)}?recursive=1`);
  const remotePaths = new Set((remoteTree.tree || []).map((n) => n.path));
  const removals = LEGACY_FILES.filter((p) => remotePaths.has(p));

  const files = (await collectFiles(ROOT))
    .filter((f) => f !== 'data/library.json')
    .concat(Object.keys(overrides));
  console.log(`    共 ${files.length} 个文件` + (removals.length ? `，清理 ${removals.length} 个旧文件` : ''));

  const entries = [];
  for (const rel of removals) entries.push({ path: rel, mode: '100644', type: 'blob', sha: null });

  const CONCURRENCY = 6;
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (rel) => {
      let payload;
      if (overrides[rel] !== undefined) {
        payload = { content: overrides[rel], encoding: 'utf-8' };
      } else {
        const buf = await readFile(path.join(ROOT, rel));
        payload = BINARY_EXT.has(path.extname(rel).toLowerCase())
          ? { content: buf.toString('base64'), encoding: 'base64' }
          : { content: buf.toString('utf8'), encoding: 'utf-8' };
      }
      const blob = await api('POST', `/repos/${owner}/${args.repo}/git/blobs`, payload);
      return { path: rel, mode: '100644', type: 'blob', sha: blob.sha };
    }));
    entries.push(...results);
    process.stdout.write(`\r    已上传 ${Math.min(i + CONCURRENCY, files.length)}/${files.length}`);
  }
  console.log('');

  step(7, '创建提交…');
  let parent = null, baseTree = null;
  try {
    const ref = await api('GET', `/repos/${owner}/${args.repo}/git/ref/heads/${args.branch}`);
    parent = ref.object.sha;
    const pc = await api('GET', `/repos/${owner}/${args.repo}/git/commits/${parent}`);
    baseTree = pc.tree.sha;
  } catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;
  }

  const tree = await api('POST', `/repos/${owner}/${args.repo}/git/trees`,
    baseTree ? { base_tree: baseTree, tree: entries } : { tree: entries });

  const cBody = { message: created ? '初始化站点' : '更新站点', tree: tree.sha };
  if (parent) cBody.parents = [parent];
  const commit = await api('POST', `/repos/${owner}/${args.repo}/git/commits`, cBody);

  if (parent) {
    await api('PATCH', `/repos/${owner}/${args.repo}/git/refs/heads/${args.branch}`, { sha: commit.sha });
  } else {
    await api('POST', `/repos/${owner}/${args.repo}/git/refs`, { ref: `refs/heads/${args.branch}`, sha: commit.sha });
  }
  console.log(`    ✓ ${commit.sha.slice(0, 7)}`);

  step(8, '开启 GitHub Pages…');
  if (args.private) {
    console.log('    ! 私有仓库无法在免费账号上使用 Pages，已跳过');
  } else {
    try {
      await api('POST', `/repos/${owner}/${args.repo}/pages`, { source: { branch: args.branch, path: '/' } });
      console.log('    ✓ 已开启');
    } catch (e) {
      if (e.status === 409) console.log('    ✓ 之前已开启');
      else console.log(`    ! 开启失败（${e.message}），请在仓库 Settings → Pages 里选 main / root`);
    }
  }

  const url = `https://${owner}.github.io/${args.repo}/`;
  step(9, '完成');
  console.log(`\n    ${url}\n`);
  return { owner, repo: args.repo, url, commit: commit.sha };
}

main().catch((e) => {
  console.error('\n❌ 部署失败：' + e.message);
  if (e.status === 401) console.error('   → 令牌无效或已过期');
  if (e.status === 403) console.error('   → 令牌权限不足，classic 令牌需要勾选 repo 和 workflow');
  if (e.status === 404) console.error('   → 找不到资源，确认用户名和仓库名');
  process.exitCode = 1;
});
