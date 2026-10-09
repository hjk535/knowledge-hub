/* 站点配置 —— 部署脚本会自动填好 owner / repo。
   在「设置」页里改过的值存在浏览器 localStorage，优先级高于这里。 */
window.SITE_CONFIG = {
  // GitHub 用户名或组织名
  owner: "hjk535",
  // 仓库名
  repo: "knowledge-hub",
  // 分支
  branch: "main",
  // 兜底站点标题与副标题。
  // 真正的值以 data/library.json 的 site.title / site.desc 为准（可在「设置」页改）；
  // 这里只在索引拿不到 title 时使用，所以别再填占位文字。
  title: "hjkd 物理海洋知识库",
  desc: "物理海洋观测与知识整理。EOF 分解、海表热收支——用可复现的数据把每一个现象讲清楚。"
};
