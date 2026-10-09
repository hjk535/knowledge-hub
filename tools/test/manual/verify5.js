(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const P = (ok) => (ok ? '✓' : '✗');
  await sleep(4000);
  const cs = getComputedStyle(document.documentElement);
  console.log('  1 站名        :', JSON.stringify($('#site-title').textContent), P($('#site-title').textContent === 'hjkd 物理海洋知识库'));
  console.log('  2 背景色      :', cs.getPropertyValue('--bg').trim(), '| body 实渲:', getComputedStyle(document.body).backgroundColor);
  console.log('  3 副标题      :', JSON.stringify(($('.hero .sub') || {}).textContent || ''));
  console.log('    含 ENSO     :', P(!/ENSO/.test(($('.hero .sub') || {}).textContent || '')));
  console.log('  4 视频条目    :', $$('.stop .kind').filter((k) => k.textContent === 'video').length, '条（应为 0）');
  console.log('    视频卡片    :', $$('.card.feat .play').length, '个播放角标（应为 0）');
  console.log('  5 出门票      :', P(!!$('#tickets')), JSON.stringify($('#tickets .more').textContent));
  console.log('    出门票卡数  :', $$('.ticket').length);
  console.log('    编号        :', JSON.stringify($$('.ticket-no').map((e) => e.textContent)));
  console.log('    标题        :', JSON.stringify($$('.ticket h3').map((e) => e.textContent)));
})();
