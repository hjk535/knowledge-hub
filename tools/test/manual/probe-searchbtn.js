/* 审计：搜索按钮在首次渲染完成前被点击会不会崩 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const P = (ok) => (ok ? '✓' : '✗');

  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.message)));

  // 模拟：列表页刚渲染完、搜索框还没展开时点搜索按钮
  location.hash = '#/';
  await sleep(4200);

  const btn = $('#btn-search');
  console.log('   #sp 初始存在    :', P(!!$('#sp')));
  console.log('   搜索按钮存在    :', P(!!btn));

  btn.click();
  await sleep(800);
  console.log('   点一次后 #sp    :', P(!!$('#sp')), '已展开:', P($('#sp') && $('#sp').classList.contains('open')));
  console.log('   焦点在输入框    :', P(document.activeElement && document.activeElement.id === 'sq'));
  console.log('   页面报错        :', errs.length ? JSON.stringify(errs) : '(无)');

  // 再点一次应该收起
  btn.click();
  await sleep(500);
  console.log('   再点一次后展开  :', P($('#sp') && $('#sp').classList.contains('open')), '(应为 false)');

  // 关键：搜索框被移除后再点（模拟点搜索按钮时 #sp 不在 DOM 里）
  console.log('   --- 模拟 #sp 不在 DOM 的情况 ---');
  const sp = $('#sp');
  if (sp) sp.remove();
  console.log('   #sp 已移除      :', P(!$('#sp')));
  const before = errs.length;
  btn.click();
  await sleep(2000);
  console.log('   移除后点搜索    :', errs.length > before ? '崩了 ✗ ' + JSON.stringify(errs.slice(before)) : '正常 ✓');
  console.log('   #sp 恢复        :', P(!!$('#sp')));
})();
