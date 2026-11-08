/**
 * modules/liuyao.js —— 六爻（金钱卦）完整装卦
 * ==========================================================================
 * 起卦：手动摇卦 / 随机摇卦 / 时间起卦 / 数字起卦
 * 装卦：京房纳甲、卦宫归属、世应、六亲、六神、伏神飞神、旬空、月破、日辰生克
 * 变化：本卦 / 变卦 / 互卦 / 错卦 / 综卦
 *
 * ## 设计要点：八宫六十四卦表是「生成 + 双重校验」而非硬抄
 * 六十四卦的卦宫、世爻位置，本模块用两条**互相独立**的路径求出并断言一致：
 *   路径 A（生成）：从八纯卦按「一世→五世→游魂→归魂」的变爻程序推出 8×8 = 64 卦；
 *   路径 B（口诀）：用《卜筮全书》安世诀，比较 (初,四)(二,五)(三,六) 三对爻的
 *                   同异模式直接定世爻。
 * 两路一致才通过（见 test/liuyao.test.js）。这比抄表可靠：抄错一格不会被发现，
 * 两条独立推导同时错到一处的概率极低。
 */

import {
  ZHI, ZHI_WUXING, GAN_WUXING, zhiIndex, zhiAdd, zhiChong,
  wuxingRelation, xun, isChong, LIU_HE, LIU_HAI, sanHeOf,
} from '../core/ganzhi.js';
import { resolve, yueJian, yuePo } from '../core/calendar.js';

// ───────────────────────── 八经卦 ─────────────────────────

/**
 * 八经卦。`yao` 自下而上三爻，1 = 阳（—），0 = 阴（--）
 * 例：巽 ☴ 一阴在下 → [0,1,1]
 */
export const TRIGRAMS = {
  乾: { yao: [1, 1, 1], wuxing: '金', nature: '天', fang: '西北', symbol: '☰' },
  兑: { yao: [1, 1, 0], wuxing: '金', nature: '泽', fang: '西', symbol: '☱' },
  离: { yao: [1, 0, 1], wuxing: '火', nature: '火', fang: '南', symbol: '☲' },
  震: { yao: [1, 0, 0], wuxing: '木', nature: '雷', fang: '东', symbol: '☳' },
  巽: { yao: [0, 1, 1], wuxing: '木', nature: '风', fang: '东南', symbol: '☴' },
  坎: { yao: [0, 1, 0], wuxing: '水', nature: '水', fang: '北', symbol: '☵' },
  艮: { yao: [0, 0, 1], wuxing: '土', nature: '山', fang: '东北', symbol: '☶' },
  坤: { yao: [0, 0, 0], wuxing: '土', nature: '地', fang: '西南', symbol: '☷' },
};

const TRIGRAM_BY_KEY = Object.fromEntries(
  Object.entries(TRIGRAMS).map(([n, v]) => [v.yao.join(''), n])
);

/** 三爻（自下而上）→ 经卦名 */
export const trigramOf = (y3) => {
  const n = TRIGRAM_BY_KEY[y3.join('')];
  if (!n) throw new Error(`非法三爻: ${y3}`);
  return n;
};

/** 六爻（自下而上）→ { lower, upper } */
export function trigramsOf(yao6) {
  return { lower: trigramOf(yao6.slice(0, 3)), upper: trigramOf(yao6.slice(3, 6)) };
}

// ───────────────────────── 京房纳甲 ─────────────────────────

