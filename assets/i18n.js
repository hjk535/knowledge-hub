/* 中英文切换：静态区块整块替换为英文片段，SPA 文本按词表替换 */
(function () {
  var KEY = 'site.lang.v1';
  var qs = location.search;
  if (/[?&]lang=en\b/.test(qs)) { try { localStorage.setItem(KEY, 'en'); } catch (e) { } }
  if (/[?&]lang=zh\b/.test(qs)) { try { localStorage.setItem(KEY, 'zh'); } catch (e) { } }
  var lang = localStorage.getItem(KEY) === 'en' ? 'en' : 'zh';
  var btn = document.getElementById('btn-lang');

  function label() {
    if (!btn) return;
    btn.textContent = lang === 'en' ? '中' : 'EN';
    btn.title = lang === 'en' ? '切换到中文' : 'Switch to English';
    btn.setAttribute('aria-label', lang === 'en' ? '切换到中文' : 'Switch to English');
  }
  label();

  if (btn) {
    btn.addEventListener('click', function () {
      try { localStorage.setItem(KEY, lang === 'en' ? 'zh' : 'en'); } catch (e) { }
      location.reload();
    });
  }

  if (lang !== 'en') return;

  document.documentElement.setAttribute('lang', 'en');
  document.documentElement.setAttribute('data-lang', 'en');
  document.title = 'HJK Knowledge Harbor · Ocean, data, discovery';

  /* ---------- 1. 静态区块 ---------- */
  var FRAG = {
    'sec-class': 'assets/i18n/en-class.html',
    'sec-book': 'assets/i18n/en-book.html',
    'story': 'assets/i18n/en-story.html',
    'tickets': 'assets/i18n/en-tickets.html'
  };
  Object.keys(FRAG).forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    fetch(FRAG[id], { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (t) { if (t) el.innerHTML = t; })
      .catch(function () { });
  });

  /* ---------- 2. SPA 文本 ---------- */
  var T = {
    'HJK 知识港湾': 'HJK Knowledge Harbor',
    '从这里开始': 'Start here',
    '航路 · 全部内容': 'All content',
    '全部': 'All',
    '主题': 'Topics',
    '类型': 'Types',
    '搜索': 'Search',
    '设置': 'Settings',
    '新建': 'New',
    '编辑': 'Edit',
    '内容不存在': 'Not found',
    '探索海洋，也探索知识。沿着数据、问题与互动实验，发现海洋的另一面。':
      'Explore the ocean, and explore knowledge. Data, questions and interactive experiments — the other side of the sea.',
    'OCEAN SCIENCE · DATA · DISCOVERY': 'OCEAN SCIENCE · DATA · DISCOVERY',
    'EOF 主成分分析': 'EOF principal component analysis',
    'EOF 是怎么算出来的': 'How EOF is computed',
    '九题分享': 'Nine questions',
    '从海水密度到地转流速': 'From seawater density to geostrophic velocity',
    '用经验正交函数（EOF）拆解海洋场的主要空间模态与时间变化，连接数据分析和物理解释。':
      'Using empirical orthogonal functions to split a field into dominant spatial modes and their time evolution — linking data analysis to physical interpretation.',
    '18 秒简介：海温场每一格都在变，把它拆成「空间型 × 时间系数」，第一模态就是厄尔尼诺。':
      '18-second intro: every grid cell of the SST field changes; split it into pattern × time coefficient, and mode 1 is El Niño.',
    '以九个问题整理海洋科学学习中的关键概念，适合快速浏览与复习。':
      'Nine questions that organise the key concepts of ocean science — good for a quick review.',
    '从密度结构、比容异常与动力高度，一步步理解海面坡度如何联系到地转流速；附互动方向判断与小测。':
      'From density structure and specific-volume anomaly to dynamic height, step by step from surface slope to geostrophic velocity, with an interactive direction quiz.',
    '海洋物理': 'Physical oceanography',
    '地转流': 'Geostrophic flow',
    '互动实验': 'Interactive',
    '问答知识分享': 'Q&A',
    '动画': 'Animation',
    '笔记': 'Notes',
    '视频': 'Video',
    '交互': 'Interactive',
    "以九个问题整理海洋科学与学习中的关键概念，适合快速浏览与复习。": "Nine questions that organise the key concepts of ocean science — good for a quick review.",

    '交互页': 'Interactive',
    '简内容': 'items',
    '按时间': 'by date',
    '收起': 'Close',
    '展开': 'Open'
  };

  var RE = [
    [/^共\s*(\d+)\s*篇$/, function (m) { return m[1] + ' items'; }],
    [/^共\s*(\d+)\s*篇\s*·\s*按时间$/, function (m) { return m[1] + ' items · by date'; }],
    [/^(\d+)\s*篇内容$/, function (m) { return m[1] + ' items'; }],
    [/^(\d+)\s*张$/, function (m) { return m[1] + ' items'; }],
    [/^(\d+)\s*简内容$/, function (m) { return m[1] + ' items'; }],
    [/^(.+?)\s+(\d+)$/, function (m) {
      var v = T[m[1].trim()];
      return v ? v + ' ' + m[2] : null;
    }]
  ];

  function tr(s) {
    if (Object.prototype.hasOwnProperty.call(T, s)) return T[s];
    for (var i = 0; i < RE.length; i++) {
      var m = s.match(RE[i][0]);
      if (m) return RE[i][1](m);
    }
    return null;
  }

  function walk(root) {
    if (!root) return;
    var it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = it.nextNode())) {
      var raw = n.nodeValue;
      var t = raw.trim();
      if (!t) continue;
      var v = tr(t);
      if (v != null) n.nodeValue = raw.replace(t, v);
    }
    // 属性
    var els = root.querySelectorAll ? root.querySelectorAll('[aria-label]') : [];
    Array.prototype.forEach.call(els, function (el) {
      var a = el.getAttribute('aria-label');
      var v = tr(a);
      if (v) el.setAttribute('aria-label', v);
    });
  }

  var app = document.getElementById('app');
  if (app) {
    walk(app);
    var mo = new MutationObserver(function () { walk(app); });
    mo.observe(app, { childList: true, subtree: true });
  }

  // 顶栏（logo、按钮标签）不在 #app 里，单独处理
  var bar = document.getElementById('topbar');
  if (bar) {
    walk(bar);
    var mo2 = new MutationObserver(function () { walk(bar); });
    mo2.observe(bar, { childList: true, subtree: true, characterData: true });
  }
})();
