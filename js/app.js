import * as E from './engine.js';
import { validateRates, validateNews } from './validate.js';

// ---------- State ----------
const STORE = 'paysa.v1';
const TODAY = new Date();

const DEFAULT_PROFILE = {
  name: 'Me', dob: '1990-04-15', doj: '2015-07-01',
  level: '7', basic: E.MATRIX['7'][3], city: 'X', tpta: true,
  scheme: 'NPS', group: 'B', el: 180, incMonth: 'Jul',
};
// Starting point for someone new: a fresh Level 6 entrant under NPS
const NEW_PERSON = {
  name: '', relation: 'Colleague', dob: '1995-06-15', doj: '2020-07-01',
  level: '6', basic: E.MATRIX['6'][0], city: 'Y', tpta: false,
  scheme: 'NPS', group: 'C', el: 120, incMonth: 'Jul',
};
const RELATIONS = ['Spouse', 'Parent', 'Sibling', 'Friend', 'Colleague', 'Client', 'Other'];
const DEFAULT_UI = { tab: 'salary', daMode: 'notified', cpc8: null, macp: true, daStep: 3, npsReturn: 9, matrixLevel: null, theme: 'auto', newsFilter: 'All', newsSeen: null };

const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const saved = load();
const uid = () => Math.random().toString(36).slice(2, 9);

// Everyone whose pay is being worked out. The first person is always the user ("Me").
// Older saves held a single `profile`, so that becomes "Me".
let people = saved.people?.length
  ? saved.people
  : [{ ...DEFAULT_PROFILE, ...saved.profile, id: 'me', self: true, corpus: saved.ui?.corpus ?? null }];
let activeId = people.some(p => p.id === saved.activeId) ? saved.activeId : people[0].id;
let P = people.find(p => p.id === activeId);
let ui = { ...DEFAULT_UI, ...saved.ui };
delete ui.corpus;
const firstRun = !saved.people && !saved.profile;

const persist = () => {
  people = people.map(p => (p.id === P.id ? P : p));
  try { localStorage.setItem(STORE, JSON.stringify({ people, activeId, ui })); } catch { /* private mode */ }
};
function switchTo(id) {
  activeId = id;
  P = people.find(p => p.id === id);
  persist();
  render(true);
}
const initials = name => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
// Stable avatar colour per person
const hueOf = id => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 17);
const avatarStyle = p => p.self
  ? 'background:linear-gradient(145deg,var(--saffron),var(--rose));color:#fff'
  : `background:linear-gradient(145deg,hsl(${hueOf(p.id)} 75% 60%),hsl(${(hueOf(p.id) + 50) % 360} 70% 50%));color:#fff`;
const whose = () => (P.self ? 'Your' : `${esc(P.name.split(' ')[0])}’s`);

