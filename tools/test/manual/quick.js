/* 快速验收：直接看页面有没有内容 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const P = (ok) => (ok ? '✓' : '✗');
  location.hash = '#/';
  await sleep(3500);
  console.log('  标题        :', JSON.stringify($('#site-title').textContent));
  console.log('  H1          :', JSON.stringify(($('.hero h1') || {}).textContent || '(无)'));
  console.log('  精选        :', $$('.card.feat').length, '张');
  console.log('  航线条目    :', $$('.stop').length, '条');
  console.log('  出门票板块  :', P(!!$('#tickets')), JSON.stringify(($('#tickets .more') || {}).textContent || ''));
  console.log('  筛选导航    :', P(!!$('.filters')));
  console.log('  内容为空?   :', P(!$('#app .empty')));
})();
