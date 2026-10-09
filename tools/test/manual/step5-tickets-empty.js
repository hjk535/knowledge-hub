/* 出门票 A：空架子状态（真实数据，site.tickets = []） */
(async () => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const P = (ok) => (ok ? '✓' : '✗');

  const head = $$('.sec-head h2').map((h) => h.textContent);
  console.log('A. 空架子状态');
  console.log('   板块标题顺序      :', JSON.stringify(head));
  console.log('   含宣言 .hero      :', P(!!$('.hero')));
  console.log('   含精选 .featured  :', P(!!$('.featured')));
  console.log('   含筛选 .filters   :', P(!!$('.filters')));
  console.log('   #tickets 区块     :', P(!!$('#tickets')));
  console.log('   出门票排在最后    :', P(head[head.length - 1] === '出门票'));
  console.log('   右侧计数          :', JSON.stringify($('#tickets .more') && $('#tickets .more').textContent));
  console.log('   提示文案          :', JSON.stringify(($('.tickets-note') || {}).textContent || ''));
  console.log('   没有空网格        :', P($$('.ticket-grid').length === 0));
  console.log('   出门票样式 border-top :', JSON.stringify(getComputedStyle($('#tickets')).borderTopWidth + ' ' + getComputedStyle($('#tickets')).borderTopColor));
})();
