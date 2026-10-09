/* 逐步追踪搜索按钮的状态变化 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const snap = (tag) => {
    const sp = $('#sp');
    console.log('  [' + tag + ']',
      'hash=' + (location.hash || '(空)'),
      '#sp=' + (sp ? '有' : '无'),
      'open=' + (sp ? sp.classList.contains('open') : '-'),
      'input=' + (!!$('#sq')),
      'active=' + (document.activeElement ? document.activeElement.id || document.activeElement.tagName : '-'));
  };

  location.hash = '#/';
  await sleep(4500);
  snap('渲染完');

  const btn = $('#btn-search');
  console.log('  --- 第 1 次点击 ---');
  btn.click();
  await sleep(120); snap('+120ms');
  await sleep(900); snap('+1s');

  console.log('  --- 第 2 次点击 ---');
  btn.click();
  await sleep(120); snap('+120ms');
  await sleep(900); snap('+1s');

  console.log('  --- 第 3 次点击 ---');
  btn.click();
  await sleep(120); snap('+120ms');
  await sleep(900); snap('+1s');

  console.log('  --- 手动再切一次 class 验证 CSS ---');
  const sp = $('#sp');
  if (sp) {
    sp.classList.remove('open');
    await sleep(600);
    snap('手动移除 open 后');
    console.log('  展开高度 grid-template-rows =',
      JSON.stringify(getComputedStyle(sp).gridTemplateRows));
  }
})();
