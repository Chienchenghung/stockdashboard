// 持股透視：讀取 data/ 下的資料檔，所有計算都在使用者的瀏覽器裡完成，持股只存在本機 localStorage。
(async () => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const cmp = new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 });
  const money = (v) => 'NT$' + cmp.format(v);
  const n0 = (v) => new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 }).format(v);
  const n2 = (v) => new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const price = (v) => v >= 1000 ? n0(v) : n2(v).replace(/\.00$/, '');
  const pct = (v) => (v * 100).toFixed(1) + '%';
  const spct = (v) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
  const x1 = (v) => (v == null || !isFinite(v)) ? '—' : v.toFixed(1);
  const md = (s) => (s || '').slice(5).replace('-', '/');
  const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const LIMIT = 0.4;
  const SAMPLE = [{ t: '006208', s: 30000 }, { t: '2454', s: 2000 }, { t: '2330', s: 1000 }];

  // ---------- 載入資料 ----------
  let TW, GL, CO, ETF, NEWS = { market: null, companies: {} }, COV = { order: [] };
  try {
    const get = (f) => fetch(`data/${f}?v=${Date.now() / 3.6e6 | 0}`).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
    [TW, GL, CO, ETF] = await Promise.all(['tw_quotes.json', 'global_quotes.json', 'companies.json', 'etf.json'].map(get));
    try { NEWS = await get('news.json'); } catch (e) { /* 新聞檔可有可無 */ }
    try { COV = await get('coverage.json'); } catch (e) { /* 可有可無 */ }
  } catch (e) {
    $('cards').innerHTML = '<div class="panel"><b>資料載入失敗</b><p class="cap">請透過網址開啟這個頁面（例如 GitHub Pages），直接打開本機檔案時瀏覽器會擋下資料讀取。</p></div>';
    return;
  }
  const TQ = TW.quotes, GQ = GL.quotes;
  delete CO._說明; delete ETF._說明;
  const etfName = {};
  Object.values(ETF).forEach((e) => (e.weights || []).forEach((w) => { etfName[w.code] = w.name; }));
  const isEtf = (c) => !!ETF[c] || /^00\d{3,4}[A-Z]?$/.test(c);
  const nameOf = (c) => (TQ[c] && TQ[c].n) || (ETF[c] && ETF[c].name) || etfName[c] || (CO[c] && CO[c].name) || c;
  $('asof').textContent = `台股收盤 ${TW.date || ''}・${TW.source === 'snapshot' ? '初始快照' : '每日自動更新'}`;

  // ---------- 今日市場 ----------
  const IMP = { positive: '利多', negative: '利空', neutral: '中性' };
  const link = ([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`;
  const mk = NEWS.market;
  if (mk && mk.points && mk.points.length) {
    $('market').hidden = false;
    $('mk-date').textContent = `${mk.date || ''} 收盤整理`;
    $('mk-head').textContent = mk.headline || '';
    $('mk-points').innerHTML = mk.points.map((p) => `<li>${esc(p)}</li>`).join('');
    $('mk-src').innerHTML = (mk.sources || []).length ? '來源：' + mk.sources.map(link).join('') : '';
  }

  // ---------- 持股輸入 ----------
  const KEY = 'chigu-toushi-v2';
  let rows;
  try { rows = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { rows = null; }
  if (!Array.isArray(rows)) rows = SAMPLE.map((r) => ({ ...r }));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {} };

  const hint = (t) => {
    if (!t) return ['', false];
    const q = TQ[t];
    return q ? [`${q.n}・${price(q.p)}`, false] : ['找不到這個代號（目前只支援台股上市櫃）', true];
  };
  function renderRows() {
    $('rows').innerHTML = rows.map((r, i) => {
      const [h, miss] = hint(r.t.trim());
      return `<tr data-i="${i}">
        <td><input id="t${i}" list="tickers" inputmode="numeric" autocomplete="off" aria-label="代號" value="${esc(r.t)}" data-k="t" placeholder="例 2330"><div class="nm${miss ? ' miss' : ''}">${esc(h)}</div></td>
        <td><input id="s${i}" inputmode="numeric" aria-label="股數" value="${esc(r.s)}" data-k="s" placeholder="股數"></td>
        <td><button class="x" type="button" aria-label="刪除這一檔" data-del="${i}">×</button></td></tr>`;
    }).join('');
  }
  $('tickers').innerHTML = [...new Set([...Object.keys(ETF), ...Object.keys(CO)])].filter((c) => TQ[c]).map((c) => `<option value="${c}">${esc(nameOf(c))}</option>`).join('');
  $('rows').addEventListener('input', (e) => {
    const inp = e.target.closest('input'); if (!inp) return;
    const i = +inp.closest('tr').dataset.i;
    if (inp.dataset.k === 's') { const v = inp.value.replace(/[^\d]/g, ''); if (v !== inp.value) inp.value = v; rows[i].s = v; }
    else {
      rows[i].t = inp.value.toUpperCase();
      const [h, miss] = hint(rows[i].t.trim()), nm = inp.parentElement.querySelector('.nm');
      nm.textContent = h; nm.classList.toggle('miss', miss);
    }
    save(); compute();
  });
  $('rows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    rows.splice(+b.dataset.del, 1); save(); renderRows(); compute();
  });
  $('add').addEventListener('click', () => { rows.push({ t: '', s: '' }); save(); renderRows(); $('t' + (rows.length - 1)).focus(); });
  $('sample').addEventListener('click', () => { rows = SAMPLE.map((r) => ({ ...r })); save(); renderRows(); compute(); });
  $('clear').addEventListener('click', () => { rows = [{ t: '', s: '' }]; save(); renderRows(); compute(); });

  // ---------- 計算 ----------
  const positions = () => rows.map((r) => {
    const t = r.t.trim(), q = TQ[t], s = Number(r.s) || 0;
    return { t, mv: q ? s * q.p : 0 };
  }).filter((x) => x.t && x.mv > 0);
  function exposure(pos) {
    const m = new Map(), add = (k, name, v, other) => { const c = m.get(k) || { code: k, name, v: 0, other }; c.v += v; m.set(k, c); };
    pos.forEach((x) => {
      const e = ETF[x.t];
      const ws = e && (e.weights || (e.proxy && ETF[e.proxy] && ETF[e.proxy].weights));
      if (ws) {
        const lev = (e && e.leverage) || 1;
        let used = 0;
        ws.forEach(({ code, w }) => { add(code, nameOf(code), x.mv * w * lev); used += w; });
        add(x.t + '-other', `${nameOf(x.t)} 其他成分股`, x.mv * (1 - used) * lev, true);
      } else if (isEtf(x.t)) add(x.t, `${nameOf(x.t)}（ETF，尚未拆解）`, x.mv, true);
      else add(x.t, nameOf(x.t), x.mv);
    });
    return [...m.values()].sort((a, b) => b.v - a.v);
  }

  // ---------- 畫面 ----------
  function compute() {
    const pos = positions(), total = pos.reduce((a, x) => a + x.mv, 0);
    $('total').textContent = total ? money(total) : '—';
    const ex = exposure(pos), cos = ex.filter((e) => !e.other);
    $('k-n').textContent = cos.length ? `${cos.length} 家` : '—';
    $('k-top').textContent = cos[0] ? `${cos[0].name} ${pct(cos[0].v / total)}` : '—';
    $('k-top3').textContent = cos.length ? pct(cos.slice(0, 3).reduce((a, c) => a + c.v, 0) / total) : '—';

    const shown = cos.slice(0, 8), restV = ex.filter((e) => !shown.includes(e)).reduce((a, c) => a + c.v, 0);
    const list = shown.map((c) => ({ ...c, share: c.v / total }));
    if (restV > 0) list.push({ name: '其他（成分股與小部位）', share: restV / total, other: true });
    const max = Math.max(LIMIT * 1.15, ...list.map((c) => c.share));
    $('bars').innerHTML = total ? list.map((c) => `
      <div class="bar${c.other ? ' other' : ''}${!c.other && c.share > LIMIT ? ' over' : ''}">
        <div class="n" title="${esc(c.name)}">${esc(c.name)}${c.code && !c.other ? `<small>${esc(c.code)}</small>` : ''}</div>
        <div class="t"><div class="f" style="width:${(c.share / max * 100).toFixed(2)}%"></div><div class="lim" style="left:${(LIMIT / max * 100).toFixed(2)}%"></div></div>
        <div class="p">${pct(c.share)}</div></div>`).join('') : '<p class="cap">填入至少一檔持股，就會在這裡看到曝險分布。</p>';
    const etfs = [...new Set(pos.filter((x) => ETF[x.t]).map((x) => x.t))].map((c) => ETF[c]);
    const lev = etfs.some((e) => e.leverage);
    $('etf-note').innerHTML = etfs.length ? etfs.map((e) => e.leverage
      ? `${esc(e.name)} 為 ${e.leverage} 倍槓桿：${esc(e.note || '')}。`
      : `${esc(e.name)} 權重資料日 ${esc(e.asof)}，只拆前十大成分股，其餘歸入「其他」。<a href="${esc(e.source)}" target="_blank" rel="noopener">來源</a>`).join('<br>')
      + (lev ? '<br>因為含槓桿，各公司曝險加總會超過 100%。' : '') : '';

    const shown2 = cos.filter((c) => CO[c.code] || (TQ[c.code] && c.v / total >= 0.01));
    const miss = cos.filter((c) => !shown2.includes(c));
    $('cards').innerHTML = shown2.map((c) => CO[c.code] ? card(c, total) : basicCard(c, total)).join('') + (miss.length ? `
      <div class="panel missing"><b>曝險較小的公司</b><p class="cap" style="margin:2px 0 0">占比低於 1%，這裡只列名稱。</p>
      <div class="chips">${miss.map((c) => `<span class="chip">${esc(c.name)} <span class="num muted">${pct(c.v / total)}</span></span>`).join('')}</div></div>` : '');
  }

  function card(c, total) {
    const d = CO[c.code], t = TQ[c.code] || {}, e = d.eps || {};
    const q = GQ[d.symbol] || { price: t.p, pe: t.pe, fpe: null, asof: TW.date };
    const hasEps = e.y26 > 0 && e.y27 > 0;
    const peers = d.peers.map((p) => ({ ...p, ...(GQ[p.symbol] || {}) })).filter((p) => p.fpe > 0);
    const core = peers.filter((p) => !p.ref);
    const med = core.length ? median(core.map((p) => p.fpe)) : null;
    const fwdEps = q.fpe ? q.price / q.fpe : null;
    const rel = med && q.fpe ? q.fpe / med - 1 : null;
    const all = [{ name: d.name, ...q, me: true }, ...peers].sort((a, b) => (b.fpe || 0) - (a.fpe || 0));
    const cap = Math.max(q.fpe || 0, med || 0) * 2.4 || 1;
    const w = (v) => Math.min(v || 0, cap) / cap * 100;
    const sc = (title, v, how) => {
      if (!v || !isFinite(v)) return '';
      const r = v / q.price - 1;
      return `<div class="sc"><div class="t">${title}</div><div class="r">${price(v)}<em class="${r >= 0 ? 'up' : 'dn'}">${spct(r)}</em></div><div class="how">${how}</div></div>`;
    };
    const relTxt = rel == null ? '' : Math.abs(rel) < 0.05 ? '預估本益比和主軸同業相近' : rel > 0 ? `預估本益比比主軸同業貴 ${pct(rel)}` : `預估本益比比主軸同業便宜 ${pct(-rel)}`;
    const stale = hasEps && (Date.now() - new Date(e.date).getTime()) / 864e5 > 60;
    const yf = (s) => `https://finance.yahoo.com/quote/${encodeURIComponent(s)}`;
    return `<article class="co" id="co-${esc(c.code)}">
      <div class="co-h">
        <div><h3>${esc(d.name)}<span>${esc(c.code)}</span></h3><div class="seg">${esc(d.seg)}${relTxt ? '・' + relTxt : ''}</div></div>
        <div class="expo">你的曝險<br><b>${money(c.v)}</b> <span class="muted num">${pct(c.v / total)}</span></div>
      </div>
      <div class="thesis">${bold(d.thesis)}${(d.changes || []).length ? `<ul class="changes">${d.changes.slice(0, 3).map((x) => `<li><b>${esc(md(x.date))}</b>${esc(x.text)}</li>`).join('')}</ul>` : ''}</div>
      <div class="co-b">
        <section>
          <h4>關鍵數字</h4>
          <div class="stats">
            <div class="stat"><div class="l">股價</div><div class="v">${price(q.price)}</div><div class="d">${md(q.asof)}</div></div>
            <div class="stat"><div class="l">預估本益比</div><div class="v">${x1(q.fpe)}</div><div class="d">未來一年</div></div>
            <div class="stat"><div class="l">主軸同業中位數</div><div class="v">${x1(med)}</div><div class="d">預估本益比，${core.length} 家</div></div>
            <div class="stat"><div class="l">近四季本益比</div><div class="v">${x1(q.pe)}</div><div class="d">已實現獲利</div></div>
            <div class="stat"><div class="l">2026 預估 EPS</div><div class="v">${hasEps ? n2(e.y26) : '—'}</div><div class="d">FactSet 中位數</div></div>
            <div class="stat"><div class="l">2027 預估 EPS</div><div class="v">${hasEps ? n2(e.y27) : '—'}</div><div class="d">${hasEps ? `年增 <span class="${e.y27 >= e.y26 ? 'up' : 'dn'}">${spct(e.y27 / e.y26 - 1)}</span>` : '尚無調查'}</div></div>
          </div>
          <p class="eps-range">${hasEps ? `FactSet ${e.n || '—'} 位分析師（${esc(e.date)}）。2026 區間 ${n2(e.y26lo)}–${n2(e.y26hi)}，2027 區間 ${n2(e.y27lo)}–${n2(e.y27hi)}。` : '目前找不到 FactSet 的分析師 EPS 調查。'}${stale ? '<span class="flag bad">預估已超過兩個月，可能已更新</span>' : ''}</p>
        </section>
        <section>
          <h4>預估本益比 vs 主軸同業</h4>
          <div class="pe">${all.map((p) => `
            <div class="pe-row${p.me ? ' me' : ''}${p.ref ? ' ref' : ''}">
              <div class="n" title="${esc(p.name)}・${esc(p.asof || '')}">${esc(p.name)}${p.tag ? `<span class="tg">${esc(p.tag)}</span>` : ''}</div>
              <div class="t"><div class="f${p.fpe > cap ? ' cut' : ''}" style="width:${w(p.fpe).toFixed(2)}%"></div></div>
              <div class="v">${x1(p.fpe)}<small>近四季 ${x1(p.pe)}</small></div></div>`).join('')}
          </div>
          <p class="med-l">主軸同業中位數 ${x1(med)} 倍。條紋代表超出圖表範圍。資料時間：${peers.map((p) => `${esc(p.name)} ${md(p.asof)}`).join('、')}。</p>
        </section>
        <section>
          <h4>可能的價格區間（機械估算）</h4>
          <div class="scen">
            ${sc('以主軸同業評價計', med && fwdEps ? med * fwdEps : null, `主軸同業預估本益比中位數 ${x1(med)} × 市場預估未來一年 EPS ${fwdEps ? n2(fwdEps) : '—'}`)}
            ${sc('本益比不變，EPS 達 2027 預估', q.pe && hasEps ? q.pe * e.y27 : null, `近四季本益比 ${x1(q.pe)} × 2027 預估 EPS ${n2(e.y27)}`)}
            ${sc('分析師目標價中位數', hasEps ? e.target : null, `FactSet 調查（${esc(e.date)}）`)}
          </div>
        </section>
        <section>
          <h4>前景產品與成長動能</h4>
          <ul class="out">${d.outlook.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
        </section>
        ${newsBlock(c.code)}
      </div>
      <div class="src">來源：${d.sources.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join('')}<a href="${yf(d.symbol)}" target="_blank" rel="noopener">${esc(d.name)} 報價</a>${peers.map((p) => `<a href="${yf(p.symbol)}" target="_blank" rel="noopener">${esc(p.name)}</a>`).join('')}<span>分析更新：${esc(d.reviewed)}</span></div>
    </article>`;
  }

  function basicCard(c, total) {
    const t = TQ[c.code];
    return `<article class="co" id="co-${esc(c.code)}">
      <div class="co-h">
        <div><h3>${esc(c.name)}<span>${esc(c.code)}</span></h3><div class="seg">股價 ${price(t.p)}・近四季本益比 ${x1(t.pe)}・${esc(md(TW.date))} 收盤</div></div>
        <div class="expo">你的曝險<br><b>${money(c.v)}</b> <span class="muted num">${pct(c.v / total)}</span></div>
      </div>
      <div class="thesis">這家公司的分析師重點、同業比較與預估 EPS 還沒建立。${(COV.order || []).includes(c.code) ? '已在分析清單中，每週六會陸續補上。' : '目前不在分析清單中。'}</div>
      ${newsBlock(c.code) ? `<div class="co-b">${newsBlock(c.code)}</div>` : ''}
    </article>`;
  }

  function newsBlock(code) {
    const items = ((NEWS.companies || {})[code] || []).slice(0, 5);
    if (!items.length) return '';
    return `<section><h4>近期新聞</h4><ul class="news">${items.map((n) => `
      <li><span class="imp ${esc(n.impact || 'neutral')}">${IMP[n.impact] || '中性'}</span>
        <div class="tt"><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></div>
        <div class="sm"><span>${esc(md(n.date))}・${esc(n.source || '')}</span>${esc(n.summary || '')}</div></li>`).join('')}</ul></section>`;
  }

  renderRows();
  compute();
})();
