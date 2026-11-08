/**
 * modules/meihua.js —— 梅花易数
 * ==========================================================================
 * 起卦：时间起卦（年月日时）／数字起卦（一数、两数）／字数起卦（一词、两词）
 * 断卦：体用互变 + 五行生克 + 卦气旺衰 + 动爻爻辞
 *
 * ## 核心规则（《梅花易数》邵康节，通行本）
 *
 * ### 先天八卦数（本模块唯一的卦数体系）
 *   乾1 兑2 离3 震4 巽5 坎6 艮7 坤8
 *   ⚠️ 另有「后天八卦数」（坎1 坤2 震3 巽4 乾6 兑7 艮8 离9，即洛书数），
 *      但那是用于**方位/飞宫**的，梅花易数**起卦一律用先天数**。
 *      本模块只实现先天数起卦，不提供后天数起卦（避免似是而非）。
 *
 * ### 时间起卦
 *   上卦 = (年 + 月 + 日) ÷ 8 取余（余 0 作 8）
 *   下卦 = (年 + 月 + 日 + 时) ÷ 8 取余（余 0 作 8）
 *   动爻 = (年 + 月 + 日 + 时) ÷ 6 取余（余 0 作 6）
 *   其中：年 = **农历年地支序**（子 1 … 亥 12）
 *         月 = 农历月（正月 1 … 腊月 12）
 *         日 = 农历日（初一 1 … 三十 30）
 *         时 = 时辰地支序（子 1 … 亥 12）
 *
 *   ⚠️ 分歧 1：「年」用**年支序**还是**年数**（如 2026）？
 *      《梅花易数》原文「如子年一数、丑年二数」明指**年支序**，本 APP 从之。
 *      现代少数 APP 直接用公历年数（2026），会得到完全不同的卦。
 *   ⚠️ 分歧 2：月日用**农历**还是**公历**？原书为农历，本 APP 默认农历，
 *      并提供 `calendar:'solar'` 作可选（与原书不符，仅便利）。
 *   ⚠️ 分歧 3：时辰是否用**真太阳时**？原书无此讲究（古人用地方时即真太阳时），
 *      本 APP 默认按真太阳时定时辰（`useTrueSolar:true`），可关。
 *
 * ### 数字起卦
 *   - 一个数：上卦 = 该数 ÷ 8，下卦 = ？—— 原书**无**单数直接成卦之法，
 *     通行做法是「一数则以该数为上卦、加时辰数为下卦」（即「数 + 时」起卦），
 *     本模块实现为 `castByOneNumber`（明确标注是「数加时」法）。
 *   - 两个数：前数 ÷ 8 为上卦，后数 ÷ 8 为下卦，两数之和 ÷ 6 为动爻。
 *
 * ### 字数起卦
 *   - 字数为偶：前一半字数为上卦，后一半为下卦。
 *   - 字数为奇：少一半为上卦（前 (n-1)/2 字），多一半为下卦。
 *     ⚠️ 原书「字数少一半为上卦、多一半为下卦」；也有作「多者为上」的版本。
 *   - 一字：以该字**笔画**分左右——本 APP **不实现**一字起卦，
 *     因为需要准确笔画/字形拆分数据，做不准不如不做（见 README TODO）。
 *   动爻 = 总字数（或上下卦数之和）÷ 6。本 APP 用「上卦数 + 下卦数」之和取 6，
 *     与「数字起卦」保持同一口径。
 *
 * ### 体用
 *   动爻所在之卦（上或下）为**用**，另一卦为**体**。
 *   （口诀「动者为用，静者为体」；体为自己/所占之主，用为他人/所问之事。）
 *   ⚠️ 分歧 4：有作「下卦（内卦）恒为体、上卦恒为用」者。此派较少，
 *      本 APP 用「动爻所在为用」的主流派，并同时输出另一派的结论以便对照
 *      （`tiYongAlt`）。
 *
 * ### 互卦 / 变卦
 *   互卦：取本卦 2·3·4 爻为下互，3·4·5 爻为上互。
 *   变卦：本卦动爻变其阴阳后所成之卦。
 *   体用为纲、互卦看事之中间过程、变卦看结果。
 *
 * ### 卦气旺衰（用于判体用强弱）
 *   以卦之五行与**当令季节**（月支）比：当令为旺、被生为相、生者为休、
 *   克者为囚、被克为死（五行旺相休囚死）。
 *   ⚠️ 本 APP 只给出旺衰标签，不换算成分数——原书无量化，量化即为编造。
 *
 * ## 不做的事
 * 本模块**不生成**「此卦主某事必成/必败」之类的断语。
 * 只输出：体用五行生克方向、旺衰、互变卦象、以及动爻的《周易》爻辞原文。
 * 判断留给用户。
 */