// ---------- Format ----------
const nf = new Intl.NumberFormat('en-IN');
const inr = n => '₹' + nf.format(Math.round(n));
const lakh = n => {
  const a = Math.abs(n);
  if (a >= 1e7) return '₹' + (n / 1e7).toFixed(a >= 1e8 ? 1 : 2).replace(/\.?0+$/, '') + ' Cr';
  if (a >= 1e5) return '₹' + (n / 1e5).toFixed(a >= 1e6 ? 1 : 2).replace(/\.?0+$/, '') + ' L';
  return inr(n);
};
const df = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const mf = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
const my = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' });
const fdate = d => df.format(d);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lvlName = l => `Level ${l}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// Count-up for hero numbers (remembers the last value per key so updates glide)
const lastVals = new Map();
function countUps(root) {
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = Number(el.dataset.count), key = el.dataset.key || el.dataset.count;
    const from = lastVals.get(key) ?? to * 0.82;
    lastVals.set(key, to);
    const fmt = el.dataset.fmt === 'lakh' ? lakh : n => nf.format(Math.round(n));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 900;
    const tick = t => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const icon = {
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
};

const seg = (name, options, value) => `
  <div class="seg" data-seg="${name}">
    <span class="seg-pill"></span>
    ${options.map(([v, label]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(value)}">${label}</button>`).join('')}
  </div>`;

const currentDA = () => E.daFor(TODAY, ui.daMode === 'expected');
const projOpts = () => ({ macp: ui.macp, daStep: ui.daStep, includeExpected: true });

// ================= Salary =================
function screenSalary() {
  const da = currentDA();
  const s = E.salary(P, da);
  const arr = E.daArrears(P, TODAY);
  const parts = [['Basic', s.basic, 'var(--saffron)'], ['DA', s.daAmt, 'var(--rose)'], ['HRA', s.hra, 'var(--indigo)'], ['TA', s.ta, 'var(--teal)']];
  const notified = E.daFor(TODAY, false), expected = E.daFor(TODAY, true);

  return `
  <section class="glass glass--lens hero pressable">
    <div class="hero-glow"></div>
    <div class="eyebrow">${P.self ? 'Take-home' : whose() + ' take-home'} · ${mf.format(TODAY)}</div>
    <div class="big num"><span class="rs">₹</span><span data-count="${s.net}" data-key="net">${nf.format(s.net)}</span></div>
    <div class="small muted">Gross <b class="num" style="color:var(--ink)">${inr(s.gross)}</b> &nbsp;·&nbsp; Deductions <b class="num" style="color:var(--ink)">${inr(s.totalDed)}</b></div>
    <div class="split">${parts.map(([, v, c]) => `<span style="flex-grow:${v};background:${c}"></span>`).join('')}</div>
    <div class="legend">${parts.map(([k, v, c]) => `<span><i style="background:${c}"></i>${k} ${Math.round(v / s.gross * 100)}%</span>`).join('')}</div>
  </section>

  <div class="row">
    <div class="chips">
      <span class="chip"><span class="dot"></span>${lvlName(P.level)}</span>
      <span class="chip">${P.city}-class city</span>
      <span class="chip">${P.scheme}</span>
    </div>
  </div>

  ${expected !== notified
    ? seg('daMode', [['notified', `DA ${notified}% · notified`], ['expected', `${expected}% · expected`]], ui.daMode)
    : ''}

  <section class="glass card">
    <div class="row"><div class="eyebrow">Earnings</div><span class="tiny muted">per month</span></div>
    <div class="lines">
      <div class="line"><span class="k">Basic pay<small>${lvlName(P.level)}, cell ${E.MATRIX[P.level].indexOf(P.basic) + 1}</small></span><span class="v">${inr(s.basic)}</span></div>
      <div class="line"><span class="k">Dearness Allowance<small>${da}% of basic</small></span><span class="v">${inr(s.daAmt)}</span></div>
      <div class="line"><span class="k">House Rent Allowance<small>${s.hraPct}% · ${P.city}-class city</small></span><span class="v">${inr(s.hra)}</span></div>
      <div class="line"><span class="k">Transport Allowance<small>${inr(s.ta0)} + DA · ${P.tpta ? 'higher-TPTA city' : 'other place'}</small></span><span class="v">${inr(s.ta)}</span></div>
      <div class="line total"><span class="k">Gross</span><span class="v">${inr(s.gross)}</span></div>
    </div>
  </section>

  <section class="glass card">
    <div class="row"><div class="eyebrow">Deductions</div><span class="tiny muted">per month</span></div>
    <div class="lines">
      ${s.deductions.map(([k, v]) => `<div class="line"><span class="k">${k}</span><span class="v neg">−${inr(v)}</span></div>`).join('')}
      <div class="line total"><span class="k">Take-home</span><span class="v">${inr(s.net)}</span></div>
    </div>
    ${s.govtShare ? `<div class="callout" style="margin-top:12px">
      <div class="ic">${icon.shield}</div>
      <div class="small"><b>Govt adds ${inr(s.govtShare)}</b> every month to ${P.self ? 'your' : 'their'} ${P.scheme} account (${P.scheme === 'UPS' ? '18.5' : '14'}% of Basic + DA). It isn't in the take-home, but it builds ${P.self ? 'your' : 'their'} pension.</div>
    </div>` : ''}
  </section>

  ${arr ? `
  <section class="glass card callout warm">
    <div class="ic">${icon.spark}</div>
    <div>
      <div class="eyebrow">When DA ${arr.newRate}% is approved</div>
      <div class="h2" style="font-size:24px"><span class="num">+${inr(arr.perMonth)}</span><em>/mo</em></div>
      <div class="small muted" style="margin-top:4px">Arrears of <b style="color:var(--ink)">${inr(arr.total)}</b> for ${plural(arr.months, 'month')} (${my.format(arr.from)} – ${my.format(arr.to)}), about ${inr(arr.net)} after ${P.scheme === 'OPS' ? 'deductions' : P.scheme + ' cut'}.</div>
    </div>
  </section>` : ''}

  <section class="glass card" id="cpc8Card">
    <div class="row">
      <div><div class="eyebrow">8th Pay Commission · what-if</div><div class="h2">Fitment <em>×<span id="cpcF">${fitment().toFixed(2)}</span></em></div></div>
    </div>
    <input class="slider" type="range" min="${E.RATES.cpc8.fitmentMin}" max="${E.RATES.cpc8.fitmentMax}" step="0.01" value="${fitment()}" id="cpcSlider" aria-label="8th CPC fitment factor">
    <div class="row tiny muted"><span>×${E.RATES.cpc8.fitmentMin.toFixed(2)}</span><span>×${E.RATES.cpc8.fitmentMax.toFixed(2)}</span></div>
    <div class="grid2" style="margin-top:12px" id="cpcOut">${cpcTiles()}</div>
    <p class="tiny muted" style="margin:10px 2px 0">DA resets to 0 and HRA drops to the base rates when a new pay commission starts. Status: ${esc(E.RATES.cpc8.status || '')}.</p>
  </section>

  <p class="footer-note">Tax is a new-regime estimate for FY ${E.RATES.tax.fy}. Rates checked ${E.RATES_CHECKED}.</p>`;
}

const fitment = () => {
  const { fitmentMin, fitmentMax, fitmentDefault } = E.RATES.cpc8;
  return Math.min(fitmentMax, Math.max(fitmentMin, ui.cpc8 ?? fitmentDefault));
};

function cpcTiles() {
  const now = E.salary(P, E.daFor(TODAY, false), { withTax: false });
  const newBasic = E.round100(P.basic * fitment());
  const s8 = E.salary({ ...P, basic: newBasic }, 0, { withTax: false });
  const pct = (s8.gross / now.gross - 1) * 100;
  return `
    <div class="tile glass"><div class="label">New basic</div><div class="value">${inr(newBasic)}</div><div class="sub">from ${inr(P.basic)}</div></div>
    <div class="tile glass"><div class="label">New gross</div><div class="value">${inr(s8.gross)}</div><div class="sub ${pct >= 0 ? 'pos' : 'neg'}">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs today</div></div>`;
}

// ================= Career =================
function screenCareer() {
  const proj = E.project(P, TODAY, projOpts());
  const ev = proj.events;
  const nextInc = ev.find(e => e.type === 'increment');
  const nextMacp = ev.find(e => e.type === 'macp');
  const last = proj.rows[proj.rows.length - 1];
  const shown = compactEvents(ev);

  return `
  <section class="glass glass--lens card">
    <div class="eyebrow">${whose()} pay path to ${proj.retire.getFullYear()}</div>
    <div class="h2">Basic grows to <em class="num">${lakh(last.basic)}</em></div>
    <div class="small muted" style="margin-top:4px">${lvlName(P.level)} → ${lvlName(last.level)} · DA ${last.da}% by retirement</div>
    ${chart(proj)}
    <div class="legend"><span><i style="background:var(--rose)"></i>Basic + DA</span><span><i style="background:var(--indigo)"></i>Basic</span><span><i style="background:#fff;box-shadow:0 0 0 2px var(--indigo)"></i>MACP</span></div>
  </section>

  <div class="grid2">
    <div class="tile glass pressable">
      <div class="label">Next increment</div>
      <div class="value">${nextInc ? '+' + inr(nextInc.basic - nextInc.from) : '—'}</div>
      <div class="sub">${nextInc ? '1 ' + my.format(nextInc.date) + ' → ' + inr(nextInc.basic) : 'At the top of your level'}</div>
    </div>
    <div class="tile glass pressable">
      <div class="label">Next MACP</div>
      <div class="value">${nextMacp ? lvlName(nextMacp.level) : '—'}</div>
      <div class="sub">${nextMacp ? fdate(nextMacp.date) + ' · ' + inr(nextMacp.basic) : ui.macp ? 'All three used' : 'MACP turned off'}</div>
    </div>
  </div>

  <section class="glass card stack">
    <div class="row">
      <div><div class="t" style="font-weight:550">Include MACP upgrades</div><div class="tiny muted">At 10, 20 and 30 years of service</div></div>
      <label class="switch"><input type="checkbox" id="macpToggle" ${ui.macp ? 'checked' : ''} aria-label="Include MACP"><span></span></label>
    </div>
    <div>
      <div class="row"><span class="small" style="font-weight:550">DA rise every 6 months</span><span class="small num"><b id="daStepVal">${ui.daStep}</b>%</span></div>
      <input class="slider" type="range" min="0" max="5" step="0.5" value="${ui.daStep}" id="daStep" aria-label="DA rise per half-year">
      <div class="tiny muted">Recent average is about 2.8%. No future pay commission is assumed here.</div>
    </div>
  </section>

  <section class="glass card">
    <div class="eyebrow">Milestones</div>
    <div class="timeline" style="margin-top:6px">
      ${shown.map(e => `
        <div class="tl ${e.type}">
          <span class="node"><i></i></span>
          <div><div class="t">${e.title}</div><div class="d">${e.sub}</div></div>
          <div class="amt">${e.amt}</div>
        </div>`).join('')}
    </div>
  </section>`;
}

function compactEvents(ev) {
  const out = [];
  let incs = 0, stag = false;
  for (const e of ev) {
    if (e.type === 'increment') {
      if (incs++ < 2) out.push({ type: 'increment', title: 'Annual increment', sub: fdate(e.date) + ' · 3%', amt: inr(e.basic) });
    } else if (e.type === 'stagnation') {
      if (!stag) { stag = true; out.push({ type: 'stagnation', title: 'Top of ' + lvlName(e.level), sub: fdate(e.date) + ' · stagnation, no more cells', amt: inr(e.basic) }); }
    } else if (e.type === 'macp') {
      out.push({ type: 'macp', title: `MACP ${['I', 'II', 'III'][e.n - 1]} → ${lvlName(e.level)}`, sub: fdate(e.date) + ` · ${e.n * 10} years of service`, amt: inr(e.basic) });
    } else if (e.type === 'retire') {
      out.push({ type: 'retire', title: 'Superannuation', sub: fdate(e.date) + ' · age 60', amt: inr(e.basic) });
    }
  }
  return out;
}

function chart(proj) {
  const W = 340, H = 180, pl = 34, pr = 8, pt = 14, pb = 22;
  const yearly = proj.rows.filter((r, i) => i === 0 || r.date.getMonth() === 0 || i === proj.rows.length - 1);
  const pts = yearly.map(r => ({ t: r.date.getTime(), b: r.basic, g: r.basic * (1 + r.da / 100) }));
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const maxY = Math.max(...pts.map(p => p.g)) * 1.08;
  const x = t => pl + (t - t0) / (t1 - t0 || 1) * (W - pl - pr);
  const y = v => pt + (1 - v / maxY) * (H - pt - pb);
  const path = key => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
  const area = path('g') + `L${x(t1).toFixed(1)},${y(0)}L${x(t0).toFixed(1)},${y(0)}Z`;
  const ticks = [0.25, 0.5, 0.75, 1].map(k => maxY * k / 1.08);
  const years = [];
  const y0 = new Date(t0).getFullYear(), y1 = new Date(t1).getFullYear();
  const step = Math.max(1, Math.ceil((y1 - y0) / 5));
  for (let yr = y0 + 1; yr <= y1; yr += step) years.push(yr);
  const macps = proj.events.filter(e => e.type === 'macp');
  const gAt = d => { const r = proj.rows.find(r => r.date >= new Date(d.getFullYear(), d.getMonth(), 1)) || proj.rows[proj.rows.length - 1]; return r.basic * (1 + r.da / 100); };
  return `
  <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected pay by year">
    <defs>
      <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--rose)" stop-opacity=".35"/><stop offset="1" stop-color="var(--rose)" stop-opacity="0"/></linearGradient>
      <linearGradient id="gLine" x1="0" x2="1"><stop offset="0" stop-color="var(--saffron)"/><stop offset="1" stop-color="var(--rose)"/></linearGradient>
    </defs>
    ${ticks.map(v => `<line class="axis" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="0" y="${y(v) + 3}">${(v / 1e5).toFixed(v < 1e6 ? 2 : 1)} L</text>`).join('')}
    ${years.map(yr => `<text x="${x(new Date(yr, 0, 1).getTime())}" y="${H - 4}" text-anchor="middle">${yr}</text>`).join('')}
    <path class="area" d="${area}" fill="url(#gArea)"/>
    <path class="ln ln-draw" style="--len:1200" d="${path('b')}" stroke="var(--indigo)"/>
    <path class="ln ln-draw" style="--len:1200" d="${path('g')}" stroke="url(#gLine)"/>
    ${macps.map(e => `<circle class="ev" cx="${x(e.date.getTime())}" cy="${y(gAt(e.date))}" r="4.5" fill="var(--indigo)"/>`).join('')}
  </svg>`;
}

// ================= Retirement =================
function screenRetire() {
  const proj = E.project(P, TODAY, projOpts());
  const autoCorpus = E.estimateCorpusSoFar(P, TODAY, ui.npsReturn / 100);
  const corpusNow = P.corpus ?? autoCorpus;
  const R = E.retirement(P, proj, { npsReturn: ui.npsReturn / 100, corpusNow });
  const doj = E.parseISO(P.doj);
  const total = E.monthsBetween(doj, R.retire) || 1;
  const done = Math.max(0, Math.min(total, E.monthsBetween(doj, TODAY)));
  const pct = done / total;
  const left = E.serviceSpan(TODAY, R.retire);
  const C = 2 * Math.PI * 50;
  const yrsAhead = (R.retire - TODAY) / (365.25 * 864e5);
  const today = v => Math.round(v / Math.pow(1.06, yrsAhead));

  const opsElig = R.ops.eligible, newElig = !opsElig;
  const schemes = [
    { k: 'NPS', amt: R.nps.pension, per: 'annuity on 40% corpus', ok: newElig },
    { k: 'UPS', amt: R.ups.withDR, per: 'assured + DR', ok: newElig },
    { k: 'OPS', amt: R.ops.withDR, per: '50% basic + DR', ok: opsElig },
  ];
  const best = schemes.filter(s => s.ok).sort((a, b) => b.amt - a.amt)[0];

  const lumps = [
    ['Gratuity', R.gratuity, `${R.halfYears} half-years · capped at ${lakh(E.GRATUITY_CEILING)}`],
    ['Leave encashment', R.leave, `${Math.min(P.el, 300)} days of EL`],
  ];
  if (P.scheme === 'NPS') lumps.push(['NPS withdrawal', R.nps.lump, `60% of ${lakh(R.nps.corpus)} corpus, tax-free`]);
  if (P.scheme === 'UPS') lumps.push(['UPS lump sum', R.ups.lump, '1/10 of pay for every 6 months served']);
  if (P.scheme === 'OPS') lumps.push(['Commutation', R.ops.commutation, '40% commuted, factor 8.194']);
  const lumpTotal = lumps.reduce((s, l) => s + l[1], 0);

  return `
  <section class="glass glass--lens card">
    <div class="row" style="align-items:center">
      <svg class="ring" viewBox="0 0 120 120" aria-label="${Math.round(pct * 100)}% of service completed">
        <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--saffron)"/><stop offset=".6" stop-color="var(--rose)"/><stop offset="1" stop-color="var(--indigo)"/></linearGradient></defs>
        <circle class="track" cx="60" cy="60" r="50"/>
        <circle class="prog" cx="60" cy="60" r="50" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-offset="${C * (1 - pct)}"/>
        <text x="60" y="62" text-anchor="middle" font-size="30">${Math.round(pct * 100)}%</text>
        <text x="60" y="80" text-anchor="middle" font-size="11" style="font-family:var(--font-ui);fill:var(--ink-3)">served</text>
      </svg>
      <div style="flex:1">
        <div class="eyebrow">${P.self ? 'You retire' : esc(P.name.split(' ')[0]) + ' retires'} on</div>
        <div class="h2">${fdate(R.retire)}</div>
        <div class="small muted" style="margin-top:6px"><b style="color:var(--ink)">${left.years} yrs ${left.months} mos</b> to go</div>
        <div class="tiny muted" style="margin-top:2px">Service ${R.service.years}y ${R.service.months}m · last basic ${inr(R.lastBasic)}</div>
      </div>
    </div>
  </section>

  <div>
    <div class="row" style="padding:0 4px 8px"><span class="eyebrow">Monthly pension at retirement</span><span class="tiny muted">first month</span></div>
    <div class="grid3">
      ${schemes.map(s => `
        <div class="scheme glass pressable ${s === best ? 'best' : ''} ${s.ok ? '' : 'na'}">
          <span class="name">${s.k}${s.k === P.scheme ? (P.self ? ' · yours' : ' · theirs') : ''}</span>
          <span class="amt">${lakh(s.amt)}</span>
          <span class="per">${s.per}</span>
          <span class="per">≈ ${lakh(today(s.amt))} today</span>
          ${s.ok ? (s === best ? '<span class="badge">Highest</span>' : '') : `<span class="badge">${s.k === 'OPS' ? 'Pre-2004 only' : 'Not for you'}</span>`}
        </div>`).join('')}
    </div>
  </div>

  <section class="glass card">
    <div class="row"><div class="eyebrow">Lump sums on retirement</div><span class="tiny muted">one-time</span></div>
    <div class="h2" style="margin-top:6px"><span data-count="${lumpTotal}" data-key="lump" data-fmt="lakh">${lakh(lumpTotal)}</span></div>
    <div class="lines" style="margin-top:6px">
      ${lumps.map(([k, v, sub]) => `<div class="line"><span class="k">${k}<small>${sub}</small></span><span class="v">${lakh(v)}</span></div>`).join('')}
    </div>
    ${P.scheme !== 'OPS' ? `<div class="callout" style="margin-top:12px"><div class="ic">${icon.info}</div><div class="small">
      ${P.scheme === 'UPS'
        ? `UPS family pension would be <b>${inr(R.ups.family)}</b> (60%) before DR. Payout assumes you don't take the optional 60% corpus withdrawal.`
        : `Switching to UPS would give an assured <b>${inr(R.ups.withDR)}/mo</b> plus a <b>${lakh(R.ups.lump)}</b> lump sum, compared with an annuity of <b>${inr(R.nps.pension)}</b> under NPS.`}
    </div></div>` : ''}
  </section>

  <section class="glass card stack">
    <div class="eyebrow">Assumptions</div>
    <div>
      <div class="row"><span class="small" style="font-weight:550">NPS return</span><span class="small num"><b id="npsVal">${ui.npsReturn}</b>% a year</span></div>
      <input class="slider" type="range" min="6" max="12" step="0.5" value="${ui.npsReturn}" id="npsReturn" aria-label="NPS return">
    </div>
    <div class="field">
      <label for="corpus">Corpus so far ${P.corpus == null ? '(estimated, edit to match your statement)' : ''}</label>
      <input id="corpus" inputmode="numeric" value="${nf.format(corpusNow)}">
    </div>
    <div class="tiny muted">Annuity at 6% a year. DA rises ${ui.daStep}% every 6 months (change it on Career). "Today" values discount 6% inflation a year. All figures are estimates.</div>
  </section>`;
}