/**
 * 京房纳甲
 *
 * 天干：乾内甲外壬、坤内乙外癸、震内外皆庚、巽皆辛、坎皆戊、离皆己、艮皆丙、兑皆丁
 * 地支：以内卦初爻起支，阳卦（乾坎艮震）**顺行隔一位**（+2），
 *       阴卦（坤巽离兑）**逆行隔一位**（-2），连贯排到上爻（外卦承内卦继续数）。
 *
 * 内卦初爻起支：乾子、坎寅、艮辰、震子、坤未、巽丑、离卯、兑巳
 *
 * 校验（传统口诀，见 test/liuyao.test.js 逐爻断言）：
 *   乾：甲子 甲寅 甲辰 壬午 壬申 壬戌
 *   坤：乙未 乙巳 乙卯 癸丑 癸亥 癸酉
 *   震：庚子 庚寅 庚辰 庚午 庚申 庚戌
 *   巽：辛丑 辛亥 辛酉 辛未 辛巳 辛卯
 *   坎：戊寅 戊辰 戊午 戊申 戊戌 戊子
 *   离：己卯 己丑 己亥 己酉 己未 己巳
 *   艮：丙辰 丙午 丙申 丙戌 丙子 丙寅
 *   兑：丁巳 丁卯 丁丑 丁亥 丁酉 丁未
 * 此表为纳甲主流（京房/火珠林一系），六爻预测通用，无实质分歧。
 */
export const NAJIA = {
  乾: { innerGan: '甲', outerGan: '壬', startZhi: '子', dir: +1 },
  坎: { innerGan: '戊', outerGan: '戊', startZhi: '寅', dir: +1 },
  艮: { innerGan: '丙', outerGan: '丙', startZhi: '辰', dir: +1 },
  震: { innerGan: '庚', outerGan: '庚', startZhi: '子', dir: +1 },
  巽: { innerGan: '辛', outerGan: '辛', startZhi: '丑', dir: -1 },
  离: { innerGan: '己', outerGan: '己', startZhi: '卯', dir: -1 },
  坤: { innerGan: '乙', outerGan: '癸', startZhi: '未', dir: -1 },
  兑: { innerGan: '丁', outerGan: '丁', startZhi: '巳', dir: -1 },
};

/**
 * 单个经卦作为内卦（下三爻）或外卦（上三爻）时，三爻所纳的干支
 * @param {string} tri 经卦名
 * @param {boolean} isInner true = 内卦(初二三爻)，false = 外卦(四五六爻)
 * @returns {Array<{gan:string, zhi:string}>} 自下而上三项
 */
export function najiaOfTrigram(tri, isInner) {
  const cfg = NAJIA[tri];
  if (!cfg) throw new Error(`未知经卦: ${tri}`);
  const gan = isInner ? cfg.innerGan : cfg.outerGan;
  // 外卦从第 4 爻起，故起点再推 3 位
  const base = isInner ? 0 : 3;
  return [0, 1, 2].map((i) => ({
    gan,
    zhi: zhiAdd(cfg.startZhi, cfg.dir * 2 * (base + i)),
  }));
}

/** 六爻纳甲（自下而上 6 项） */
export function najia(yao6) {
  const { lower, upper } = trigramsOf(yao6);
  return [...najiaOfTrigram(lower, true), ...najiaOfTrigram(upper, false)];
}

// ───────────────────────── 八宫六十四卦 ─────────────────────────

/** 京房八宫序 */
export const EIGHT_PALACES = ['乾', '坎', '艮', '震', '巽', '离', '坤', '兑'];

/** 宫五行（= 本宫经卦五行） */
export const palaceWuxing = (p) => TRIGRAMS[p].wuxing;

const flip = (yao, i) => { const y = [...yao]; y[i] = 1 - y[i]; return y; };

/**
 * 生成八宫六十四卦（路径 A）
 *
 * 每宫八卦，自本宫卦起依次：
 *   本宫(六世) → 一世(变初爻) → 二世(再变二爻) → 三世(再变三爻)
 *   → 四世(再变四爻) → 五世(再变五爻)
 *   → 游魂(自五世卦把**第四爻变回**) → 归魂(自游魂卦把**内卦复原为本宫内卦**)
 *
 * 世爻位置：本宫 6、一世 1 … 五世 5、游魂 4、归魂 3（以 1 = 初爻计）
 * 应爻 = 世爻 ± 3（相隔三位）
 */
