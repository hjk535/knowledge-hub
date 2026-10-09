/**
 * tools/lib/library.mjs 的单元测试。
 *
 * 这些函数一旦改坏是「静默」坏的——索引里少一条、摘要多截一段，
 * 界面不会报错，只有人肉翻列表才发现。所以这里把边界情况钉死。
 *
 * 运行：npm test   （等价于 node --test tools/test/）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  parseFrontMatter,
  makeSummary,
  reconcile,
  sortItems,
  buildLibraryJSON,
} from '../lib/library.mjs';

/* ------------------------------------------------------------------ *
 * parseFrontMatter
 * ------------------------------------------------------------------ */
test('parseFrontMatter：解析 title / date / tags', () => {
  const { meta, body } = parseFrontMatter(
    '---\ntitle: 混合层\ndate: 2026-10-08\ntags: ENSO, 海表热收支\n---\n\n正文在这里'
  );
  assert.equal(meta.title, '混合层');
  assert.equal(meta.date, '2026-10-08');
  assert.deepEqual(meta.tags, ['ENSO', '海表热收支']);
  assert.equal(body, '\n正文在这里');
});

test('parseFrontMatter：tags 支持中文逗号与方括号', () => {
  assert.deepEqual(parseFrontMatter('---\ntags: [甲，乙]\n---\nx').meta.tags, ['甲', '乙']);
});

test('parseFrontMatter：tag 单数写法同样识别', () => {
  assert.deepEqual(parseFrontMatter('---\ntag: 参考\n---\nx').meta.tags, ['参考']);
});

test('parseFrontMatter：去掉值两端的引号', () => {
  assert.equal(parseFrontMatter('---\ntitle: "带引号"\n---\nx').meta.title, '带引号');
  assert.equal(parseFrontMatter("---\ntitle: '单引号'\n---\nx").meta.title, '单引号');
});

test('parseFrontMatter：键名大小写不敏感', () => {
  assert.equal(parseFrontMatter('---\nTitle: 大写\n---\nx').meta.title, '大写');
});

test('parseFrontMatter：没有 front matter 时原样返回正文', () => {
  const { meta, body } = parseFrontMatter('# 只有正文\n\n内容');
  assert.deepEqual(meta, {});
  assert.equal(body, '# 只有正文\n\n内容');
});

test('parseFrontMatter：兼容 BOM 与 CRLF', () => {
  const { meta, body } = parseFrontMatter('\uFEFF---\r\ntitle: CRLF\r\n---\r\n正文');
  assert.equal(meta.title, 'CRLF');
  assert.equal(body, '正文');
});

test('parseFrontMatter：忽略没有冒号的行', () => {
  const { meta } = parseFrontMatter('---\ntitle: 有冒号\n这一行没有冒号\n---\nx');
  assert.equal(meta.title, '有冒号');
  assert.equal(Object.keys(meta).length, 1);
});

/* ------------------------------------------------------------------ *
 * makeSummary
 * ------------------------------------------------------------------ */
test('makeSummary：去掉标题重复的开头', () => {
  const s = makeSummary('# 混合层\n\n混合层是海洋与大气交换热量的一层。', '混合层');
  assert.equal(s, '混合层是海洋与大气交换热量的一层。');
});

test('makeSummary：超长时截断并加省略号', () => {
  const s = makeSummary('甲'.repeat(200), '', 10);
  assert.equal(s, '甲'.repeat(10) + '…');
});

test('makeSummary：刚好等于上限时不加省略号', () => {
  assert.equal(makeSummary('甲'.repeat(10), '', 10), '甲'.repeat(10));
});

test('makeSummary：剥离代码块，避免把示例文字当摘要', () => {
  const md = '```python\nprint("不该出现")\n```\n真正的摘要内容。';
  const s = makeSummary(md, '');
  assert.ok(!s.includes('不该出现'), `摘要里混进了代码块内容：${s}`);
  assert.ok(s.includes('真正的摘要内容'));
});