import { zhiIndex, wuxingRelation, SHENG, KE } from '../core/ganzhi.js';
import { resolve } from '../core/calendar.js';
import { TRIGRAMS, trigramsOf, huGua, bianGua, fullName } from './liuyao.js';

// ───────────────────────── 先天八卦数 ─────────────────────────

/** 先天八卦数 1..8 → 经卦名 */
export const XIANTIAN = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
/** 经卦名 → 先天数 */
export const XIANTIAN_NUM = Object.fromEntries(XIANTIAN.map((n, i) => [n, i + 1]));

/** n ÷ 8 取余，余 0 作 8 → 经卦名 */
export const guaByNum = (n) => {
  const m = ((Math.trunc(n) % 8) + 8) % 8; // 0..7，0 代表余 8
  return XIANTIAN[m === 0 ? 7 : m - 1];
};
/** n ÷ 6 取余，余 0 作 6 → 动爻位 1..6 */
export const yaoByNum = (n) => {
  const m = ((Math.trunc(n) % 6) + 6) % 6;
  return m === 0 ? 6 : m;
};

// ───────────────────────── 卦气旺衰 ─────────────────────────

/**
 * 月支 → 当令五行
 * 寅卯木、巳午火、申酉金、亥子水、辰未戌丑土（四季土月）
 * ⚠️ 分歧：辰戌丑未四个月，一派作「土旺」（本 APP 采用），
 *    一派作「季月土旺后十八日、前十二日仍属前一季之气」。
 *    后者需要精确到日，本 APP 未实现，已在文档标注。
 */
export const MONTH_ZHI_WANG = {
  寅: '木', 卯: '木', 巳: '火', 午: '火',
  申: '金', 酉: '金', 亥: '水', 子: '水',
  辰: '土', 未: '土', 戌: '土', 丑: '土',
};

/** 旺相休囚死 */
export const WANG_XIANG = ['旺', '相', '休', '囚', '死'];

/**
 * 卦气旺衰
 * @param {string} guaWuxing 卦之五行
 * @param {string} monthZhi 月建地支
 */
export function guaQi(guaWuxing, monthZhi) {
  const w = MONTH_ZHI_WANG[monthZhi];
  if (!w) throw new Error(`未知月支: ${monthZhi}`);
  if (guaWuxing === w) return { level: '旺', wangWuxing: w, desc: '与月令同气，最盛' };
  if (SHENG[w] === guaWuxing) return { level: '相', wangWuxing: w, desc: '得月令之生，次盛' };
  if (SHENG[guaWuxing] === w) return { level: '休', wangWuxing: w, desc: '生月令而自泄，力衰' };
  if (KE[guaWuxing] === w) return { level: '囚', wangWuxing: w, desc: '克月令而受制，受困' };
  return { level: '死', wangWuxing: w, desc: '被月令所克，最弱' };
}

// ───────────────────────── 体用 ─────────────────────────

/**
 * 体用生克判读
 *
 * 传统判读方向（《梅花易数》「体用生克诀」）：
 *   用生体 → 吉（他来助我）
 *   体生用 → 耗（我去助他，费力）
 *   用克体 → 凶（他来伤我）
 *   体克用 → 小吉（我能制他，事可成而费力）
 *   体用同 → 和（比和，事顺）
 * 这五句是原书明文，不是本 APP 的发明。
 */
