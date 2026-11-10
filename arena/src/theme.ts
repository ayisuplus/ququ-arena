/**
 * 共享展示工具 —— 页面渲染层的单一来源模块
 *
 * - 主题：THEME_CSS / THEME_TOGGLE（各页面零依赖单文件 HTML，无法共享外部样式表，共享走代码；
 *   海报刻意不接入——印刷向产物，保持宣纸底）
 * - 安全/格式工具：esc（HTML 转义）/ pct（百分比格式化）——安全攸关与高频工具只许一份
 *   （v3.26/v3.27 实证：复制粘贴必漂移，esc 曾漂出 3 变体各丢一半安全性质）
 */
export const THEME_CSS = `
  /* 石墨底 + 香槟金单主色：主色只给主操作与选中态，冷灰蓝只给标签/信息，其余靠明度分层 */
  :root { color-scheme:dark; --ink:#e8e8ea; --muted:#9a9ca6; --accent:#dcb46e; --gold:#e9a55c; --bg:#141518; --card:#1b1c20; --line:#2c2e34; --soft:#232429; --tag-bg:#22272f; --tag-ink:#a9bfd6; --button-ink:#1c1609; }
  [data-theme="dark"] {
    color-scheme: dark;
    --ink:#e8e8ea; --muted:#9a9ca6; --accent:#dcb46e; --gold:#e9a55c;
    --bg:#141518; --card:#1b1c20; --line:#2c2e34; --soft:#232429; --tag-bg:#22272f; --tag-ink:#a9bfd6; --button-ink:#1c1609;
  }
  [data-theme="light"] { color-scheme:light; --ink:#1f2024; --muted:#63656e; --accent:#8a6320; --gold:#a5601c; --bg:#f5f4f0; --card:#fff; --line:#e1ddd4; --soft:#efede7; --tag-bg:#eceff3; --tag-ink:#3f5a78; --button-ink:#fff; }
  [data-theme="dark"] .win { color:#7fcf9a; }
  [data-theme="dark"] .hall.gold { background:linear-gradient(135deg,#29251d,#1d1c1f); border-color:#4a4232; }
  [data-theme="dark"] .hall.dark { background:var(--card); border-color:var(--line); }
  .card { border-radius:8px; }
  .hall { border-radius:8px; }
  body { line-height: 1.65; }
  :where(body) { background-color:var(--bg); color:var(--ink); font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif; }
  button, input, select, textarea { font-family: inherit; }
  input, select, textarea { color:var(--ink); background:var(--card); accent-color:var(--accent); }
  input::placeholder, textarea::placeholder { color:var(--muted); opacity:1; }
  button, a, input, select, summary { transition: background-color .15s, border-color .15s, color .15s, box-shadow .15s; }
  :where(a, button, input, select, textarea, summary):focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  button:disabled { cursor:not-allowed; opacity:.55; }
  a:hover { text-decoration:underline; text-underline-offset:3px; }
  td { font-variant-numeric:tabular-nums; }
  tbody tr:hover { background:var(--soft); }
  code { color:var(--ink); background:var(--tag-bg); }
  .muted { line-height:1.65; }
  .site-nav { display:flex; align-items:center; gap:4px; margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid var(--line); font-size:14px; }
  .site-nav .arena-brand { display:flex; align-items:center; gap:11px; margin-right:28px; padding-left:0; color:var(--ink); font-size:16px; font-weight:700; letter-spacing:1px; }
  .site-nav .arena-brand:hover { background:none; }
  .brand-mark { display:inline-grid; place-items:center; width:26px; height:26px; border:1.5px solid var(--accent); border-radius:4px; color:var(--accent); transform:rotate(45deg); font-size:15px; }
  .brand-mark span { transform:rotate(-45deg); }
  .site-nav a { padding:7px 13px; border-radius:7px; color:var(--muted); text-decoration:none; }
  .site-nav a:hover { color:var(--ink); background:var(--soft); text-decoration:none; }
  .site-nav a[aria-current="page"] { color:var(--ink); background:var(--soft); font-weight:600; }
  .theme-toggle { position: fixed; top: 14px; right: 14px; z-index: 99; width:36px; height:36px; display:grid; place-items:center; background: var(--card, #fff); border: 1px solid var(--line, #e8e0d5); border-radius: 10px; padding:0; cursor: pointer; color: var(--ink, #2b2622); font-size: 16px; box-shadow:none; }
  .theme-toggle:hover { background:var(--soft); border-color:var(--muted); }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation:none !important; transition:none !important; scroll-behavior:auto !important; } }
`;