// ================= Rates =================
function screenRates() {
  const lvl = ui.matrixLevel ?? P.level;
  const cells = E.MATRIX[lvl];
  const hist = E.DA_HISTORY;
  const maxDA = Math.max(...hist.map(h => h.rate));
  const R = E.RATES;
  // "9 and above", "3 to 8", "1–2 (pay ≥ ₹24,200)"… built from the TA rows (highest level first)
  const lvlRange = (row, i, rows) => {
    const above = rows.slice(0, i).reverse().find(r => r.minLevel !== row.minLevel);
    const hi = above ? E.LEVELS[E.levelIndex(above.minLevel) - 1] : null;
    const base = !hi ? `${row.minLevel} and above` : hi === row.minLevel ? row.minLevel : `${row.minLevel}–${hi}`;
    return row.minPay ? `${base} (pay ≥ ${inr(row.minPay)})` : base;
  };
  const halfLabel = iso => { const d = E.parseISO(iso); return (d.getMonth() ? 'Jul' : 'Jan') + ' ’' + String(d.getFullYear()).slice(2); };

  return `
  <section class="glass glass--lens card">
    <div class="row"><div><div class="eyebrow">Dearness Allowance</div><div class="h2">Now <em>${E.daFor(TODAY, false)}%</em>, next ${E.daFor(TODAY, true)}%</div></div></div>
    <div class="da-bars">
      ${hist.map((h, i) => `
        <div class="da-bar ${h.status}">
          <span class="p">${h.rate}%</span>
          <span class="b" style="height:${Math.round(h.rate / maxDA * 96)}px;animation-delay:${i * 60}ms"></span>
          <span class="m">${halfLabel(h.from)}</span>
        </div>`).join('')}
    </div>
    <div class="tiny muted" style="margin-top:10px">Striped bar = expected, awaiting Cabinet approval.</div>
    ${R.notice ? `<div class="callout" style="margin-top:12px"><div class="ic">${icon.info}</div><div class="small">${esc(R.notice)}</div></div>` : ''}
    <div class="tiny muted" style="margin-top:10px">Rates update automatically on every phone. Data version ${R.version} · ${E.RATES_CHECKED}.</div>
  </section>

  <section class="glass card">
    <div class="eyebrow">Pay matrix</div>
    <div class="levels" role="group" aria-label="Pay level">
      ${E.LEVELS.map(l => `<button data-level="${l}" aria-pressed="${l === lvl}">L${l}</button>`).join('')}
    </div>
    <div class="cells">
      ${cells.map((c, i) => `<div class="cell ${lvl === P.level && c === P.basic ? 'you' : ''}"><small>${i + 1}</small>${nf.format(c)}</div>`).join('')}
    </div>
  </section>

  <section class="glass card">
    <div class="eyebrow">HRA</div>
    <table class="rt" style="margin-top:6px">
      <tr><th>City class</th><th>Rate</th><th>Minimum</th></tr>
      ${['X', 'Y', 'Z'].map(c => `<tr><td>${c}${c === P.city ? (P.self ? ' · you' : ' · ' + esc(P.name.split(' ')[0])) : ''}</td><td>${Math.round(E.hraRate(c, E.daFor(TODAY, false)) * 100)}%</td><td>${inr(E.HRA_MIN[c])}</td></tr>`).join('')}
    </table>
  </section>

  <section class="glass card">
    <div class="eyebrow">Transport Allowance (+ DA)</div>
    <table class="rt" style="margin-top:6px">
      <tr><th>Level</th><th>Higher-TPTA</th><th>Other</th></tr>
      ${R.ta.map((t, i, rows) => `<tr><td>${lvlRange(t, i, rows)}</td><td>${inr(t.tpta)}</td><td>${inr(t.other)}</td></tr>`).join('')}
    </table>
  </section>

  <div class="grid2">
    <div class="tile glass"><div class="label">Gratuity ceiling</div><div class="value">${lakh(R.gratuityCeiling)}</div><div class="sub">Maximum payable</div></div>
    <div class="tile glass"><div class="label">Leave encashment</div><div class="value">${R.leaveMaxDays} days</div><div class="sub">Maximum EL</div></div>
    <div class="tile glass"><div class="label">NPS contribution</div><div class="value">${R.nps.employee}% + ${R.nps.govt}%</div><div class="sub">You + Govt</div></div>
    <div class="tile glass"><div class="label">UPS contribution</div><div class="value">${R.ups.employee}% + ${R.ups.govt}%</div><div class="sub">You + Govt</div></div>
    <div class="tile glass"><div class="label">UPS minimum</div><div class="value">${inr(R.ups.minPayout)}</div><div class="sub">With ${R.ups.minServiceYears}+ years of service</div></div>
    <div class="tile glass"><div class="label">OPS minimum</div><div class="value">${inr(R.ops.minPension)}</div><div class="sub">Plus DR</div></div>
  </div>

  <section class="glass card">
    <div class="eyebrow">Sources · rates updated ${E.RATES_CHECKED}</div>
    <div class="src" style="margin-top:6px">
      ${R.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}<span>${esc(s.publisher || '')} ↗</span></a>`).join('')}
    </div>
  </section>

  <p class="footer-note">Paysa is a personal calculator, not an official Government app. Check the OPS pension rules and railway GIS amounts with your office.</p>`;
}

// ================= News =================
const NEWS_FILTERS = ['All', 'Official', 'DA', 'Pension', '8th CPC', 'Railways', 'CGHS', 'Tax'];
const ago = iso => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : df.format(new Date(iso));
};

function screenNews() {
  const all = news?.items ?? [];
  const f = ui.newsFilter;
  const list = all.filter(i => f === 'All' || (f === 'Official' ? i.official : i.tags.includes(f)));
  const seen = seenBefore ?? 0;
  const pending = E.DA_HISTORY.find(d => d.status === 'expected');

  return `
  <section class="glass glass--lens card">
    <div class="eyebrow">For central govt employees & pensioners</div>
    <div class="h2">What’s <em>new</em></div>
    <div class="small muted" style="margin-top:4px">${news ? `Updated automatically · checked ${ago(news.updated)}` : 'Connect to the internet to load news.'}</div>
    <div class="callout" style="margin-top:12px">
      <div class="ic">${icon.shield}</div>
      <div class="small">Official DA is <b>${E.daFor(TODAY, false)}%</b>${pending ? ` · ${my.format(E.parseISO(pending.from))} not yet announced` : ''}. Paysa changes its rates only after a Government order, not from news reports.</div>
    </div>
  </section>

  <div class="levels news-filters" role="group" aria-label="Filter news">
    ${NEWS_FILTERS.map(t => `<button data-news-filter="${t}" aria-pressed="${t === f}">${t}</button>`).join('')}
  </div>

  ${list.length ? `<div class="news-list">${list.map(i => `
    <a class="news glass pressable" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">
      <div class="news-meta">
        ${i.official ? '<span class="nb nb--off">Official</span>' : '<span class="nb">Media report</span>'}
        <span class="news-src">${esc(i.source)}</span>
        <span class="news-dot">·</span>
        <span>${ago(i.date)}</span>
        ${Date.parse(i.date) > seen ? '<span class="news-new" aria-label="New"></span>' : ''}
      </div>
      <div class="news-title">${esc(i.title)}</div>
      ${i.summary ? `<div class="news-sum">${esc(i.summary)}</div>` : ''}
      <div class="news-tags">${i.tags.map(t => `<span>${esc(t)}</span>`).join('')}<span class="news-go">Read ↗</span></div>
    </a>`).join('')}</div>`
    : `<section class="glass card" style="text-align:center"><div class="h2" style="font-size:22px">Nothing here yet</div><p class="small muted">${all.length ? 'No stories match this filter.' : 'News appears here once the app is online.'}</p></section>`}

  <p class="footer-note">Headlines are collected automatically from PIB and news outlets several times a day. Media reports can be speculation; only a Government order is final. Opening a story takes you to that website.</p>`;
}

// ================= Live data (rates + news) =================
// Both files are published with the app and refreshed in the background. Nothing about the user is
// sent: these are plain file downloads, identical for everyone.
const DATA = new URL('data/', document.baseURI);
const CACHE_RATES = 'paysa.rates', CACHE_NEWS = 'paysa.news';
let news = null;
let seenBefore = null;        // newsSeen at the moment the News tab was opened (for "new" dots)
let lastCheck = 0;
const readCache = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const writeCache = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or private */ } };

async function fetchJSON(name) {
  const res = await fetch(new URL(name, DATA), { cache: 'no-cache', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

/** Returns true if the rates in use changed. Bad or older files are ignored and the last good copy stays. */
async function refreshRates() {
  try {
    const r = await fetchJSON('rates.json');
    if (validateRates(r).length) return false;
    if (E.RATES && r.version <= E.RATES.version) return false;
    const before = E.RATES ? E.daFor(TODAY, false) : null;
    E.useRates(r);
    writeCache(CACHE_RATES, r);
    if (before != null) {
      const now = E.daFor(TODAY, false);
      toast(now !== before ? `DA updated: ${before}% → ${now}%` : 'Rates updated');
    }
    return true;
  } catch { return false; }
}

async function refreshNews() {
  try {
    const n = await fetchJSON('news.json');
    if (validateNews(n).length) return false;
    if (news && n.updated <= news.updated) return false;
    news = n;
    writeCache(CACHE_NEWS, n);
    return true;
  } catch { return false; }
}

async function refreshAll() {
  lastCheck = Date.now();
  const [ratesChanged, newsChanged] = await Promise.all([refreshRates(), refreshNews()]);
  updateNewsBadge();
  if (ratesChanged || (newsChanged && ui.tab === 'news')) render(false);
}

function updateNewsBadge() {
  const seen = ui.newsSeen ? Date.parse(ui.newsSeen) : 0;
  const fresh = (news?.items ?? []).filter(i => Date.parse(i.date) > seen).length;
  const badge = document.getElementById('newsBadge');
  badge.hidden = !fresh || ui.tab === 'news';
  badge.textContent = fresh > 9 ? '9+' : fresh;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 4200);
}

// Shown above every tab while you're looking at someone else's numbers
function viewingBanner() {
  const me = people.find(p => p.self);
  return `
  <div class="viewing glass">
    <span class="pav pav--sm" style="${avatarStyle(P)}">${initials(P.name)}</span>
    <span class="viewing-txt"><b>${esc(P.name)}</b><small>${esc(P.relation || 'Other')} · ${lvlName(P.level)} · ${P.scheme}</small></span>
    <button class="viewing-back" data-switch-to="${me.id}">Back to me</button>
  </div>`;
}

// ================= Sheets =================
const sheetEl = () => document.getElementById('sheet');
let sheetTimer = 0;
function showSheet(html) {
  const sheet = sheetEl(), scrim = document.getElementById('scrim');
  clearTimeout(sheetTimer);
  sheet.innerHTML = `<div class="grabber"></div>${html}`;
  scrim.hidden = false; sheet.hidden = false;
  scrim.classList.remove('closing'); sheet.classList.remove('closing');
  sheet.scrollTop = 0;
  placeSegPills(sheet);
  scrim.onclick = closeSheet;
  sheet.querySelector('[data-close]')?.addEventListener('click', closeSheet);
}
function closeSheet() {
  const sheet = sheetEl(), scrim = document.getElementById('scrim');
  sheet.classList.add('closing'); scrim.classList.add('closing');
  sheetTimer = setTimeout(() => { sheet.hidden = true; scrim.hidden = true; }, 320);
  document.getElementById('profileBtn').focus({ preventScroll: true });
}
const closeBtn = label => `<button class="btn btn--ghost" data-close style="padding:8px 14px;font-size:13px">${label}</button>`;

// ---------- People: switch between yourself and anyone else ----------
function openPeople() {
  const row = p => {
    const s = E.salary(p, E.daFor(TODAY, false));
    const active = p.id === activeId;
    return `
      <div class="person ${active ? 'active' : ''}">
        <button class="person-main" data-switch="${p.id}" aria-pressed="${active}">
          <span class="pav" style="${avatarStyle(p)}">${initials(p.name)}</span>
          <span class="pinfo">
            <span class="pname"><span class="pn">${esc(p.name)}</span>${p.self ? ' <span class="tag">You</span>' : ` <span class="tag tag--soft">${esc(p.relation || 'Other')}</span>`}</span>
            <span class="psub">${lvlName(p.level)} · ${p.scheme} · take-home ${inr(s.net)}</span>
          </span>
          ${active ? '<span class="tick" aria-label="Currently viewing">✓</span>' : ''}
        </button>
        <button class="pedit" data-edit="${p.id}" aria-label="Edit ${esc(p.name)}">
          <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>
        </button>
      </div>`;
  };
  showSheet(`
    <div class="row"><h2 class="h2" id="sheetTitle">Whose <em>pay?</em></h2>${closeBtn('Done')}</div>
    <p class="small muted" style="margin:6px 2px 12px">Work out salary, NPS and pension for anyone: family, friends or colleagues. Each person is saved separately on this device.</p>
    <div class="people">${people.map(row).join('')}</div>
    <button class="btn" id="addPerson" style="width:100%;margin-top:14px">+ Add someone</button>
    <div class="field" style="margin-top:18px"><label>Appearance</label>${seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], ui.theme)}</div>`);
  const sheet = sheetEl();
  sheet.querySelectorAll('[data-switch]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.switch !== activeId) switchTo(b.dataset.switch);
    closeSheet();
  }));
  sheet.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openProfile(b.dataset.edit)));
  sheet.querySelector('#addPerson').addEventListener('click', () => openProfile(null));
}

// ---------- Profile editor (yourself, someone else, or a new person) ----------
function openProfile(id = activeId) {
  const isNew = id == null;
  const person = isNew ? { ...NEW_PERSON, id: uid() } : people.find(p => p.id === id);
  const opt = (v, label, cur) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label}</option>`;
  const basicOptions = (lvl, cur) => E.MATRIX[lvl].map((c, i) => opt(c, `${inr(c)} · cell ${i + 1}`, cur)).join('');
  const title = isNew ? 'Add <em>someone</em>' : person.self ? 'Your <em>profile</em>' : `Edit <em>${esc(person.name.split(' ')[0])}</em>`;
  showSheet(`
    <div class="row"><h2 class="h2" id="sheetTitle">${title}</h2>${closeBtn(isNew ? 'Cancel' : 'Close')}</div>
    <p class="small muted" style="margin:6px 2px 0">${person.self ? 'Saved only on this device. No account, no internet needed.' : 'Enter their service details. Everything stays on this device.'}</p>
    <form class="form" id="profileForm">
      <div class="${person.self ? '' : 'grid2'}">
        <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" value="${esc(person.name)}" autocomplete="off" ${person.self ? '' : 'required placeholder="e.g. Rahul Das"'}></div>
        ${person.self ? '' : `<div class="field"><label for="f-rel">Relation</label><select id="f-rel" name="relation">${RELATIONS.map(r => opt(r, r, person.relation)).join('')}</select></div>`}
      </div>
      <div class="grid2">
        <div class="field"><label for="f-dob">Date of birth</label><input type="date" id="f-dob" name="dob" value="${person.dob}" required></div>
        <div class="field"><label for="f-doj">Date of joining</label><input type="date" id="f-doj" name="doj" value="${person.doj}" required></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="f-level">Pay level</label><select id="f-level" name="level">${E.LEVELS.map(l => opt(l, lvlName(l), person.level)).join('')}</select></div>
        <div class="field"><label for="f-basic">Basic pay</label><select id="f-basic" name="basic">${basicOptions(person.level, person.basic)}</select></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="f-city">City class (HRA)</label><select id="f-city" name="city">${opt('X', 'X · 30%', person.city)}${opt('Y', 'Y · 20%', person.city)}${opt('Z', 'Z · 10%', person.city)}</select></div>
        <div class="field"><label for="f-tpta">Transport city</label><select id="f-tpta" name="tpta">${opt('1', 'Higher-TPTA', person.tpta ? '1' : '0')}${opt('0', 'Other place', person.tpta ? '1' : '0')}</select></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="f-scheme">Pension scheme</label><select id="f-scheme" name="scheme">${opt('NPS', 'NPS', person.scheme)}${opt('UPS', 'UPS', person.scheme)}${opt('OPS', 'OPS (pre-2004)', person.scheme)}</select></div>
        <div class="field"><label for="f-group">Group</label><select id="f-group" name="group">${opt('A', 'Group A', person.group)}${opt('B', 'Group B', person.group)}${opt('C', 'Group C', person.group)}</select></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="f-el">Earned leave (days)</label><input type="number" id="f-el" name="el" min="0" max="300" value="${person.el}"></div>
        <div class="field"><label for="f-inc">Increment month</label><select id="f-inc" name="incMonth">${opt('Jul', '1 July', person.incMonth)}${opt('Jan', '1 January', person.incMonth)}</select></div>
      </div>
      <button class="btn" type="submit" style="margin-top:4px">${isNew ? 'Add & calculate' : 'Save'}</button>
      ${!isNew && !person.self ? `<button class="btn btn--ghost btn--danger" type="button" id="delPerson">Remove ${esc(person.name.split(' ')[0])}</button>` : ''}
      ${!isNew && people.length > 1 ? '<button class="btn btn--ghost" type="button" id="backPeople">← All people</button>' : ''}
    </form>`);
  const sheet = sheetEl();
  const f = sheet.querySelector('#profileForm');
  f.level.addEventListener('change', () => {
    const idx = Math.max(0, E.MATRIX[person.level].indexOf(Number(f.basic.value)));
    const cells = E.MATRIX[f.level.value];
    f.basic.innerHTML = basicOptions(f.level.value, cells[Math.min(idx, cells.length - 1)]);
  });
  f.addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const updated = {
      ...person, ...d, basic: Number(d.basic), el: Math.min(300, Math.max(0, Number(d.el) || 0)), tpta: d.tpta === '1',
      name: d.name.trim() || (person.self ? 'Me' : 'Someone'), corpus: null,
    };
    if (isNew) people.push(updated);
    else people = people.map(p => (p.id === updated.id ? updated : p));
    closeSheet();
    switchTo(updated.id);
  });
  sheet.querySelector('#delPerson')?.addEventListener('click', () => {
    if (!confirm(`Remove ${person.name} from Paysa? Their details will be deleted from this device.`)) return;
    people = people.filter(p => p.id !== person.id);
    if (activeId === person.id) { activeId = people[0].id; P = people[0]; }
    persist();
    render(true);
    openPeople();
  });
  sheet.querySelector('#backPeople')?.addEventListener('click', openPeople);
  if (isNew) setTimeout(() => f.name.focus({ preventScroll: true }), 350);
}

