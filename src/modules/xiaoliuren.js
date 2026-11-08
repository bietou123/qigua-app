/**
 * modules/xiaoliuren.js —— 小六壬（诸葛马前课 / 六神课）
 * ==========================================================================
 * 六神：大安 留连 速喜 赤口 小吉 空亡（固定顺序，循环）
 * 起法：自「大安」起，按 月 → 日 → 时 三步接续数宫，落处即三宫。
 *
 * ## 流派分歧（本模块就地标注，不替用户做唯一真理）
 *
 * ### 分歧 1：用农历还是公历？（用户明确要求说明的一条）
 * - **农历派（本 APP 默认）**：月 = 农历月序（正月=1…腊月=12，闰月按其本月数），
 *   日 = 农历日（初一=1…三十=30），时 = 时辰序（子=1…亥=12）。
 *   传统术数以农历纪日为体，《马前课》口诀「月起大安、日从月落、时从日落」皆指农历。
 *   绝大多数纸本与老先生的口传如此。
 * - **公历派**：直接用公历月、日。近年手机 APP 常见（实现省事），
 *   但与传统口诀所指不符，本 APP 提供为**可选项**（`calendar: 'solar'`）而非默认。
 * - **节气月派**：月用节气月（月柱地支所对应的月序，立春后为正月）。
 *   本 APP 也提供（`calendar: 'jieqi'`），因为部分六壬一系的先生主张
 *   「凡涉月建者当以节气为断」。
 * 三派在同一天可能落到**完全不同的三宫**，请在 UI 上让用户知道自己选了哪派。
 *
 * ### 分歧 2：起数是「从大安数起」还是「从大安的下一位数起」？
 * - **含头派（本 APP 默认）**：正月即大安（数 1 落大安），二月留连……
 *   即 `index = (n - 1) % 6`。这是《马前课》通行口诀「正月大安起」。
 * - **不含头派**：正月从大安**之后**数一位，落留连。此派少见，多为口传讹变。
 * 本 APP 用含头派，且三步接续时也一律含头：
 *   月落宫为起点数日（日 = 1 即落在月宫本身），日落宫为起点数时。
 *   例：农历正月初一子时 → 月 1 → 大安；自大安数日 1 → 仍大安；自大安数时 1 → 大安。
 *   这与「正月初一子时得大安」的传统检验一致。
 *
 * ### 分歧 3：三宫的意义分派
 * 通行以「月宫 = 事之根由/远因、日宫 = 事之现状/人事、时宫 = 事之结果/应期」，
 * 也有作「天/地/人」三才或「过去/现在/未来」者。本 APP 采用前者并标注。
 *
 * ## 断语来源
 * 六神的吉凶、五行、方位、色、数、应期取通行《马前课》口诀原文
 * （见 LIU_SHEN_DETAIL 各条 `source` 字段）。
 * **未收录来源不明的细节断语**——用户若需更细的判词请自行查证，
 * 本模块不生成看似专业实为编造的内容。
 */

import { ZHI, zhiIndex, hourToZhi, wuxingRelation } from '../core/ganzhi.js';
import { resolve } from '../core/calendar.js';

// ───────────────────────── 六神 ─────────────────────────

/** 六神固定顺序（循环） */
export const SHEN_ORDER = ['大安', '留连', '速喜', '赤口', '小吉', '空亡'];

/**
 * 六神详解
 *
 * `verse`      —— 《马前课》通行长诀原文（各本用字略有出入，此处取常见本）。
 * `shortVerse` —— 通行简诀「大安身不动…」一句。
 * `wuxing` / `fang` / `color` —— 见下方 ATTR_NOTE：**各家表不一**，本 APP 取流传最广一种。
 * `gongNum`    —— 宫序数（大安 1 … 空亡 6），起数与报数时用。
 * `jixiong`    —— 吉 / 凶（小六壬六神只分吉凶两类，无「中平」一档）。
 */