export const TI_YONG_JUDGE = {
  用生体: { tag: '吉', text: '用生体：他来助我，事有外援，多吉。' },
  体生用: { tag: '耗', text: '体生用：我去助他，耗气费力，成而不美。' },
  用克体: { tag: '凶', text: '用克体：他来伤我，事多阻逆，宜避。' },
  体克用: { tag: '小吉', text: '体克用：我能制他，事可成但须自己出力。' },
  体用比和: { tag: '和', text: '体用比和：气类相同，事顺无碍。' },
};

/** 以体为主体，判与用之关系 → 上表的键 */
export function tiYongKey(tiWx, yongWx) {
  const rel = wuxingRelation(tiWx, yongWx); // 以体看用
  if (rel === '同我') return '体用比和';
  if (rel === '我生') return '体生用';
  if (rel === '生我') return '用生体';
  if (rel === '我克') return '体克用';
  return '用克体';
}

/**
 * 由六爻与动爻位求体用（主流派：动爻所在之卦为用）
 * @param {number[]} yao6 自下而上 6 爻
 * @param {number} movePos 动爻位 1..6
 */
export function tiYongOf(yao6, movePos) {
  const { lower, upper } = trigramsOf(yao6);
  const inUpper = movePos >= 4;
  const yong = inUpper ? upper : lower;
  const ti = inUpper ? lower : upper;
  return {
    school: '动爻所在为用（主流）',
    ti, tiWuxing: TRIGRAMS[ti].wuxing, tiPos: inUpper ? '下卦（内）' : '上卦（外）',
    yong, yongWuxing: TRIGRAMS[yong].wuxing, yongPos: inUpper ? '上卦（外）' : '下卦（内）',
    key: tiYongKey(TRIGRAMS[ti].wuxing, TRIGRAMS[yong].wuxing),
  };
}

/** 另一派：下卦（内卦）恒为体、上卦恒为用 —— 一并输出以便对照 */
export function tiYongAlt(yao6) {
  const { lower, upper } = trigramsOf(yao6);
  return {
    school: '下卦恒为体、上卦恒为用（少数派，供对照）',
    ti: lower, tiWuxing: TRIGRAMS[lower].wuxing, tiPos: '下卦（内）',
    yong: upper, yongWuxing: TRIGRAMS[upper].wuxing, yongPos: '上卦（外）',
    key: tiYongKey(TRIGRAMS[lower].wuxing, TRIGRAMS[upper].wuxing),
  };
}

// ───────────────────────── 卦爻辞 ─────────────────────────

let YIJING = null;
/** @param {{hexagrams:Array}} data src/data/yijing64.json */
export function setYijingData(data) {
  const idx = new Map();
  for (const h of data.hexagrams) {
    idx.set([...TRIGRAMS[h.lower].yao, ...TRIGRAMS[h.upper].yao].join(''), h);
  }
  if (idx.size !== 64) throw new Error(`卦爻辞数据异常：去重后 ${idx.size} 卦`);
  YIJING = idx;
}
const textOf = (yao6) => (YIJING ? YIJING.get(yao6.join('')) : null);

/** 一个卦的基本信息（名、上下卦、五行、卦辞） */
export function guaInfo(yao6, label) {
  const { lower, upper } = trigramsOf(yao6);
  const t = textOf(yao6);
  return {
    label,
    yao: yao6,
    lower, upper,
    lowerInfo: TRIGRAMS[lower], upperInfo: TRIGRAMS[upper],
    no: t ? t.no : null,
    name: t ? t.name : null,
    fullName: t ? fullName(yao6, t.name) : null,
    guaCi: t ? t.guaci : null,
    xiantian: { upper: XIANTIAN_NUM[upper], lower: XIANTIAN_NUM[lower] },
  };
}

// ───────────────────────── 起卦 ─────────────────────────

