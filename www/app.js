/* ══════════════════════════════════════════════════════════
   app.js —— 起卦 App 的界面层
   ----------------------------------------------------------
   这一层只做三件事：收集输入 → 调算法层 → 把返回的对象铺成 DOM。
   **不含任何术数计算**，也不生成任何断语。算法层在 src/modules/*.js，
   规则依据与流派选择写在各模块文件头的注释里。

   渲染的字段名一律以算法层实际返回为准（写之前逐个 node -e 探过），
   不是照文档猜的 —— 之前猜字段名踩过一整轮。
   ══════════════════════════════════════════════════════════ */

import * as XLR from './src/modules/xiaoliuren.js';
import * as LY from './src/modules/liuyao.js';
import * as DLR from './src/modules/daliuren.js';
import * as MH from './src/modules/meihua.js';
import { ZHI } from './src/core/ganzhi.js';
import YIJING from './src/data/yijing64.js';

LY.setYijingData(YIJING);
MH.setYijingData(YIJING);

// ───────────────────────── 小工具 ─────────────────────────

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 用户输入一律转义后再进 innerHTML */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hide');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hide'), 3600);
}

// ───────────────────────── 设置 ─────────────────────────

const SETTINGS_KEY = 'qigua.settings.v1';
const settings = Object.assign(
  { useTrueSolar: true, longitude: 120, sect: 2 },
  (() => {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
    catch { return {}; }
  })()
);

function saveSettings() {
  settings.useTrueSolar = $('set-tst').checked;
  const lon = Number($('set-lon').value);
  settings.longitude = Number.isFinite(lon) ? Math.max(-180, Math.min(180, lon)) : 120;
  settings.sect = Number($('set-sect').value) === 1 ? 1 : 2;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 隐私模式下写不进，忽略 */ }
}

/** 每次起卦都带上的历法参数 */
const calOpts = () => ({
  dt: new Date(),
  longitude: settings.longitude,
  useTrueSolar: settings.useTrueSolar,
  sect: settings.sect,
});

const sectLabel = () => (settings.sect === 2 ? '晚子时派（23时后进次日）' : '早子时派（23–24时仍算当日）');

/** 结果页脚固定披露：这盘是在哪些流派选择下算出来的 */
function disclosure(extra = []) {
  const items = [
    `时辰依据：${settings.useTrueSolar
      ? `真太阳时（经度 ${settings.longitude}°E）`
      : '⚠️ 北京时间，未做经度校正'}`,
    `子时归属：${sectLabel()}`,
    ...extra,
  ];
  return `<div class="disc"><b>本盘的流派选择</b><br>${items.map(esc).join('<br>')}</div>`;
}

const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;
const jxCls = (jixiong) => (jixiong === '吉' ? 'ji' : jixiong === '凶' ? 'xiong' : 'warn');
const tagCls = (tag) =>
  ({ 吉: 'ji', 小吉: 'ji', 凶: 'xiong', 耗: 'warn', 和: 'gold' }[tag] || '');

const kv = (pairs) =>
  `<div class="kv">${pairs
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v, wide]) =>
      `<div class="kv-item${wide ? ' wide' : ''}"><span class="kv-k">${esc(k)}</span><span class="kv-v">${esc(v)}</span></div>`)
    .join('')}</div>`;

const card = (title, sub, body) =>
  `<div class="card"><h2 class="card-title">${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</h2>${body}</div>`;

const sect = (title) => `<h3 class="sect-title">${esc(title)}</h3>`;

const classic = (text, src) =>
  `<p class="classic">${esc(text)}${src ? `<span class="src">${esc(src)}</span>` : ''}</p>`;

