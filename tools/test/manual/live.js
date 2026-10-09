(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const P = (ok) => (ok ? '✓' : '✗');
  await sleep(4000);
  console.log('  线上 URL     :', location.href);
  console.log('  <title>      :', JSON.stringify(document.title));
  console.log('  顶栏站名     :', JSON.stringify($('#site-title').textContent));
  console.log('  H1           :', JSON.stringify(($('.hero h1') || {}).textContent || '(无)'));
  console.log('  坐标行       :', JSON.stringify(($('.hero .coord') || {}).textContent || '(无)'));
  console.log('  精选         :', $$('.card.feat').length, '张');
  console.log('  航线条目     :', $$('.stop').length, '条');
  console.log('  筛选导航     :', P(!!$('.filters')));
  console.log('  出门票板块   :', P(!!$('#tickets')), JSON.stringify(($('#tickets .more') || {}).textContent || ''));
  console.log('  出门票提示   :', JSON.stringify(($('.tickets-note') || {}).textContent || '(无)'));
})();