export function buildPalaceTable() {
  const table = []; // { yao, palace, shiPos(1..6), rank }
  for (const p of EIGHT_PALACES) {
    const t = TRIGRAMS[p].yao;
    const ben = [...t, ...t];
    const seq = [];
    seq.push({ yao: ben, shiPos: 6, rank: '本宫卦（六世）' });
    let cur = ben;
    for (let i = 0; i < 5; i++) {
      cur = flip(cur, i);
      seq.push({ yao: cur, shiPos: i + 1, rank: `${'一二三四五'[i]}世卦` });
    }
    // 游魂：自五世卦把第 4 爻（index 3）变回
    const youhun = flip(cur, 3);
    seq.push({ yao: youhun, shiPos: 4, rank: '游魂卦（四世）' });
    // 归魂：自游魂卦把内卦（下三爻）复原为本宫内卦
    const guihun = [...t, ...youhun.slice(3)];
    seq.push({ yao: guihun, shiPos: 3, rank: '归魂卦（三世）' });
    seq.forEach((s) => table.push({ ...s, palace: p }));
  }
  return table;
}

/**
 * 安世诀（路径 B，独立推导）
 * 比较 (初,四)(二,五)(三,六) 三对爻的同/异：
 *   同同同 → 本宫卦，世在六爻
 *   同同异 → 天变，五世
 *   同异异 → 地同，四世
 *   异同异 → 人同，游魂，四世
 *   异异同 → 天同，二世
 *   异同同 → 地变，初世
 *   同异同 → 人变，归魂，三世
 *   异异异 → 三世（上下卦全反，如天地否、地天泰、水火既济）
 * 口诀：「天同二世天变五，地同四世地变初，人同游魂人变归，本宫之卦六世居」
 */
export function shiPosByFormula(yao6) {
  const di = yao6[0] === yao6[3]; // 地：初 vs 四
  const ren = yao6[1] === yao6[4]; // 人：二 vs 五
  const tian = yao6[2] === yao6[5]; // 天：三 vs 六
  const key = `${di ? '同' : '异'}${ren ? '同' : '异'}${tian ? '同' : '异'}`;
  const map = {
    同同同: 6, 同同异: 5, 同异异: 4, 异同异: 4,
    异异同: 2, 异同同: 1, 同异同: 3, 异异异: 3,
  };
  return { shiPos: map[key], pattern: key };
}

const PALACE_TABLE = buildPalaceTable();
const PALACE_INDEX = new Map(PALACE_TABLE.map((r) => [r.yao.join(''), r]));

/** 六爻 → { palace, shiPos, yingPos, rank } */
export function palaceOf(yao6) {
  const r = PALACE_INDEX.get(yao6.join(''));
  if (!r) throw new Error(`八宫表缺卦: ${yao6.join('')}`);
  const yingPos = ((r.shiPos + 3 - 1) % 6) + 1;
  return { palace: r.palace, shiPos: r.shiPos, yingPos, rank: r.rank };
}

// ───────────────────────── 六亲 ─────────────────────────

/**
 * 六亲 —— 以**卦宫五行**为「我」，比各爻地支五行
 *   同我 = 兄弟 ／ 我生 = 子孙 ／ 生我 = 父母 ／ 我克 = 妻财 ／ 克我 = 官鬼
 */
export const LIU_QIN_BY_REL = {
  同我: '兄弟', 我生: '子孙', 生我: '父母', 我克: '妻财', 克我: '官鬼',
};
export const liuQin = (palaceWx, zhiWx) => LIU_QIN_BY_REL[wuxingRelation(palaceWx, zhiWx)];

export const LIU_QIN_MEANING = {
  父母: '长辈、师长、文书证件、房屋车船、庇护与依靠；主劳苦操持。',
  兄弟: '兄弟姐妹、朋友同辈、竞争者；主耗财、阻隔、分夺。',
  子孙: '子女晚辈、医药、僧道、福神；克官鬼，主解忧去病。',
  妻财: '妻妾、财物钱粮、货物；主得失进益。',
  官鬼: '官府上司、丈夫、疾病、盗贼、鬼神；主压制与忧疑。',
};

// ───────────────────────── 六神（六兽） ─────────────────────────