const notesBlock = (notes) =>
  notes && notes.length
    ? `${sect('规则与分歧说明')}<ul class="notes">${notes
        .map((n) => `<li>${esc(n).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</li>`)
        .join('')}</ul>`
    : '';

const askLine = (q) => (q ? kv([['所占', q, true]]) : '');

/** 阴阳爻条：value 1=阳 0=阴 */
const barHTML = (value, extraCls = '') =>
  value
    ? `<div class="bar ${extraCls}"><i></i></div>`
    : `<div class="bar yin ${extraCls}"><i></i><i></i></div>`;

/** 时间信息（各模块 time 结构一致的那几个字段） */
function timeKV(t) {
  if (!t) return '';
  const p = t.pillars || {};
  return kv([
    ['北京时', t.civil],
    ['真太阳时', t.trueSolar],
    ['公历', t.solar && t.solar.text],
    ['农历', t.lunar && t.lunar.text],
    ['四柱', [p.year, p.month, p.day, p.hour].filter(Boolean).join(' ')],
  ]);
}

// ═════════════════════════ 小六壬 ═════════════════════════

function renderXLR(r) {
  const gongs = r.gongs
    .map((g, i) => `
      <div class="gong${i === 2 ? ' final' : ''}">
        <div class="gong-label">${esc(g.label)}</div>
        <div class="gong-shen">${esc(g.shen)}</div>
        <div class="gong-meta">数 ${esc(g.n)} · ${esc(g.wuxing)} · ${esc(g.jixiong)}</div>
        <div class="gong-verse-s">${esc(g.shortVerse)}</div>
        <div class="gong-role">${esc(g.role)}</div>
      </div>`)
    .join('');

  const steps = (r.steps || [])
    .map((s, i) => `
      <div class="step">
        <span class="step-n">${i + 1}</span>
        <span class="step-d">${esc(s.step)}位 ${esc(s.desc)} · 自「${esc(s.from)}」含头数 ${esc(s.n)}</span>
        <span class="step-r">→ ${esc(s.to)}</span>
      </div>`)
    .join('');

  const rels = r.relations.map((x) => chip(`${x.pair}：${x.relation}`)).join('');

  const verses = r.gongs
    .map((g, i) =>
      // 三宫同神时只出一遍口诀，避免同一段话贴三次
      r.gongs.findIndex((x) => x.shen === g.shen) === i
        ? `${sect(`${g.shen} · 口诀`)}${classic(g.verse, g.source)}<p class="hint">${esc(g.gist)}</p>`
        : '')
    .join('');

  const conc = r.conclusion;
  const isNums = !r.time;

  return (
    card('三宫', [r.mode, r.calendarNote].filter(Boolean).join(' · '),
      askLine(r.question) +
      `<div class="gongs">${gongs}</div>` +
      `<p class="hint" style="margin-top:12px">${esc(r.summary.text)}</p>` +
      `<div>${chip(`结论宫：${conc.shen}`, jxCls(conc.jixiong))}${chip(r.summary.trend, 'gold')}${rels}</div>`) +
    card('推演过程', '自「大安」起，含头数',
      (steps ? `<div class="steps">${steps}</div>` : '') +
      (r.nums ? kv([['三数', r.nums.join(' · ')]]) : '') +
      (isNums ? '<p class="hint">报数起卦不涉历法，故不列时间。</p>' : '')) +
    card('口诀原文', '《诸葛神数·马前课》通行本', verses) +
    card('时间与说明', null,
      timeKV(r.time) +
      (r.calendarNote ? kv([['起卦历法', r.calendarNote]]) : '') +
      notesBlock(r.notes) +
      (isNums
        ? `<div class="disc"><b>本盘的流派选择</b><br>三宫起法：自「大安」起、含头数（另有不含头一派）</div>`
        : disclosure([`小六壬历法：${r.calendarNote}`, '三宫起法：含头数（另有不含头一派）'])))
  );
}

function castXLR() {
  const mode = $$('#xlr-mode .seg-btn.on')[0].dataset.m;
  const question = $('xlr-q').value.trim();
  try {
    const r = mode === 'nums'
      ? XLR.castByNumbers({
          nums: [$('xlr-n1').value, $('xlr-n2').value, $('xlr-n3').value],
          question,
        })
      : XLR.castByTime({ ...calOpts(), calendar: $('xlr-cal').value, question });
    $('xlr-out').innerHTML = renderXLR(r);
  } catch (e) {
    toast(e.message);
  }
}

// ═════════════════════════ 六爻 ═════════════════════════

function guaHead(ben, bian, hasMoving) {
  const one = (g) =>
    `<div class="gua-name">${esc(g.fullName || g.name || '—')}<small>${esc(g.palace)}宫${esc(g.palaceWuxing)} · ${esc(g.rank)}${g.no ? ` · 第${g.no}卦` : ''}</small></div>`;
  return `<div class="gua-head">${one(ben)}${
    hasMoving ? `<span class="gua-arrow">→</span>${one(bian)}` : ''
  }</div>`;
}

function yaoRows(r) {
  const { benGua, bianGua, movingPositions, liuShen } = r;
  const hasMoving = movingPositions.length > 0; // 无动爻时算法层的 bianGua 为 null
  // 自上而下显示（上爻在最上），故倒序
  return [...benGua.yaos]
    .reverse()
    .map((y) => {
      const tags = [];
      if (y.xunKong) tags.push(chip('旬空', 'warn'));
      if (y.yuePo) tags.push(chip('月破', 'xiong'));
      if (y.chongByDay) tags.push(chip('日冲', 'xiong'));
      if (y.heByDay) tags.push(chip('日合', 'ji'));
      if (y.moving && y.bian && y.bian.huiTou) {
        tags.push(chip(y.bian.huiTou.name, /生|进/.test(y.bian.huiTou.name) ? 'ji' : 'warn'));
        if (y.bian.huiTou.chong) tags.push(chip(y.bian.huiTou.chongDesc || '化冲', 'xiong'));
      }
      if (y.moving && y.bian) {
        tags.push(chip(`变爻六亲：${y.bian.liuQin}（变宫）/ ${y.bian.liuQinBenGong}（本宫）`));
      }
      const mark = y.isShi ? '<span class="yao-mark shi">世</span>'
        : y.isYing ? '<span class="yao-mark ying">应</span>'
        : '<span class="yao-mark"></span>';
      const bianCell = hasMoving
        ? (y.moving
            ? `<span class="arr">→</span> ${esc(y.bian.ganzhi)} ${esc(y.bian.wuxing)}<br>${esc(y.bian.liuQin)}`
            : (() => {
                const b = bianGua.yaos[y.pos - 1];
                return `${esc(b.ganzhi)} ${esc(b.wuxing)}<br>${esc(b.liuQin)}`;
              })())
        : '';
      return `
        <div class="yao-row${y.moving ? ' moving' : ''}">
          <span class="yao-shen">${esc(liuShen[y.pos - 1])}</span>
          <span class="yao-qin">${esc(y.liuQin)}<br><span class="wx">${esc(y.ganzhi)} ${esc(y.wuxing)}</span></span>
          <span class="yao-bars">${barHTML(y.value)}<span class="wx" style="font-size:10px;color:var(--ink-3)">${esc(y.yaoTi)}${y.moving ? ' 动' : ''}</span></span>
          ${mark}
          <span class="yao-bian">${bianCell}</span>
          ${tags.length ? `<span class="yao-tags">${tags.join('')}</span>` : ''}
        </div>`;
    })
    .join('');
}

function renderLY(r) {
  const hasMoving = r.movingPositions.length > 0;
  const dc = r.dayChen;

  const rolls = r.cast.rolls
    ? `${sect('摇卦记录')}<div class="steps">${[...r.cast.rolls]
        .reverse()
        .map((x) => `
          <div class="step">
            <span class="step-n">${x.pos}</span>
            <span class="step-d">背 ${x.bei} · ${esc(x.name)}（${esc(x.mark)}）${x.moving ? ' · 动' : ''}</span>
            <span class="step-r">${esc(x.symbol)}</span>
          </div>`)
        .join('')}</div>`
    : r.cast.trace
      ? `${sect('起卦推演')}<ol class="trace">${r.cast.trace.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`
      : '';

  const fu = r.fuShen.length
    ? `${sect('伏神飞神')}<div class="steps">${r.fuShen
        .map((f) => `
          <div class="step">
            <span class="step-n">伏</span>
            <span class="step-d">${esc(f.liuQin)} ${esc(f.fu.ganzhi)}（${esc(f.fu.wuxing)}）伏于 ${esc(f.fu.posName)}</span>
            <span class="step-r">飞神 ${esc(f.fei.liuQin)} ${esc(f.fei.ganzhi)} · ${esc(f.relation)}</span>
          </div>`)
        .join('')}</div>`
    : `${sect('伏神飞神')}<p class="hint">本卦六亲齐备，无伏神。</p>`;

  const movingCi = hasMoving
    ? r.movingPositions
        .map((p) => {
          const y = r.benGua.yaos[p - 1];
          return classic(`${y.yaoTi}：${y.yaoCi}`, `《周易》${r.benGua.name}卦`);
        })
        .join('')
    : '<p class="hint">六爻无动，以卦辞为主。</p>';

  const guaCi = (g, label) =>
    g.guaCi ? classic(`${g.fullName} ${g.name}：${g.guaCi}`, label) : '';

  return (
    card('卦身', `${r.cast.mode} · 京房纳甲`,
      askLine(r.question) +
      guaHead(r.benGua, r.bianGua, hasMoving) +
      `<div class="yao-table">${yaoRows(r)}</div>` +
      `<p class="hint" style="margin-top:10px">左起：六神 · 六亲/纳甲 · 爻象 · 世应 · ${hasMoving ? '变卦' : '（无变爻）'}</p>` +
      rolls) +
    card('日月建', dc.ganzhi + '日', kv([
      ['日干支', `${dc.ganzhi}（${dc.wuxingGan}/${dc.wuxingZhi}）`],
      ['月建', `${dc.monthZhi}（${dc.monthWuxing}）`],
      ['旬首', dc.xunShou],
      ['旬空', dc.xunKong.join('、')],
      ['月破', dc.yuePo],
      ['日冲', dc.liuHai ? `六害 ${dc.liuHai}` : ''],
      ['日合', dc.liuHe ? `六合 ${dc.liuHe}` : ''],
      ['三合局', dc.sanHe ? `${dc.sanHe.zhi.join('')}合${dc.sanHe.wuxing}` : ''],
    ]) + fu) +
    card('卦辞与动爻爻辞', '《周易》通行本原文',
      guaCi(r.benGua, '本卦') +
      (hasMoving ? guaCi(r.bianGua, '变卦') : '') +
      sect('动爻爻辞') + movingCi +
      (r.benGua.yongJiu ? classic(`用九：${r.benGua.yongJiu}`, '本卦') : '') +
      (r.benGua.yongLiu ? classic(`用六：${r.benGua.yongLiu}`, '本卦') : '')) +
    card('互卦 · 错卦 · 综卦', '象的其余三面', kv([
      ['互卦', `${r.huGua.fullName || '—'}（${r.huGua.palace}宫）`],
      ['错卦', `${r.cuoGua.fullName || '—'}（${r.cuoGua.palace}宫）`],
      ['综卦', `${r.zongGua.fullName || '—'}（${r.zongGua.palace}宫）`],
      ['世应', `世在 ${r.benGua.shiPos} 爻、应在 ${r.benGua.yingPos} 爻`],
    ])) +
    card('时间与说明', null, timeKV(r.time) + notesBlock(r.notes) + disclosure([
      '摇卦计法：以「背为阳」计（另有「字为阳」一派，会把少阴少阳对调）',
      '变爻六亲：默认显示按变卦之宫，同时标出按本卦之宫',
    ]))
  );
}

/** 摇卦手动输入：六行 0~3 */
function buildBeiGrid() {
  const box = $('ly-bei');
  box.innerHTML = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']
    .map((name, i) => `
      <div class="bei-row" data-pos="${i + 1}">
        <span>${name}</span>
        <div class="bei-opts">${[0, 1, 2, 3]
          .map((n) => `<button class="bei-opt${n === 1 ? ' on' : ''}" data-n="${n}">${n}背</button>`)
          .join('')}</div>
      </div>`)
    .join('');
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.bei-opt');
    if (!btn) return;
    $$('.bei-opt', btn.closest('.bei-opts')).forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
  });
}

