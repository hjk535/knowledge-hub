/* 注入用前置脚本：把线上 library.json 换成带 4 张出门票的版本 */
(() => {
  const LIB = {
    site: {
      title: 'One Piece 物理海洋知识库',
      desc: '物理海洋观测与知识整理。',
      coords: 'GRAND LINE OBSERVATORY · 20°S–20°N',
      featured: ['eof', 'markdown-guide'],
      tickets: [
        { no: 1, title: '混合层热收支', desc: '用浮标数据算一遍混合层热量平衡', href: 'https://example.com/t1.pdf' },
        { no: 2, title: '温盐剖面', desc: '副热带与副极地的温盐结构对比', href: 'https://example.com/t2.pdf' },
        { no: 3, title: 'Niño3.4 复盘', desc: '1997 与 2015 两次超强厄尔尼诺', href: 'https://example.com/t3.pdf' },
        { no: 4, title: '没有链接的那张', desc: '用来确认无链接时不会渲染成死链' },
      ],
    },
    items: [
      { id: 'eof', type: 'page', title: 'EOF 主成分分析', date: '2026-10-09', tags: [], summary: '', path: 'content/pages/eof.html', pin: 1 },
      { id: 'eof-explained', type: 'video', title: 'EOF 主成分分析 · 讲解视频', date: '2026-10-09', tags: [], summary: '58 秒讲清 EOF', path: 'content/videos/eof-explained.mp4', cover: 'content/videos/eof-explained.jpg', pin: 2 },
      { id: 'markdown-guide', type: 'note', title: 'Markdown 语法', date: '2026-02-14', tags: ['参考'], summary: '文本 标题 列表 引用', path: 'content/markdown-guide.md', pin: 3 },
    ],
  };
  const orig = window.fetch;
  window.fetch = function (u) {
    const s = String(u);
    if (s.indexOf('api.github.com') >= 0 && s.indexOf('library.json') >= 0) {
      return Promise.resolve(new Response(JSON.stringify(LIB), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    }
    return orig.apply(this, arguments);
  };
})();