/**
 * 时间起卦
 * @param {Object} opt
 * @param {Date}   [opt.dt]
 * @param {number} [opt.longitude]
 * @param {boolean}[opt.useTrueSolar] 默认 true
 * @param {'lunar'|'solar'} [opt.calendar] 默认 'lunar'
 * @param {string} [opt.question]
 */
export function castByTime(opt = {}) {
  const {
    dt = new Date(), longitude = 120, useTrueSolar = true, sect = 2,
    calendar = 'lunar', question = '',
  } = opt;
  const ctx = resolve(dt, longitude, useTrueSolar, sect);

  const yearZhi = ctx.pillars.year[1];
  const yearN = zhiIndex(yearZhi) + 1; // 子=1
  const monthN = calendar === 'solar' ? ctx.solar.m : ctx.lunar.month;
  const dayN = calendar === 'solar' ? ctx.solar.d : ctx.lunar.day;
  const hourN = zhiIndex(ctx.hourZhi) + 1;

  const upperN = yearN + monthN + dayN;
  const lowerN = upperN + hourN;
  const movePos = yaoByNum(lowerN);

  const res = assemble({
    upper: guaByNum(upperN), lower: guaByNum(lowerN), movePos,
    monthZhi: ctx.pillars.month[1], question,
  });

  return {
    ...res,
    mode: '时间起卦',
    calendar,
    detail: {
      yearZhi, yearN, monthN, dayN, hourZhi: ctx.hourZhi, hourN,
      upperN, upperMod: `${upperN} ÷ 8 余 ${upperN % 8 || 8} → ${res.ben.upper}`,
      lowerN, lowerMod: `${lowerN} ÷ 8 余 ${lowerN % 8 || 8} → ${res.ben.lower}`,
      moveMod: `${lowerN} ÷ 6 余 ${lowerN % 6 || 6} → 第 ${movePos} 爻动`,
      note: calendar === 'lunar'
        ? '年用农历年支序（子1…亥12）、月日用农历，与《梅花易数》原书一致。'
        : '⚠️ 月日用公历，与原书不符，仅作便利选项。',
    },
    time: {
      civil: ctx.trueSolarTime.civilText,
      trueSolar: ctx.trueSolarTime.trueSolarText,
      basedOn: ctx.basedOn, useTrueSolar,
      solar: ctx.solar, lunar: ctx.lunar,
      pillars: ctx.pillars, jieqi: ctx.jieqi,
    },
  };
}

/**
 * 两数起卦：前数为上卦、后数为下卦、两数之和取动爻
 * @param {Object} opt
 * @param {number} opt.a 前数
 * @param {number} opt.b 后数
 * @param {Date}   [opt.dt] 仅用于取月建判卦气旺衰（不参与起卦）
 */
export function castByTwoNumbers(opt = {}) {
  const { a, b, dt = new Date(), longitude = 120, useTrueSolar = true, sect = 2, question = '' } = opt;
  for (const [k, v] of [['a', a], ['b', b]]) {
    if (!Number.isFinite(Number(v)) || Math.trunc(Number(v)) < 1) {
      throw new Error(`${k} 须为 >=1 的整数: ${v}`);
    }
  }
  const na = Math.trunc(Number(a)), nb = Math.trunc(Number(b));
  const ctx = resolve(dt, longitude, useTrueSolar, sect);
  const res = assemble({
    upper: guaByNum(na), lower: guaByNum(nb), movePos: yaoByNum(na + nb),
    monthZhi: ctx.pillars.month[1], question,
  });
  return {
    ...res,
    mode: '数字起卦（两数）',
    detail: {
      a: na, b: nb,
      upperMod: `${na} ÷ 8 余 ${na % 8 || 8} → ${res.ben.upper}（上卦）`,
      lowerMod: `${nb} ÷ 8 余 ${nb % 8 || 8} → ${res.ben.lower}（下卦）`,
      moveMod: `(${na}+${nb})=${na + nb} ÷ 6 余 ${(na + nb) % 6 || 6} → 第 ${res.movePos} 爻动`,
    },
    time: { basedOn: ctx.basedOn, pillars: ctx.pillars },
  };
}