const readBeiCounts = () =>
  $$('#ly-bei .bei-row').map((row) => Number($$('.bei-opt.on', row)[0].dataset.n));

function castLY() {
  const mode = $$('#ly-mode .seg-btn.on')[0].dataset.m;
  const question = $('ly-q').value.trim();
  try {
    let opt = { ...calOpts(), question };
    if (mode === 'manual') {
      opt.beiCounts = readBeiCounts();
    } else if (mode === 'time') {
      const tc = LY.timeCast(opt.dt, settings.longitude, settings.sect, settings.useTrueSolar);
      opt.yao = tc.yao;
      opt.movingPositions = tc.movingPositions;
      opt.timeDetail = tc.detail;
    } else {
      opt.beiCounts = LY.randomCast();
    }
    const r = LY.paipan(opt);
    if (mode === 'time') {
      const d = opt.timeDetail;
      r.cast = {
        mode: '时间起卦',
        rolls: null,
        trace: [
          `年支序 ${d.yearZhiIdx} + 农历月 ${d.lunarMonth} + 日 ${d.lunarDay} = ${d.upperN} ÷ 8 → 上卦 ${d.up}`,
          `${d.upperN} + 时序 ${d.hourIdx} = ${d.lowerN} ÷ 8 → 下卦 ${d.low}`,
          `${d.lowerN} ÷ 6 → 第 ${d.movePos} 爻动`,
        ],
      };
    }
    $('ly-out').innerHTML = renderLY(r);
  } catch (e) {
    toast(e.message);
  }
}