/**
 * 六神起法 —— 按**日干**起，自初爻向上依次安六神
 *   甲乙日起青龙、丙丁日起朱雀、戊日起勾陈、己日起螣蛇、
 *   庚辛日起白虎、壬癸日起玄武
 * 顺序固定：青龙 → 朱雀 → 勾陈 → 螣蛇 → 白虎 → 玄武
 *
 * 分歧：以上为《卜筮正宗》《增删卜易》主流。少数抄本把「勾陈」「螣蛇」次序
 * 互换（作 青龙-朱雀-螣蛇-勾陈-白虎-玄武），并相应改为「戊日起螣蛇、己日起勾陈」。
 * 本 APP 用主流一派。
 */
export const LIU_SHEN = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];
export const LIU_SHEN_START = {
  甲: 0, 乙: 0, 丙: 1, 丁: 1, 戊: 2, 己: 3, 庚: 4, 辛: 4, 壬: 5, 癸: 5,
};
export function liuShenOf(dayGan) {
  const s = LIU_SHEN_START[dayGan];
  if (s === undefined) throw new Error(`未知日干: ${dayGan}`);
  // 自初爻（index 0）到上爻（index 5）
  return Array.from({ length: 6 }, (_, i) => LIU_SHEN[(s + i) % 6]);
}

export const LIU_SHEN_MEANING = {
  青龙: '吉庆、喜事、酒色财喜；主正大光明之事。',
  朱雀: '口舌文书、信息音讯、争讼；主言语是非。',
  勾陈: '牵连缠绕、田土房产、旧事纠缠；主迟滞。',
  螣蛇: '虚惊怪异、忧疑梦扰；主虚而不实。',
  白虎: '刑伤病丧、道路血光、迅疾；主凶暴急速。',
  玄武: '盗贼暗昧、遗失欺瞒、私情；主阴私。',
};

// ───────────────────────── 摇卦 ─────────────────────────

/**
 * 一次摇卦（三枚铜钱）→ 爻象
 * 传统以**背为阳（有字面为阴）**：
 *   三背 = 老阳（重）→ 阳爻且动，变阴
 *   三面 = 老阴（交）→ 阴爻且动，变阳
 *   二背一面 = 少阴（拆）→ 阴爻，静
 *   一背二面 = 少阳（单）→ 阳爻，静
 *
 * 分歧：铜钱正反面与阴阳的对应有"背为阳"与"字为阳"两说，
 * 二者会把 少阴/少阳 对调（老阴老阳不受影响）。本 APP 用**背为阳**
 * （《增删卜易》一系通行），UI 上直接让用户点"背/面"，不涉及硬币外观。
 */
export function yaoFromCoins(beiCount) {
  if (![0, 1, 2, 3].includes(beiCount)) throw new Error('背面数须为 0~3');
  switch (beiCount) {
    case 3: return { value: 1, moving: true, name: '老阳', mark: '重', symbol: '▅▅▅ ○' };
    case 0: return { value: 0, moving: true, name: '老阴', mark: '交', symbol: '▅ ▅ ×' };
    case 2: return { value: 0, moving: false, name: '少阴', mark: '拆', symbol: '▅ ▅' };
    default: return { value: 1, moving: false, name: '少阳', mark: '单', symbol: '▅▅▅' };
  }
}

/** 随机摇一爻（用 crypto 保证质量，无 crypto 时退回 Math.random） */
function randomBeiCount() {
  const rnd = () => {
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      const a = new Uint8Array(1);
      globalThis.crypto.getRandomValues(a);
      return a[0] / 256;
    }
    return Math.random();
  };
  return [0, 1, 2].reduce((s) => s + (rnd() < 0.5 ? 1 : 0), 0);
}

/** 随机摇六爻，返回 beiCounts（自下而上） */
export const randomCast = () => Array.from({ length: 6 }, () => randomBeiCount());

