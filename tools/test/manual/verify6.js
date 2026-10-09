(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const P = (ok) => (ok ? '✓' : '✗');
  const go = async (h) => { location.hash = h; await sleep(4200); };

  await sleep(2500);
  console.log('1. 删除 Markdown 笔记');
  const stops = $$('.stop h3').map((h) => h.textContent.trim());
  console.log('   航线条目      :', JSON.stringify(stops));
  console.log('   已无 Markdown :', P(!stops.some((s) => /Markdown/.test(s))));
  console.log('   主题筛选      :', JSON.stringify($$('.chip').map((c) => c.textContent.trim())));

  console.log('2. 出门票去掉占位注释');
  console.log('   出门票卡数    :', $$('.ticket').length);
  console.log('   卡片内 <p> 数 :', $$('#tickets .ticket p').length, '(应为 0)');
  console.log('   卡内文本      :', JSON.stringify($$('.ticket .ticket-body').map((e) => e.textContent.trim())));
  console.log('   含「作业或作品」:', P(!/作业或作品/.test($('#tickets').textContent)));

  console.log('3. 新视频');
  const vk = $$('.stop .kind').filter((k) => k.textContent === 'video').length;
  console.log('   视频条目数    :', vk, P(vk === 1));
  await go('#/i/eof-explained');
  const v = $('#app video');
  console.log('   video 元素    :', P(!!v));
  if (v) {
    console.log('   时长          :', v.duration ? v.duration.toFixed(2) + 's' : '(未加载)', P(v.duration > 29 && v.duration < 31));
    console.log('   分辨率        :', v.videoWidth + 'x' + v.videoHeight);
    console.log('   readyState    :', v.readyState);
  }
})();
