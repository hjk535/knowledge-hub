/* 出门票 B：有内容时的渲染（通过拦截 API 注入本地索引） */
(async () => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const P = (ok) => (ok ? '✓' : '✗');

  const cards = $$('.ticket');
  console.log('B. 有内容状态');
  console.log('   卡片数量          :', cards.length, P(cards.length === 4));
  console.log('   网格列数           :', getComputedStyle($('.ticket-grid')).gridTemplateColumns);
  console.log('   编号              :', JSON.stringify($$('.ticket-no').map((e) => e.textContent)));
  console.log('   标题              :', JSON.stringify($$('.ticket h3').map((e) => e.textContent)));
  console.log('   说明              :', JSON.stringify($$('.ticket p').map((e) => e.textContent.slice(0, 18))));
  console.log('   有链接的卡片数     :', $$('a.ticket').length, P($$('a.ticket').length === 3));
  console.log('   无链接的用 div     :', P($$('div.ticket').length === 1));
  console.log('   外链属性           :', JSON.stringify($('a.ticket').getAttribute('target') + '/' + $('a.ticket').getAttribute('rel')));
  console.log('   编号用等宽数字     :', P(/mono/.test(getComputedStyle($('.ticket-no')).fontFamily)));
  console.log('   编号颜色=黄铜      :', JSON.stringify(getComputedStyle($('.ticket-no')).color));
  console.log('   未使用 emoji       :', P(!/🎫/.test($('#tickets').textContent)));
  console.log('   右侧计数           :', JSON.stringify($('#tickets .more').textContent));
})();
