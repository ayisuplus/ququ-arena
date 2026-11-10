/**
 * 竞猜台页面（/predictions）——盘口、押注、段位与竞猜成就的唯一观赛副屏
 *
 * 架构边界：本文件只做 HTML 合成（对齐 homeHtml.ts 外置模式）；
 * 数据来自 /api/predictions，押注逻辑在 prediction.ts 域，本文件零业务规则。
 */
import { THEME_CSS, THEME_TOGGLE, siteNav } from './theme.ts';

export function renderPredictionPage(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>竞猜台 · AI斗兽场</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 28px 32px 64px; }
  h1 { font-size: 26px; margin: 18px 0 6px; }
  .muted { color: var(--muted); font-size: 12px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px 20px; margin: 12px 0; }
  .profile { display:flex; flex-wrap:wrap; gap:22px; align-items:center; }
  .stat b { font-size: 22px; display:block; }
  .stat span { font-size: 12px; color: var(--muted); }
  .achievements { margin-top: 10px; display:flex; flex-wrap:wrap; gap:8px; }
  .badge-ach { border:1px solid var(--line); border-radius:99px; padding:4px 12px; font-size:12px; background:var(--soft); }
  .market { border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin:12px 0; background:var(--card); }
  .market-head { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
  .market-head h2 { font-size:16px; margin:0; }
  .tag { font-size:11px; border:1px solid var(--line); border-radius:99px; padding:2px 9px; color:var(--muted); }
  .tag.hot { border-color: var(--accent); color: var(--accent); }
  .picks { display:flex; flex-wrap:wrap; gap:10px; margin-top:12px; }
  .pick { border:1px solid var(--line); background:var(--bg); color:var(--ink); border-radius:10px; padding:10px 14px; cursor:pointer; font-size:14px; text-align:left; }
  .pick:hover:not(:disabled) { border-color: var(--accent); }
  .pick.mine { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
  .pick:disabled { opacity:.5; cursor:not-allowed; }
  .pick .odds { font-size: 18px; font-weight: 700; display:block; }
  .pick .prob { font-size: 11px; color: var(--muted); }
  .hint { margin-top:10px; font-size:13px; }
  .outcome-win { color: #2e9e44; }
  .outcome-lose { color: var(--muted); }
  .outcome-refund { color: var(--muted); }
  .name-input { border:1px solid var(--line); border-radius:8px; padding:8px 10px; background:var(--bg); color:var(--ink); font-size:13px; width:160px; }
  input:disabled { opacity:.5; }
  ${THEME_CSS}
</style></head><body><div class="wrap" role="main">${THEME_TOGGLE}${siteNav('predictions')}
  <h1>🎲 竞猜台</h1>
  <p class="muted">开赛前押一只——押中按赔率连本派彩，押错没收注金。赔率是 Glicko 公众共识，押冷门赚的是你的信息差。封盘后不可下注；无冠军/退赛一律退注。</p>
  <section class="card" id="profileCard" aria-label="我的竞猜档案">
    <div class="profile">
      <div class="stat"><b id="bank">…</b><span>竞猜豆</span></div>
      <div class="stat"><b id="rank">…</b><span>预测段位</span></div>
      <div class="stat"><b id="record">…</b><span>战绩（中/注）</span></div>
      <div class="stat"><b id="net">…</b><span>净收益</span></div>
      <div class="stat"><b id="streak">…</b><span>连中（最佳）</span></div>
      <div class="stat"><label class="muted" for="bettorName">我的花名</label><input class="name-input" id="bettorName" maxlength="32" placeholder="匿名看客"></div>
    </div>
    <div class="achievements" id="achievements"></div>
    <p class="muted" id="bailoutNote" hidden></p>
  </section>
  <div id="markets"></div>
<script>
(() => {
  const KEY = 'ququ-bettor';
  const id = (() => {
    let v = localStorage.getItem(KEY);
    if (!v) { v = 'u' + Math.random().toString(36).slice(2, 10); localStorage.setItem(KEY, v); }
    return v;
  })();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let nameDirty = false;
  const nameInput = document.getElementById('bettorName');
  nameInput.addEventListener('input', () => { nameDirty = true; });

  async function bet(marketId, pick) {
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bettor: id, name: nameInput.value.trim() || undefined, marketId, pick }),
      });
      const out = await res.json();
      if (!res.ok) { alert(out.error || '下注失败'); return; }
      if (out.rescued) alert('豆不够下注，已发放救济金 500——翻本的机会来了');
      refresh();
    } catch (e) { alert('下注失败：' + e.message); }
  }

  function render(data) {
    const p = data.profile;
    if (p) {
      document.getElementById('bank').textContent = p.bank;
      document.getElementById('rank').textContent = p.rank.icon + ' ' + p.rank.rank;
      document.getElementById('record').textContent = p.wins + '/' + p.bets;
      document.getElementById('net').textContent = (p.net >= 0 ? '+' : '') + p.net;
      document.getElementById('streak').textContent = p.streak + '（' + p.bestStreak + '）';
      if (!nameDirty && document.activeElement !== nameInput && p.name && p.name !== id) nameInput.value = p.name;
      document.getElementById('achievements').innerHTML = p.achievements.map((a) =>
        '<span class="badge-ach" title="' + esc(a.desc || '') + '">' + esc(a.icon || '🏅') + ' ' + esc(a.name || a.id) + '</span>').join('') || '<span class="muted">还没有成就——开一盘试试</span>';
      const note = document.getElementById('bailoutNote');
      note.hidden = !p.bailouts;
      note.textContent = p.bailouts ? '已领过 ' + p.bailouts + ' 次救济金（豆 < 100 时自动补 500）' : '';
    }
    const now = Date.now();
    document.getElementById('markets').innerHTML = data.markets.map((m) => {
      const sealed = m.status !== 'open' || !!m.sealedAt || (m.closesAt && now > new Date(m.closesAt).getTime());
      const countdown = m.status === 'open' && !m.sealedAt && m.closesAt ? Math.max(0, Math.ceil((new Date(m.closesAt).getTime() - now) / 1000)) : null;
      const tags = [
        m.kind === 'competition' ? '<span class="tag hot">捧杯盘</span>' : '<span class="tag hot">对战盘</span>',
        m.demo ? '<span class="tag">🎪 演示盘</span>' : '',
        m.status === 'settled' ? '<span class="tag">已结算</span>' : m.status === 'void' ? '<span class="tag">已作废</span>' : sealed ? '<span class="tag">已封盘</span>' : '<span class="tag hot">下注中</span>',
      ].join('');
      const picks = m.entries.map((e) => {
        const mine = m.myBet && m.myBet.pick === e.id;
        return '<button class="pick' + (mine ? ' mine' : '') + '" data-market="' + esc(m.id) + '" data-pick="' + esc(e.id) + '"' + (sealed ? ' disabled' : '') + '>' +
          '<span class="odds">×' + e.odds + '</span>' + esc(e.name) + '<span class="prob">共识 ' + (e.prob * 100).toFixed(0) + '%</span></button>';
      }).join('');
      let hint = '';
      if (m.status === 'settled') {
        const w = m.entries.find((e) => e.id === m.winner);
        hint = '🏆 冠军：' + esc(w ? w.name : m.winner);
        if (m.myBet) hint += ' · 你的注 ' + esc(m.myBet.pickName) + '（×' + m.myBet.odds + '）' + (m.myBet.pick === m.winner ? '<span class="outcome-win"> — 押中！</span>' : '<span class="outcome-lose"> — 押错</span>');
      } else if (m.status === 'void') {
        hint = '本盘作废，注金已退';
      } else if (sealed) {
        hint = '已封盘' + (m.myBet ? ' · 你押了 ' + esc(m.myBet.pickName) + '（×' + m.myBet.odds + '）' : '——下次手快点');
      } else {
        hint = countdown != null ? '封盘倒计时 <b>' + countdown + '</b> 秒' : '等待开赛封盘';
        hint += m.myBet ? ' · 你押了 ' + esc(m.myBet.pickName) + '（×' + m.myBet.odds + '，可改注）' : ' · 押一只（注 100 豆）';
        hint += ' · ' + m.bettors + ' 人已押';
      }
      return '<section class="market"><div class="market-head"><h2>' + esc(m.title) + '</h2>' + tags + '</div>' +
        '<div class="picks">' + picks + '</div><p class="hint">' + hint + '</p></section>';
    }).join('') || '<div class="card">暂无盘口——开一场对战或 3D 赛事，盘口会在这里亮起</div>';
    document.querySelectorAll('.pick:not(:disabled)').forEach((btn) => {
      btn.onclick = () => bet(btn.dataset.market, btn.dataset.pick);
    });
  }

  async function refresh() {
    try {
      const res = await fetch('/api/predictions?bettor=' + encodeURIComponent(id));
      if (res.ok) render(await res.json());
    } catch { /* 后端未起时静默，下轮重试 */ }
  }
  refresh();
  setInterval(refresh, 2000);
})();
</script>
</div></body></html>`;
}