/**
 * 时间起卦（以卦为体，与梅花易数同法但按六爻规则装卦）
 * 上卦 = (农历年支序 + 月 + 日) % 8，下卦 = (年支序 + 月 + 日 + 时支序) % 8，
 * 动爻 = 上述总和 % 6
 * ⚠️ 分歧：这是梅花易数的年月日时起卦法，六爻传统以摇钱为正法；
 *    时间起卦只得**一个动爻**，得不到多爻齐动的情形。仅作便捷入口。
 */
export function timeCast(dt, longitude = 120, sect = 2, useTrueSolar = true) {
  const ctx = resolve(dt, longitude, useTrueSolar, sect);
  const yearZhiIdx = zhiIndex(ctx.pillars.year[1]) + 1; // 子=1
  const m = ctx.lunar.month;
  const d = ctx.lunar.day;
  const hourIdx = zhiIndex(ctx.hourZhi) + 1;
  const upperN = yearZhiIdx + m + d;
  const lowerN = upperN + hourIdx;
  const XIANTIAN = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤']; // 先天八卦数 1..8
  const up = XIANTIAN[(upperN % 8 || 8) - 1];
  const low = XIANTIAN[(lowerN % 8 || 8) - 1];
  const movePos = (lowerN % 6 || 6); // 1..6
  return {
    yao: [...TRIGRAMS[low].yao, ...TRIGRAMS[up].yao],
    movingPositions: [movePos],
    detail: { yearZhiIdx, lunarMonth: m, lunarDay: d, hourIdx, upperN, lowerN, up, low, movePos },
  };
}

// ───────────────────────── 变卦 / 互卦 / 错卦 / 综卦 ─────────────────────────

export const bianGua = (yao6, movingIdx) =>
  yao6.map((v, i) => (movingIdx.includes(i) ? 1 - v : v));
/** 互卦：下卦取 2·3·4 爻，上卦取 3·4·5 爻（自下而上，index 1..4） */
export const huGua = (y) => [y[1], y[2], y[3], y[2], y[3], y[4]];
/** 错卦：六爻全反 */
export const cuoGua = (y) => y.map((v) => 1 - v);
/** 综卦：整卦上下颠倒 */
export const zongGua = (y) => [...y].reverse();

// ───────────────────────── 卦名 / 卦爻辞 ─────────────────────────

/**
 * 卦名与卦爻辞由 src/data/yijing64.json 提供（原文来源见该文件 _source 字段）。
 * 传入以避免模块层直接读文件（浏览器与 Node 加载方式不同）。
 */
let YIJING = null;
/** @param {{hexagrams:Array}} data src/data/yijing64.json 的内容 */
export function setYijingData(data) {
  const idx = new Map();
  for (const h of data.hexagrams) {
    const yao = [...TRIGRAMS[h.lower].yao, ...TRIGRAMS[h.upper].yao];
    idx.set(yao.join(''), h);
  }
  if (idx.size !== 64) throw new Error(`卦爻辞数据异常：去重后 ${idx.size} 卦`);
  YIJING = idx;
}
export const yijingLoaded = () => YIJING !== null;

/** 常用俗名（"天地否" 式），由上下卦自然名组合而成，可机械生成 */
export function fullName(yao6, shortName) {
  const { lower, upper } = trigramsOf(yao6);
  if (lower === upper) return `${lower}为${TRIGRAMS[lower].nature}`;
  return `${TRIGRAMS[upper].nature}${TRIGRAMS[lower].nature}${shortName}`;
}

// ───────────────────────── 装卦主流程 ─────────────────────────

/**
 * 装一个卦（不含日辰旬空等外部信息）
 */