test('makeSummary：剥离行内代码、图片、注释与表格行', () => {
  const s = makeSummary('`code` ![图](a.png) <!-- 注释 -->\n| 表格 | 行 |\n真正的文字', '');
  assert.ok(!s.includes('code'));
  assert.ok(!s.includes('a.png'));
  assert.ok(!s.includes('注释'));
  assert.ok(!s.includes('表格'));
  assert.ok(s.includes('真正的文字'));
});

test('makeSummary：链接只保留链接文字', () => {
  const s = makeSummary('见 [浙大云盘](https://pan.zju.edu.cn/x) 下载', '');
  assert.ok(s.includes('浙大云盘'));
  assert.ok(!s.includes('pan.zju.edu.cn'));
});

test('makeSummary：空输入返回空串而不是崩溃', () => {
  assert.equal(makeSummary('', ''), '');
  assert.equal(makeSummary(null, null), '');
});

/* ------------------------------------------------------------------ *
 * reconcile —— 核心：把仓库文件对齐成索引
 * ------------------------------------------------------------------ */
const noteFile = (path, content) => ({ path, content });
const pageFile = (path, content) => ({ path, content });

test('reconcile：识别 note / page / video 三种类型', () => {
  const items = reconcile([], [
    noteFile('content/a.md', '---\ntitle: 甲\n---\nx'),
    pageFile('content/pages/b.html', '<title>乙</title>'),
    { path: 'content/videos/c.mp4' },
  ]);
  const byPath = Object.fromEntries(items.map((i) => [i.path, i]));
  assert.equal(byPath['content/a.md'].type, 'note');
  assert.equal(byPath['content/pages/b.html'].type, 'page');
  assert.equal(byPath['content/videos/c.mp4'].type, 'video');
});

test('reconcile：page 的标题优先取旧值，其次 <title>', () => {
  const prev = [{ id: 'b', type: 'page', title: '人工标题', date: '2026-01-01', tags: [], summary: '', path: 'content/pages/b.html' }];
  const out = reconcile(prev, [pageFile('content/pages/b.html', '<title>文件标题</title>')]);
  assert.equal(out[0].title, '人工标题');

  const out2 = reconcile([], [pageFile('content/pages/b.html', '<title>文件标题</title>')]);
  assert.equal(out2[0].title, '文件标题');
});

test('reconcile：笔记的 title 由 front matter 说了算（可覆盖旧值）', () => {
  const prev = [{ id: 'a', type: 'note', title: '旧标题', date: '2026-01-01', tags: [], summary: '', path: 'content/a.md' }];
  const out = reconcile(prev, [noteFile('content/a.md', '---\ntitle: 新标题\n---\nx')]);
  assert.equal(out[0].title, '新标题');
});

test('reconcile：front matter 没有 title 时退回旧值，再退回文件名', () => {
  const prev = [{ id: 'a', type: 'note', title: '旧标题', date: '2026-01-01', tags: [], summary: '', path: 'content/a.md' }];
  assert.equal(reconcile(prev, [noteFile('content/a.md', '没有元信息')])[0].title, '旧标题');
  assert.equal(reconcile([], [noteFile('content/裸标题.md', 'x')])[0].title, '裸标题');
});

test('reconcile：保留人工字段 pin / series / related', () => {
  const prev = [{
    id: 'a', type: 'note', title: '甲', date: '2026-01-01', tags: [], summary: '', path: 'content/a.md',
    pin: 1,
    series: { name: 'ENSO 观测', order: 2, total: 3 },
    related: ['b', 'c'],
  }];
  const out = reconcile(prev, [noteFile('content/a.md', '---\ntitle: 甲\n---\nx')]);
  assert.equal(out[0].pin, 1);
  assert.deepEqual(out[0].series, { name: 'ENSO 观测', order: 2, total: 3 });
  assert.deepEqual(out[0].related, ['b', 'c']);
});