/** 拨杆 + 记忆（localStorage）；data-theme 挂在 <html> 上 */
export const THEME_TOGGLE = `<button type="button" class="theme-toggle" onclick="toggleTheme()" title="切换明暗" aria-label="切换明暗主题" aria-pressed="false">🌓</button>
<script>
try { document.documentElement.dataset.theme = localStorage.getItem('ququ-theme') || 'dark'; } catch (e) { document.documentElement.dataset.theme = 'dark'; }
function syncThemeToggle() {
  var dark = document.documentElement.dataset.theme === 'dark';
  var button = document.querySelector('.theme-toggle');
  button.setAttribute('aria-pressed', String(dark));
  button.setAttribute('aria-label', dark ? '切换到浅色主题' : '切换到深色主题');
  button.title = dark ? '切换到浅色主题' : '切换到深色主题';
}
syncThemeToggle();
function toggleTheme() {
  var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('ququ-theme', next); } catch (e) {}
  syncThemeToggle();
}
</script>`;

/** 仅用于在线工作台；导出的独立页面不附带服务器导航。看比赛在 3D 客户端，网页只做配置、评测与研究。 */
export const siteNav = (current = ''): string =>
  `<nav class="site-nav" aria-label="主导航"><a class="arena-brand" href="/"><span class="brand-mark"><span>Λ</span></span><span>AI斗兽场</span></a>${[
    ['home', '/', '对战'],
    ['predictions', '/predictions', '竞猜'],
    ['questions', '/questions', '题库'],
    ['stable', '/stable', '榜单'],
    ['results', '/results', '战报档案'],
    ['harness', '/harness', 'Harness 实验'],
    ['experiments', '/experiments', '工程实验'],
  ]
    .map(([key, href, label]) => `<a href="${href}"${key === current ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('')}</nav>`;

/** 在线界面使用真实模型标识；用户自定义的模型保留其名称。 */
export const modelDisplayName = (id: string, name: string, names: Readonly<Record<string, string>> = {}): string =>
  names[id] ?? (id.startsWith('custom:') ? name : id.slice(id.indexOf(':') + 1));

/** 仅替换展示文案，评级阈值和历史记录仍由 career 模块管理。 */
export const modelRatingName = (rank: string): string =>
  (({ 虫王: 'S', 大将军: 'A', 骁骑: 'B', 老卒: 'C', 雏虫: 'D' }) as Record<string, string>)[rank] ?? rank;

/**
 * HTML 转义唯一实现——安全攸关工具只许一份（v3.26 实证：8 模块各抄一份且漂出 3 个变体：
 * null 安全 / 单引号覆盖互不一致）。统一语义：null/undefined → ''，转义 & < > " ' 五字符。
 */
export const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** 百分比格式化唯一实现（esc 同病：11 份复制，export.ts 的 \\% 是 LaTeX 转义有意变体不归并） */
export const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/**
 * 维度显示名：题库维度字典里的说明可能是一整句，界面只取括号/冒号前的短名（超长截断）；
 * 字典里没有的维度 id 原样返回。完整说明由调用方放进 title。
 */
export const conditionLabel = (id: string, names: Readonly<Record<string, string>> = {}): string => {
  const full = names[id];
  if (!full) return id;
  const short = full.split(/[（(：:]/)[0]!.trim() || full;
  return short.length > 14 ? short.slice(0, 13) + '…' : short;
};
