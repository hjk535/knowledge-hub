/* ============================================================
   统一内容站
   文字 / 图片 / 交互页面，同一种数据模型、同一套界面
   ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     配置
     --------------------------------------------------------- */
  var FILE_CFG = window.SITE_CONFIG || {};
  var LS_CFG = 'site.cfg.v1';
  var LS_TOKEN = 'site.token.v1';
  var LIB_PATH = 'data/library.json';

  var CFG = Object.assign({ owner: '', repo: '', branch: 'main', title: '我的空间', desc: '' },
    FILE_CFG, readJSON(LS_CFG) || {});

  function readJSON(k) {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }
  function saveCfg() {
    localStorage.setItem(LS_CFG, JSON.stringify({
      owner: CFG.owner, repo: CFG.repo, branch: CFG.branch
    }));
  }
  function getToken() { return localStorage.getItem(LS_TOKEN) || ''; }
  function setToken(t) {
    if (t) localStorage.setItem(LS_TOKEN, t); else localStorage.removeItem(LS_TOKEN);
  }
  function isAuthor() { return !!getToken(); }
  function configured() { return !!(CFG.owner && CFG.repo); }

  /* ---------------------------------------------------------
     工具
     --------------------------------------------------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmtDate(s) {
    if (!s) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (m) return m[1] + '.' + m[2] + '.' + m[3];
    return String(s);
  }
  function uid(prefix) {
    return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function slugify(s) {
    var b = String(s || '').toLowerCase().trim()
      .replace(/[^\w\u4e00-\u9fa5\s-]/g, '').replace(/\s+/g, '-')
      .replace(/-+/g, '-').replace(/^-|-$/g, '');
    return b || uid('n');
  }
  function debounce(fn, ms) {
    var t; return function () {
      var a = arguments, self = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  var toastTimer;
  function toast(msg, kind) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, kind === 'err' ? 6000 : 2600);
  }
  function spin(label) {
    return '<div class="loading"><span class="spin"></span>' + (label ? esc(label) : '') + '</div>';
  }

  function markdown(md) {
    var html = window.marked.parse(String(md || ''), { gfm: true, breaks: false });
    return window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }

  function stripFences(s) {
    return String(s || '').replace(/(`{3,})([\s\S]*?)\1/g, ' ');
  }

  function plainText(md, title, len) {
    var t = stripFences(md)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s*\|.*\|\s*$/gm, ' ')
      .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, ' ')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/[*_~|]/g, '')
      .replace(/\s+/g, ' ').trim();
    var tt = String(title || '').trim();
    if (tt && t.indexOf(tt) === 0) t = t.slice(tt.length).trim();
    len = len || 96;
    return t.length > len ? t.slice(0, len) + '…' : t;
  }

  function firstImage(md) {
    var clean = stripFences(md).replace(/`[^`]*`/g, ' ');
    var m = /!\[[^\]]*\]\(([^)\s]+)/.exec(clean);
    if (!m) return null;
    var src = m[1];
    if (/^https?:/i.test(src)) return null;
    if (!/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(src) && src.indexOf('/') < 0) return null;
    return src;
  }

  /* ---------------------------------------------------------
     GitHub
     --------------------------------------------------------- */
  var API = 'https://api.github.com';

  function gh(path, opts) {
    opts = opts || {};
    var headers = { Accept: opts.accept || 'application/vnd.github+json' };
    var t = getToken();
    if (t && !opts.anon) headers.Authorization = 'Bearer ' + t;
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: opts.anon ? 'default' : 'no-store'
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (txt) {
          var msg = 'HTTP ' + res.status;
          try { msg = JSON.parse(txt).message || msg; } catch (e) { }
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        });
      }
      return opts.raw ? res.text() : res.json();
    });
  }

  function rp(p) {
    return '/repos/' + encodeURIComponent(CFG.owner) + '/' + encodeURIComponent(CFG.repo) + p;
  }

  function apiRead(path) {
    return gh(rp('/contents/' + path) + '?ref=' + encodeURIComponent(CFG.branch), {
      accept: 'application/vnd.github.raw+json', raw: true, anon: !isAuthor()
    }).catch(function (e) { if (e.status === 404) return null; throw e; });
  }

  function staticRead(path) {
    return fetch(path + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : null; })
      .catch(function () { return null; });
  }

  /* 有令牌走 API（新鲜），否则走 Pages 静态文件（快且无限额） */
  function readFile(path) {
    if (!configured()) return staticRead(path);
    return apiRead(path).then(function (txt) {
      if (txt != null) return txt;
      return staticRead(path).then(function (s) {
        return s != null ? s : apiRead(path);
      });
    }).catch(function () { return staticRead(path); });
  }

  /* 写操作串行 + 冲突重试 */
  var chain = Promise.resolve();
  function queue(task) {
    var run = chain.then(task, task);
    chain = run.catch(function () { });
    return run;
  }

  function commit(files, message, attempt) {
    attempt = attempt || 1;
    var head;
    return gh(rp('/git/ref/heads/' + encodeURIComponent(CFG.branch)))
      .then(function (ref) {
        head = ref.object.sha;
        return gh(rp('/git/commits/' + head));
      })
      .then(function (c) {
        var base = c.tree.sha;
        return files.reduce(function (p, f) {
          return p.then(function (acc) {
            if (f.remove) {
              acc.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
              return acc;
            }
            return gh(rp('/git/blobs'), {
              method: 'POST', body: { content: f.content, encoding: f.encoding || 'utf-8' }
            }).then(function (b) {
              acc.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
              return acc;
            });
          });
        }, Promise.resolve([])).then(function (entries) {
          return gh(rp('/git/trees'), { method: 'POST', body: { base_tree: base, tree: entries } });
        });
      })
      .then(function (tree) {
        return gh(rp('/git/commits'), {
          method: 'POST', body: { message: message, tree: tree.sha, parents: [head] }
        });
      })
      .then(function (c) {
        return gh(rp('/git/refs/heads/' + encodeURIComponent(CFG.branch)), {
          method: 'PATCH', body: { sha: c.sha, force: false }
        });
      })
      .catch(function (err) {
        if ((err.status === 422 || err.status === 409) && attempt < 4) {
          return new Promise(function (r) { setTimeout(r, 320 * attempt); })
            .then(function () { return commit(files, message, attempt + 1); });
        }
        throw err;
      });
  }

  function friendly(e) {
    var m = String((e && e.message) || e || '');
    if (/not a fast forward|422/i.test(m)) return '内容刚好被其他操作更新，请重试';
    if (/bad credentials|401/i.test(m)) return '令牌无效或已过期';
    if (/403/.test(m)) return '令牌权限不足，需要 repo 和 workflow';
    if (/404/.test(m)) return '找不到仓库，请检查设置';
    if (/rate limit/i.test(m)) return '操作太频繁，稍后再试';
    if (/Failed to fetch|NetworkError/i.test(m)) return '网络中断，请重试';
    return m;
  }

  /* ---------------------------------------------------------
     素材库
     --------------------------------------------------------- */
  var LIB = { site: { title: '', desc: '' }, items: [] };
  var loaded = false;

  function normalize(raw) {
    var o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { return null; } }
    if (!o) return null;
    // 兼容旧格式：{ notes: [...] }
    if (!Array.isArray(o.items) && Array.isArray(o.notes)) {
      o.items = o.notes.map(function (n) {
        return {
          id: n.slug, type: 'note', title: n.title, date: n.date || '',
          tags: n.tags || [], summary: n.summary || '', path: 'content/' + n.slug + '.md'
        };
      });
    }
    if (!Array.isArray(o.items)) return null;
    return o;
  }

  function loadLibrary(force) {
    if (loaded && !force) return Promise.resolve(LIB);
    return readFile(LIB_PATH).then(function (raw) {
      var o = normalize(raw);
      if (o) LIB = { site: o.site || {}, items: o.items };
      loaded = true;
      return LIB;
    });
  }

  function libJSON() {
    return JSON.stringify({
      generated: new Date().toISOString(),
      site: LIB.site,
      items: LIB.items
    }, null, 2) + '\n';
  }

  function itemById(id) {
    for (var i = 0; i < LIB.items.length; i++) if (LIB.items[i].id === id) return LIB.items[i];
    return null;
  }
  function sorted() {
    return LIB.items.slice().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
  }
  function itemURL(it) { return location.origin + location.pathname + '#/i/' + encodeURIComponent(it.id); }
  function assetURL(p) { return location.origin + location.pathname.replace(/[^\/]*$/, '') + p; }

  /* ---------------------------------------------------------
     图片
     --------------------------------------------------------- */
  var localBlobs = {};
  var MAX_IMG = 25 * 1024 * 1024;
  var MAX_EDGE = 1800;
  var WEB_SAFE = { 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1 };

  function fileToDataURL(f) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('读取失败')); };
      r.readAsDataURL(f);
    });
  }
  function decode(src) {
    return new Promise(function (res, rej) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { rej(new Error('无法解析该图片')); };
      i.src = src;
    });
  }

  /* 需要时缩小，非 Web 格式统一转 JPEG */
  function prepareImage(file) {
    return fileToDataURL(file).then(function (dataURL) {
      if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
        return { dataURL: dataURL, mime: file.type };
      }
      return decode(dataURL).then(function (img) {
        var w = img.width, h = img.height;
        var shrink = w > MAX_EDGE;
        var convert = !WEB_SAFE[file.type];
        if (!shrink && !convert) return { dataURL: dataURL, mime: file.type };
        if (shrink) { h = Math.max(1, Math.round(h * MAX_EDGE / w)); w = MAX_EDGE; }
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        var mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        return { dataURL: cv.toDataURL(mime, 0.86), mime: mime };
      }).catch(function () { return { dataURL: dataURL, mime: file.type }; });
    });
  }

  var EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

  function uploadImage(file) {
    if (!isAuthor()) return Promise.reject(new Error('未配置令牌'));
    if (file.size > MAX_IMG) return Promise.reject(new Error('图片超过 25MB'));
    return prepareImage(file).then(function (r) {
      var ext = EXT[r.mime] || 'png';
      var name = uid('img') + '.' + ext;
      var path = 'content/images/' + name;
      var b64 = String(r.dataURL).split(',')[1];
      localBlobs[path] = r.dataURL;
      return queue(function () {
        return commit([{ path: path, content: b64, encoding: 'base64' }], '上传图片 ' + name);
      }).then(function () { return path; });
    });
  }

  function patchBlobs(root) {
    $$('img', root).forEach(function (img) {
      var src = img.getAttribute('src') || '';
      var m = /content\/images\/([^\/?#]+)/.exec(src);
      if (m && localBlobs['content/images/' + m[1]]) {
        img.src = localBlobs['content/images/' + m[1]];
      }
    });
  }

  /* 有令牌时用 API 取原图，刚上传的不必等构建 */
  function hydrateImages(root) {
    if (!isAuthor() || !configured()) return;
    $$('img', root).forEach(function (img) {
      var src = img.getAttribute('src') || '';
      if (/^(https?:|data:)/i.test(src)) return;
      var m = /content\/images\/([^\/?#]+)/.exec(src);
      if (!m) return;
      var key = 'content/images/' + m[1];
      if (localBlobs[key]) { img.src = localBlobs[key]; return; }
      fetch(API + rp('/contents/' + key) + '?ref=' + encodeURIComponent(CFG.branch), {
        headers: { Authorization: 'Bearer ' + getToken(), Accept: 'application/vnd.github.raw+json' },
        cache: 'no-store'
      }).then(function (r) { return r.ok ? r.blob() : null; })
        .then(function (b) {
          if (!b || b.size > 6 * 1024 * 1024) return;
          var fr = new FileReader();
          fr.onload = function () { img.src = fr.result; localBlobs[key] = fr.result; };
          fr.readAsDataURL(b);
        }).catch(function () { });
    });
  }

  /* ---------------------------------------------------------
     路由
     --------------------------------------------------------- */
  function route() {
    var h = location.hash.replace(/^#/, '') || '/';
    var seg = h.split('/').filter(Boolean).map(function (s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    if (!seg.length) return { v: 'list' };
    if (seg[0] === 'i' && seg[1]) return { v: 'item', id: seg.slice(1).join('/') };
    if (seg[0] === 'new') return { v: 'edit', type: seg[1] || null, id: null };
    if (seg[0] === 'edit' && seg[1]) return { v: 'edit', id: seg.slice(1).join('/'), type: null };
    if (seg[0] === 'settings') return { v: 'settings' };
    return { v: 'list' };
  }
  function go(hash) {
    if (location.hash === hash) render(); else location.hash = hash;
  }

  function copy(text, msg) {
    function fb() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(msg || '已复制'); }
      catch (e) { toast('复制失败', 'err'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(msg || '已复制'); }, fb);
    } else fb();
  }

  /* ---------------------------------------------------------
     视图：列表
     --------------------------------------------------------- */
  var q = '';
  var searchOpen = false;

  function viewList() {
    return loadLibrary().then(function () {
      var items = sorted();
      var kw = q.trim().toLowerCase();
      var shown = kw ? items.filter(function (it) {
        return ((it.title || '') + ' ' + (it.summary || '') + ' ' + (it.tags || []).join(' '))
          .toLowerCase().indexOf(kw) >= 0;
      }) : items;

      document.title = LIB.site.title || CFG.title || '我的空间';
      $('#site-title').textContent = document.title;

      var head = '<div class="page-head"><h1>' + esc(LIB.site.title || CFG.title || '我的空间') + '</h1>' +
        (LIB.site.desc ? '<p>' + esc(LIB.site.desc) + '</p>' : '') + '</div>';

      var search = '<div class="search-wrap' + (searchOpen ? ' open' : '') + '" id="sp"><div>' +
        '<input class="search-input" id="sq" type="search" placeholder="搜索" value="' + esc(q) + '">' +
        '</div></div>';

      var body;
      if (!items.length) {
        body = '<div class="empty"><h2>还没有内容</h2><p>' +
          (isAuthor() ? '点右下角的按钮开始。' : '') + '</p></div>';
      } else if (!shown.length) {
        body = '<div class="empty"><p>没有匹配「' + esc(q) + '」的内容</p></div>';
      } else {
        body = '<div class="grid">' + shown.map(card).join('') + '</div>';
      }

      $('#app').innerHTML = head + search + body;

      var input = $('#sq');
      if (input) {
        input.addEventListener('input', debounce(function () {
          q = input.value;
          viewList();
        }, 160));
      }
      hydrateImages($('#app'));
      patchBlobs($('#app'));
    });
  }

  function card(it) {
    var media = '';
    if (it.type === 'image') {
      media = '<div class="card-cover"><img src="' + esc(it.path) + '" alt="" loading="lazy"></div>';
    } else if (it.type === 'note' && it.cover) {
      media = '<div class="card-cover"><img src="' + esc(it.cover) + '" alt="" loading="lazy"></div>';
    }
    var meta = [];
    if (it.date) meta.push('<span>' + esc(fmtDate(it.date)) + '</span>');
    if (it.type === 'page') meta.push('<span class="dot"></span><span>页面</span>');
    else if (it.type === 'image') meta.push('<span class="dot"></span><span>图片</span>');

    return '<a class="card' + (media ? '' : ' plain') + '" href="#/i/' + encodeURIComponent(it.id) + '">' + media +
      '<div class="card-body">' +
      '<h3>' + esc(it.title || '未命名') + '</h3>' +
      (it.summary ? '<p class="excerpt">' + esc(it.summary) + '</p>' : '') +
      '<div class="card-foot">' + meta.join('') + '</div>' +
      '</div></a>';
  }

  /* ---------------------------------------------------------
     视图：内容页
     --------------------------------------------------------- */
  function viewItem(r) {
    return loadLibrary().then(function () {
      var it = itemById(r.id);
      if (!it) {
        $('#app').innerHTML = '<div class="empty"><h2>内容不存在</h2></div>';
        return;
      }
      document.title = (it.title || '') + ' · ' + (LIB.site.title || '');

      var back = '<button class="back" id="back">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m15 18-6-6 6-6"/></svg>返回</button>';

      if (it.type === 'page') {
        renderPage(it, back);
      } else if (it.type === 'image') {
        $('#app').innerHTML = back + '<article class="article">' +
          '<header><h1>' + esc(it.title || '') + '</h1>' +
          '<div class="meta">' + metaHTML(it) + '</div></header>' +
          '<figure class="figure"><img src="' + esc(it.path) + '" alt="' + esc(it.title || '') + '"></figure>' +
          footHTML(it) + '</article>';
        afterItem(it);
      } else {
        readFile(it.path).then(function (raw) {
          var n = splitFront(raw);
          var body = n.body;
          var h1 = /^\s*#\s+(.+?)\s*(?:\r?\n|$)/.exec(body);
          var t = it.title || n.meta.title || '';
          if (h1 && h1[1].trim() === String(t).trim()) body = body.slice(h1[0].length);
          $('#app').innerHTML = back + '<article class="article">' +
            '<header><h1>' + esc(t) + '</h1>' +
            '<div class="meta">' + metaHTML(it) + '</div></header>' +
            '<div class="prose">' + markdown(body) + '</div>' +
            footHTML(it) + '</article>';
          hydrateImages($('#app'));
          patchBlobs($('#app'));
          afterItem(it);
        });
      }

      $('#back').addEventListener('click', function () {
        if (history.length > 1) history.back(); else go('#/');
      });
    });
  }

  function metaHTML(it) {
    var a = [];
    if (it.date) a.push('<span>' + esc(fmtDate(it.date)) + '</span>');
    (it.tags || []).forEach(function (t) { a.push('<span class="dot"></span><span>' + esc(t) + '</span>'); });
    return a.join('');
  }

  function footHTML(it) {
    var a = ['<button class="btn sm" id="a-link">复制链接</button>'];
    if (it.type === 'page') {
      a.push('<a class="btn sm" href="' + esc(it.path) + '" target="_blank" rel="noopener">新窗口打开</a>');
    }
    if (isAuthor()) {
      a.push('<a class="btn sm" href="#/edit/' + encodeURIComponent(it.id) + '">编辑</a>');
      a.push('<button class="btn sm danger" id="a-del">删除</button>');
    }
    return '<div class="article-foot">' + a.join('') + '</div>';
  }

  function renderPage(it, back) {
    var url = assetURL(it.path);
    $('#app').innerHTML = back + '<div class="article" style="max-width:100%">' +
      '<header><h1>' + esc(it.title || '') + '</h1>' +
      '<div class="meta">' + metaHTML(it) + '</div></header>' +
      '<div class="frame-wrap">' +
      '<div class="frame-bar"><span class="url">' + esc(it.path) + '</span><span class="grow"></span>' +
      '<a class="btn sm" href="' + esc(url) + '" target="_blank" rel="noopener">新窗口</a></div>' +
      '<iframe src="' + esc(it.path) + '" loading="lazy"></iframe>' +
      '</div>' + footHTML(it) + '</div>';
    afterItem(it);
  }

  function afterItem(it) {
    var link = $('#a-link');
    if (link) link.addEventListener('click', function () { copy(itemURL(it), '链接已复制'); });
    var del = $('#a-del');
    if (del) {
      del.addEventListener('click', function () {
        if (!confirm('删除「' + (it.title || '') + '」？')) return;
        del.disabled = true;
        queue(function () {
          var idx = LIB.items.map(function (x) { return x.id; }).indexOf(it.id);
          if (idx >= 0) LIB.items.splice(idx, 1);
          var files = [{ path: LIB_PATH, content: libJSON() }];
          if (it.path) files.push({ path: it.path, remove: true });
          return commit(files, '删除 ' + (it.title || it.id));
        }).then(function () {
          loaded = false;
          toast('已删除');
          go('#/');
        }).catch(function (e) {
          del.disabled = false;
          toast(friendly(e), 'err');
        });
      });
    }
  }

  /* ---------------------------------------------------------
     标记解析
     --------------------------------------------------------- */
  function splitFront(text) {
    var meta = {}, body = String(text || '');
    var m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(body);
    if (m) {
      body = body.slice(m[0].length);
      m[1].split(/\r?\n/).forEach(function (line) {
        var i = line.indexOf(':');
        if (i < 0) return;
        var k = line.slice(0, i).trim().toLowerCase();
        var v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
        if (!k) return;
        if (k === 'tags' || k === 'tag') {
          meta.tags = v.replace(/^\[|\]$/g, '').split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
        } else meta[k] = v;
      });
    }
    return { meta: meta, body: body };
  }

  function buildNote(it, body) {
    var L = ['---', 'title: ' + String(it.title || '').replace(/[\r\n]+/g, ' ')];
    if (it.tags && it.tags.length) L.push('tags: ' + it.tags.join(', '));
    L.push('date: ' + (it.date || today()));
    L.push('---', '', body || '');
    return L.join('\n');
  }

  /* ---------------------------------------------------------
     视图：编辑器
     --------------------------------------------------------- */
  function viewEdit(r) {
    if (!isAuthor()) {
      $('#app').innerHTML = '<div class="empty"><h2>需要访问令牌</h2>' +
        '<p><a href="#/settings" style="color:var(--accent)">前往设置</a></p></div>';
      return;
    }
    return loadLibrary().then(function () {
      if (r.id) {
        var it = itemById(r.id);
        if (!it) { go('#/'); return; }
        if (it.type === 'note') return noteEditor(it);
        if (it.type === 'image') return imageEditor(it);
        return pageEditor(it);
      }
      if (!r.type) return typeChooser();
      if (r.type === 'note') return noteEditor(null);
      if (r.type === 'image') return imageEditor(null);
      return pageEditor(null);
    });
  }

  function typeChooser() {
    document.title = '新建';
    $('#app').innerHTML = '<div class="panel">' +
      '<div class="page-head"><h1>新建</h1></div>' +
      '<div class="kinds">' +
      kindCard('note', '文字', 'Markdown 排版，可插入图片') +
      kindCard('image', '图片', '上传一张图片') +
      kindCard('page', '页面', '带交互的 HTML') +
      '</div></div>';
    $$('.kind').forEach(function (el) {
      el.addEventListener('click', function () { go('#/new/' + el.getAttribute('data-k')); });
    });
  }
  function kindCard(k, t, d) {
    return '<button class="kind" data-k="' + k + '"><div class="t">' + t + '</div><div class="d">' + d + '</div></button>';
  }

  /* ---------- 文字 ---------- */
  function noteEditor(it) {
    var isNew = !it;
    document.title = isNew ? '新建文字' : '编辑';
    var model = it || { id: '', type: 'note', title: '', date: today(), tags: [], path: '' };

    readFile(model.path || '__none__').then(function (raw) {
      var body = raw ? splitFront(raw).body : '';
      if (raw) {
        var fm = splitFront(raw);
        if (fm.meta.title) model.title = model.title || fm.meta.title;
      }

      $('#app').innerHTML = '<div class="panel" style="max-width:1000px">' +
        '<div class="page-head"><h1>' + (isNew ? '新建文字' : '编辑') + '</h1></div>' +
        '<div class="field"><input id="f-title" type="text" placeholder="标题" value="' + esc(model.title) + '"></div>' +
        '<div class="row">' +
        '<div class="field"><label>日期</label><input id="f-date" type="date" value="' + esc(model.date || today()) + '"></div>' +
        '<div class="field"><label>标签</label><input id="f-tags" type="text" placeholder="用逗号分隔" value="' + esc((model.tags || []).join(', ')) + '"></div>' +
        '</div>' +
        '<div class="split">' +
        '<div><textarea id="f-body" class="field code" style="width:100%;min-height:420px" placeholder="正文">' + esc(body) + '</textarea>' +
        '<div class="hint" style="color:var(--muted);font-size:12.5px;margin-top:6px">图片可直接粘贴或拖入</div></div>' +
        '<div class="preview" id="pv"></div>' +
        '</div>' +
        '<div class="form-actions">' +
        '<button class="btn primary" id="f-save">保存</button>' +
        '<button class="btn" id="f-img">插入图片</button>' +
        '<button class="btn ghost" id="f-cancel">取消</button>' +
        '<span class="spacer"></span><span class="count" id="f-count"></span>' +
        '</div>' +
        '<input type="file" id="f-file" accept="image/*" multiple hidden></div>';

      var ta = $('#f-body'), pv = $('#pv'), cnt = $('#f-count');
      function refresh() {
        pv.innerHTML = ta.value.trim() ? markdown(ta.value) : '<p class="ph">预览</p>';
        patchBlobs(pv);
        cnt.textContent = ta.value.length + ' 字';
      }
      ta.addEventListener('input', refresh);
      refresh();

      function insert(text) {
        var s = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
        var pre = (s > 0 && !/\n$/.test(ta.value.slice(0, s))) ? '\n' : '';
        ta.value = ta.value.slice(0, s) + pre + text + '\n' + ta.value.slice(ta.selectionEnd == null ? s : ta.selectionEnd);
        ta.focus();
        refresh();
      }

      function accept(files) {
        var list = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type); });
        if (!list.length) return;
        list.forEach(function (f) {
          var ph = '![](uploading-' + Math.random().toString(36).slice(2, 7) + ')';
          insert(ph);
          toast('正在上传…');
          uploadImage(f).then(function (p) {
            ta.value = ta.value.split(ph).join('![](' + p + ')');
            refresh();
            toast('图片已插入');
          }).catch(function (e) {
            ta.value = ta.value.split(ph).join('');
            refresh();
            toast(friendly(e), 'err');
          });
        });
      }

      $('#f-img').addEventListener('click', function () { $('#f-file').click(); });
      $('#f-file').addEventListener('change', function (e) { accept(e.target.files); e.target.value = ''; });
      ta.addEventListener('paste', function (e) {
        var items = (e.clipboardData && e.clipboardData.items) || [], fs = [];
        for (var i = 0; i < items.length; i++) {
          if (items[i].kind === 'file') { var f = items[i].getAsFile(); if (f) fs.push(f); }
        }
        if (fs.length) { e.preventDefault(); accept(fs); }
      });
      ta.addEventListener('dragover', function (e) { e.preventDefault(); ta.style.borderColor = 'var(--accent)'; });
      ta.addEventListener('dragleave', function () { ta.style.borderColor = ''; });
      ta.addEventListener('drop', function (e) {
        e.preventDefault(); ta.style.borderColor = '';
        if (e.dataTransfer && e.dataTransfer.files) accept(e.dataTransfer.files);
      });

      $('#f-cancel').addEventListener('click', function () { go(isNew ? '#/' : '#/i/' + encodeURIComponent(model.id)); });
      $('#f-save').addEventListener('click', function () {
        var title = $('#f-title').value.trim() || '未命名';
        var bodyText = ta.value;
        var item = {
          id: isNew ? slugify(title) : model.id,
          type: 'note',
          title: title,
          date: $('#f-date').value || today(),
          tags: $('#f-tags').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
          summary: plainText(bodyText, title),
          path: isNew ? 'content/' + slugify(title) + '.md' : model.path
        };
        var img = firstImage(bodyText);
        if (img && !/^https?:/i.test(img)) item.cover = img;
        if (isNew && itemById(item.id)) item.id = item.path = 'content/' + uid('n') + '.md';
        if (item.path.indexOf('content/') !== 0) item.path = 'content/' + item.path;

        var btn = $('#f-save');
        btn.disabled = true; btn.textContent = '保存中';
        queue(function () {
          var idx = LIB.items.map(function (x) { return x.id; }).indexOf(item.id);
          if (idx >= 0) {
            if (LIB.items[idx].path !== item.path) { /* 保留原路径 */ item.path = LIB.items[idx].path; }
            LIB.items[idx] = item;
          } else LIB.items.push(item);
          return commit([
            { path: item.path, content: buildNote(item, bodyText) },
            { path: LIB_PATH, content: libJSON() }
          ], (isNew ? '添加 ' : '更新 ') + title);
        }).then(function () {
          loaded = false;
          toast('已保存');
          go('#/i/' + encodeURIComponent(item.id));
        }).catch(function (e) {
          btn.disabled = false; btn.textContent = '保存';
          toast(friendly(e), 'err');
        });
      });
    });
  }

  /* ---------- 图片 ---------- */
  function imageEditor(it) {
    var isNew = !it;
    document.title = isNew ? '新建图片' : '编辑';
    var model = it || { id: '', type: 'image', title: '', date: today(), path: '' };

    $('#app').innerHTML = '<div class="panel">' +
      '<div class="page-head"><h1>' + (isNew ? '新建图片' : '编辑') + '</h1></div>' +
      '<div class="field"><input id="g-title" type="text" placeholder="标题" value="' + esc(model.title) + '"></div>' +
      '<div class="row">' +
      '<div class="field"><label>日期</label><input id="g-date" type="date" value="' + esc(model.date || today()) + '"></div>' +
      '<div class="field"><label>标签</label><input id="g-tags" type="text" placeholder="用逗号分隔" value="' + esc((model.tags || []).join(', ')) + '"></div>' +
      '</div>' +
      (isNew
        ? '<div class="drop" id="g-drop">选择或拖入一张图片</div>'
        : '<img class="thumb" src="' + esc(model.path) + '" alt="">') +
      '<div class="form-actions">' +
      '<button class="btn primary" id="g-save"' + (isNew ? ' disabled' : '') + '>保存</button>' +
      '<button class="btn ghost" id="g-cancel">取消</button>' +
      '</div>' +
      '<input type="file" id="g-file" accept="image/*" hidden></div>';

    var picked = null;
    var drop = $('#g-drop');
    if (drop) {
      var pick = function () { $('#g-file').click(); };
      drop.addEventListener('click', pick);
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault(); drop.classList.remove('over');
        if (e.dataTransfer && e.dataTransfer.files[0]) take(e.dataTransfer.files[0]);
      });
      $('#g-file').addEventListener('change', function (e) {
        if (e.target.files[0]) take(e.target.files[0]);
        e.target.value = '';
      });
      function take(f) {
        if (!/^image\//.test(f.type)) { toast('请选择图片', 'err'); return; }
        picked = f;
        if (!picked) return;
        var url = URL.createObjectURL(f);
        drop.innerHTML = '<img src="' + url + '" style="max-height:300px;margin:0 auto;border-radius:8px">';
        drop.style.padding = '10px';
        var gs = $('#g-save'); if (gs) gs.disabled = false;
        if (!$('#g-title').value) $('#g-title').value = f.name.replace(/\.[^.]+$/, '');
      }
    }

    $('#g-cancel').addEventListener('click', function () { go(isNew ? '#/' : '#/i/' + encodeURIComponent(model.id)); });
    $('#g-save').addEventListener('click', function () {
      var btn = $('#g-save');
      btn.disabled = true; btn.textContent = '保存中';
      var title = $('#g-title').value.trim() || '未命名';
      var next = function (path) {
        var item = {
          id: isNew ? uid('i') : model.id, type: 'image', title: title,
          date: $('#g-date').value || today(),
          tags: $('#g-tags').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
          summary: '', path: path || model.path
        };
        return queue(function () {
          var idx = LIB.items.map(function (x) { return x.id; }).indexOf(item.id);
          if (idx >= 0) LIB.items[idx] = item; else LIB.items.push(item);
          return commit([{ path: LIB_PATH, content: libJSON() }], (isNew ? '添加图片 ' : '更新 ') + title);
        }).then(function () { return item; });
      };
      (isNew ? uploadImage(picked).then(next) : next(model.path))
        .then(function (item) {
          loaded = false;
          toast('已保存');
          go('#/i/' + encodeURIComponent(item.id));
        })
        .catch(function (e) {
          btn.disabled = false; btn.textContent = '保存';
          toast(friendly(e), 'err');
        });
    });
  }

  /* ---------- 页面 ---------- */
  function pageEditor(it) {
    var isNew = !it;
    document.title = isNew ? '新建页面' : '编辑';
    var model = it || { id: '', type: 'page', title: '', date: today(), path: '' };

    $('#app').innerHTML = '<div class="panel">' +
      '<div class="page-head"><h1>' + (isNew ? '新建页面' : '编辑') + '</h1></div>' +
      '<div class="field"><input id="h-title" type="text" placeholder="标题" value="' + esc(model.title) + '"></div>' +
      '<div class="row">' +
      '<div class="field"><label>日期</label><input id="h-date" type="date" value="' + esc(model.date || today()) + '"></div>' +
      '<div class="field"><label>标签</label><input id="h-tags" type="text" placeholder="用逗号分隔" value="' + esc((model.tags || []).join(', ')) + '"></div>' +
      '</div>' +
      (isNew ? '<div class="drop" id="h-drop">选择或拖入一个 .html 文件</div>' : '') +
      '<div class="field" style="margin-top:16px"><label>HTML</label>' +
      '<textarea id="h-code" class="field code" style="width:100%;min-height:320px" placeholder="&lt;!DOCTYPE html&gt;…"></textarea></div>' +
      '<div class="form-actions">' +
      '<button class="btn primary" id="h-save">保存</button>' +
      '<button class="btn ghost" id="h-cancel">取消</button>' +
      '</div>' +
      '<input type="file" id="h-file" accept=".html,.htm,text/html" hidden></div>';

    if (!isNew) {
      readFile(model.path).then(function (raw) { $('#h-code').value = raw || ''; });
    }

    var drop = $('#h-drop');
    if (drop) {
      var take = function (f) {
        if (!/\.html?$/i.test(f.name) && f.type !== 'text/html') { toast('请选择 .html 文件', 'err'); return; }
        var fr = new FileReader();
        fr.onload = function () {
          $('#h-code').value = fr.result;
          if (!$('#h-title').value) $('#h-title').value = f.name.replace(/\.html?$/i, '');
          drop.textContent = '已载入 ' + f.name;
        };
        fr.readAsText(f);
      };
      drop.addEventListener('click', function () { $('#h-file').click(); });
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault(); drop.classList.remove('over');
        if (e.dataTransfer && e.dataTransfer.files[0]) take(e.dataTransfer.files[0]);
      });
      $('#h-file').addEventListener('change', function (e) {
        if (e.target.files[0]) take(e.target.files[0]);
        e.target.value = '';
      });
    }

    $('#h-cancel').addEventListener('click', function () { go(isNew ? '#/' : '#/i/' + encodeURIComponent(model.id)); });
    $('#h-save').addEventListener('click', function () {
      var code = $('#h-code').value;
      if (!code.trim()) { toast('内容为空', 'err'); return; }
      var title = $('#h-title').value.trim() || '未命名';
      var id = isNew ? uid('p') : model.id;
      var path = isNew ? 'content/pages/' + id + '.html' : model.path;
      var item = {
        id: id, type: 'page', title: title, date: $('#h-date').value || today(),
        tags: $('#h-tags').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
        summary: '', path: path
      };
      var btn = $('#h-save');
      btn.disabled = true; btn.textContent = '保存中';
      queue(function () {
        var idx = LIB.items.map(function (x) { return x.id; }).indexOf(item.id);
        if (idx >= 0) LIB.items[idx] = item; else LIB.items.push(item);
        return commit([
          { path: path, content: code },
          { path: LIB_PATH, content: libJSON() }
        ], (isNew ? '添加页面 ' : '更新 ') + title);
      }).then(function () {
        loaded = false;
        toast('已保存');
        go('#/i/' + encodeURIComponent(item.id));
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = '保存';
        toast(friendly(e), 'err');
      });
    });
  }

  /* ---------------------------------------------------------
     视图：设置
     --------------------------------------------------------- */
  function viewSettings() {
    document.title = '设置';
    $('#app').innerHTML = '<div class="panel">' +
      '<div class="page-head"><h1>设置</h1></div>' +
      '<div class="field"><label>站点标题</label><input id="s-title" type="text" value="' + esc(LIB.site.title || CFG.title || '') + '"></div>' +
      '<div class="field"><label>站点副标题</label><input id="s-desc" type="text" value="' + esc(LIB.site.desc || CFG.desc || '') + '"></div>' +
      '<div class="row">' +
      '<div class="field"><label>GitHub 用户名</label><input id="s-owner" type="text" value="' + esc(CFG.owner) + '"></div>' +
      '<div class="field"><label>仓库名</label><input id="s-repo" type="text" value="' + esc(CFG.repo) + '"></div>' +
      '</div>' +
      '<div class="field"><label>访问令牌</label><input id="s-token" type="password" value="' + esc(getToken()) + '">' +
      '<div class="hint">仅保存在本浏览器。需要 <code>repo</code> 和 <code>workflow</code> 权限。</div></div>' +
      '<div id="s-msg"></div>' +
      '<div class="form-actions">' +
      '<button class="btn primary" id="s-save">保存</button>' +
      '<button class="btn" id="s-test">测试连接</button>' +
      '<button class="btn ghost" id="s-clear">清除令牌</button>' +
      '</div></div>';

    $('#s-save').addEventListener('click', function () {
      CFG.owner = $('#s-owner').value.trim();
      CFG.repo = $('#s-repo').value.trim();
      setToken($('#s-token').value.trim());
      saveCfg();
      var title = $('#s-title').value.trim(), desc = $('#s-desc').value.trim();
      if (isAuthor() && configured() && (title !== LIB.site.title || desc !== LIB.site.desc)) {
        LIB.site = { title: title, desc: desc };
        queue(function () {
          return commit([{ path: LIB_PATH, content: libJSON() }], '更新站点信息');
        }).then(function () { loaded = false; toast('已保存'); go('#/'); })
          .catch(function (e) { toast(friendly(e), 'err'); });
      } else {
        toast('已保存');
        go('#/');
      }
    });

    $('#s-clear').addEventListener('click', function () {
      setToken(''); $('#s-token').value = ''; toast('已清除');
    });

    $('#s-test').addEventListener('click', function () {
      CFG.owner = $('#s-owner').value.trim();
      CFG.repo = $('#s-repo').value.trim();
      setToken($('#s-token').value.trim());
      saveCfg();
      var box = $('#s-msg');
      box.innerHTML = '<div class="notice">检查中…</div>';
      gh(rp('')).then(function (info) {
        var w = info.permissions && info.permissions.push;
        box.innerHTML = '<div class="notice ok">' + esc(info.full_name) +
          (w ? ' · 可写入' : ' · 只读') + '</div>';
      }).catch(function (e) {
        box.innerHTML = '<div class="notice err">' + esc(friendly(e)) + '</div>';
      });
    });
  }

  /* ---------------------------------------------------------
     渲染
     --------------------------------------------------------- */
  function render() {
    var r = route();
    $('#fab').className = (isAuthor() && r.v !== 'edit' && r.v !== 'settings') ? 'show' : '';
    $('#btn-search').style.display = (r.v === 'list') ? '' : 'none';
    if (r.v !== 'list' && r.v !== 'settings') $('#site-title').textContent = LIB.site.title || CFG.title || '';

    if (!configured() && r.v !== 'settings') {
      $('#app').innerHTML = '<div class="empty"><h2>尚未配置</h2>' +
        '<p><a href="#/settings" style="color:var(--accent)">前往设置</a></p></div>';
      return;
    }

    if (r.v === 'settings') {
      loadLibrary().then(viewSettings);
      return;
    }

    $('#app').innerHTML = spin();
    var p;
    if (r.v === 'list') p = viewList();
    else if (r.v === 'item') p = viewItem(r);
    else p = viewEdit(r);

    if (p && p.catch) {
      p.catch(function (e) {
        $('#app').innerHTML = '<div class="empty"><h2>出错了</h2><p>' + esc(friendly(e)) + '</p></div>';
      });
    }
  }

  /* ---------------------------------------------------------
     启动
     --------------------------------------------------------- */
  $('#btn-search').addEventListener('click', function () {
    searchOpen = !searchOpen;
    var sp = $('#sp');
    if (sp) { sp.classList.toggle('open', searchOpen); if (searchOpen) $('#sq').focus(); }
    else { searchOpen = true; viewList().then(function () { $('#sq').focus(); }); }
  });

  $('#fab').addEventListener('click', function () { go('#/new'); });

  window.addEventListener('hashchange', render);
  window.addEventListener('scroll', function () {
    $('#topbar').classList.toggle('scrolled', window.scrollY > 4);
  }, { passive: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