/**
 * 一数起卦（「数加时」法）
 * ⚠️ 原书无「一数直接成卦」之法。通行补法：该数为上卦，该数 + 时辰数为下卦，
 *    和数取动爻。本函数即此补法，已明确标注，非原书条文。
 */
export function castByOneNumber(opt = {}) {
  const { n, dt = new Date(), longitude = 120, useTrueSolar = true, sect = 2, question = '' } = opt;
  const nn = Math.trunc(Number(n));
  if (!Number.isFinite(nn) || nn < 1) throw new Error(`n 须为 >=1 的整数: ${n}`);
  const ctx = resolve(dt, longitude, useTrueSolar, sect);
  const hourN = zhiIndex(ctx.hourZhi) + 1;
  const lowerN = nn + hourN;
  const res = assemble({
    upper: guaByNum(nn), lower: guaByNum(lowerN), movePos: yaoByNum(lowerN),
    monthZhi: ctx.pillars.month[1], question,
  });
  return {
    ...res,
    mode: '数字起卦（一数加时）',
    detail: {
      n: nn, hourZhi: ctx.hourZhi, hourN, lowerN,
      upperMod: `${nn} ÷ 8 余 ${nn % 8 || 8} → ${res.ben.upper}（上卦）`,
      lowerMod: `${nn}+${hourN}=${lowerN} ÷ 8 余 ${lowerN % 8 || 8} → ${res.ben.lower}（下卦）`,
      moveMod: `${lowerN} ÷ 6 余 ${lowerN % 6 || 6} → 第 ${res.movePos} 爻动`,
      note: '⚠️「一数加时」为通行补法，非《梅花易数》原书条文。',
    },
    time: { basedOn: ctx.basedOn, pillars: ctx.pillars },
  };
}

/**
 * 字数起卦
 * 偶数字：前一半为上卦、后一半为下卦
 * 奇数字：少一半（前 (n-1)/2 字）为上卦、多一半为下卦
 * 动爻 = (上卦字数 + 下卦字数) ÷ 6 = 总字数 ÷ 6
 *
 * @param {Object} opt
 * @param {string} opt.text 所报之字（会剔除空白）
 */
export function castByText(opt = {}) {
  const { text = '', dt = new Date(), longitude = 120, useTrueSolar = true, sect = 2, question = '' } = opt;
  const chars = [...String(text).replace(/\s+/gu, '')];
  const n = chars.length;
  if (n < 2) {
    throw new Error('字数起卦至少需 2 字（一字起卦须按笔画拆字，本 APP 未实现，见 README TODO）');
  }
  const half = Math.floor(n / 2);
  const upCount = n % 2 === 0 ? half : half; // 奇数时 floor 即「少一半」
  const lowCount = n - upCount;
  const ctx = resolve(dt, longitude, useTrueSolar, sect);
  const res = assemble({
    upper: guaByNum(upCount), lower: guaByNum(lowCount), movePos: yaoByNum(n),
    monthZhi: ctx.pillars.month[1], question,
  });
  return {
    ...res,
    mode: '字数起卦',
    detail: {
      text: chars.join(''), total: n,
      upperChars: chars.slice(0, upCount).join(''), upCount,
      lowerChars: chars.slice(upCount).join(''), lowCount,
      upperMod: `${upCount} ÷ 8 余 ${upCount % 8 || 8} → ${res.ben.upper}（上卦）`,
      lowerMod: `${lowCount} ÷ 8 余 ${lowCount % 8 || 8} → ${res.ben.lower}（下卦）`,
      moveMod: `${n} ÷ 6 余 ${n % 6 || 6} → 第 ${res.movePos} 爻动`,
      note: n % 2
        ? '奇数字：取「少一半为上卦、多一半为下卦」（原书法）；另有「多者为上」之说。'
        : '偶数字：前一半为上卦、后一半为下卦。',
    },
    time: { basedOn: ctx.basedOn, pillars: ctx.pillars },
  };
}

// ───────────────────────── 组装 ─────────────────────────

