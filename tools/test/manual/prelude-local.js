/* 用本地索引预览：新配色 + 出门票 3 张 */
(function () {
  var orig = window.fetch;
  window.fetch = function (u) {
    if (String(u).indexOf('library.json') >= 0) {
      return orig('/data/library.json').then(function (r) {
        return new Response(r.body, { status: 200, headers: { 'Content-Type': 'application/json' } });
      });
    }
    return orig.apply(this, arguments);
  };
})();
