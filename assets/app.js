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
    var raw = location.hash.replace(/^#/, '') || '/';
    // hash 里可能带查询串（#/?tag=ENSO），先切出来
    var qi = raw.indexOf('?');
    var query = {};
    if (qi >= 0) {
      raw.slice(qi + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        var i = kv.indexOf('=');
        var k = i < 0 ? kv : kv.slice(0, i);
        var v = i < 0 ? '' : kv.slice(i + 1);
        try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { }
        query[k] = v;
      });
      raw = raw.slice(0, qi);
    }

    var seg = raw.split('/').filter(Boolean).map(function (s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });

    if (!seg.length) return { v: 'list', query: query };
    if (seg[0] === 'i' && seg[1]) return { v: 'item', id: seg.slice(1).join('/') };
    if (seg[0] === 'new') return { v: 'edit', type: seg[1] || null, id: null };
    if (seg[0] === 'edit' && seg[1]) return { v: 'edit', id: seg.slice(1).join('/'), type: null };
    if (seg[0] === 'settings') return { v: 'settings' };
    return { v: 'list', query: query };
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

  /* 类型的中文名与排序权重 */
  var TYPE_LABEL = { page: '交互页', note: '笔记', video: '视频', image: '图片' };
  var TYPE_ORDER = ['page', 'note', 'video', 'image'];

  var FOLD_LIMIT = 8;   // 航线清单默认最多显示这么多条

  /** 站点名：索引里的 title 优先，其次 config.js，最后兜底 */
  function siteTitle() {
    var a = (LIB.site && LIB.site.title) || '';
    if (a) return a;
    var b = (CFG.siteTitle || CFG.title || '').trim();
    return (b && b !== '我的空间') ? b : 'One Piece 物理海洋知识库';
  }

  /** 当前筛选条件（从 hash 查询串读，可分享、可后退） */
  function listFilter(r) {
    var Q = (r && r.query) || {};
    var tags = Object.keys(tagMap());
    var tag = Q.tag && tags.indexOf(Q.tag) >= 0 ? Q.tag : '';
    var type = TYPE_ORDER.indexOf(Q.type) >= 0 ? Q.type : '';
    return { tag: tag, type: type, all: Q.all === '1' };
  }

  /** 标签 → 条目数（导航用；按条目数倒序，再按字典序） */
  function tagMap() {
    var m = {};
    LIB.items.forEach(function (it) {
      (it.tags || []).forEach(function (t) {
        t = String(t).trim();
        if (!t) return;
        m[t] = (m[t] || 0) + 1;
      });
    });
    return m;
  }

  /** 改筛选条件并写回 hash（保留 q 之外的其它参数） */
  function setListQuery(patch) {
    var r = route();
    var Q = Object.assign({}, r.query || {}, patch);
    Object.keys(Q).forEach(function (k) {
      if (Q[k] === '' || Q[k] === null || Q[k] === undefined) delete Q[k];
    });
    var qs = Object.keys(Q).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(Q[k]);
    }).join('&');
    go(qs ? '#/?' + qs : '#/');
  }

  /* ---------- 第一段：身份宣言 ---------- */
  function heroHTML() {
    var site = LIB.site || {};
    var desc = (site.desc || '').trim();
    var coords = (site.coords || '').trim();

    var years = LIB.items.map(function (i) { return String(i.date || '').slice(0, 4); })
      .filter(function (y) { return /^\d{4}$/.test(y); }).sort();
    var span = years.length ? (years[0] === years[years.length - 1] ? years[0] : years[0] + '–' + years[years.length - 1]) : '';

    var stats = [];
    if (LIB.items.length) stats.push([String(LIB.items.length), '篇内容']);
    if (span) stats.push([span, '覆盖时段']);
    stats.push(['NOAA', '数据来源']);

    return '<section class="hero">' +
      (coords ? '<p class="coord">' + esc(coords) + '</p>' : '') +
      '<h1>' + esc(siteTitle()) + '</h1>' +
      (desc ? '<p class="sub">' + esc(desc) + '</p>' : '') +
      (stats.length ? '<div class="stats">' + stats.map(function (s) {
        return '<div class="stat"><div class="n">' + esc(s[0]) + '</div>' +
          '<div class="l">' + esc(s[1]) + '</div></div>';
      }).join('') + '</div>' : '') +
      '</section>';
  }

  /* ---------- 第二段：从这里开始（人工精选） ---------- */
  function featuredItems() {
    var ids = (LIB.site && LIB.site.featured) || [];
    var out = [];
    ids.forEach(function (id) {
      var it = itemById(id);
      if (it && out.indexOf(it) < 0) out.push(it);
    });
    // 精选为空时退回 pin 最小的几条，保证新站也不空着
    if (!out.length) {
      out = LIB.items.filter(function (it) { return it.pin != null; })
        .sort(function (a, b) { return Number(a.pin) - Number(b.pin); });
    }
    return out.slice(0, 4);
  }

  function featuredHTML() {
    var list = featuredItems();
    if (!list.length) return '';
    return '<section class="featured">' +
      '<div class="sec-head"><h2>从这里开始</h2><span class="line"></span></div>' +
      '<div class="grid">' + list.map(function (it, i) {
        return featuredCard(it, i + 1);
      }).join('') + '</div></section>';
  }

  function featuredCard(it, n) {
    var img = it.type === 'image' ? it.path : it.cover;
    var media = img
      ? '<div class="card-cover' + (it.type === 'video' ? ' playable' : '') + '">' +
        '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async">' +
        (it.type === 'video' ? '<span class="play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' : '') +
        '</div>'
      : '';
    return '<a class="card feat' + (media ? '' : ' plain') + '" href="#/i/' + encodeURIComponent(it.id) + '">' +
      media +
      '<div class="card-body">' +
      '<span class="feat-no">' + pad(n) + '</span>' +
      '<h3>' + esc(it.title || '未命名') + '</h3>' +
      (it.summary ? '<p class="excerpt">' + esc(it.summary) + '</p>' : '') +
      '<div class="card-foot">' + footMeta(it) + '</div>' +
      '</div></a>';
  }

  function footMeta(it) {
    var meta = [];
    if (it.date) meta.push('<span>' + esc(fmtDate(it.date)) + '</span>');
    if (TYPE_LABEL[it.type]) meta.push('<span class="dot"></span><span>' + TYPE_LABEL[it.type] + '</span>');
    return meta.join('');
  }

  /* ---------- 第三段：航线清单 ---------- */
  /**
   * 航线式条目。
   * @param {object} it        条目
   * @param {Array}  parts     搜索关键词（用于高亮，可选）
   * @param {string} snippet   全文命中处的摘要（优先于 it.summary，可选）
   */
  function stopHTML(it, parts, snippet) {
    var tags = (it.tags || []).slice(0, 3);
    var text = snippet || it.summary || '';
    return '<a class="stop" href="#/i/' + encodeURIComponent(it.id) + '">' +
      '<div class="co">' + esc(fmtDate(it.date) || '—') + '</div>' +
      '<div>' +
      '<h3>' + (parts && parts.length ? highlight(it.title || '未命名', parts) : esc(it.title || '未命名')) + '</h3>' +
      (text ? '<p>' + (parts && parts.length ? highlight(text, parts) : esc(text)) + '</p>' : '') +
      (tags.length ? '<div class="tags">' + tags.map(function (t) {
        return '<span class="tag">' +
          (parts && parts.length ? highlight(t, parts) : esc(t)) + '</span>';
      }).join('') + '</div>' : '') +
      '</div>' +
      '<div class="kind">' + esc(it.type) + '</div>' +
      '</a>';
  }

  /* ---------- 导航：主题 + 类型筛选 ---------- */
  function navHTML(f) {
    var tags = tagMap();
    var names = Object.keys(tags).sort(function (a, b) {
      return tags[b] - tags[a] || a.localeCompare(b, 'zh');
    });
    if (!names.length && !LIB.items.length) return '';

    function chip(label, on, key, val) {
      return '<button class="chip' + (on ? ' on' : '') + '" data-k="' + esc(key) + '" data-v="' + esc(val) + '"' +
        (on ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(label) + '</button>';
    }

    var rows = [];

    if (names.length) {
      rows.push('<div class="nav-row"><span class="nav-label">主题</span>' +
        chip('全部', !f.tag, 'tag', '') +
        names.map(function (n) {
          return chip(n + ' ' + tags[n], f.tag === n, 'tag', n);
        }).join('') +
        '</div>');
    }

    var types = TYPE_ORDER.filter(function (t) {
      return LIB.items.some(function (i) { return i.type === t; });
    });
    if (types.length > 1) {
      rows.push('<div class="nav-row"><span class="nav-label">类型</span>' +
        chip('全部', !f.type, 'type', '') +
        types.map(function (t) {
          var n = LIB.items.filter(function (i) { return i.type === t; }).length;
          return chip(TYPE_LABEL[t] + ' ' + n, f.type === t, 'type', t);
        }).join('') +
        '</div>');
    }

    return rows.length ? '<nav class="filters" aria-label="内容筛选">' + rows.join('') + '</nav>' : '';
  }

  /* ---------------------------------------------------------
     全文搜索
     索引由 tools/build-index.mjs 生成，按需懒加载：
     首页首屏不下载它，只有用户真的搜索时才取。
     --------------------------------------------------------- */
  var SEARCH_PATH = 'data/search-index.json';
  var SIDX = null;
  var sidxPromise = null;

  function loadSearchIndex() {
    if (SIDX) return Promise.resolve(SIDX);
    if (sidxPromise) return sidxPromise;          // 单飞：并发只请求一次
    sidxPromise = staticRead(SEARCH_PATH).then(function (raw) {
      var o = null;
      try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
      SIDX = (o && Array.isArray(o.items)) ? o.items : [];
      sidxPromise = null;
      return SIDX;
    }).catch(function () { SIDX = []; sidxPromise = null; return SIDX; });
    return sidxPromise;
  }

  /** 关键词 → 可安全放进 RegExp 的片段（含中英混排） */
  function kwParts(kw) {
    return String(kw || '').split(/\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** 在正文里找「第一个命中的词周围」做摘要，方便用户看清为什么匹配 */
  function bestSnippet(body, summary, parts, len) {
    len = len || 96;
    var b = String(body || '');
    var lower = b.toLowerCase();
    var at = -1, hit = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].toLowerCase();
      var idx = lower.indexOf(p);
      // 取所有词里最靠前的那次命中
      if (idx >= 0 && (at < 0 || idx < at)) { at = idx; hit = parts[i]; }
    }
    if (at < 0) return summary || b.slice(0, len);

    // 往前留一点上下文，尽量从词边界开始
    var start = Math.max(0, at - Math.floor(len / 3));
    var cut = b.slice(start, start + len);
    return (start > 0 ? '…' : '') + cut.trim() + (start + len < b.length ? '…' : '');
  }

  /** 把命中的关键词包成 <mark>，其余部分转义 */
  function highlight(text, parts) {
    var s = String(text || '');
    if (!parts.length) return esc(s);
    var re = new RegExp('(' + parts.map(escapeRe).join('|') + ')', 'ig');
    // 先切分再逐段转义，避免把用户输入当 HTML
    var out = '', last = 0, m;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) out += esc(s.slice(last, m.index));
      out += '<mark>' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
      if (m[0] === '') re.lastIndex++;            // 防零宽死循环
    }
    out += esc(s.slice(last));
    return out;
  }

  /** 用全文索引过滤；索引没加载好时退回标题/摘要匹配 */
  function searchItems(all, kw) {
    var parts = kwParts(kw);
    if (!parts.length) return all;
    var lowerParts = parts.map(function (p) { return p.toLowerCase(); });

    // 索引里以 id 为键，便于把正文挂回条目
    var byId = {};
    if (SIDX) SIDX.forEach(function (x) { byId[x.id] = x; });

    return all.map(function (it) {
      var rec = byId[it.id];
      var title = String(it.title || '').toLowerCase();
      var sum = String(it.summary || '').toLowerCase();
      var tags = (it.tags || []).join(' ').toLowerCase();
      var body = rec ? String(rec.body || '').toLowerCase() : '';

      var score = 0, snippets = [];
      lowerParts.forEach(function (p) {
        if (title.indexOf(p) >= 0) score += 100;
        if (tags.indexOf(p) >= 0) score += 50;
        if (sum.indexOf(p) >= 0) score += 20;
        if (body.indexOf(p) >= 0) score += 10;
      });
      if (!score) return null;

      // 命中在正文里而摘要没体现时，换一段更贴切的摘要
      if (rec && !lowerParts.some(function (p) { return sum.indexOf(p) >= 0; }) &&
        lowerParts.some(function (p) { return body.indexOf(p) >= 0; })) {
        snippets.push(bestSnippet(rec.body, it.summary, parts));
      } else if (it.summary) {
        snippets.push(it.summary);
      }
      return { it: it, score: score, snippet: snippets[0] || '' };
    }).filter(Boolean);
  }

  /* ---------- 第四段：出门票 ---------- */
  /**
   * 出门票：首页最底部的卡片墙，用来汇总各人的作品。
   * 数据来自 data/library.json 的 site.tickets，人工维护、自己复制粘贴。
   * 每项：{ no, title, desc, href, img }
   */
  function ticketsHTML() {
    var list = (LIB.site && LIB.site.tickets) || [];
    var head = '<div class="sec-head"><h2>出门票</h2><span class="line"></span>' +
      '<span class="more">' + (list.length ? list.length + ' 张' : '待补充') + '</span></div>';

    if (!list.length) {
      return '<section class="tickets" id="tickets">' + head +
        '<p class="tickets-note">这里还没有内容。' +
        (isAuthor() ? '在 data/library.json 的 site.tickets 里粘贴你的出门票即可。' : '') +
        '</p></section>';
    }

    return '<section class="tickets" id="tickets">' + head +
      '<div class="ticket-grid">' + list.map(function (t, i) {
        var no = String(t.no != null ? t.no : i + 1);
        var inner =
          (t.img ? '<div class="ticket-img"><img src="' + esc(t.img) + '" alt="" loading="lazy" decoding="async"></div>' : '') +
          '<div class="ticket-body">' +
          '<span class="ticket-no">' + esc(no.length < 2 ? '0' + no : no) + '</span>' +
          '<h3>' + esc(t.title || ('出门票 ' + no)) + '</h3>' +
          (t.desc ? '<p>' + esc(t.desc) + '</p>' : '') +
          '</div>';
        // 有链接就整张可点，没有就退化成静态卡片，避免出现死链
        return t.href
          ? '<a class="ticket" href="' + esc(t.href) + '" target="_blank" rel="noopener">' + inner + '</a>'
          : '<div class="ticket">' + inner + '</div>';
      }).join('') + '</div></section>';
  }

  function viewList(r) {
    var f = listFilter(r);
    return loadLibrary().then(function () {
      // 站点标题/描述在 loadLibrary 之后才可用，这里再定一次
      f = listFilter(r);
      // 有搜索词时才去取全文索引（首页首屏不该为它买单）
      if (!q.trim()) return null;
      return loadSearchIndex();
    }).then(function () {

      var all = sorted();
      var tagOn = f.tag, typeOn = f.type;
      var kw = q.trim();

      // 先按主题/类型过滤，再交给搜索（搜索需要标题/正文线索）
      var pool = all.filter(function (it) {
        if (typeOn && it.type !== typeOn) return false;
        if (tagOn && (it.tags || []).indexOf(tagOn) < 0) return false;
        return true;
      });

      var results = null;      // [{ it, score, snippet }]，有搜索词时才有值
      if (kw) {
        results = searchItems(pool, kw);
        results.sort(function (a, b) { return b.score - a.score; });
      }
      var shown = results ? results.map(function (r2) { return r2.it; }) : pool;
      var snippetById = {};
      if (results) results.forEach(function (r2) { if (r2.snippet) snippetById[r2.it.id] = r2.snippet; });

      var parts = kwParts(kw);
      var filtering = !!(tagOn || typeOn || kw);

      document.title = siteTitle();
      $('#site-title').textContent = document.title;

      var search = '<div class="search-wrap' + (searchOpen ? ' open' : '') + '" id="sp"><div>' +
        '<label class="sr" for="sq">搜索内容</label>' +
        '<input class="search-input" id="sq" type="search" placeholder="搜索标题、正文、标签（Ctrl+K）" value="' + esc(q) + '">' +
        '</div></div>';

      var body;
      if (!all.length) {
        body = '<div class="empty"><h2>还没有内容</h2><p>' +
          (isAuthor() ? '点右下角的按钮开始。' : '') + '</p></div>';
      } else if (!shown.length) {
        body = '<div class="empty"><h2>没有匹配的内容</h2><p>' +
          (kw ? '换个关键词试试，或在其它主题里找找' : '换个主题或类型试试') + '</p></div>';
      } else {
        // 筛选或搜索时全量展示；否则按「精选 → 最近」三段式呈现
        var head, list, foot = '';

        if (filtering) {
          head = '<div class="sec-head"><h2>' + (kw ? '搜索结果' : '筛选结果') + '</h2><span class="line"></span>' +
            '<span class="more">' + shown.length + ' 篇' + (kw ? ' · 按相关度' : '') + '</span></div>';
          list = shown;
        } else {
          var folded = !f.all && shown.length > FOLD_LIMIT;
          head = '<div class="sec-head"><h2>航路 · 全部内容</h2><span class="line"></span>' +
            '<span class="more">共 ' + shown.length + ' 篇 · 按时间</span></div>';
          list = folded ? shown.slice(0, FOLD_LIMIT) : shown;
          if (folded) {
            foot = '<div class="fold-bar"><button class="btn" id="show-all">查看全部 ' +
              shown.length + ' 篇</button></div>';
          } else if (f.all && shown.length > FOLD_LIMIT) {
            foot = '<div class="fold-bar"><button class="btn ghost" id="show-less">收起</button></div>';
          }
        }

        body = head + '<div class="route">' + list.map(function (it) {
          return stopHTML(it, parts, snippetById[it.id]);
        }).join('') + '</div>' + foot;
      }

      // 三段式：筛选状态下不再显示宣言与精选，避免干扰
      var prefix = filtering
        ? ''
        : (heroHTML() + featuredHTML() + navHTML(f) + search + body + ticketsHTML());
      var html = filtering ? (search + body) : prefix;
      $('#app').innerHTML = html;

      wireList(r, f);
      hydrateImages($('#app'));
      patchBlobs($('#app'));
    });
  }

  function wireList(r, f) {
    var input = $('#sq');
    if (input) {
      input.addEventListener('input', debounce(function () {
        q = input.value;
        viewList(route());
      }, 160));
    }

    $$('.chip', $('#app')).forEach(function (el) {
      el.addEventListener('click', function () {
        var k = el.getAttribute('data-k');
        var v = el.getAttribute('data-v');
        // 再点一次已选中的主题＝取消选择
        var cur = k === 'tag' ? f.tag : f.type;
        var patch = {};
        patch[k] = (cur === v) ? '' : v;
        patch.all = '';
        setListQuery(patch);
      });
    });

    var more = $('#show-all');
    if (more) more.addEventListener('click', function () { setListQuery({ all: '1' }); });
    var less = $('#show-less');
    if (less) less.addEventListener('click', function () { setListQuery({ all: '' }); });
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
      document.title = (it.title || '') + ' · ' + siteTitle();

      var back = '<button class="back" id="back">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>返回</button>';

      if (it.type === 'video') {
        $('#app').innerHTML = back + '<article class="article wide">' +
          '<header><h1>' + esc(it.title || '') + '</h1>' +
          '<div class="meta">' + metaHTML(it) + '</div></header>' +
          '<div class="frame-wrap"><video src="' + esc(it.path) + '" controls preload="metadata" playsinline></video></div>' +
          footHTML(it) + '</article>';
        afterItem(it);
        return;
      }
      if (it.type === 'page') {
        renderPage(it, back);
      } else if (it.type === 'image') {
        $('#app').innerHTML = back + '<article class="article">' +
          '<header><h1>' + esc(it.title || '') + '</h1>' +
          '<div class="meta">' + metaHTML(it) + '</div></header>' +
          '<figure class="figure"><img src="' + esc(it.path) + '" alt="' + esc(it.title || '') + '"></figure>' +
          footHTML(it) + '</article>';
        wireLightbox();
        afterItem(it);
      } else {
        readFile(it.path).then(function (raw) {
          var n = splitFront(raw);
          var body = n.body;
          var h1 = /^\s*#\s+(.+?)\s*(?:\r?\n|$)/.exec(body);
          var t = it.title || n.meta.title || '';
          if (h1 && h1[1].trim() === String(t).trim()) body = body.slice(h1[0].length);

          var st = proseStats(body);
          $('#app').innerHTML = back + '<article class="article">' +
            '<header><h1>' + esc(t) + '</h1>' +
            '<div class="meta">' + metaHTML(it) +
            '<span class="dot"></span><span>约 ' + st.minutes + ' 分钟</span>' +
            '</div></header>' +
            '<div class="prose">' + markdown(body) + '</div>' +
            footHTML(it) + '</article>';

          var toc = enhanceProse($('.prose', $('#app')));
          if (toc.length >= 3) {
            // 目录插在 header 之后、正文之前；宽屏时靠 CSS 吸附到左侧
            var art = $('.article', $('#app'));
            art.insertAdjacentHTML('afterbegin', '<div class="toc-slot">' + tocHTML(toc) + '</div>');
          }
          wireToc();
          wireLightbox();
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

  /* ---------------------------------------------------------
     正文增强：目录 / 阅读时长 / 代码复制 / 图片放大 / 表格出血
     --------------------------------------------------------- */

  var CJK_PER_MIN = 350;   // 中文阅读速度（字/分钟）
  var WORD_PER_MIN = 200;  // 西文阅读速度（词/分钟）

  /** 去掉代码块与 Markdown 标记后统计正文长度 */
  function proseStats(body) {
    var s = String(body || '')
      .replace(/(`{3,})[\s\S]*?\1/g, ' ')       // 围栏代码块
      .replace(/`[^`]*`/g, ' ')                  // 行内代码
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')     // 图片
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // 链接保留文字
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/[*_~>|]/g, ' ');
    var cjk = (s.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
    var words = (s.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, ' ')
      .match(/[A-Za-z0-9][A-Za-z0-9'’\-]*/g) || []).length;
    var minutes = cjk / CJK_PER_MIN + words / WORD_PER_MIN;
    return { cjk: cjk, words: words, minutes: Math.max(1, Math.round(minutes)) };
  }

  /** 把 marked 的输出变成适合阅读的形态，并抽出目录 */
  function enhanceProse(root) {
    if (!root) return [];

    // 1) 抽目录。
    //    注意：绝不能用 href="#id" 做锚点 —— 本站用 hash 路由，
    //    href="#某标题" 会把 #/i/xxx 直接冲掉、整页重渲染成首页。
    //    所以只记序号，跳转全部走 scrollIntoView。
    var toc = [];
    $$('h2, h3', root).forEach(function (h, i) {
      h.dataset.hi = String(i);
      // 为了可分享/可深链，id 仍然写上，但目录链接不依赖它
      h.id = 'sec-' + (i + 1);
      toc.push({ i: i, text: String(h.textContent || '').trim(), level: h.tagName === 'H3' ? 3 : 2 });
    });

    // 2) 表格包一层，窄屏可横向滑动
    $$('table', root).forEach(function (tb) {
      if (tb.parentNode && tb.parentNode.classList && tb.parentNode.classList.contains('table-scroll')) return;
      var box = document.createElement('div');
      box.className = 'table-scroll';
      box.setAttribute('role', 'region');
      box.setAttribute('tabindex', '0');
      box.setAttribute('aria-label', '可横向滚动的表格');
      tb.parentNode.insertBefore(box, tb);
      box.appendChild(tb);
    });

    // 3) 代码块加复制按钮与语言标签
    $$('pre', root).forEach(function (pre) {
      if (pre.parentNode && pre.parentNode.classList && pre.parentNode.classList.contains('code-block')) return;
      var codeEl = pre.querySelector('code');
      var raw = codeEl ? codeEl.textContent : pre.textContent;

      var box = document.createElement('div');
      box.className = 'code-block';
      pre.parentNode.insertBefore(box, pre);
      box.appendChild(pre);

      var cls = (codeEl && codeEl.className) || '';
      var m = /language-([\w+#-]+)/i.exec(cls);
      if (m) {
        var lg = document.createElement('span');
        lg.className = 'code-lang';
        lg.textContent = m[1];
        box.appendChild(lg);
      }

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy';
      btn.setAttribute('aria-label', '复制代码');
      btn.textContent = '复制';
      btn.addEventListener('click', function () {
        copy(raw, '代码已复制');
        btn.textContent = '已复制';
        btn.classList.add('done');
        setTimeout(function () { btn.textContent = '复制'; btn.classList.remove('done'); }, 1600);
      });
      box.appendChild(btn);
    });

    // 4) 图片可点击放大，同时把有意义的 alt 作为图注
    $$('img', root).forEach(function (img) {
      if (img.closest('a')) return;                  // 已经是链接的不动
      if (img.dataset.zoomable) return;
      img.dataset.zoomable = '1';
      img.classList.add('zoomable');
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      var alt = (img.getAttribute('alt') || '').trim();
      img.setAttribute('aria-label', alt ? '放大图片：' + alt : '放大图片');

      // alt 太短或看着像文件名就不当图注，避免「image.png」这种噪音
      var looksLikeFile = /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(alt);
      if (alt && alt.length >= 4 && !looksLikeFile && !img.closest('figure, .figure')) {
        var cap = document.createElement('span');
        cap.className = 'fig-cap';
        cap.textContent = alt;
        var anchor = img.parentNode;
        // 若图片单独占一个段落，图注放到段落之后，避免撑破行内布局
        if (anchor && anchor.tagName === 'P' && anchor.textContent.trim() === alt) {
          anchor.parentNode.insertBefore(cap, anchor.nextSibling);
        } else {
          anchor.insertBefore(cap, img.nextSibling);
        }
      }
    });

    return toc;
  }

  /** 目录（宽屏左侧固定，窄屏折叠在正文上方） */
  function tocHTML(toc) {
    if (toc.length < 3) return '';   // 太短没必要给目录
    // href 用 "#" 占位而非 "#id"：本站是 hash 路由，真实锚点会破坏路由
    var items = toc.map(function (t) {
      return '<a class="toc-link' + (t.level === 3 ? ' lv3' : '') + '" href="#" role="link" data-i="' +
        t.i + '">' + esc(t.text) + '</a>';
    }).join('');
    return '<details class="toc-narrow" open><summary>目录 · ' + toc.length + ' 节</summary>' +
      '<nav class="toc">' + items + '</nav></details>' +
      '<aside class="toc-wide" aria-label="目录"><p class="toc-title">目录</p>' +
      '<nav class="toc">' + items + '</nav></aside>';
  }

  function wireToc() {
    $$('.toc-link').forEach(function (a) {
      function jump(e) {
        e.preventDefault();          // 关键：不能让它改 hash，否则路由被冲掉
        var root = $('.prose');
        if (!root) return;
        var h = root.querySelector('[data-hi="' + a.getAttribute('data-i') + '"]');
        if (!h) return;
        var y = h.getBoundingClientRect().top + window.pageYOffset - 76;  // 让开 sticky 顶栏
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
      a.addEventListener('click', jump);
      a.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') jump(e);
      });
    });
  }

  /* ---------------------------------------------------------
     图片灯箱
     --------------------------------------------------------- */
  var LIGHTBOX_ID = 'lightbox';

  function closeLightbox() {
    var el = document.getElementById(LIGHTBOX_ID);
    if (el) el.remove();
    document.documentElement.style.overflow = '';
    if (window.__lbKey) {
      document.removeEventListener('keydown', window.__lbKey);
      window.__lbKey = null;
    }
  }

  function openLightbox(src, caption) {
    closeLightbox();
    var el = document.createElement('div');
    el.id = LIGHTBOX_ID;
    el.className = 'lightbox';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', caption || '图片预览');

    var img = document.createElement('img');
    img.src = src;
    img.alt = caption || '';
    el.appendChild(img);

    if (caption) {
      var cap = document.createElement('p');
      cap.className = 'lb-cap';
      cap.textContent = caption;
      el.appendChild(cap);
    }

    var btn = document.createElement('button');
    btn.className = 'lb-close';
    btn.type = 'button';
    btn.setAttribute('aria-label', '关闭预览');
    btn.textContent = '✕';
    el.appendChild(btn);

    function onKey(e) {
      if (e.key === 'Escape') closeLightbox();
    }
    window.__lbKey = onKey;
    document.addEventListener('keydown', onKey);

    el.addEventListener('click', function (e) {
      // 点图片本身不关闭，点空白处关闭
      if (e.target === el) closeLightbox();
    });
    btn.addEventListener('click', closeLightbox);

    document.body.appendChild(el);
    document.documentElement.style.overflow = 'hidden';
    btn.focus();
  }

  function wireLightbox() {
    $$('.prose img.zoomable, .figure img').forEach(function (img) {
      function open() { openLightbox(img.currentSrc || img.src, img.getAttribute('alt') || ''); }
      img.addEventListener('click', open);
      img.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  /* ---------------------------------------------------------
     回到顶部
     --------------------------------------------------------- */
  function ensureTopBtn() {
    var el = document.getElementById('to-top');
    if (!el) {
      el = document.createElement('button');
      el.id = 'to-top';
      el.type = 'button';
      el.setAttribute('aria-label', '回到顶部');
      el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">' +
        '<path d="M12 19V5M5 12l7-7 7 7"/></svg>';
      el.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      document.body.appendChild(el);
    }
    return el;
  }

  function updateTopBtn() {
    var el = document.getElementById('to-top');
    if (!el) return;
    // 只在长文里出现，避免首页浮个没用的按钮
    var r = route();
    var show = r.v === 'item' && window.scrollY > 600;
    el.classList.toggle('show', show);
  }

  function footHTML(it) {
    var a = ['<button class="btn sm" id="a-link">复制链接</button>'];
    if (it.type === 'page') {
      a.push('<a class="btn sm" href="' + esc(it.path) + '" target="_blank" rel="noopener">新窗口打开</a>');
    }
    if (it.type === 'video') {
      a.push('<a class="btn sm" href="' + esc(it.path) + '" download>下载视频</a>');
    }
    if (isAuthor()) {
      a.push('<a class="btn sm" href="#/edit/' + encodeURIComponent(it.id) + '">编辑</a>');
      a.push('<button class="btn sm danger" id="a-del">删除</button>');
    }
    return '<div class="article-foot">' + a.join('') + '</div>';
  }

  /* 交互页：自适应高度 + 全屏 + 窄屏直跳 */
  function renderPage(it, back) {
    var url = assetURL(it.path);
    var narrow = window.matchMedia('(max-width: 720px)').matches;

    $('#app').innerHTML = back + '<div class="article wide">' +
      '<header><h1>' + esc(it.title || '') + '</h1>' +
      '<div class="meta">' + metaHTML(it) + '</div></header>' +
      (narrow
        ? '<div class="frame-hint">这是可交互页面，建议全屏查看：' +
          '<a class="btn sm" href="' + esc(it.path) + '" target="_blank" rel="noopener">全屏打开</a></div>'
        : '') +
      '<div class="frame-wrap" id="frame-wrap">' +
      '<div class="frame-bar"><span class="url">' + esc(it.path) + '</span><span class="grow"></span>' +
      '<button class="btn sm" id="frame-full" type="button">全屏</button>' +
      '<a class="btn sm" href="' + esc(url) + '" target="_blank" rel="noopener">新窗口</a></div>' +
      '<iframe id="frame" src="' + esc(it.path) + '" loading="lazy" title="' + esc(it.title || '交互页面') +
      '" sandbox="allow-scripts allow-same-origin"></iframe>' +
      '</div>' + footHTML(it) + '</div>';

    var wrap = $('#frame-wrap');
    var frame = $('#frame');
    var fullBtn = $('#frame-full');

    if (fullBtn && wrap) {
      fullBtn.addEventListener('click', function () {
        var on = wrap.classList.toggle('full');
        fullBtn.textContent = on ? '退出全屏' : '全屏';
        if (on) { try { wrap.focus(); } catch (e) { } }
      });
      // 全屏时按 Esc 退出
      document.addEventListener('keydown', function esc(e) {
        if (e.key !== 'Escape' || !wrap.classList.contains('full')) return;
        wrap.classList.remove('full');
        fullBtn.textContent = '全屏';
      });
    }

    // 同源时按内容高度撑开，避免在 iframe 里「滚动两次」
    if (frame && !narrow) autoSizeFrame(frame, wrap);

    afterItem(it);
  }

  function autoSizeFrame(frame, wrap) {
    function fit() {
      if (wrap && wrap.classList.contains('full')) return;
      var doc;
      try { doc = frame.contentDocument; } catch (e) { return; }   // 跨域则放弃，退回 CSS 的 74vh
      if (!doc || !doc.body) return;
      var h = Math.max(
        doc.body.scrollHeight, doc.documentElement ? doc.documentElement.scrollHeight : 0
      );
      if (h > 200) frame.style.height = (h + 16) + 'px';
    }
    frame.addEventListener('load', function () {
      fit();
      // 页面内有交互（切 tab、重绘）时也要跟着变
      try {
        if (window.ResizeObserver && frame.contentDocument && frame.contentDocument.body) {
          new ResizeObserver(fit).observe(frame.contentDocument.body);
        } else if (window.MutationObserver && frame.contentDocument) {
          new MutationObserver(fit).observe(frame.contentDocument.body, {
            childList: true, subtree: true, attributes: true,
          });
        }
      } catch (e) { }
      setTimeout(fit, 400);
      setTimeout(fit, 1200);
    });
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
  /** 只对不带任何 hash 的预渲染正文生效，避免挡住正常导航 */
  function isStaticView(r) {
    var app = $('#app');
    if (!app || app.getAttribute('data-static') !== '1') return false;
    var h = location.hash;
    if (!h) return r.v === 'list' && !Object.keys(r.query || {}).length;
    // 带到本条目详情的 hash 也算「同一个页面」，交给 afterStatic 规范化 URL
    return r.v === 'item' && r.id === app.getAttribute('data-item');
  }

  /** 预渲染页首次加载时的接线（后续走正常渲染） */
  function afterStatic() {
    var app = $('#app');
    ensureTopBtn();
    applyTheme(getThemeMode());
    $('#site-title').textContent = siteTitle();
    enhanceProse($('.prose', app));
    wireToc();
    wireLightbox();

    // 把 URL 规范成正式的 hash 路由（replace 不留历史，免得后退要按两次）
    var id = app.getAttribute('data-item');
    if (id && location.hash !== '#/i/' + id) {
      try { location.replace('#/i/' + id); } catch (e) { }
    }

    var back = $('#back');
    if (back) {
      back.addEventListener('click', function () {
        app.removeAttribute('data-static');
        go('#/');
      });
    }
    updateTopBtn();
  }

  function render() {
    var r = route();
    closeLightbox();                       // 换页时收掉可能开着的图片预览

    // 预渲染页（i/<id>.html）在 HTML 里已经带了完整正文。
    // 保留它，别用 spinner 覆盖 —— 否则爬虫看到的仍然是空壳。
    if (isStaticView(r)) { afterStatic(); return; }

    ensureTopBtn();
    // 离开列表页时清空搜索词：否则下次回到首页会带着旧关键词，
    // 一进来就是「筛选结果」，看不到宣言与精选。
    if (r.v !== 'list' && q) { q = ''; searchOpen = false; }
    $('#fab').className = (isAuthor() && r.v !== 'edit' && r.v !== 'settings') ? 'show' : '';
    $('#btn-search').style.display = (r.v === 'list') ? '' : 'none';
    if (r.v !== 'list' && r.v !== 'settings') $('#site-title').textContent = siteTitle();

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
    if (r.v === 'list') p = viewList(r);
    else if (r.v === 'item') p = viewItem(r);
    else p = viewEdit(r);

    var done = function () { updateTopBtn(); };
    if (p && p.then) p.then(done, done);
    if (p && p.catch) {
      p.catch(function (e) {
        $('#app').innerHTML = '<div class="empty"><h2>出错了</h2><p>' + esc(friendly(e)) + '</p></div>';
      });
    }
  }

  /* ---------------------------------------------------------
     主题：自动 → 浅色 → 深色 三态循环
     --------------------------------------------------------- */
  var LS_THEME = 'site.theme.v1';
  var THEME_ORDER = ['auto', 'light', 'dark'];
  var THEME_LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };

  function getThemeMode() {
    try {
      var t = localStorage.getItem(LS_THEME);
      return THEME_ORDER.indexOf(t) >= 0 ? t : 'auto';
    } catch (e) { return 'auto'; }
  }

  function applyTheme(mode) {
    if (THEME_ORDER.indexOf(mode) < 0) mode = 'auto';
    var root = document.documentElement;
    if (mode === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);

    // 图标形状与按钮语义都跟着状态走，避免状态不可见、必须点一下才知道
    var icon = $('#theme-icon');
    if (icon) {
      icon.innerHTML = (mode === 'dark')
        ? '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z"/>'
        : '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>';
    }
    var next = THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length];
    var btn = $('#btn-theme');
    if (btn) {
      btn.setAttribute('aria-label', '当前主题：' + THEME_LABEL[mode] + '，点击切换为' + THEME_LABEL[next]);
      btn.setAttribute('title', '主题：' + THEME_LABEL[mode]);
    }
  }

  function cycleTheme() {
    var next = THEME_ORDER[(THEME_ORDER.indexOf(getThemeMode()) + 1) % THEME_ORDER.length];
    try {
      if (next === 'auto') localStorage.removeItem(LS_THEME);
      else localStorage.setItem(LS_THEME, next);
    } catch (e) { }
    applyTheme(next);
    toast('主题：' + THEME_LABEL[next]);
  }

  /* ---------------------------------------------------------
     启动
     --------------------------------------------------------- */
  $('#btn-search').addEventListener('click', function () {
    // 不能只切 class 而不写回 searchOpen：viewList() 重渲染时读的是这个变量，
    // 一旦两者不同步，界面和状态就会打架（表现为「再点一次收不起来」）。
    searchOpen = !searchOpen;

    var sp = $('#sp');
    if (sp && route().v === 'list') {
      sp.classList.toggle('open', searchOpen);
      if (searchOpen) $('#sq').focus();
      return;
    }

    // 搜索框还不在 DOM 里（例如首屏尚未渲染完）：让列表页按当前状态重建
    if (route().v !== 'list') go('#/');
    viewList(route()).then(function () {
      var el = $('#sq');
      if (el && searchOpen) el.focus();
    });
  });

  $('#fab').addEventListener('click', function () { go('#/new'); });

  /* Ctrl/⌘+K 打开搜索并聚焦；在详情页也能用 */
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || (e.key !== 'k' && e.key !== 'K')) return;
    e.preventDefault();
    searchOpen = true;

    var sp = $('#sp');
    var input = $('#sq');

    // 已经渲染好的话直接展开，不必重渲染整个列表
    if (sp && input && route().v === 'list') {
      sp.classList.add('open');
      input.focus();
      return;
    }

    // 不在列表页：先回列表页，等它渲染完再聚焦
    // （用 setTimeout 赌渲染时机是不可靠的，这里用 viewList 的 Promise）
    if (route().v !== 'list') {
      go('#/');
      setTimeout(function () {
        var el = $('#sq');
        if (el) el.focus();
      }, 0);
      return;
    }

    viewList(route()).then(function () {
      var el = $('#sq');
      if (el) el.focus();
    });
  });

  $('#btn-theme').addEventListener('click', cycleTheme);
  applyTheme(getThemeMode());

  ensureTopBtn();

  window.addEventListener('hashchange', render);
  window.addEventListener('scroll', function () {
    $('#topbar').classList.toggle('scrolled', window.scrollY > 4);
    updateTopBtn();
  }, { passive: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