/**
 * 由 上卦/下卦/动爻 组装完整梅花盘
 */
export function assemble({ upper, lower, movePos, monthZhi, question = '' }) {
  if (!TRIGRAMS[upper] || !TRIGRAMS[lower]) throw new Error(`非法经卦: ${upper}/${lower}`);
  if (!Number.isInteger(movePos) || movePos < 1 || movePos > 6) throw new Error(`动爻位须 1..6: ${movePos}`);

  const yao6 = [...TRIGRAMS[lower].yao, ...TRIGRAMS[upper].yao]; // 自下而上
  const ben = guaInfo(yao6, '本卦');
  const hu = guaInfo(huGua(yao6), '互卦');
  const bian = guaInfo(bianGua(yao6, [movePos - 1]), '变卦');

  const ty = tiYongOf(yao6, movePos);
  const tyAlt = tiYongAlt(yao6);

  const benText = textOf(yao6);
  const moveYao = benText ? benText.yaoci[movePos - 1] : null;

  // 三卦四象：本卦体用、互卦、变卦分别与「体」比五行
  const tiWx = ty.tiWuxing;
  const vs = (gua) => [
    { which: '互卦下（下互）', tri: gua.lower, wuxing: TRIGRAMS[gua.lower].wuxing },
    { which: '互卦上（上互）', tri: gua.upper, wuxing: TRIGRAMS[gua.upper].wuxing },
  ];

  return {
    mode: null,
    question,
    movePos,
    movePosName: ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'][movePos - 1],
    ben, hu, bian,
    tiYong: {
      ...ty,
      judge: TI_YONG_JUDGE[ty.key],
      tiQi: guaQi(ty.tiWuxing, monthZhi),
      yongQi: guaQi(ty.yongWuxing, monthZhi),
    },
    tiYongAlt: { ...tyAlt, judge: TI_YONG_JUDGE[tyAlt.key] },
    /** 互卦两经卦与「体」的五行关系（看事之中间波折） */
    huVsTi: vs(hu).map((x) => ({ ...x, vsTi: tiYongKey(tiWx, x.wuxing), judge: TI_YONG_JUDGE[tiYongKey(tiWx, x.wuxing)] })),
    /** 变卦两经卦与「体」的五行关系（看事之结果） */
    bianVsTi: [
      { which: '变卦下卦', tri: bian.lower, wuxing: TRIGRAMS[bian.lower].wuxing },
      { which: '变卦上卦', tri: bian.upper, wuxing: TRIGRAMS[bian.upper].wuxing },
    ].map((x) => ({ ...x, vsTi: tiYongKey(tiWx, x.wuxing), judge: TI_YONG_JUDGE[tiYongKey(tiWx, x.wuxing)] })),
    monthZhi,
    moveYao: moveYao ? { title: moveYao.title, text: moveYao.text } : null,
    notes: NOTES,
  };
}

const NOTES = [
  '起卦一律用**先天八卦数**（乾1兑2离3震4巽5坎6艮7坤8）；后天数（洛书数）只用于方位，不用于起卦。',
  '时间起卦的「年」用农历年支序（子1…亥12），非公历年数；月日默认农历。以上皆依《梅花易数》原书。',
  '体用采用「动爻所在之卦为用」主流派；「下卦恒为体」一派的结论一并列于 tiYongAlt 供对照。',
  '卦气旺衰用「旺相休囚死」，四季月（辰戌丑未）一律作土旺；另有按土旺后十八日细分之说，本 APP 未实现。',
  '一字起卦（按笔画拆字）未实现——需准确笔画数据，做不准不如不做。',
  '体用生克五句判语为《梅花易数》原书明文；本 APP 不额外生成断语，动爻爻辞用《周易》原文。',
];

export default {
  castByTime, castByTwoNumbers, castByOneNumber, castByText, assemble,
  setYijingData, guaByNum, yaoByNum, guaQi, tiYongOf, tiYongAlt, tiYongKey,
  XIANTIAN, XIANTIAN_NUM, TI_YONG_JUDGE,
};
