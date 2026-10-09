/* 站点整体可用性：首页三段式、日常路由、编辑器可达性 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const P = (ok) => (ok ? '✓' : '✗');

  function state(tag) {
    return {
      hash: location.hash || '(空)',
      heads: $$('.sec-head h2').map((h) => h.textContent),
      stops: $$('.stop').length,
      tickets: !!$('#tickets'),
      article: !!$('#app article'),
      empty: ($('#app .empty') || {}).textContent || '',
      title: document.title,
    };
  }

  const go = async (h) => { location.hash = h; await sleep(4200); return state(h); };

  console.log('1. 首页');
  const home = await go('#/');
  console.log('   板块            :', JSON.stringify(home.heads));
  console.log('   条目数          :', home.stops);
  console.log('   出门票板块      :', P(home.tickets));
  console.log('   页面标题        :', JSON.stringify(home.title));

  console.log('2. 笔记页');
  const note = await go('#/i/markdown-guide');
  console.log('   渲染出 article  :', P(note.article));
  console.log('   目录            :', $$('.toc-link').length, '项');
  console.log('   阅读时长        :', JSON.stringify((($$('.article .meta span').map((s) => s.textContent).find((t) => /分钟/.test(t))) || '(无)')));

  console.log('3. 交互页');
  const page = await go('#/i/eof');
  const fr = $('#frame');
  console.log('   iframe          :', P(!!fr), fr ? '高=' + fr.style.height : '');
  console.log('   全屏按钮        :', P(!!$('#frame-full')));

  console.log('4. 不存在的条目要优雅处理');
  const bad = await go('#/i/does-not-exist');
  console.log('   提示            :', JSON.stringify(bad.empty.trim().slice(0, 20)), P(/不存在/.test(bad.empty)));

  console.log('5. 回到首页（确认状态没被污染）');
  const back = await go('#/');
  console.log('   板块            :', JSON.stringify(back.heads));
  console.log('   出门票仍在      :', P(back.tickets));
  console.log('   搜索词已清空    :', P(($('#sq') || {}).value === ''));

  console.log('6. 设置页可达');
  const set = await go('#/settings');
  const hasForm = !!$('#s-owner') || !!$('#app input');
  console.log('   表单渲染        :', P(hasForm));
})();
