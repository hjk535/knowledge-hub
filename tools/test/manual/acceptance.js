/* 三点总验收：① 航海日志主题 ② HTML 互动 + 教学视频 ③ 出门票 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const P = (ok) => (ok ? '✓' : '✗');
  const root = document.documentElement;
  const css = (k) => getComputedStyle(root).getPropertyValue(k).trim();

  console.log('① 航海日志视觉主题');
  console.log('   纸感底 --bg        :', css('--bg'), P(css('--bg') === '#f6f4ee'));
  console.log('   墨蓝 --text        :', css('--text'), P(css('--text') === '#12263a'));
  console.log('   黄铜强调 --accent  :', css('--accent'), P(css('--accent') === '#8a5a12'));
  console.log('   坐标行 .coord      :', P(!!$('.hero .coord')), JSON.stringify($('.hero .coord') && $('.hero .coord').textContent));
  console.log('   罗盘 logo          :', P(!!$('.logo')));
  console.log('   主题切换按钮       :', P(!!$('#btn-theme')));
  console.log('   航线式条目 .stop   :', $$('.stop').length, '条');

  console.log('');
  console.log('② HTML 互动页 + 教学视频');
  // 互动页
  location.hash = '#/i/eof';
  await sleep(4500);
  const fr = $('#frame');
  console.log('   互动页 iframe      :', P(!!fr));
  console.log('   自适应高度         :', fr ? JSON.stringify(fr.style.height) : '-');
  console.log('   全屏按钮           :', P(!!$('#frame-full')));
  // 视频
  location.hash = '#/i/eof-explained';
  await sleep(4500);
  const v = $('#app video');
  console.log('   视频播放器         :', P(!!v), v ? JSON.stringify({ controls: v.controls, src: v.getAttribute('src') }) : '');

  console.log('');
  console.log('③ 出门票');
  location.hash = '#/';
  await sleep(4500);
  const heads = $$('.sec-head h2').map((h) => h.textContent);
  console.log('   板块顺序           :', JSON.stringify(heads));
  console.log('   出门票在最底部     :', P(heads[heads.length - 1] === '出门票'));
  console.log('   卡片数             :', $$('.ticket').length);
  console.log('   编号               :', JSON.stringify($$('.ticket-no').map((e) => e.textContent)));
  console.log('   可点卡片           :', $$('a.ticket').length, ' 静态卡片:', $$('div.ticket').length);
  console.log('   用黄铜编号非 emoji :', P(!/🎫/.test(($('#tickets') || {}).textContent || '')));
})();