export function dressGua(yao6) {
  const { lower, upper } = trigramsOf(yao6);
  const { palace, shiPos, yingPos, rank } = palaceOf(yao6);
  const pWx = palaceWuxing(palace);
  const nj = najia(yao6);
  const text = YIJING ? YIJING.get(yao6.join('')) : null;

  const yaos = yao6.map((v, i) => {
    const { gan, zhi } = nj[i];
    const wx = ZHI_WUXING[zhi];
    return {
      pos: i + 1, // 1 = 初爻
      posName: ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'][i],
      value: v,
      yinYang: v ? '阳' : '阴',
      gan, zhi, ganzhi: gan + zhi, wuxing: wx,
      liuQin: liuQin(pWx, wx),
      isShi: i + 1 === shiPos,
      isYing: i + 1 === yingPos,
      yaoTi: text ? text.yaoci[i].title : null,
      yaoCi: text ? text.yaoci[i].text : null,
    };
  });

  return {
    yao: yao6,
    lower, upper,
    lowerInfo: TRIGRAMS[lower], upperInfo: TRIGRAMS[upper],
    palace, palaceWuxing: pWx, rank, shiPos, yingPos,
    no: text ? text.no : null,
    name: text ? text.name : null,
    fullName: text ? fullName(yao6, text.name) : null,
    guaCi: text ? text.guaci : null,
    yongJiu: text ? text.yongjiu || null : null,
    yongLiu: text ? text.yongliu || null : null,
    yaos,
  };
}

/**
 * 伏神 / 飞神
 * 本卦六亲不全时，缺失的六亲从**本宫首卦（八纯卦）**同爻位取出为「伏神」，
 * 伏于本卦该爻之下；本卦该爻即「飞神」。
 */
export function fuShen(dressed) {
  const palaceYao = [...TRIGRAMS[dressed.palace].yao, ...TRIGRAMS[dressed.palace].yao];
  const pure = dressGua(palaceYao);
  const present = new Set(dressed.yaos.map((y) => y.liuQin));
  const missing = ['父母', '兄弟', '子孙', '妻财', '官鬼'].filter((q) => !present.has(q));
  return missing.map((q) => {
    const src = pure.yaos.find((y) => y.liuQin === q);
    const fei = dressed.yaos[src.pos - 1];
    return {
      liuQin: q,
      fu: { ganzhi: src.ganzhi, zhi: src.zhi, wuxing: src.wuxing, pos: src.pos, posName: src.posName },
      fei: { ganzhi: fei.ganzhi, zhi: fei.zhi, wuxing: fei.wuxing, liuQin: fei.liuQin },
      /** 飞神生伏神则伏神可用（"飞来生伏得长生"）；飞神克伏神则伏神难出 */
      relation: wuxingRelation(fei.wuxing, src.wuxing),
    };
  });
}

// ───────────────────────── 动爻化出（回头生克 / 进退神） ─────────────────────────

/**
 * 四进神 / 四退神
 * 进神：寅化卯、巳化午、申化酉、亥化子（同五行而地支顺进一位）
 * 退神：卯化寅、午化巳、酉化申、子化亥
 *
 * ⚠️ 分歧：辰戌丑未（土）之间的转化（如丑化辰、辰化未）是否也算进退神，
 *    各家说法不一。《卜筮正宗》只列上述四进四退，本 APP 从之；
 *    土支之间同五行相化，本模块记为 `化同五行（土）`，不判进退。
 */
export const JIN_SHEN = { 寅: '卯', 巳: '午', 申: '酉', 亥: '子' };
export const TUI_SHEN = { 卯: '寅', 午: '巳', 酉: '申', 子: '亥' };

/**
 * 动爻与其变出之爻的关系
 * @param {string} benZhi 本爻地支
 * @param {string} bianZhi 变出之爻地支
 */
export function huiTouOf(benZhi, bianZhi) {
  const bw = ZHI_WUXING[benZhi], vw = ZHI_WUXING[bianZhi];
  // 变爻冲本爻（「化回头之冲」），与下面的五行判定并存
  const chong = isChong(benZhi, bianZhi);
  const tag = (name, desc) => ({ name, desc, chong, chongDesc: chong ? '变爻冲本爻（化回头之冲）' : null });
  // 以「变爻」为主体看「本爻」
  const rel = wuxingRelation(vw, bw);
  if (rel === '同我') {
    if (JIN_SHEN[benZhi] === bianZhi) return tag('化进神', '同五行而地支顺进，力增');
    if (TUI_SHEN[benZhi] === bianZhi) return tag('化退神', '同五行而地支退回，力减');
    if (benZhi === bianZhi) return tag('化伏吟', '变出同支（阴阳互变而支不动）');
    return tag(`化同五行（${vw}）`, '同五行相化，进退不判（见 JIN_SHEN 注释）');
  }
  if (rel === '我生') return tag('回头生', '变爻生本爻，本爻得助');
  if (rel === '我克') return tag('回头克', '变爻克本爻，本爻受伤');
  if (rel === '生我') return tag('化泄气', '本爻生变爻，本爻力泄');
  return tag('化耗气', '本爻克变爻，本爻力耗');
}

