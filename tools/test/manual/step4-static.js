/* 验证预渲染页：静态正文是否被保留、链接是否正确 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const P = (ok) => (ok ? '✓' : '✗');

  // 用 fetch 直接看服务端返回的 HTML（不执行 JS），这就是爬虫看到的
  const html = await fetch('/i/markdown-guide.html').then((r) => r.text());
  console.log('1. 服务端返回的静态 HTML');
  console.log('   字节数             :', html.length, P(html.length > 3000));
  console.log('   <title>            :', JSON.stringify((html.match(/<title>([^<]*)/) || [])[1]));
  console.log('   含静态正文（删除线）:', P(html.includes('删除线')));
  console.log('   含 data-static      :', P(html.includes('data-static="1"')));
  console.log('   main#app 非空       :', P(!html.includes('<main id="app"></main>')));
  console.log('   ../assets/style.css :', P(html.includes('../assets/style.css')));

  // 再看浏览器里执行 JS 之后，静态正文有没有被 spinner 覆盖
  await sleep(2500);
  const app = $('#app');
  console.log('2. JS 执行后的 #app');
  console.log('   data-static 属性   :', JSON.stringify(app && app.getAttribute('data-static')));
  console.log('   仍含 <article>      :', P(!!$('#app article')));
  console.log('   仍含表格            :', P(!!$('#app table')));
  console.log('   仍含静态正文        :', P(!!($('#app') && $('#app').textContent.includes('删除线'))));
  console.log('   是否被 spinner 覆盖 :', P(!$('#app .loading')));
  console.log('   增强生效(复制按钮)  :', document.querySelectorAll('.code-copy').length,
    P(document.querySelectorAll('.code-copy').length > 0));
  console.log('   顶栏站名           :', JSON.stringify($('#site-title') && $('#site-title').textContent));

  // 站内链接是否指向站点根而不是 /i/
  const links = [...document.querySelectorAll('#app a')].map((a) => a.getAttribute('href')).filter(Boolean);
  const bad = links.filter((h) => h.startsWith('../#/') || h === '#/');
  console.log('3. 链接检查');
  console.log('   #app 内链接总数     :', links.length);
  console.log('   会丢目录的坏链接    :', bad.length, P(bad.length === 0), JSON.stringify(bad.slice(0, 3)));
  console.log('   示例               :', JSON.stringify(links.slice(0, 4)));
})();