// ═════════════════════════ 大六壬 ═════════════════════════

/** 4×4 天地盘的地盘排列：外圈按 巳午未申 / 酉戌 / 亥子丑寅 / 卯辰 顺时针 */
const PAN_LAYOUT = [
  '巳', '午', '未', '申',
  '辰', null, null, '酉',
  '卯', null, null, '戌',
  '寅', '丑', '子', '亥',
];

function renderPan(r) {
  const byDi = new Map(r.pan.cells.map((c) => [c.di, c]));
  let core = false;
  const cells = PAN_LAYOUT.map((di, i) => {
    if (di === null) {
      if (core) return '';
      core = true;
      return `
        <div class="pan-core">
          <div class="big">${esc(r.day.ganzhi)}日</div>
          <div class="sm">${esc(r.dayNight.label)} · ${esc(r.zhanShi.zhi)}时<br>
            月将 ${esc(r.yueJiang.zhi)}${esc(r.yueJiang.name)}<br>
            旬空 ${esc(r.day.xunKong.join('、'))}<br>
            ${esc(r.pan.kDesc || '')}</div>
        </div>`;
    }
    const c = byDi.get(di);
    const cls = [
      'pan-cell',
      c.tianKong ? 'kong' : '',
      di === r.zhanShi.zhi ? 'zs' : '',
    ].filter(Boolean).join(' ');
    return `
      <div class="${cls}">
        <span class="jiang">${esc(r.tianJiang.byDiPan[di] || '')}</span>
        <span class="tian">${esc(c.tian)}</span>
        <span class="di">${esc(di)}</span>
      </div>`;
  }).join('');
  return `<div class="pan-wrap"><div class="pan">${cells}</div></div>`;
}

