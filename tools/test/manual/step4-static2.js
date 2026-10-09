/* 确认预渲染页的增强是否全部生效 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const P = (ok) => (ok ? '✓' : '✗');

  console.log('   URL                :', location.href);
  console.log('   <title>            :', JSON.stringify(document.title));
  console.log('   #app data-static   :', JSON.stringify($('#app') && $('#app').dataset.static));
  console.log('   #app data-item     :', JSON.stringify($('#app') && $('#app').dataset.item));
  console.log('   顶栏站名           :', JSON.stringify($('#site-title').textContent));
  console.log('   article 存在       :', P(!!$('#app article')));
  console.log('   h2 总数            :', $$('#app h2').length);
  console.log('   h2 带 data-hi      :', $$('#app h2[data-hi]').length, P($$('#app h2[data-hi]').length > 0));
  console.log('   .toc-slot 存在     :', P(!!$('.toc-slot')));
  console.log('   .toc-link 数量     :', $$('.toc-link').length);
  console.log('   代码复制按钮       :', $$('.code-copy').length, P($$('.code-copy').length > 0));
  console.log('   表格滚动层         :', $$('.table-scroll').length);
  console.log('   spinner 残留       :', P(!$('#app .loading')));
  console.log('   #app 文本长度      :', $('#app').textContent.trim().length);
})();
