/* ============================================================
   知识库 · 单页应用
   - 未配置令牌：数据从 GitHub Pages 静态文件读取（快、无限制、有缓存）
   - 已配置令牌：数据走 GitHub API 读取（绕过 CDN 缓存，秒级生效），并可直接提交
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 配置 ---------------- */
  var FILE_DEFAULTS = window.KB_CONFIG || {};
  var LS_CFG = 'kb.config.v1';
  var LS_TOKEN = 'kb.token.v1';

  var CFG = Object.assign({
    owner: '', repo: '', branch: 'main',
    title: '我的知识库', desc: ''
  }, FILE_DEFAULTS, readJSON(LS_CFG) || {});

  function readJSON(k) {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }
  function persistCfg() {
    localStorage.setItem(LS_CFG, JSON.stringify({
      owner: CFG.owner, repo: CFG.repo, branch: CFG.branch
    }));
  }
  function getToken() { return localStorage.getItem(LS_TOKEN) || ''; }
  function setToken(t) {
    if (t) localStorage.setItem(LS_TOKEN, t); else localStorage.removeItem(LS_TOKEN);
  }
  function configured() { return !!(CFG.owner && CFG.repo); }

  /* ---------------- 小工具 ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(s) {
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  var toastTimer;
  function toast(msg, kind) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, kind === 'err' ? 6000 : 3000);
  }

  /* ---------------- Front matter ---------------- */
  function parseNote(text) {
    var meta = {}, body = text;
    var m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (m) {
      body = text.slice(m[0].length);
      m[1].split(/\r?\n/).forEach(function (line) {
        var i = line.indexOf(':');
        if (i < 0) return;
        var k = line.slice(0, i).trim().toLowerCase();
        var v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
        if (!k) return;
        if (k === 'tags' || k === 'tag') {
          meta.tags = v.replace(/^\[|\]$/g, '').split(/[,，]/)
            .map(function (t) { return t.trim(); }).filter(Boolean);
        } else {
          meta[k] = v;
        }
      });
    }
    return { meta: meta, body: body };
  }

  function buildNote(n) {
    var lines = ['---'];
    lines.push('title: ' + oneLine(n.title));
    if (n.tags && n.tags.length) lines.push('tags: ' + n.tags.join(', '));
    lines.push('date: ' + (n.date || todayISO()));
    if (n.summary) lines.push('summary: ' + oneLine(n.summary));
    lines.push('---', '', n.body || '');
    return lines.join('\n');
  }
  function oneLine(s) {
    return String(s || '').replace(/[\r\n]+/g, ' ').trim();
  }

  function makeSummary(md, len) {
    var t = String(md || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/[*_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    len = len || 110;
    return t.length > len ? t.slice(0, len) + '…' : t;
  }

  function renderMD(md) {
    var html = window.marked.parse(String(md || ''), { gfm: true, breaks: false });
    return window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }

  function slugify(s) {
    var base = String(s || '').toLowerCase().trim()
      .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return base || ('note-' + Date.now().toString(36));
  }

  /* ---------------- GitHub 接口 ---------------- */
  var API = 'https://api.github.com';

  function ghFetch(path, opts) {
    opts = opts || {};
    var headers = { 'Accept': opts.accept || 'application/vnd.github+json' };
    var token = getToken();
    if (token && !opts.anonymous) headers['Authorization'] = 'Bearer ' + token;
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: opts.anonymous ? 'default' : 'no-store'
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          var msg = 'GitHub 接口错误 ' + res.status;
          try { msg = JSON.parse(t).message || msg; } catch (e) { }
          if (res.status === 401) msg = '令牌无效或已过期（401）';
          if (res.status === 403) msg = '权限不足或被限流（403）：' + msg;
          if (res.status === 404) msg = '找不到资源（404）：请检查用户名 / 仓库名 / 分支';
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        });
      }
      if (opts.raw) return res.text();
      return res.json();
    });
  }

  function repoPath(p) {
    return '/repos/' + encodeURIComponent(CFG.owner) + '/' + encodeURIComponent(CFG.repo) + p;
  }

  /* 通过 API 读取仓库里的文本文件；不存在返回 null */
  function apiReadFile(path) {
    return ghFetch(repoPath('/contents/' + path) + '?ref=' + encodeURIComponent(CFG.branch), {
      accept: 'application/vnd.github.raw+json', raw: true, anonymous: !getToken()
    }).then(function (txt) { return txt; })
      .catch(function (e) { if (e.status === 404) return null; throw e; });
  }

  /* 通过 Pages 静态路径读取（同源） */
  function staticReadFile(path) {
    return fetch(path + '?v=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : null; })
      .catch(function () { return null; });
  }

  /* 读取文件：优先 API（新鲜），失败则回退静态文件（稳） */
  function readFile(path, preferFresh) {
    if (!configured()) return staticReadFile(path);
    var primary = preferFresh ? apiReadFile(path) : Promise.resolve(null);
    return primary.then(function (txt) {
      if (txt != null) return txt;
      return staticReadFile(path).then(function (s) {
        if (s != null) return s;
        return apiReadFile(path); // 静态没构建出来时再兜一次
      });
    }).catch(function () { return staticReadFile(path); });
  }

  /* ---------------- 目录读取 ---------------- */
  function normalizeManifest(raw) {
    var obj = raw;
    if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch (e) { return null; } }
    if (!obj) return null;
    var list = Array.isArray(obj) ? obj : (obj.notes || []);
    if (!Array.isArray(list)) return null;
    return list;
  }

  function loadIndex() {
    return readFile('data/index.json', true).then(function (raw) {
      var list = normalizeManifest(raw);
      if (list) return list;
      return listViaTree();
    });
  }

  /* 兜底：匿名读 git tree，列出 content/*.md（只有文件名，没有标题） */
  function listViaTree() {
    if (!configured()) return [];
    return ghFetch(repoPath('/git/trees/' + encodeURIComponent(CFG.branch) + '?recursive=1'), {
      anonymous: !getToken()
    }).then(function (data) {
      return (data.tree || [])
        .filter(function (n) { return n.type === 'blob' && /^content\/.+\.md$/i.test(n.path); })
        .map(function (n) {
          var slug = n.path.replace(/^content\//, '').replace(/\.md$/i, '');
          return { slug: slug, title: slug, tags: [], date: '', summary: '' };
        });
    }).catch(function () { return []; });
  }

  /* ---------------- 写入：原子提交 ---------------- */
  function commitFiles(files, message) {
    var head;
    return ghFetch(repoPath('/git/ref/heads/' + encodeURIComponent(CFG.branch)))
      .then(function (ref) {
        head = ref.object.sha;
        return ghFetch(repoPath('/git/commits/' + head));
      })
      .then(function (commit) {
        var baseTree = commit.tree.sha;
        var chain = Promise.resolve([]);
        files.forEach(function (f) {
          chain = chain.then(function (acc) {
            if (f.remove) {
              acc.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
              return acc;
            }
            return ghFetch(repoPath('/git/blobs'), {
              method: 'POST', body: { content: f.content, encoding: 'utf-8' }
            }).then(function (blob) {
              acc.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
              return acc;
            });
          });
        });
        return chain.then(function (entries) {
          return ghFetch(repoPath('/git/trees'), {
            method: 'POST', body: { base_tree: baseTree, tree: entries }
          });
        });
      })
      .then(function (tree) {
        return ghFetch(repoPath('/git/commits'), {
          method: 'POST', body: { message: message, tree: tree.sha, parents: [head] }
        });
      })
      .then(function (commit) {
        return ghFetch(repoPath('/git/refs/heads/' + encodeURIComponent(CFG.branch)), {
          method: 'PATCH', body: { sha: commit.sha, force: false }
        });
      });
  }

  /* 更新 data/index.json：读现有 → upsert → 返回新内容 */
  function indexWithEntry(entry) {
    return apiReadFile('data/index.json').catch(function () { return null; })
      .then(function (raw) {
        var list = normalizeManifest(raw) || [];
        list = list.filter(function (n) { return n.slug !== entry.slug; });
        if (!entry.remove) list.push(entry);
        list.sort(function (a, b) {
          return String(b.date || '').localeCompare(String(a.date || ''));
        });
        return JSON.stringify({ generated: new Date().toISOString(), notes: list }, null, 2) + '\n';
      });
  }

  function saveNote(note, isNew) {
    var rel = 'content/' + note.slug + '.md';
    var entry = {
      slug: note.slug, title: note.title, tags: note.tags || [],
      date: note.date || todayISO(), summary: note.summary || ''
    };
    return indexWithEntry(entry).then(function (indexContent) {
      return commitFiles([
        { path: rel, content: buildNote(note) },
        { path: 'data/index.json', content: indexContent }
      ], (isNew ? '新增笔记：' : '更新笔记：') + note.title + '\n\n通过知识库在线编辑器提交');
    });
  }

  function deleteNote(note) {
    return indexWithEntry({ slug: note.slug, remove: true }).then(function (indexContent) {
      return commitFiles([
        { path: 'content/' + note.slug + '.md', remove: true },
        { path: 'data/index.json', content: indexContent }
      ], '删除笔记：' + (note.title || note.slug) + '\n\n通过知识库在线编辑器提交');
    });
  }

  /* ---------------- 路由 ---------------- */
  function parseHash() {
    var h = location.hash.replace(/^#/, '') || '/';
    var seg = h.split('/').filter(Boolean).map(function (s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    if (!seg.length) return { view: 'list' };
    if (seg[0] === 'n' && seg[1]) return { view: 'note', slug: seg.slice(1).join('/') };
    if (seg[0] === 'tag' && seg[1]) return { view: 'list', tag: seg.slice(1).join('/') };
    if (seg[0] === 'new') return { view: 'edit', slug: null };
    if (seg[0] === 'edit' && seg[1]) return { view: 'edit', slug: seg.slice(1).join('/') };
    if (seg[0] === 'settings') return { view: 'settings' };
    return { view: 'list' };
  }

  function go(hash) {
    if (location.hash === hash) render(); else location.hash = hash;
  }

  function noteURL(slug) {
    return location.origin + location.pathname + '#/n/' + encodeURIComponent(slug);
  }

  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast(okMsg || '已复制', 'ok'); }
      catch (e) { toast('复制失败，请手动复制', 'err'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg || '已复制', 'ok'); }, fallback);
    } else fallback();
  }

  /* ---------------- 视图：列表 ---------------- */
  var allNotes = [];
  var listState = { q: '', tag: null };

  function viewList(route) {
    listState.tag = route.tag || null;
    return loadIndex().then(function (notes) {
      allNotes = notes || [];
      renderListBody();
    });
  }

  function renderListBody() {
    var q = listState.q.toLowerCase();
    var notes = allNotes.filter(function (n) {
      if (listState.tag && (n.tags || []).indexOf(listState.tag) < 0) return false;
      if (!q) return true;
      return ((n.title || '') + ' ' + (n.summary || '') + ' ' + (n.tags || []).join(' '))
        .toLowerCase().indexOf(q) >= 0;
    });

    var tagCount = {};
    allNotes.forEach(function (n) {
      (n.tags || []).forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; });
    });
    var tags = Object.keys(tagCount).sort(function (a, b) { return tagCount[b] - tagCount[a]; });

    var html = '<div class="toolbar">' +
      '<input class="search" id="q" type="search" placeholder="搜索标题、摘要、标签…" value="' + esc(listState.q) + '">' +
      '<span class="count">' + notes.length + ' / ' + allNotes.length + ' 篇</span>' +
      (getToken() && configured() ? '<a class="btn primary" href="#/new">✏️ 写笔记</a>' : '') +
      '</div>';

    if (tags.length) {
      html += '<div class="tags">' +
        (listState.tag ? '<a class="tag" href="#/">← 全部</a>' : '') +
        tags.map(function (t) {
          return '<a class="tag' + (listState.tag === t ? ' active' : '') + '" href="#/tag/' +
            encodeURIComponent(t) + '">' + esc(t) + ' ' + tagCount[t] + '</a>';
        }).join('') + '</div>';
    }

    if (!allNotes.length) {
      html += '<div class="empty-state"><h2>还没有内容</h2>' +
        '<p>这个知识库目前是空的，写下第一篇就会出现在这里。</p>' +
        '<a class="btn primary" href="#/new">✏️ 写第一篇笔记</a></div>';
    } else if (!notes.length) {
      html += '<div class="empty-state"><p>没有匹配「' + esc(listState.q || listState.tag) + '」的内容。</p></div>';
    } else {
      html += '<div class="grid">' + notes.map(function (n) {
        return '<article class="card">' +
          '<h3><a href="#/n/' + encodeURIComponent(n.slug) + '">' + esc(n.title || n.slug) + '</a></h3>' +
          (n.summary ? '<p class="summary">' + esc(n.summary) + '</p>' : '') +
          '<div class="meta">' +
          (n.date ? '<span>' + esc(fmtDate(n.date)) + '</span>' : '') +
          (n.tags || []).slice(0, 3).map(function (t) {
            return '<a class="tag plain" href="#/tag/' + encodeURIComponent(t) + '">' + esc(t) + '</a>';
          }).join('') +
          '</div></article>';
      }).join('') + '</div>';
    }

    $('#app').innerHTML = html;
    var input = $('#q');
    if (input) {
      input.addEventListener('input', function () {
        listState.q = input.value;
        var pos = input.selectionStart;
        renderListBody();
        var ni = $('#q');
        if (ni) { ni.focus(); try { ni.setSelectionRange(pos, pos); } catch (e) { } }
      });
    }
  }

  /* ---------------- 视图：阅读 ---------------- */
  function viewNote(route) {
    var slug = route.slug;
    return readFile('content/' + slug + '.md', true).then(function (raw) {
      if (raw == null) {
        $('#app').innerHTML = '<div class="panel"><h2>找不到这篇笔记</h2>' +
          '<p class="hint">它可能已被删除，或仓库还没构建好。</p>' +
          '<a class="btn" href="#/">← 返回列表</a></div>';
        return;
      }
      var n = parseNote(raw);
      var title = n.meta.title || slug;
      var tags = n.meta.tags || [];
      // 正文开头若重复写了与标题相同的一级标题，去掉以免页面出现两个大标题
      var rawBody = n.body || '';
      var h1 = /^\s*#\s+(.+?)\s*(?:\r?\n|$)/.exec(rawBody);
      if (h1 && h1[1].trim() === title.trim()) rawBody = rawBody.slice(h1[0].length);
      var body = renderMD(rawBody);
      var isAuthor = !!getToken();

      var html = '<article class="article">' +
        '<div class="article-head">' +
        '<h1>' + esc(title) + '</h1>' +
        '<div class="meta">' +
        (n.meta.date ? '<span>📅 ' + esc(fmtDate(n.meta.date)) + '</span>' : '') +
        tags.map(function (t) {
          return '<a class="tag plain" href="#/tag/' + encodeURIComponent(t) + '">' + esc(t) + '</a>';
        }).join('') +
        '</div>' +
        '<div class="article-actions">' +
        '<button class="btn sm" id="copy">🔗 复制链接</button>' +
        (configured() ? '<a class="btn sm" target="_blank" rel="noopener" href="https://github.com/' +
          encodeURIComponent(CFG.owner) + '/' + encodeURIComponent(CFG.repo) + '/edit/' +
          encodeURIComponent(CFG.branch) + '/content/' + encodeURIComponent(slug) + '.md">在 GitHub 编辑</a>' : '') +
        (isAuthor ? '<a class="btn sm" href="#/edit/' + encodeURIComponent(slug) + '">✏️ 编辑</a>' : '') +
        (isAuthor ? '<button class="btn sm danger" id="del">删除</button>' : '') +
        '</div></div>' +
        '<div class="prose">' + body + '</div>' +
        '</article>';

      $('#app').innerHTML = html;

      $('#copy').addEventListener('click', function () {
        copyText(noteURL(slug), '链接已复制，可以直接分享');
      });

      var delBtn = $('#del');
      if (delBtn) {
        delBtn.addEventListener('click', function () {
          if (!confirm('确定删除《' + title + '》？此操作会提交到 GitHub，可以从历史记录中恢复。')) return;
          delBtn.disabled = true;
          delBtn.textContent = '删除中…';
          deleteNote({ slug: slug, title: title }).then(function () {
            allNotes = allNotes.filter(function (x) { return x.slug !== slug; });
            toast('已删除', 'ok');
            go('#/');
          }).catch(function (e) {
            delBtn.disabled = false;
            delBtn.textContent = '删除';
            toast('删除失败：' + e.message, 'err');
          });
        });
      }
    });
  }

  /* ---------------- 视图：编辑 ---------------- */
  function viewEdit(route) {
    var isNew = !route.slug;
    var load = isNew
      ? Promise.resolve({ title: '', tags: [], date: todayISO(), summary: '', body: '' })
      : readFile('content/' + route.slug + '.md', true).then(function (raw) {
        if (raw == null) { toast('找不到这篇笔记', 'err'); go('#/'); return null; }
        var n = parseNote(raw);
        return {
          title: n.meta.title || route.slug, tags: n.meta.tags || [],
          date: n.meta.date || todayISO(), summary: n.meta.summary || '', body: n.body || ''
        };
      });

    return load.then(function (note) {
      if (!note) return;
      var slug = isNew ? '' : route.slug;

      $('#app').innerHTML = '<div class="panel">' +
        '<h2>' + (isNew ? '写新笔记' : '编辑笔记') + '</h2>' +
        '<p class="hint">保存后会直接提交到 GitHub 仓库（' + esc(CFG.owner + '/' + CFG.repo) + '）。</p>' +
        (getToken() ? '' : '<div class="notice warn">还没有配置访问令牌，无法保存。请先到 <a href="#/settings">设置</a> 里填写。</div>') +
        '<div class="row">' +
        '<div class="field" style="flex:2 1 340px"><label for="f-title">标题</label>' +
        '<input id="f-title" type="text" placeholder="例如：如何高效做读书笔记" value="' + esc(note.title) + '"></div>' +
        '<div class="field" style="flex:1 1 200px"><label for="f-slug">链接标识</label>' +
        '<input id="f-slug" type="text" placeholder="自动生成" value="' + esc(slug) + '"' + (isNew ? '' : ' readonly') + '>' +
        '<div class="note">决定网址 <code>#/n/标识</code>，建议用英文或数字，中文也可用。</div></div>' +
        '</div>' +
        '<div class="row">' +
        '<div class="field" style="flex:2 1 300px"><label for="f-tags">标签</label>' +
        '<input id="f-tags" type="text" placeholder="用逗号分隔，例如：读书, 方法" value="' + esc((note.tags || []).join(', ')) + '">' +
        '<div class="note">标签会显示在列表页顶部，方便分类浏览。</div></div>' +
        '<div class="field" style="flex:1 1 180px"><label for="f-date">日期</label>' +
        '<input id="f-date" type="date" value="' + esc(note.date) + '"></div>' +
        '</div>' +
        '<div class="field"><label for="f-summary">摘要（可选）</label>' +
        '<input id="f-summary" type="text" placeholder="留空则自动截取正文开头" value="' + esc(note.summary) + '"></div>' +
        '<div class="field"><label for="f-body">正文（Markdown）</label></div>' +
        '<div class="editor-split">' +
        '<textarea id="f-body" class="body" spellcheck="false" placeholder="在这里写 Markdown…">' + esc(note.body) + '</textarea>' +
        '<div class="preview-box" id="preview"></div>' +
        '</div>' +
        '<div class="actions">' +
        '<button class="btn primary" id="save">💾 保存并发布</button>' +
        '<a class="btn" href="' + (isNew ? '#/' : '#/n/' + encodeURIComponent(route.slug)) + '">取消</a>' +
        '<span class="spacer"></span>' +
        '<span class="count" id="stat"></span>' +
        '</div></div>';

      // 移动端把 textarea 的 min-height 调小一点
      var bodyEl = $('#f-body');
      if (window.innerWidth < 900) bodyEl.style.minHeight = '260px';

      var preview = $('#preview');
      var stat = $('#stat');
      function refresh() {
        var md = bodyEl.value;
        preview.innerHTML = md.trim()
          ? renderMD(md)
          : '<p class="empty">左边输入内容，这里会实时预览。</p>';
        stat.textContent = md.length + ' 字符';
      }
      bodyEl.addEventListener('input', refresh);
      refresh();

      var titleEl = $('#f-title'), slugEl = $('#f-slug');
      if (isNew) {
        var slugTouched = false;
        slugEl.addEventListener('input', function () { slugTouched = true; });
        titleEl.addEventListener('input', function () {
          if (!slugTouched) slugEl.value = slugify(titleEl.value);
        });
      }

      $('#save').addEventListener('click', function () {
        if (!getToken()) {
          toast('请先在设置里配置访问令牌', 'err');
          go('#/settings');
          return;
        }
        var title = titleEl.value.trim();
        if (!title) { toast('请填写标题', 'err'); titleEl.focus(); return; }
        var finalSlug = (slugEl.value.trim() || slugify(title));
        finalSlug = finalSlug.replace(/[\/\\]/g, '-').replace(/\.md$/i, '');
        var body = bodyEl.value;
        var noteObj = {
          title: title,
          slug: finalSlug,
          tags: $('#f-tags').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
          date: $('#f-date').value || todayISO(),
          summary: $('#f-summary').value.trim() || makeSummary(body),
          body: body
        };
        var btn = $('#save');
        btn.disabled = true;
        btn.textContent = '提交中…';
        saveNote(noteObj, isNew).then(function () {
          toast('已提交，正在打开…', 'ok');
          setTimeout(function () { go('#/n/' + encodeURIComponent(finalSlug)); }, 400);
        }).catch(function (e) {
          btn.disabled = false;
          btn.textContent = '💾 保存并发布';
          toast('保存失败：' + e.message, 'err');
        });
      });
    });
  }

  /* ---------------- 视图：设置 ---------------- */
  function viewSettings() {
    $('#app').innerHTML = '<div class="panel">' +
      '<h2>设置</h2>' +
      '<p class="hint">仓库信息决定站点从哪里读写内容；访问令牌让你能在网页上直接保存。</p>' +

      '<div class="field"><label for="s-owner">GitHub 用户名</label>' +
      '<input id="s-owner" type="text" placeholder="例如 octocat" value="' + esc(CFG.owner) + '"></div>' +

      '<div class="field"><label for="s-repo">仓库名</label>' +
      '<input id="s-repo" type="text" placeholder="例如 knowledge-hub" value="' + esc(CFG.repo) + '"></div>' +

      '<div class="field"><label for="s-branch">分支</label>' +
      '<input id="s-branch" type="text" placeholder="main" value="' + esc(CFG.branch) + '"></div>' +

      '<div class="field"><label for="s-token">访问令牌（Personal Access Token）</label>' +
      '<input id="s-token" type="password" placeholder="github_pat_… 或 ghp_…" value="' + esc(getToken()) + '">' +
      '<div class="note">' +
      '令牌只保存在<strong>你自己这台浏览器</strong>的 localStorage 里，不会提交到仓库，也不会发给任何第三方。<br>' +
      '需要的最小权限（Fine-grained token）：<code>Contents: Read and write</code>。' +
      '</div></div>' +

      '<div id="s-result"></div>' +

      '<div class="actions">' +
      '<button class="btn primary" id="s-save">保存设置</button>' +
      '<button class="btn" id="s-test">测试连接</button>' +
      '<button class="btn danger" id="s-clear">清除令牌</button>' +
      '</div>' +

      '<div class="notice" style="margin-top:26px">' +
      '<strong>怎么生成令牌？</strong><br>' +
      '打开 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a> → ' +
      'Repository access 选 <em>Only select repositories</em> 并勾选你的知识库仓库 → ' +
      'Permissions 里把 <em>Contents</em> 设为 <em>Read and write</em> → 生成后复制粘贴到上面。' +
      '</div>' +
      '</div>';

    $('#s-save').addEventListener('click', function () {
      CFG.owner = $('#s-owner').value.trim();
      CFG.repo = $('#s-repo').value.trim();
      CFG.branch = $('#s-branch').value.trim() || 'main';
      setToken($('#s-token').value.trim());
      persistCfg();
      toast('设置已保存', 'ok');
      setTimeout(function () { go('#/'); }, 400);
    });

    $('#s-clear').addEventListener('click', function () {
      setToken('');
      $('#s-token').value = '';
      toast('令牌已从本机清除', 'ok');
    });

    $('#s-test').addEventListener('click', function () {
      CFG.owner = $('#s-owner').value.trim();
      CFG.repo = $('#s-repo').value.trim();
      CFG.branch = $('#s-branch').value.trim() || 'main';
      setToken($('#s-token').value.trim());
      persistCfg();
      var box = $('#s-result');
      box.innerHTML = '<div class="notice"><span class="spinner"></span> 正在测试…</div>';
      ghFetch(repoPath(''))
        .then(function (info) {
          var canWrite = info.permissions && info.permissions.push;
          box.innerHTML = '<div class="notice ok">连接成功：<strong>' + esc(info.full_name) +
            '</strong>（默认分支 ' + esc(info.default_branch) + '）' +
            (canWrite ? '，令牌具备写入权限 ✅' : '。注意：令牌可能没有写入权限，保存时可能失败。') +
            '</div>';
        })
        .catch(function (e) {
          box.innerHTML = '<div class="notice err">连接失败：' + esc(e.message) + '</div>';
        });
    });
  }

  /* ---------------- 渲染入口 ---------------- */
  function render() {
    var route = parseHash();
    document.title = (CFG.title || '知识库');
    $('#site-title').textContent = CFG.title || '知识库';
    $('#site-title').href = '#/';
    $('#site-desc').textContent = CFG.desc || '';

    var footer = $('#footer-info');
    if (footer) {
      footer.innerHTML = configured()
        ? '<a href="https://github.com/' + encodeURIComponent(CFG.owner) + '/' + encodeURIComponent(CFG.repo) +
        '" target="_blank" rel="noopener">' + esc(CFG.owner + '/' + CFG.repo) + '</a>' +
        '<span class="sep">·</span><span>托管于 GitHub Pages</span>'
        : '<span>尚未配置仓库，请先到</span><a href="#/settings">设置</a><span>填写。</span>';
    }

    if (!configured() && route.view !== 'settings') {
      $('#app').innerHTML = '<div class="panel">' +
        '<h2>先完成一次设置</h2>' +
        '<p class="hint">填写 GitHub 用户名和仓库名后，站点就知道该读取哪里的内容了。</p>' +
        '<a class="btn primary" href="#/settings">前往设置</a></div>';
      return;
    }

    $('#app').innerHTML = '<div class="loading"><span class="spinner"></span> 加载中…</div>';

    var p;
    if (route.view === 'list') p = viewList(route);
    else if (route.view === 'note') p = viewNote(route);
    else if (route.view === 'edit') p = viewEdit(route);
    else { viewSettings(); return; }

    Promise.resolve(p).catch(function (e) {
      $('#app').innerHTML = '<div class="panel"><h2>出错了</h2>' +
        '<p class="hint">' + esc(e.message || e) + '</p>' +
        '<a class="btn" href="#/">返回列表</a></div>';
    });
  }

  window.addEventListener('hashchange', render);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else render();
})();
