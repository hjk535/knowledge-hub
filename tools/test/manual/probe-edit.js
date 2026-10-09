(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const P = (ok) => (ok ? '✓' : '✗');

  console.log('1. 未登录状态（当前浏览器）');
  console.log('   新建按钮 #fab 显示 :', JSON.stringify($('#fab').className), '-> 可见:', P($('#fab').classList.contains('show')));
  console.log('   顶栏按钮           :', JSON.stringify([...document.querySelectorAll('.icon-btn')].map((b) => b.id)));
  console.log('   localStorage 令牌  :', JSON.stringify(localStorage.getItem('site.token.v1') ? '已存' : '无'));

  console.log('2. 进入设置页，看要填什么');
  location.hash = '#/settings';
  await sleep(3000);
  const fields = [...document.querySelectorAll('#app input, #app textarea')].map((i) => ({
    id: i.id, type: i.type, ph: i.placeholder || '',
  }));
  console.log('   表单字段           :', JSON.stringify(fields));
  const html = $('#app').innerHTML;
  console.log('   有「令牌」字样     :', P(/令牌|token/i.test(html)));
  console.log('   有「测试/检查」按钮:', P(/s-test/.test(html)));
  console.log('   有「保存」按钮     :', P(/s-save/.test(html)));

  console.log('3. 设置页里的说明文字');
  const notes = [...document.querySelectorAll('#app p, #app .hint, #app label, #app .notice')]
    .map((e) => e.textContent.trim()).filter(Boolean).slice(0, 10);
  notes.forEach((n) => console.log('   -', JSON.stringify(n.slice(0, 90))));
})();