test('reconcile：人工字段在 page 与 video 上同样保留', () => {
  const prev = [
    { id: 'b', type: 'page', title: '乙', date: '2026-01-01', tags: [], summary: '', path: 'content/pages/b.html', pin: 2 },
    { id: 'c', type: 'video', title: '丙', date: '2026-01-01', tags: [], summary: '', path: 'content/videos/c.mp4', pin: 3 },
  ];
  const out = reconcile(prev, [
    pageFile('content/pages/b.html', '<title>乙</title>'),
    { path: 'content/videos/c.mp4' },
  ]);
  const byPath = Object.fromEntries(out.map((i) => [i.path, i]));
  assert.equal(byPath['content/pages/b.html'].pin, 2);
  assert.equal(byPath['content/videos/c.mp4'].pin, 3);
});

test('reconcile：空的 pin / related 不会被搬运（避免脏字段）', () => {
  const prev = [{ id: 'a', type: 'note', title: '甲', date: '2026-01-01', tags: [], summary: '', path: 'content/a.md', pin: null, related: [] }];
  const out = reconcile(prev, [noteFile('content/a.md', 'x')]);
  assert.ok(!('pin' in out[0]));
  assert.ok(!('related' in out[0]));
});

test('reconcile：content/ 下文件消失则条目消失', () => {
  const prev = [{ id: 'gone', type: 'note', title: '没了', date: '2026-01-01', tags: [], summary: '', path: 'content/gone.md' }];
  assert.equal(reconcile(prev, [noteFile('content/other.md', 'x')]).length, 1);
  assert.equal(reconcile(prev, [noteFile('content/other.md', 'x')])[0].path, 'content/other.md');
});

test('reconcile：非 content/ 路径的手工条目一律保留', () => {
  const prev = [{ id: 'ext', type: 'note', title: '外部', date: '2026-01-01', tags: [], summary: '', path: 'external/x.md' }];
  const out = reconcile(prev, []);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'ext');
});

test('reconcile：未登记的图片不算条目，登记过的才算', () => {
  const files = [{ path: 'content/images/pic.jpg' }];
  assert.equal(reconcile([], files).length, 0);

  const prev = [{ id: 'pic', type: 'image', title: '图', date: '2026-01-01', tags: [], summary: '', path: 'content/images/pic.jpg' }];
  assert.equal(reconcile(prev, files).length, 1);
});

test('reconcile：视频有同名 jpg 时自动挂上封面', () => {
  const out = reconcile([], [
    { path: 'content/videos/demo.mp4' },
    { path: 'content/videos/demo.jpg' },
  ]);
  assert.equal(out[0].cover, 'content/videos/demo.jpg');
});

test('reconcile：笔记正文第一张本地图片作为封面', () => {
  const out = reconcile([], [noteFile('content/a.md', '![x](content/images/c.png)\n正文')]);
  assert.equal(out[0].cover, 'content/images/c.png');
});

test('reconcile：不把外链图片当封面', () => {
  const out = reconcile([], [noteFile('content/a.md', '![x](https://example.com/a.png)\n正文')]);
  assert.ok(!out[0].cover);
});

test('reconcile：空输入不崩溃', () => {
  assert.deepEqual(reconcile([], []), []);
  assert.deepEqual(reconcile(null, []), []);
  assert.deepEqual(reconcile([], null), []);
});

/* ------------------------------------------------------------------ *
 * sortItems / buildLibraryJSON
 * ------------------------------------------------------------------ */
test('sortItems：按日期倒序，不修改原数组', () => {
  const items = [
    { id: 'old', date: '2026-01-01' },
    { id: 'new', date: '2026-10-09' },
    { id: 'mid', date: '2026-05-05' },
  ];
  const copy = items.slice();
  assert.deepEqual(sortItems(items).map((i) => i.id), ['new', 'mid', 'old']);
  assert.deepEqual(items, copy, 'sortItems 不该改动传入的数组');
});

test('sortItems：缺日期的条目排在最后且不崩溃', () => {
  const out = sortItems([{ id: 'a', date: '2026-01-01' }, { id: 'b' }]);
  assert.equal(out[0].id, 'a');
  assert.equal(out[1].id, 'b');
});