// ================= Render + events =================
const SCREENS = { salary: screenSalary, career: screenCareer, retire: screenRetire, news: screenNews, rates: screenRates };
const TABS = Object.keys(SCREENS);
const view = document.getElementById('view');

function render(animate = false) {
  const top = view.scrollTop;
  view.innerHTML = `<div class="screen${animate ? ' anim' : ''}">${P.self ? '' : viewingBanner()}${SCREENS[ui.tab]()}</div>`;
  if (!animate) view.scrollTop = top; else view.scrollTop = 0;
  const av = document.getElementById('avatarInitials');
  av.textContent = initials(P.name);
  av.style.cssText = avatarStyle(P);
  document.getElementById('whoName').textContent = P.self ? 'Me' : P.name.split(' ')[0];
  document.getElementById('profileBtn').classList.toggle('other', !P.self);
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-current', t.dataset.tab === ui.tab ? 'page' : 'false'));
  const pill = document.getElementById('tabPill');
  pill.style.transform = `translateX(${TABS.indexOf(ui.tab) * 100}%)`;
  placeSegPills(view);
  countUps(view);
  view.querySelectorAll('.slider').forEach(fillSlider);
  requestAnimationFrame(() => view.querySelectorAll('.ring .prog').forEach(c => { c.style.strokeDashoffset = c.dataset.offset; }));
  if (!animate) view.querySelectorAll('.ln-draw').forEach(p => p.classList.remove('ln-draw'));
  const strip = view.querySelector('.levels'), chip = strip?.querySelector('[aria-pressed="true"]');
  if (chip) strip.scrollLeft = chip.offsetLeft - strip.clientWidth / 2 + chip.offsetWidth / 2;
}