export const LIU_SHEN_DETAIL = {
  大安: {
    gongNum: 1,
    jixiong: '吉',
    wuxing: '木',
    fang: '东方',
    color: '青碧',
    shortVerse: '大安身不动',
    verse: '大安事事昌，求财在坤方，失物去不远，宅舍保安康，行人身未动，病者主无妨，将军回田野，仔细更推详。',
    gist: '静而安。宜守不宜动；求谋有成但迟；病无大碍；失物近在身边。',
    source: '《诸葛神数·马前课》通行长诀 + 通行简诀',
  },
  留连: {
    gongNum: 2,
    jixiong: '凶',
    wuxing: '水',
    fang: '北方',
    color: '青黑',
    shortVerse: '留连人未归',
    verse: '留连事难成，求谋日未明，官事只宜缓，去者未回程，失物南方见，急讨方遂心，更须防口舌，人口且平平。',
    gist: '牵缠拖延。事在半途，宜缓不宜急；官讼宜和；人未归。',
    source: '同上',
  },
  速喜: {
    gongNum: 3,
    jixiong: '吉',
    wuxing: '火',
    fang: '南方',
    color: '红赤',
    shortVerse: '速喜喜来临',
    verse: '速喜喜来临，求财向南行，失物申未午，逢人路上寻，官事有福德，病者无祸侵，田宅六畜吉，行人有音信。',
    gist: '喜事速至。所求可成且快；有音信；病渐愈。',
    source: '同上',
  },
  赤口: {
    gongNum: 4,
    jixiong: '凶',
    wuxing: '金',
    fang: '西方',
    color: '白',
    shortVerse: '赤口有惊慌',
    verse: '赤口主口舌，官非切要防，失物急去寻，行人有惊慌，六畜多灾殃，鸡犬也遭伤，若能防口舌，祸病不成灾。',
    gist: '口舌争斗。防争执官非、惊险；宜谨言。',
    source: '同上（末二句各本用字略异）',
  },
  小吉: {
    gongNum: 5,
    jixiong: '吉',
    wuxing: '水',
    fang: '北方',
    color: '碧黑',
    shortVerse: '小吉人来喜',
    verse: '小吉最吉昌，路上好商量，阴人来报喜，失物在坤方，行人即便至，交易甚是强，凡事皆和合，病者主安康。',
    gist: '和合大吉。诸事顺遂、宜商谈合作；人即至；病安。',
    source: '同上（五行有作「木」者，见 ATTR_NOTE）',
  },
  空亡: {
    gongNum: 6,
    jixiong: '凶',
    wuxing: '土',
    fang: '中央',
    color: '黄',
    shortVerse: '空亡事不长',
    verse: '空亡事不祥，阴人少乖张，求财无利益，行人有灾殃，失物寻不见，官事有刑伤，病人逢暗鬼，禳解贺平安。',
    gist: '徒劳空耗。所求落空；失物难寻；宜退守待时。',
    source: '同上',
  },
};

/**
 * 属性表的分歧说明（务必随 UI 一同呈现）
 *
 * 1. 六神各自的**五行与方位**，流传的表并不统一。最常见的一种是
 *    大安木东、留连水北、速喜火南、赤口金西、小吉水北、空亡土中央（本 APP 采用）；
 *    另有把**小吉作木**（于是木有二、水只一）、或把**留连作土**的版本。
 *    这些属性只用于三宫之间的生克参考，**不影响三宫本身的排出**，
 *    故即便取了另一派，卦象仍相同，只是生克注解会变。
 * 2. 口诀原文里出现的方位（如留连「失物南方见」、大安/小吉「失物在坤方」）
 *    是**该事项的方位**，不等于该神自身的五行方位，两者勿混。
 * 3. 本 APP **未收录**来源不明的「六神配数字 / 配人物 / 配疾病部位」等细表；
 *    需要更细的判词请自行查证原书。
 */
export const ATTR_NOTE =
  '六神的五行/方位各家表不一（小吉有作木者、留连有作土者），本 APP 取流传最广一种；' +
  '此属性仅用于三宫生克参考，不影响三宫的排出。口诀中的方位指该事项方位，非该神自身方位。';

/** 六神 → 五行 */
export const shenWuxing = (s) => LIU_SHEN_DETAIL[s].wuxing;

/** 六神 → 序号（0=大安） */
export const shenIndex = (s) => {
  const i = SHEN_ORDER.indexOf(s);
  if (i < 0) throw new Error(`未知六神: ${s}`);
  return i;
};

/**
 * 自某宫起「含头」数 n 位
 * @param {string} from 起点宫名
 * @param {number} n 数目（>=1；n=1 即落在起点本身）
 */