test('buildLibraryJSON：输出可解析、带 generated、并对 items 排序', () => {
  const raw = buildLibraryJSON({ title: '站' }, [
    { id: 'a', date: '2026-01-01' },
    { id: 'b', date: '2026-09-09' },
  ]);
  const o = JSON.parse(raw);
  assert.equal(o.site.title, '站');
  assert.ok(o.generated);
  assert.deepEqual(o.items.map((i) => i.id), ['b', 'a']);
  assert.ok(raw.endsWith('\n'), '结尾应有换行，避免 diff 噪音');
});

/* ------------------------------------------------------------------ *
 * build-index.mjs 的比对逻辑（回归测试）
 *
 * 背景：原实现只比对 items，导致「只改 site 配置、不动任何内容文件」时
 * 判定为无变化并跳过写入，站点的 title/desc/coords/featured 改动被静默丢弃。
 * ------------------------------------------------------------------ */

/** 复刻 build-index.mjs 里的变更判定 */
function isUnchanged(existing, mergedSite, items) {
  return !!existing &&
    JSON.stringify(existing.site || {}) === JSON.stringify(mergedSite) &&
    JSON.stringify(sortItems(existing.items || [])) === JSON.stringify(sortItems(items));
}

test('变更判定：只改 site 也必须视为有变化（否则 site 改动会被丢弃）', () => {
  const items = [{ id: 'a', date: '2026-01-01' }];
  const existing = { site: { title: '旧标题' }, items: items.slice() };
  const mergedSite = { title: '新标题' };

  assert.equal(isUnchanged(existing, mergedSite, items), false,
    'site.title 变了却判为无变化 —— site 配置会被静默丢弃');
});

test('变更判定：site 与 items 都没变时才算无变化', () => {
  const items = [{ id: 'a', date: '2026-01-01' }];
  const existing = { site: { title: '站' }, items: items.slice() };
  assert.equal(isUnchanged(existing, { title: '站' }, items), true);
});

test('变更判定：条目顺序不同不应视为变化（比对前先排序）', () => {
  const a = { id: 'a', date: '2026-01-01' };
  const b = { id: 'b', date: '2026-09-09' };
  const existing = { site: {}, items: [a, b] };
  assert.equal(isUnchanged(existing, {}, [b, a]), true);
});

test('变更判定：新增条目必须视为有变化', () => {
  const a = { id: 'a', date: '2026-01-01' };
  const existing = { site: {}, items: [a] };
  assert.equal(isUnchanged(existing, {}, [a, { id: 'b', date: '2026-02-02' }]), false);
});

test('变更判定：没有既有索引时一律写入', () => {
  assert.equal(isUnchanged(null, {}, []), false);
});

test('site 合并：磁盘上的字段优先，只补默认值', () => {
  const DEFAULT = { title: '', desc: '', coords: '' };
  const fromDisk = { title: 'One Piece 物理海洋知识库', featured: ['eof'] };
  const merged = Object.assign({}, DEFAULT, fromDisk);

  assert.equal(merged.title, 'One Piece 物理海洋知识库', '不该被默认值覆盖');
  assert.deepEqual(merged.featured, ['eof'], 'featured 属于人工字段，必须保留');
  assert.equal(merged.desc, '', '缺失字段才用默认值补齐');
  assert.equal(merged.coords, '');
});

test('BOM 容错：带 BOM 的索引仍能解析', () => {
  const withBom = '\uFEFF{"site":{"title":"站"},"items":[]}';
  const parsed = (() => {
    try { return JSON.parse(String(withBom).replace(/^\uFEFF/, '')); } catch { return null; }
  })();
  assert.ok(parsed, '带 BOM 的 library.json 不该解析失败');
  assert.equal(parsed.site.title, '站');
});