function placeSegPills(root) {
  root.querySelectorAll('.seg').forEach(s => {
    const b = s.querySelector('[aria-pressed="true"]'), pill = s.querySelector('.seg-pill');
    if (!b) return;
    pill.style.width = b.offsetWidth + 'px';
    pill.style.transform = `translateX(${b.offsetLeft - 4}px)`;
  });
}
function fillSlider(s) {
  const k = (s.value - s.min) / (s.max - s.min) * 100;
  s.style.setProperty('--fill', k + '%');
}
function applyTheme() {
  if (ui.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = ui.theme;
}

function markNewsSeen() {
  seenBefore = ui.newsSeen ? Date.parse(ui.newsSeen) : 0;
  ui.newsSeen = new Date().toISOString();
  updateNewsBadge();
}

// Tabs
document.getElementById('tabbar').addEventListener('click', e => {
  const t = e.target.closest('.tab');
  if (!t || t.dataset.tab === ui.tab) return;
  ui.tab = t.dataset.tab;
  if (ui.tab === 'news') markNewsSeen();
  persist();
  const pill = document.getElementById('tabPill');
  pill.classList.remove('squish'); void pill.offsetWidth; pill.classList.add('squish');
  render(true);
  view.focus({ preventScroll: true });
});

// Delegated interactions inside the view and sheet
document.addEventListener('click', e => {
  const sb = e.target.closest('.seg button');
  if (sb) {
    const name = sb.closest('.seg').dataset.seg;
    ui[name] = sb.dataset.v;
    sb.closest('.seg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === sb)));
    placeSegPills(sb.closest('.seg').parentElement);
    persist();
    if (name === 'theme') { applyTheme(); return; }
    setTimeout(() => render(false), 120);
    return;
  }
  const nf_ = e.target.closest('[data-news-filter]');
  if (nf_) { ui.newsFilter = nf_.dataset.newsFilter; persist(); render(false); return; }
  const back = e.target.closest('[data-switch-to]');
  if (back) { switchTo(back.dataset.switchTo); return; }
  const lv = e.target.closest('.levels button');
  if (lv) { ui.matrixLevel = lv.dataset.level; persist(); render(false); }
});

view.addEventListener('input', e => {
  const t = e.target;
  if (t.classList.contains('slider')) fillSlider(t);
  if (t.id === 'cpcSlider') {
    ui.cpc8 = Number(t.value);
    document.getElementById('cpcF').textContent = ui.cpc8.toFixed(2);
    document.getElementById('cpcOut').innerHTML = cpcTiles();
  }
  if (t.id === 'daStep') document.getElementById('daStepVal').textContent = t.value;
  if (t.id === 'npsReturn') document.getElementById('npsVal').textContent = t.value;
});
view.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'cpcSlider') { persist(); return; }
  if (t.id === 'daStep') ui.daStep = Number(t.value);
  else if (t.id === 'npsReturn') ui.npsReturn = Number(t.value);
  else if (t.id === 'macpToggle') ui.macp = t.checked;
  else if (t.id === 'corpus') { const v = Number(t.value.replace(/[^\d]/g, '')); P.corpus = Number.isFinite(v) ? v : null; }
  else return;
  persist();
  render(false);
});