export function countFrom(from, n) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`数目须为 >=1 的整数: ${n}`);
  return SHEN_ORDER[(shenIndex(from) + n - 1) % 6];
}

// ───────────────────────── 三宫意义 ─────────────────────────

/**
 * 三宫职司（分歧 3，本 APP 取「根由 / 现状 / 结果」派）
 */
export const GONG_ROLE = [
  { key: 'month', label: '月宫', role: '事之根由（远因、背景、大势）' },
  { key: 'day', label: '日宫', role: '事之现状（当下人事、过程）' },
  { key: 'hour', label: '时宫', role: '事之结果（应期、结局）' },
];

// ───────────────────────── 起卦 ─────────────────────────

/**
 * 按时间起小六壬
 *
 * @param {Object} opt
 * @param {Date}    [opt.dt]        起卦时刻，默认现在
 * @param {number}  [opt.longitude] 经度（真太阳时校正），默认 120
 * @param {boolean} [opt.useTrueSolar] 是否用真太阳时定时辰，默认 true
 * @param {'lunar'|'solar'|'jieqi'} [opt.calendar] 历法派别，默认 'lunar'（见文件头分歧 1）
 * @param {string}  [opt.question]  所占何事
 */
export function castByTime(opt = {}) {
  const {
    dt = new Date(), longitude = 120, useTrueSolar = true, sect = 2,
    calendar = 'lunar', question = '',
  } = opt;
  if (!['lunar', 'solar', 'jieqi'].includes(calendar)) {
    throw new Error(`未知历法派别: ${calendar}（可选 lunar / solar / jieqi）`);
  }

  const ctx = resolve(dt, longitude, useTrueSolar, sect);

  // ── 月 ──
  let monthN, monthDesc;
  if (calendar === 'lunar') {
    monthN = ctx.lunar.month; // 1..12（闰月取其本月数）
    monthDesc = `农历${ctx.lunar.monthInChinese}月（${monthN}）` +
      (ctx.lunar.isLeapMonth ? '［闰月，按其本月数计］' : '');
  } else if (calendar === 'solar') {
    monthN = ctx.solar.m;
    monthDesc = `公历 ${monthN} 月`;
  } else {
    // 节气月：月柱地支 寅=正月 … 丑=十二月
    const mz = ctx.pillars.month[1];
    monthN = ((zhiIndex(mz) - zhiIndex('寅') + 12) % 12) + 1;
    monthDesc = `节气月 ${ctx.pillars.month}（${mz}月＝第 ${monthN} 月）`;
  }

  // ── 日 ──
  let dayN, dayDesc;
  if (calendar === 'solar') {
    dayN = ctx.solar.d;
    dayDesc = `公历 ${dayN} 日`;
  } else {
    // 农历派与节气月派的「日」都用农历日（节气只影响月，不影响日）
    dayN = ctx.lunar.day;
    dayDesc = `农历${ctx.lunar.dayInChinese}（${dayN}）`;
  }

  // ── 时 ──
  const hourZhi = ctx.hourZhi;
  const hourN = zhiIndex(hourZhi) + 1; // 子=1 … 亥=12
  const hourDesc = `${hourZhi}时（${hourN}）`;

  const res = castByNumbers({ nums: [monthN, dayN, hourN], question });
  return {
    ...res,
    mode: '时间起卦',
    calendar,
    calendarNote: {
      lunar: '农历派（传统口诀所指，本 APP 默认）',
      solar: '公历派（现代 APP 常见，与传统口诀不符，仅作可选）',
      jieqi: '节气月派（月用月柱地支，日仍用农历日）',
    }[calendar],
    time: {
      civil: ctx.trueSolarTime.civilText,
      trueSolar: ctx.trueSolarTime.trueSolarText,
      basedOn: ctx.basedOn,
      useTrueSolar,
      solar: ctx.solar, lunar: ctx.lunar,
      pillars: ctx.pillars, jieqi: ctx.jieqi,
      hourZhi,
    },
    steps: [
      { step: '月', n: monthN, desc: monthDesc, from: '大安', to: res.gongs[0].shen },
      { step: '日', n: dayN, desc: dayDesc, from: res.gongs[0].shen, to: res.gongs[1].shen },
      { step: '时', n: hourN, desc: hourDesc, from: res.gongs[1].shen, to: res.gongs[2].shen },
    ],
  };
}

