/* Step 4 断言：全文搜索（含正文命中）、高亮、Ctrl+K、预渲染页 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const P = (ok) => (ok ? '✓' : '✗');
  const go = (h) => { location.hash = h; return sleep(3400); };

  async function searchFor(word) {
    // 走真实交互：点搜索按钮 -> 输入 -> 等防抖与索引加载
    const btn = $('#btn-search');
    if (btn && btn.style.display !== 'none') btn.click();
    await sleep(500);
    const input = $('#sq');
    if (!input) return { err: '搜索框不存在' };
    input.value = word;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(2200);
    return {
      heads: $$('.sec-head h2').map((h) => h.textContent),
      more: $$('.sec-head .more').map((h) => h.textContent),
      stops: $$('.stop h3').map((h) => h.textContent.trim()),
      snippets: $$('.stop p').map((h) => h.textContent.trim()),
      marks: $$('.stop mark').map((m) => m.textContent),
    };
  }

  /* ---------- 1. 索引懒加载：未搜索时不该请求 ---------- */
  await go('#/');
  const early = performance.getEntriesByType('resource')
    .filter((r) => /search-index/.test(r.name)).length;
  console.log('1. 全文索引懒加载');
  console.log('   进入首页后已请求索引 :', early, '(应为 0)', P(early === 0));

  /* ---------- 2. 全文搜索：正文独有的词 ---------- */
  // 「正交」只出现在 eof.html 的正文里（不在任何标题、摘要、标签中）
  const r1 = await searchFor('正交');
  const idxLoaded = performance.getEntriesByType('resource')
    .filter((r) => /search-index/.test(r.name)).length;
  console.log('2. 搜「正交」（只存在于正文）');
  console.log('   此时索引已请求     :', idxLoaded, P(idxLoaded > 0));
  console.log('   区块标题           :', JSON.stringify(r1.heads));
  console.log('   命中条目           :', JSON.stringify(r1.stops.slice(0, 4)));
  console.log('   命中数 > 0         :', P(r1.stops.length > 0), '(改动前这里是 0)');
  console.log('   高亮 <mark> 数     :', r1.marks.length, P(r1.marks.length > 0), JSON.stringify([...new Set(r1.marks)].slice(0, 5)));
  console.log('   摘要片段           :', JSON.stringify((r1.snippets[0] || '').slice(0, 70)));

  /* ---------- 3. 只存在于正文深处的词 ---------- */
  const r2 = await searchFor('模态');
  console.log('3. 搜「模态」');
  console.log('   命中条目           :', JSON.stringify(r2.stops.slice(0, 4)));
  console.log('   命中数 > 0         :', P(r2.stops.length > 0));

  /* ---------- 4. 搜不到的词要给出空状态而非崩掉 ---------- */
  const r3 = await searchFor('zzz不存在的词zzz');
  const empty = $('.empty h2');
  console.log('4. 搜不存在的词');
  console.log('   空状态标题         :', JSON.stringify(empty && empty.textContent), P(!!empty));

  /* ---------- 5. 标题命中优先于正文命中 ---------- */
  const r4 = await searchFor('EOF');
  console.log('5. 搜「EOF」（标题命中）');
  console.log('   命中条目           :', JSON.stringify(r4.stops.slice(0, 4)));
  console.log('   排序说明           :', JSON.stringify(r4.more));

  /* ---------- 6. Ctrl+K ---------- */
  await go('#/i/markdown-guide');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  await sleep(1200);
  const spOpen = $('#sp') && $('#sp').classList.contains('open');
  const focused = document.activeElement && document.activeElement.id === 'sq';
  console.log('6. Ctrl+K（在详情页触发）');
  console.log('   已回到列表并展开搜索:', P(!!spOpen), ' 焦点在输入框:', P(focused));

  /* ---------- 7. 预渲染页在开启 JS 时仍保留静态正文 ---------- */
  console.log('7. 预渲染页（需单独打开 i/xxx.html 验证，见 _shot/_cdp 另跑）');
})();