// Pointer-tracked specular glare on glass
document.addEventListener('pointermove', e => {
  const g = e.target.closest?.('.glass');
  if (!g) return;
  const r = g.getBoundingClientRect();
  g.style.setProperty('--mx', `${e.clientX - r.left}px`);
  g.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });

document.getElementById('profileBtn').addEventListener('click', openPeople);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.getElementById('sheet').hidden) closeSheet(); });
addEventListener('resize', () => placeSegPills(document));

// ---------- Start ----------
// Use the last good rates saved on this phone straight away (works offline), then check for newer ones.
async function boot() {
  applyTheme();
  const cachedRates = readCache(CACHE_RATES);
  if (cachedRates && !validateRates(cachedRates).length) E.useRates(cachedRates);
  const cachedNews = readCache(CACHE_NEWS);
  if (cachedNews && !validateNews(cachedNews).length) news = cachedNews;

  if (!E.RATES) {
    view.innerHTML = '<div class="screen anim"><section class="glass card" style="text-align:center"><div class="h2">Loading rates…</div></section></div>';
    await refreshAll();
    if (!E.RATES) {
      view.innerHTML = '<div class="screen anim"><section class="glass card" style="text-align:center"><div class="h2">You’re <em>offline</em></div><p class="small muted">Paysa needs the internet once to download the latest pay rates. After that it works offline.</p><button class="btn" id="retryBtn">Try again</button></section></div>';
      document.getElementById('retryBtn').addEventListener('click', () => location.reload());
      return;
    }
  } else {
    refreshAll();
  }
  if (ui.tab === 'news') markNewsSeen();
  render(true);
  updateNewsBadge();
  if (firstRun) setTimeout(() => openProfile('me'), 900); // first run: invite the user to enter their details
  document.fonts?.ready.then(() => placeSegPills(document));
}

// Check again when the app comes back to the foreground (at most every 30 minutes)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && E.RATES && Date.now() - lastCheck > 30 * 60e3) refreshAll();
});

boot();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