/**
 * 按三个数起小六壬（用户报数 / 也是时间起卦的内核）
 *
 * @param {Object} opt
 * @param {number[]} opt.nums 三个正整数（月/日/时位），任意大小，取模循环
 * @param {string} [opt.question]
 */
export function castByNumbers(opt = {}) {
  const { nums, question = '' } = opt;
  if (!Array.isArray(nums) || nums.length !== 3) throw new Error('需提供三个数');
  const n = nums.map((x) => {
    const v = Math.trunc(Number(x));
    if (!Number.isFinite(v) || v < 1) throw new Error(`数须为 >=1 的整数: ${x}`);
    return v;
  });

  // 三步接续，一律「含头数」（见文件头分歧 2）
  const g1 = countFrom('大安', n[0]);
  const g2 = countFrom(g1, n[1]);
  const g3 = countFrom(g2, n[2]);

  const gongs = [g1, g2, g3].map((shen, i) => ({
    ...GONG_ROLE[i],
    n: n[i],
    shen,
    ...LIU_SHEN_DETAIL[shen],
  }));

  return {
    mode: '数字起卦',
    question,
    nums: n,
    gongs,
    /** 结论宫（时宫）—— 断吉凶以此为主，兼看三宫生克 */
    conclusion: gongs[2],
    relations: gongRelations(gongs),
    summary: summarize(gongs),
    notes: NOTES,
  };
}

/**
 * 三宫五行生克
 * 月 → 日 → 时 依次相邻生克，及 月 ↔ 时 的隔宫关系
 */
export function gongRelations(gongs) {
  const rel = (a, b) => wuxingRelation(a.wuxing, b.wuxing);
  return [
    { pair: '月宫 → 日宫', a: gongs[0].shen, b: gongs[1].shen, relation: rel(gongs[0], gongs[1]) },
    { pair: '日宫 → 时宫', a: gongs[1].shen, b: gongs[2].shen, relation: rel(gongs[1], gongs[2]) },
    { pair: '月宫 → 时宫', a: gongs[0].shen, b: gongs[2].shen, relation: rel(gongs[0], gongs[2]) },
  ];
}

/**
 * 三宫综合概述
 *
 * 只做**规则化的组合陈述**（各宫吉凶计数 + 结论宫 + 生克走向），
 * 不生成传统判词之外的"断语"。真正的判断留给用户自己。
 */
export function summarize(gongs) {
  const ji = gongs.filter((g) => g.jixiong === '吉').length;
  const xiong = gongs.filter((g) => g.jixiong === '凶').length;
  const trend =
    ji === 3 ? '三宫全吉'
      : xiong === 3 ? '三宫全凶'
        : ji > xiong ? '吉多于凶' : ji < xiong ? '凶多于吉' : '吉凶相当';
  const seq = gongs.map((g) => g.shen).join(' → ');
  return {
    sequence: seq,
    jiCount: ji,
    xiongCount: xiong,
    trend,
    /** 结论宫吉凶为断事主轴（分歧 3 之「结果」派） */
    conclusion: `${gongs[2].shen}（${gongs[2].jixiong}）`,
    text:
      `三宫 ${seq}，${trend}；以时宫「${gongs[2].shen}」为结果，其性${gongs[2].jixiong}。` +
      `本 APP 只列口诀原文与三宫生克，最终判断请结合所占之事自行定夺。`,
  };
}

const NOTES = [
  '三宫起法采用「农历 + 含头数」：正月即大安，自月宫含头数日，自日宫含头数时。' +
  '另有公历派、节气月派、不含头派，见 modules/xiaoliuren.js 文件头注释。',
  '六神口诀取《诸葛神数·马前课》通行本；各本用字略有出入，未收录来源不明的细节判词。',
  ATTR_NOTE,
  '本 APP 只做排盘与口诀呈现，不生成吉凶结论断语。',
];

export default {
  castByTime, castByNumbers, countFrom, gongRelations, summarize,
  SHEN_ORDER, LIU_SHEN_DETAIL, GONG_ROLE, ATTR_NOTE,
};