function renderDLR(r) {
  const courses = r.fourCourses
    .map((c) => `
      <div class="course${c.isZeiShang ? ' zei' : c.isKeXia ? ' ke' : ''}">
        <div class="course-jiang">${esc(c.shangJiang)}</div>
        <div class="course-shang">${esc(c.shang)}${c.shangKong ? '<span style="font-size:10px;color:var(--cinnabar)">空</span>' : ''}</div>
        <div class="course-xia">${esc(c.xiaLabel)}</div>
        <div class="course-n">${esc(c.index)}课 ${esc(c.name)}</div>
        <div class="course-rel ${c.isZeiShang ? 'zei' : c.isKeXia ? 'ke' : ''}">${esc(c.keRelation)}</div>
      </div>`)
    .join('');

  const chuan = r.sanChuan.detail
    .map((s) => `
      <div class="chuan-row">
        <span class="chuan-pos">${esc(s.pos)}</span>
        <span class="chuan-zhi">${esc(s.zhi)}${s.gan ? `<small>遁${esc(s.gan)}</small>` : ''}${s.kong ? '<small style="color:var(--cinnabar)">空</small>' : ''}</span>
        <span class="chuan-jiang">${esc(s.jiang)}<br><span class="chuan-di">${esc(s.jiangName)}</span></span>
        <span class="chuan-di">${esc(s.wuxing)}<br>乘${esc(s.diPos)}</span>
      </div>`)
    .join('');

  const keti = r.keTi.length
    ? r.keTi
        .map((k) => `
          <div class="keti-item">
            <div class="keti-name">${esc(k.name)}${k.tentative ? chip('待考', 'warn') : ''}</div>
            <div class="keti-why">${esc(k.why)}</div>
          </div>`)
        .join('')
    : '<p class="hint">未命中本 APP 已收录的课体。</p>';

  const tj = r.tianJiang;

  return (
    card('天地盘', `${r.yueJiang.zhi}将加${r.zhanShi.zhi}时`,
      askLine(r.question) +
      renderPan(r) +
      `<p class="hint" style="margin-top:11px">格内：上=十二天将，中=天盘，右下角小字=地盘。金框为占时位，划掉者为旬空。</p>` +
      kv([
        ['日干支', `${r.day.ganzhi}（${r.day.gangRou}）`],
        ['日干寄宫', r.day.jiGong],
        ['旬首', r.day.xunShou],
        ['旬空', r.day.xunKong.join('、')],
        ['月将', `${r.yueJiang.zhi} ${r.yueJiang.name}`],
        ['换将中气', r.yueJiang.qiAt ? `${r.yueJiang.qi} ${r.yueJiang.qiAt}` : r.yueJiang.qi],
        ['占时', `${r.zhanShi.zhi} ${r.zhanShi.jiangName}`],
        ['昼夜', r.dayNight.label],
        ['昼夜依据', r.dayNight.reason, true],
        ['天盘加临', r.pan.kDesc, true],
      ])) +
    card('四课', '传统右起，一课在右', `<div class="courses">${courses}</div>` +
      `<p class="hint" style="margin-top:10px">格内自上而下：所乘天将 · 上神 · 下神 · 课序 · 上下克关系。红框为下贼上，金框为上克下。</p>`) +
    card('三传', `${r.sanChuan.gate} · ${r.sanChuan.method}`,
      `<div class="chuan">${chuan}</div>` +
      sect('发用推演') +
      `<ol class="trace">${r.sanChuan.trace.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` +
      (r.sanChuan.notes && r.sanChuan.notes.length
        ? r.sanChuan.notes.map((n) => `<p class="hint">${esc(n)}</p>`).join('')
        : '')) +
    card('课体', '已收录者', keti) +
    card('十二天将', `${tj.direction} · 贵人 ${tj.guiRenZhi}`,
      kv([
        ['贵人天盘', tj.guiRenZhi],
        ['贵人乘地盘', tj.guiRenPos],
        ['顺逆', tj.direction],
        ['判据', tj.dirReason, true],
      ]) +
      sect('按天盘排列') +
      `<div>${ZHI.map((z) => chip(`${z}${tj.byTianPan[z]}`)).join('')}</div>`) +
    card('时间与说明', null, timeKV({
      civil: r.input.civil,
      trueSolar: r.input.trueSolar,
      solar: r.calendar.solar,
      lunar: r.calendar.lunar,
      pillars: r.calendar.pillars,
    }) + notesBlock(r.notes) + disclosure([
      '天乙贵人昼夜分配：口诀只给两支未分昼夜，本 APP 取的是可与 zhanbu 互校的一派，不代表它更正确（详见设置）',
      '戊己寄宫：戊寄巳、己寄未（《六壬大全》主流）',
      '月将：按中气换将',
    ]))
  );
}

