(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(2500);
  const app = document.getElementById('app');
  console.log('  页面标题      :', JSON.stringify(document.title));
  console.log('  #app 文本     :', JSON.stringify((app.textContent || '').trim().slice(0, 160)));
  console.log('  SITE_CONFIG   :', JSON.stringify(window.SITE_CONFIG));
  console.log('  marked 可用   :', !!(window.marked && window.marked.parse));
  console.log('  DOMPurify     :', !!window.DOMPurify);
  // 直接抓本地索引，看 dev-server 是否真的能提供
  try {
    const r = await fetch('data/library.json');
    const t = await r.text();
    console.log('  data/library.json : HTTP', r.status, t.length, '字节');
  } catch (e) { console.log('  library.json 抓取失败:', e.message); }
})();