/* ------------------------------------------------------------------ *
 * 前端契约：app.js 是浏览器里的经典脚本，不能 import 本模块，
 * 所以这里直接对它的源码做契约断言 —— 锁定的是真实实现，不是复刻品。
 * ------------------------------------------------------------------ */
const APP_SRC = readFileSync(new URL('../../assets/app.js', import.meta.url), 'utf8');

test('契约：目录链接绝不能用 href="#id"（会冲掉 hash 路由）', () => {
  // 曾出现过：目录用 href="#标题id"，点一下 hash 从 #/i/xxx 变成 #标题，
  // 路由回落首页，整页被重新渲染。这个断言就是防它回归。
  const tocFn = /function tocHTML\s*\(toc\)\s*\{([\s\S]*?)\n  \}/.exec(APP_SRC);
  assert.ok(tocFn, '没找到 tocHTML 函数，测试需要跟着改');
  const bodySrc = tocFn[1];

  assert.ok(/href="#"/.test(bodySrc), 'tocHTML 里的链接必须是 href="#" 占位');
  assert.ok(!/href="#'\s*\+/.test(bodySrc), 'tocHTML 不得把锚点拼进 href');
  assert.ok(!/data-target/.test(bodySrc), 'tocHTML 不该再用 data-target 指 id');
  assert.ok(/data-i=/.test(bodySrc), 'tocHTML 应通过 data-i 记录标题序号');
});

test('契约：wireToc 必须 preventDefault，避免点击改写 hash', () => {
  const wire = /function wireToc\s*\(\)\s*\{([\s\S]*?)\n  \}/.exec(APP_SRC);
  assert.ok(wire, '没找到 wireToc 函数');
  assert.ok(/preventDefault\(\)/.test(wire[1]), 'wireToc 必须阻止默认跳转行为');
  assert.ok(/scrollIntoView|scrollTo/.test(wire[1]), 'wireToc 应自行滚动到目标');
});

test('契约：正文增强必须给标题打 data-hi，供目录定位', () => {
  assert.ok(/h\.dataset\.hi\s*=/.test(APP_SRC), 'enhanceProse 应写入 dataset.hi');
  assert.ok(/querySelector\('\[data-hi=/.test(APP_SRC) || /\[data-hi="/.test(APP_SRC),
    'wireToc 应通过 [data-hi] 定位标题');
});

test('契约：代码块必须加复制按钮与语言标签', () => {
  assert.ok(/class\s*=\s*'code-copy'/.test(APP_SRC) || /className\s*=\s*'code-copy'/.test(APP_SRC),
    '缺少复制按钮');
  assert.ok(/code-lang/.test(APP_SRC), '缺少语言标签');
  assert.ok(/dataset\.zoomable/.test(APP_SRC), '图片应标记为可放大');
});

test('契约：阅读时长与目录阈值', () => {
  const st = /function proseStats\s*\(body\)\s*\{([\s\S]*?)\n  \}/.exec(APP_SRC);
  assert.ok(st, '没找到 proseStats 函数');
  assert.ok(/CJK_PER_MIN/.test(st[1]) || /350/.test(st[1]), '中文阅读速度应可配置且非零');
  assert.ok(/Math\.max\(1,/.test(st[1]), '至少显示 1 分钟');

  assert.ok(/toc\.length\s*<\s*3/.test(APP_SRC) || /toc\.length\s*>=\s*3/.test(APP_SRC),
    '目录应有最小节数阈值');
});

test('契约：交互页 iframe 必须可自适应且提供全屏', () => {
  assert.ok(/function autoSizeFrame/.test(APP_SRC), '缺少 iframe 自适应逻辑');
  assert.ok(/ResizeObserver|MutationObserver/.test(APP_SRC), '自适应应监听内容变化');
  assert.ok(/frame-full/.test(APP_SRC), '缺少全屏按钮');
  assert.ok(/frame-wrap\.full|classList\.toggle\('full'\)/.test(APP_SRC), '缺少全屏状态切换');
  assert.ok(/frame-hint/.test(APP_SRC), '窄屏应给出全屏引导');
});