function castDLR() {
  const question = $('dlr-q').value.trim();
  try {
    const opt = { ...calOpts(), question };
    if ($('dlr-zs').value) opt.zhanShi = $('dlr-zs').value;
    if ($('dlr-yj').value) opt.yueJiang = $('dlr-yj').value;
    if ($('dlr-dn').value !== '') opt.forceDay = $('dlr-dn').value === '1';
    $('dlr-out').innerHTML = renderDLR(DLR.paipan(opt));
  } catch (e) {
    toast(e.message);
  }
}

// ═════════════════════════ 梅花易数 ═════════════════════════

function triGuaBox(g, label, movePos) {
  const bars = g.yao
    .map((v, i) => barHTML(v, movePos && i + 1 === movePos ? 'move' : ''))
    .join('');
  return `
    <div class="tri-gua">
      <div class="label">${esc(label)}</div>
      <div class="name">${esc(g.fullName || '—')}<br><span style="font-size:10px;color:var(--ink-3)">${g.no ? `第${g.no}卦` : ''}</span></div>
      <div class="bars">${bars}</div>
      <div class="tri-txt">${esc(g.lower)}${esc(g.lowerInfo.symbol)} 下 · ${esc(g.upper)}${esc(g.upperInfo.symbol)} 上<br>先天 ${esc(g.xiantian.upper)}/${esc(g.xiantian.lower)}</div>
    </div>`;
}

