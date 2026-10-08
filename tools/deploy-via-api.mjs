#!/usr/bin/env node
/**
 * 用 GitHub REST API 一键部署知识库到 GitHub Pages。
 *
 * 全程只访问 api.github.com —— 不需要 git 推送，也不需要打开 github.com 网页。
 * 会完成：创建仓库 → 上传全站文件 → 开启 Pages → 打印访问链接。
 *
 * 用法：
 *   node tools/deploy-via-api.mjs --token ghp_xxx --repo knowledge-hub
 *
 * 可选参数：
 *   --owner <用户名>   默认用令牌所属账号
 *   --title <站名>     写入 assets/config.js 的站点标题
 *   --desc  <副标题>
 *   --private          建私有仓库（注意：免费账号的私有仓库不能用 Pages）
 *   --dry-run          只检查，不实际写入
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.github.com';

const SKIP_DIRS = new Set(['.git', 'node_modules', '.vscode', '.idea']);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db', 'tools/dev-server.mjs']);
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.zip']);

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

if (args.help || !args.token || !args.repo) {
  console.log(`
知识库一键部署（纯 API，不需要 git push）

  node tools/deploy-via-api.mjs --token <令牌> --repo <仓库名> [选项]

必填：
  --token      GitHub 令牌（classic 令牌，勾选 repo + workflow 权限）
  --repo       仓库名，例如 knowledge-hub

可选：
  --owner      仓库归属账号，默认是令牌所属用户
  --title      站点标题，例如「我的知识库」
  --desc       站点副标题
  --branch     分支名，默认 main
  --private    建私有仓库（免费账号私有仓库无法使用 Pages）
  --dry-run    只做检查，不写入任何东西

部署完成后会打印形如 https://<用户名>.github.io/<仓库名>/ 的链接。
`);
  process.exit(args.help ? 0 : 1);
}

/* ---------------- HTTP ---------------- */
async function api(method, endpoint, body) {
  const res = await fetch(API + endpoint, {
    method,
    headers: {
      Authorization: 'Bearer ' + args.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'knowledge-hub-deployer',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const err = new Error(
      `GitHub API ${method} ${endpoint} → ${res.status} ${(data && data.message) || text}`
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ---------------- 收集文件 ---------------- */
async function collectFiles(dir, base = '') {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out.push(...await collectFiles(path.join(dir, e.name), rel));
    } else if (e.isFile()) {
      if (SKIP_FILES.has(e.name)) continue;
      if (e.name.endsWith('.log')) continue;
      out.push(rel);
    }
  }
  return out;
}

/* ---------------- 主流程 ---------------- */
function step(n, msg) { console.log(`\n[${n}] ${msg}`); }

async function main() {
  /* 1. 校验令牌 */
  step(1, '校验令牌…');
  const me = await api('GET', '/user');
  const owner = args.owner || me.login;
  console.log(`    ✓ 令牌有效，账号：${me.login}`);
  console.log(`    → 目标仓库：${owner}/${args.repo}`);

  if (args.dryRun) {
    console.log('\n--dry-run：仅校验通过，未做任何写入。');
    return { dryRun: true, owner };
  }

  /* 2. 确保仓库存在 */
  step(2, '检查仓库…');
  let created = false;
  try {
    await api('GET', `/repos/${owner}/${args.repo}`);
    console.log('    ✓ 仓库已存在，将更新内容');
  } catch (e) {
    if (e.status !== 404) throw e;
    console.log('    → 仓库不存在，正在创建…');
    await api('POST', owner === me.login ? '/user/repos' : `/orgs/${owner}/repos`, {
      name: args.repo,
      description: args.desc || '我的知识库 —— 在线编辑、随时分享',
      private: !!args.private,
      has_issues: true,
      has_wiki: false,
      auto_init: false,
    });
    created = true;
    console.log('    ✓ 仓库创建完成');
  }

  /* 3. 确保仓库已初始化
     GitHub 限制：完全没有提交的空仓库无法使用 Git Data API（blobs/trees 会返回
     409 "Git Repository is empty"）。所以先用 Contents API 建一个初始化提交。 */
  step(3, '确保仓库已初始化…');
  let initialized = true;
  try {
    await api('GET', `/repos/${owner}/${args.repo}/git/ref/heads/${args.branch}`);
    console.log('    ✓ 仓库已有提交历史');
  } catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;
    initialized = false;
    console.log('    → 空仓库，先创建初始化提交…');
    const bootstrap = Buffer.from(
      `# ${args.repo}\n\n此仓库由知识库部署脚本初始化。\n`, 'utf8'
    ).toString('base64');
    await api('PUT', `/repos/${owner}/${args.repo}/contents/README.md`, {
      message: '初始化仓库',
      content: bootstrap,
      branch: args.branch,
    });
    console.log('    ✓ 初始化完成');
  }

  /* 4. 刷新目录清单 */
  step(4, '生成内容目录清单…');
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-index.mjs')], {
      cwd: ROOT, stdio: 'inherit',
    });
  } catch {
    console.log('    ! 生成清单失败，跳过（站点仍可用）');
  }

  /* 4. 把 owner/repo 写进站点配置 */
  step(5, '写入站点配置…');
  const cfgPath = path.join(ROOT, 'assets', 'config.js');
  let cfg = await readFile(cfgPath, 'utf8');
  cfg = cfg.replace(/owner:\s*"[^"]*"/, `owner: "${owner}"`)
           .replace(/repo:\s*"[^"]*"/, `repo: "${args.repo}"`)
           .replace(/branch:\s*"[^"]*"/, `branch: "${args.branch}"`);
  if (args.title) cfg = cfg.replace(/title:\s*"[^"]*"/, `title: "${args.title.replace(/"/g, '\\"')}"`);
  if (args.desc) cfg = cfg.replace(/desc:\s*"[^"]*"/, `desc: "${args.desc.replace(/"/g, '\\"')}"`);
  await writeFile(cfgPath, cfg, 'utf8');
  console.log(`    ✓ assets/config.js → ${owner}/${args.repo}`);

  /* 5. 上传文件（Git Data API） */
  step(6, '上传站点文件…');
  const files = await collectFiles(ROOT);
  console.log(`    共 ${files.length} 个文件`);

  const entries = [];
  const CONCURRENCY = 6;
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (rel) => {
      const buf = await readFile(path.join(ROOT, rel));
      const isBinary = BINARY_EXT.has(path.extname(rel).toLowerCase());
      const payload = isBinary
        ? { content: buf.toString('base64'), encoding: 'base64' }
        : { content: buf.toString('utf8'), encoding: 'utf-8' };
      const blob = await api('POST', `/repos/${owner}/${args.repo}/git/blobs`, payload);
      return { path: rel, mode: '100644', type: 'blob', sha: blob.sha };
    }));
    entries.push(...results);
    process.stdout.write(`\r    已上传 ${Math.min(i + CONCURRENCY, files.length)}/${files.length}`);
  }
  console.log('');

  /* 6. 建立提交 */
  step(7, '创建提交…');
  let parentSha = null;
  let baseTree = null;
  try {
    const ref = await api('GET', `/repos/${owner}/${args.repo}/git/ref/heads/${args.branch}`);
    parentSha = ref.object.sha;
    const parentCommit = await api('GET', `/repos/${owner}/${args.repo}/git/commits/${parentSha}`);
    baseTree = parentCommit.tree.sha;
    console.log(`    → 在已有分支上提交（父提交 ${parentSha.slice(0, 7)}）`);
  } catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;
    console.log('    → 空仓库，创建首次提交');
  }

  const treeBody = baseTree ? { base_tree: baseTree, tree: entries } : { tree: entries };
  const tree = await api('POST', `/repos/${owner}/${args.repo}/git/trees`, treeBody);

  const commitBody = { message: created ? '初始化知识库站点' : '更新知识库站点', tree: tree.sha };
  if (parentSha) commitBody.parents = [parentSha];
  const commit = await api('POST', `/repos/${owner}/${args.repo}/git/commits`, commitBody);

  if (parentSha) {
    await api('PATCH', `/repos/${owner}/${args.repo}/git/refs/heads/${args.branch}`, { sha: commit.sha });
  } else {
    await api('POST', `/repos/${owner}/${args.repo}/git/refs`, {
      ref: `refs/heads/${args.branch}`, sha: commit.sha,
    });
  }
  console.log(`    ✓ 提交完成 ${commit.sha.slice(0, 7)}`);

  /* 7. 开启 Pages */
  step(8, '开启 GitHub Pages…');
  if (args.private) {
    console.log('    ! 私有仓库无法在免费账号上使用 Pages，已跳过');
  } else {
    try {
      await api('POST', `/repos/${owner}/${args.repo}/pages`, {
        source: { branch: args.branch, path: '/' },
      });
      console.log('    ✓ Pages 已开启');
    } catch (e) {
      if (e.status === 409) {
        console.log('    ✓ Pages 之前已开启，沿用现有配置');
      } else if (e.status === 403) {
        console.log('    ! 令牌权限不足，无法开启 Pages。');
        console.log('      请手动打开仓库 Settings → Pages → Source 选 main / root');
      } else {
        console.log(`    ! 开启 Pages 失败：${e.message}`);
        console.log('      请手动打开仓库 Settings → Pages → Source 选 main / root');
      }
    }
  }

  /* 8. 完成 */
  const url = `https://${owner}.github.io/${args.repo}/`;
  step(9, '完成 🎉');
  console.log(`\n    访问链接：${url}`);
  console.log('    首次发布通常需要 1–2 分钟生效，之后改内容几乎是秒级。\n');
  console.log('    下一步：打开上面的链接 → 右上角「设置」→ 填入用户名、仓库名和令牌');
  console.log('    之后就能在网页里直接写笔记，保存即上线。\n');

  return { owner, repo: args.repo, url, commit: commit.sha };
}

main().catch((e) => {
  console.error('\n❌ 部署失败：' + e.message);
  if (e.status === 401) console.error('   → 令牌无效或已过期，请重新生成。');
  if (e.status === 403) console.error('   → 令牌权限不足。classic 令牌需要勾选 repo 和 workflow。');
  if (e.status === 404) console.error('   → 找不到资源，确认用户名和仓库名拼写。');
  // 用 exitCode 而不是 process.exit()，避免 Node 在 keep-alive 连接上触发 libuv 断言
  process.exitCode = 1;
});
