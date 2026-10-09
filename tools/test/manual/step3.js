/* Step 3 阅读增强的断言脚本（由 _cdp.mjs 注入执行） */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const P = (ok) => (ok ? '✓' : '✗');
  const go = (h) => { location.hash = h; return sleep(3200); };

  /* ---------- A. 笔记页：目录 / 阅读时长 / 代码复制 / 表格出血 ---------- */
  await go('#/i/markdown-guide');
  const note = {
    time: ($$('.article .meta span').map((s) => s.textContent).find((t) => /分钟/.test(t)) || '(无)'),
    tocLinks: $$('.toc-link').length,
    hasWide: !!$('.toc-wide'),
    hasNarrow: !!$('.toc-narrow'),
    codeBlocks: $$('.code-block').length,
    copyBtns: $$('.code-copy').length,
    langs: $$('.code-lang').map((e) => e.textContent),
    tableScroll: $$('.table-scroll').length,
    tables: $$('.prose table').length,
    h2WithId: $$('.prose h2[id]').length,
    h2Total: $$('.prose h2').length,
  };
  console.log('A. 笔记页（Markdown 语法）');
  console.log('   阅读时长           :', note.time, P(/分钟/.test(note.time)));
  console.log('   目录项数           :', note.tocLinks, P(note.tocLinks > 0));
  console.log('   宽屏目录 / 窄屏目录:', note.hasWide, '/', note.hasNarrow, P(note.hasWide && note.hasNarrow));
  console.log('   代码块 / 复制按钮  :', note.codeBlocks, '/', note.copyBtns,
    P(note.codeBlocks === note.copyBtns && note.codeBlocks > 0));
  console.log('   语言标签           :', JSON.stringify(note.langs));
  console.log('   表格包滚动层       :', note.tableScroll, '/', note.tables,
    P(note.tableScroll === note.tables && note.tables > 0));
  console.log('   h2 带 id           :', note.h2WithId + '/' + note.h2Total, P(note.h2WithId === note.h2Total));

  /* 点击第一个复制按钮，确认文案变化 */
  const cb = $('.code-copy');
  if (cb) {
    cb.click();
    await sleep(250);
    console.log('   点复制后按钮文案   :', JSON.stringify(cb.textContent), P(cb.textContent === '已复制'));
  }

  /* 目录锚点跳转 */
  const firstLink = $('.toc-link');
  if (firstLink) {
    const before = window.scrollY;
    firstLink.click();
    await sleep(1200);
    console.log('   点目录项后滚动     :', before, '->', window.scrollY, P(window.scrollY !== before || before === 0));
  }

  /* 回到顶部按钮（长文 + 已滚动才出现） */
  // 注意：window.scrollTo 会自然触发 scroll 监听，不要再手动 dispatch，
  // 否则容易出现「先读状态、后派发事件」的时序误判。
  console.log('   [诊断] 滚动前 hash=' + location.hash + ' scrollY=' + window.scrollY +
    ' 按钮=' + !!$('#to-top'));
  window.scrollTo(0, 900);
  await sleep(700);
  const topBtn = $('#to-top');
  console.log('   [诊断] 滚动后 scrollY=' + window.scrollY + ' class=' +
    JSON.stringify(topBtn && topBtn.className) + ' display=' +
    (topBtn ? getComputedStyle(topBtn).display : '-'));
  console.log('   回到顶部按钮       : scrollY=' + window.scrollY + ' class=' + JSON.stringify(topBtn && topBtn.className),
    P(!!topBtn && topBtn.classList.contains('show')));

  /* 滚回顶部后应自动隐藏 */
  window.scrollTo(0, 0);
  await sleep(700);
  console.log('   滚回顶部后隐藏     :', JSON.stringify(topBtn && topBtn.className),
    P(!!topBtn && !topBtn.classList.contains('show')));

  /* ---------- B. 交互页：iframe 自适应 + 全屏 ---------- */
  await go('#/i/eof');
  await sleep(2500);
  const fr = $('#frame');
  const wrap = $('#frame-wrap');
  const ifr = {
    exists: !!fr,
    inlineH: fr ? fr.style.height : '',
    renderedH: fr ? Math.round(fr.getBoundingClientRect().height) : 0,
    bodyH: (() => { try { return fr.contentDocument ? fr.contentDocument.body.scrollHeight : -1; } catch (e) { return -2; } })(),
    fullBtn: !!$('#frame-full'),
    hint: !!$('.frame-hint'),
  };
  console.log('B. 交互页（EOF）');
  console.log('   iframe 存在        :', ifr.exists, P(ifr.exists));
  console.log('   内联高度 / 实际高度:', JSON.stringify(ifr.inlineH), '/', ifr.renderedH);
  console.log('   内容实际高度       :', ifr.bodyH);
  console.log('   自适应生效         :', P(ifr.inlineH && ifr.bodyH > 0 && ifr.renderedH > 600));
  console.log('   全屏按钮           :', ifr.fullBtn, P(ifr.fullBtn));

  if (ifr.fullBtn && wrap) {
    $('#frame-full').click();
    await sleep(500);
    const cls = wrap.className;
    const h = Math.round(wrap.getBoundingClientRect().height);
    console.log('   点全屏后 class/高度:', JSON.stringify(cls), '/', h, P(/full/.test(cls)));
    $('#frame-full').click();
    await sleep(400);
    console.log('   再点退出全屏       :', JSON.stringify(wrap.className), P(!/full/.test(wrap.className)));
  }

  /* ---------- C. 图片灯箱（图片条目不存在，改测 note 内图片） ---------- */
  await go('#/i/markdown-guide');
  const zoomables = $$('.prose img.zoomable');
  console.log('C. 图片放大');
  console.log('   note 内可放大图片  :', zoomables.length, '(该页可能无图，属正常)');
  if (zoomables.length) {
    zoomables[0].click();
    await sleep(400);
    const lb = $('#lightbox');
    console.log('   点图后灯箱出现     :', !!lb, P(!!lb));
    if (lb) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await sleep(300);
      console.log('   Esc 关闭灯箱       :', !$('#lightbox'), P(!$('#lightbox')));
    }
  }
})();