function renderMH(r) {
  const ty = r.tiYong;

  const tiyongBox = `
    <div class="tiyong">
      <div class="ty-box">
        <div class="r">体（我）</div>
        <div class="g">${esc(ty.ti)}</div>
        <div class="w">${esc(ty.tiWuxing)} · ${esc(ty.tiPos)}<br>${esc(ty.tiQi.level)}</div>
      </div>
      <div class="ty-rel">${esc(ty.key)}</div>
      <div class="ty-box">
        <div class="r">用（事）</div>
        <div class="g">${esc(ty.yong)}</div>
        <div class="w">${esc(ty.yongWuxing)} · ${esc(ty.yongPos)}<br>${esc(ty.yongQi.level)}</div>
      </div>
    </div>`;

  const vsList = (arr, title) =>
    sect(title) +
    `<div class="steps">${arr
      .map((x) => `
        <div class="step">
          <span class="step-n">${esc(x.tri)}</span>
          <span class="step-d">${esc(x.which)} · ${esc(x.wuxing)} · ${esc(x.judge.text)}</span>
          <span class="step-r">${chip(x.judge.tag, tagCls(x.judge.tag))}</span>
        </div>`)
      .join('')}</div>`;

  const d = r.detail || {};
  const traceLines = [d.upperMod, d.lowerMod, d.moveMod].filter(Boolean);

  return (
    card('三卦', `${r.mode} · 第${r.movePos}爻（${r.movePosName}）动`,
      askLine(r.question) +
      `<div class="tri-guas">${
        triGuaBox(r.ben, '本卦', r.movePos) + triGuaBox(r.hu, '互卦', 0) + triGuaBox(r.bian, '变卦', 0)
      }</div>` +
      `<p class="hint" style="margin-top:11px">本卦看现状、互卦看过程、变卦看结果。本卦中朱色一爻为动爻。</p>`) +
    card('体用', ty.school,
      tiyongBox +
      `<div>${chip(ty.judge.tag, tagCls(ty.judge.tag))}</div>` +
      `<p class="hint">${esc(ty.judge.text)}</p>` +
      kv([
        ['体卦气', `${ty.tiQi.level} —— ${ty.tiQi.desc}`, true],
        ['用卦气', `${ty.yongQi.level} —— ${ty.yongQi.desc}`, true],
        ['月建', `${r.monthZhi}（当令 ${ty.tiQi.wangWuxing}）`],
      ]) +
      sect('另一派结论（供对照）') +
      `<p class="hint">${esc(r.tiYongAlt.school)}：体 ${esc(r.tiYongAlt.ti)}（${esc(r.tiYongAlt.tiWuxing)}）· 用 ${esc(r.tiYongAlt.yong)}（${esc(r.tiYongAlt.yongWuxing)}）→ ${esc(r.tiYongAlt.key)} ${chip(r.tiYongAlt.judge.tag, tagCls(r.tiYongAlt.judge.tag))}<br>${esc(r.tiYongAlt.judge.text)}</p>` +
      vsList(r.huVsTi, '互卦与体（事之中间波折）') +
      vsList(r.bianVsTi, '变卦与体（事之结果）')) +
    card('卦辞与动爻爻辞', '《周易》通行本原文',
      (r.ben.guaCi ? classic(`${r.ben.fullName} ${r.ben.name}：${r.ben.guaCi}`, '本卦卦辞') : '') +
      (r.moveYao ? classic(`${r.moveYao.title}：${r.moveYao.text}`, `${r.ben.name}卦动爻`) : '') +
      (r.bian.guaCi ? classic(`${r.bian.fullName} ${r.bian.name}：${r.bian.guaCi}`, '变卦卦辞') : '') +
      (r.hu.guaCi ? classic(`${r.hu.fullName} ${r.hu.name}：${r.hu.guaCi}`, '互卦卦辞') : '')) +
    card('起卦推演', '先天八卦数',
      (traceLines.length ? `<ol class="trace">${traceLines.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` : '') +
      kv([
        ['年支序', d.yearZhi ? `${d.yearZhi}（${d.yearN}）` : ''],
        ['月', d.monthN],
        ['日', d.dayN],
        ['时', d.hourZhi ? `${d.hourZhi}（${d.hourN}）` : ''],
        ['两数', d.a !== undefined ? `${d.a} · ${d.b}` : ''],
        ['报数', d.n !== undefined ? d.n : ''],
        ['所报之字', d.text],
        ['上卦取字', d.upperChars ? `${d.upperChars}（${d.upCount} 字）` : ''],
        ['下卦取字', d.lowerChars ? `${d.lowerChars}（${d.lowCount} 字）` : ''],
      ]) +
      (d.note ? `<p class="hint">${esc(d.note)}</p>` : '')) +
    card('时间与说明', null, timeKV(r.time) + notesBlock(r.notes) + disclosure([
      '起卦数：先天八卦数（乾1兑2离3震4巽5坎6艮7坤8）',
      '体用：动爻所在之卦为用（主流派），另一派结论已并列',
    ]))
  );
}