/**
 * 六爻完整排盘
 *
 * @param {Object} opt
 * @param {number[]} [opt.beiCounts]  六次摇卦的背面数（自下而上），0~3
 * @param {number[]} [opt.yao]        直接给六爻值（自下而上 0/1），与 movingPositions 配合
 * @param {number[]} [opt.movingPositions] 动爻位（1..6），配合 yao 使用
 * @param {Date}     [opt.dt]         占卦时刻（定日辰、月建、旬空），默认现在
 * @param {number}   [opt.longitude]  经度
 * @param {1|2}      [opt.sect]       晚子时流派：2=23时后日柱进次日（默认），1=仍算当日
 * @param {string}   [opt.question]   所占何事
 */
export function paipan(opt = {}) {
  const {
    dt = new Date(), longitude = 120, useTrueSolar = true, sect = 2, question = '',
  } = opt;

  // ── 取卦 ──
  let yao6, movingIdx, castDetail = null;
  if (opt.beiCounts) {
    if (opt.beiCounts.length !== 6) throw new Error('beiCounts 需 6 项（自下而上）');
    const rolls = opt.beiCounts.map((b) => yaoFromCoins(b));
    yao6 = rolls.map((r) => r.value);
    movingIdx = rolls.map((r, i) => (r.moving ? i : -1)).filter((i) => i >= 0);
    castDetail = { mode: '摇卦', rolls: rolls.map((r, i) => ({ pos: i + 1, bei: opt.beiCounts[i], ...r })) };
  } else if (opt.yao) {
    yao6 = [...opt.yao];
    movingIdx = (opt.movingPositions || []).map((p) => p - 1);
    castDetail = { mode: '指定卦象' };
  } else {
    throw new Error('需提供 beiCounts 或 yao');
  }
  if (yao6.length !== 6 || yao6.some((v) => v !== 0 && v !== 1)) throw new Error('六爻须为 6 个 0/1');

  // ── 日辰上下文 ──
  const ctx = resolve(dt, longitude, useTrueSolar, sect);
  const dayGz = ctx.pillars.day;
  const dayGan = dayGz[0], dayZhi = dayGz[1];
  const { xunKong, xunShou } = xun(dayGz);
  const monthZhi = ctx.pillars.month[1];
  const poZhi = zhiChong(monthZhi);

  // ── 装本卦及诸卦 ──
  const ben = dressGua(yao6);
  const bianYao = movingIdx.length ? bianGua(yao6, movingIdx) : yao6;
  const bian = dressGua(bianYao);
  const hu = dressGua(huGua(yao6));
  const cuo = dressGua(cuoGua(yao6));
  const zong = dressGua(zongGua(yao6));

  // ── 六神（按日干，自初爻向上） ──
  const shen = liuShenOf(dayGan);

  // ── 逐爻附加日辰信息 ──
  const enrich = (g, isBen) =>
    g.yaos.map((y, i) => {
      const out = { ...y };
      if (isBen) {
        out.moving = movingIdx.includes(i);
        out.liuShen = shen[i];
        /**
         * 变爻（动爻变出的那一爻）
         *
         * ⚠️ 分歧：变出之爻的**六亲**以哪个卦宫为准，两说并存：
         *   (a) 以**变卦之宫**定 —— 主流排盘软件（元亨利贞等）与多数印本卦盘的做法，
         *       故卦盘上会同时标出「本卦宫名」与「变卦宫名」两行；
         *   (b) 以**本卦之宫**定 —— 部分注家主张一卦之六亲当始终以本宫为体，
         *       变爻只是本宫某爻之化神。
         * 本模块**两者都给出**，不替用户选：
         *   `liuQin`      = 按变卦之宫（(a) 说，与主流软件一致，UI 默认显示）
         *   `liuQinBenGong` = 按本卦之宫（(b) 说）
         * 真正用于判断的「回头生 / 回头克 / 进退神」只依赖五行与地支，不受此分歧影响，
         * 已单列于 `huiTou`。
         */
        const bz = bian.yaos[i];
        out.bian = out.moving
          ? {
            ganzhi: bz.ganzhi, zhi: bz.zhi, wuxing: bz.wuxing, yinYang: bz.yinYang,
            liuQin: bz.liuQin,
            liuQinBenGong: liuQin(ben.palaceWuxing, bz.wuxing),
            huiTou: huiTouOf(y.zhi, bz.zhi),
          }
          : null;
      }
      out.xunKong = xunKong.includes(y.zhi);
      out.yuePo = y.zhi === poZhi;
      out.vsDayZhi = wuxingRelation(ZHI_WUXING[dayZhi], y.wuxing); // 日辰对该爻
      out.vsMonthZhi = wuxingRelation(ZHI_WUXING[monthZhi], y.wuxing); // 月建对该爻
      out.chongByDay = isChong(dayZhi, y.zhi);
      out.heByDay = LIU_HE[dayZhi] === y.zhi;
      return out;
    });

  const benYaos = enrich(ben, true);

  return {
    question,
    cast: castDetail,
    time: {
      civil: ctx.trueSolarTime.civilText,
      trueSolar: ctx.trueSolarTime.trueSolarText,
      solar: ctx.solar, lunar: ctx.lunar,
      pillars: ctx.pillars,
      jieqi: ctx.jieqi,
    },
    dayChen: {
      ganzhi: dayGz, gan: dayGan, zhi: dayZhi,
      wuxingGan: GAN_WUXING[dayGan], wuxingZhi: ZHI_WUXING[dayZhi],
      xunShou, xunKong,
      monthZhi, monthWuxing: ZHI_WUXING[monthZhi],
      yuePo: poZhi,
      sanHe: sanHeOf(dayZhi),
      liuHe: LIU_HE[dayZhi],
      liuHai: LIU_HAI[dayZhi],
    },
    benGua: { ...ben, yaos: benYaos },
    bianGua: movingIdx.length ? bian : null,
    huGua: hu,
    cuoGua: cuo,
    zongGua: zong,
    movingPositions: movingIdx.map((i) => i + 1),
    fuShen: fuShen(ben),
    liuShen: shen,
    notes: [
      '摇卦以「背为阳」计（三背老阳动、三面老阴动、二背少阴、一背少阳）；' +
      '另有「字为阳」一派，会把少阴少阳对调。',
      '六神按主流「戊日起勾陈、己日起螣蛇」；少数抄本勾陈螣蛇次序相反。',
      '旬空按日干支所在旬推（癸酉日属甲子旬，空戌亥）；月破 = 月建之冲。',
      '变爻六亲两说并存：本 APP 同时给出「按变卦之宫」（主流软件做法，默认显示）与' +
      '「按本卦之宫」两个标注；回头生克与进退神只依五行地支判定，不受此分歧影响。',
      '本 APP 只做**排盘与规则化标注**，不生成吉凶结论断语——' +
      '用神取用与最终判断需按所占之事自行定夺。',
    ],
  };
}

export default {
  paipan, dressGua, najia, palaceOf, buildPalaceTable, shiPosByFormula,
  liuShenOf, yaoFromCoins, randomCast, timeCast, setYijingData, huiTouOf,
  fuShen, huGua, cuoGua, zongGua, bianGua, fullName,
  TRIGRAMS, NAJIA, EIGHT_PALACES,
};
