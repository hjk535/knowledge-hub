(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = (ok) => (ok ? '✓' : '✗');

  location.hash = '#/i/eof';
  await sleep(6000);

  const fr = document.getElementById('frame');
  console.log('  iframe 存在      :', P(!!fr));
  if (!fr) { console.log('  页面未加载'); return; }

  const doc = fr.contentDocument;
  console.log('  可读同源文档     :', P(!!doc));
  if (!doc) return;

  console.log('  iframe 内 <video>:', doc.querySelectorAll('video').length, '(应为 0)');
  console.log('  含 .vid 区块     :', P(!doc.querySelector('.vid')));
  console.log('  含「58 秒」      :', P(!/58\s*秒/.test(doc.body.textContent)));

  console.log('  --- 页面功能是否完好 ---');
  console.log('  标题             :', JSON.stringify((doc.querySelector('h1') || {}).textContent || ''));
  console.log('  tabs 数          :', doc.querySelectorAll('.tab').length);
  console.log('  canvas 数        :', doc.querySelectorAll('canvas').length);
  console.log('  滑块数           :', doc.querySelectorAll('input[type=range]').length);
  console.log('  synPanel 可见    :', P(!!doc.querySelector('#synPanel')));
  console.log('  iframe 高度      :', JSON.stringify(fr.style.height));

  // 点一下 TAO 实测那个 tab，确认交互没坏
  const tabs = [...doc.querySelectorAll('.tab')];
  const tao = tabs.find((t) => /TAO/.test(t.textContent));
  if (tao) {
    tao.click();
    await sleep(2500);
    console.log('  --- 点「TAO 实测」后 ---');
    console.log('  当前 tab         :', JSON.stringify(doc.querySelector('.tab.on') ? doc.querySelector('.tab.on').textContent.trim() : '(无)'));
    console.log('  src 说明更新     :', P((doc.querySelector('#src') || {}).textContent.trim().length > 10));
    console.log('  canvas 仍有内容  :', P(doc.querySelector('canvas').width > 0));
  }
})();