function castMH() {
  const mode = $$('#mh-mode .seg-btn.on')[0].dataset.m;
  const question = $('mh-q').value.trim();
  try {
    const base = { ...calOpts(), question };
    let r;
    if (mode === 'two') {
      r = MH.castByTwoNumbers({ ...base, a: $('mh-a').value, b: $('mh-b').value });
    } else if (mode === 'one') {
      r = MH.castByOneNumber({ ...base, n: $('mh-n').value });
    } else if (mode === 'text') {
      r = MH.castByText({ ...base, text: $('mh-text').value });
    } else {
      r = MH.castByTime(base);
    }
    $('mh-out').innerHTML = renderMH(r);
  } catch (e) {
    toast(e.message);
  }
}

// ═════════════════════════ 交互装配 ═════════════════════════

/** 分段选择器：点亮一个、并按 data-m 显隐相关行 */
function bindSeg(segId, onChange) {
  $(segId).addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    $$('.seg-btn', $(segId)).forEach((b) => b.classList.toggle('on', b === btn));
    onChange(btn.dataset.m);
  });
}

function bindTabs() {
  $('tabbar').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    const go = btn.dataset.go;
    $$('.tab').forEach((b) => b.classList.toggle('on', b === btn));
    $$('.view').forEach((v) => v.classList.toggle('on', v.dataset.view === go));
    window.scrollTo({ top: 0 });
  });
}

function bindSheet() {
  const open = () => { $('sheet-mask').classList.remove('hide'); $('sheet').classList.remove('hide'); };
  const close = () => {
    saveSettings();
    $('sheet-mask').classList.add('hide');
    $('sheet').classList.add('hide');
  };
  $('btn-settings').addEventListener('click', open);
  $('btn-sheet-close').addEventListener('click', close);
  $('sheet-mask').addEventListener('click', close);
  for (const id of ['set-tst', 'set-lon', 'set-sect']) {
    $(id).addEventListener('change', saveSettings);
  }
}

function fillDLRSelects() {
  const zs = $('dlr-zs');
  const yj = $('dlr-yj');
  for (const z of ZHI) {
    zs.insertAdjacentHTML('beforeend', `<option value="${z}">${z}时</option>`);
    yj.insertAdjacentHTML('beforeend', `<option value="${z}">${z}将</option>`);
  }
}

function init() {
  // 设置回填
  $('set-tst').checked = settings.useTrueSolar;
  $('set-lon').value = settings.longitude;
  $('set-sect').value = String(settings.sect);
  $('about-src').innerHTML =
    `卦爻辞来源：<b>${esc(YIJING._source)}</b>，由 <b>${esc(YIJING._extractedBy)}</b> 机械抽取。<br>` +
    `${esc(YIJING._note)}<br>自检：${esc(YIJING._selfCheck)}。` +
    (YIJING._errata && YIJING._errata.length ? `<br>勘误：${esc(YIJING._errata.join('；'))}。` : '');

  fillDLRSelects();
  buildBeiGrid();
  bindTabs();
  bindSheet();

  bindSeg('xlr-mode', (m) => {
    $('xlr-cal-row').classList.toggle('hide', m !== 'time');
    $('xlr-nums-row').classList.toggle('hide', m !== 'nums');
  });
  bindSeg('ly-mode', (m) => {
    $('ly-manual').classList.toggle('hide', m !== 'manual');
  });
  bindSeg('mh-mode', (m) => {
    $('mh-two-row').classList.toggle('hide', m !== 'two');
    $('mh-one-row').classList.toggle('hide', m !== 'one');
    $('mh-text-row').classList.toggle('hide', m !== 'text');
  });

  $('xlr-go').addEventListener('click', castXLR);
  $('ly-go').addEventListener('click', castLY);
  $('dlr-go').addEventListener('click', castDLR);
  $('mh-go').addEventListener('click', castMH);

  // 默认落在小六壬
  $$('.view')[0].classList.add('on');
}

init();
