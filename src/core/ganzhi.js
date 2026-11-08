/**
 * core/ganzhi.js —— 干支 / 五行 / 刑冲合害 基础层
 * ==================================================
 * 纯函数、零依赖、可独立单元测试。上层（小六壬/大六壬/六爻/梅花）共用。
 *
 * 所有表都是**确定性的传统定义**，不涉及流派分歧；凡有分歧的地方
 * （如干寄宫、贵人）都放在各自的模块里并就地标注。
 */

// ───────────────────────── 天干地支 ─────────────────────────

/** 十天干 */
export const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

/** 十二地支（子=0） */
export const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

export const ganIndex = (g) => {
  const i = GAN.indexOf(g);
  if (i < 0) throw new Error(`未知天干: ${g}`);
  return i;
};
export const zhiIndex = (z) => {
  const i = ZHI.indexOf(z);
  if (i < 0) throw new Error(`未知地支: ${z}`);
  return i;
};

/** 地支加减（自动取模，支持负数） */
export const zhiAdd = (z, n) => ZHI[(((zhiIndex(z) + n) % 12) + 12) % 12];
/** 从 a 顺行到 b 的步数 (0..11) */
export const zhiFwd = (a, b) => (((zhiIndex(b) - zhiIndex(a)) % 12) + 12) % 12;

/** 天干阴阳：甲丙戊庚壬为阳（偶数位） */
export const ganYinYang = (g) => (ganIndex(g) % 2 === 0 ? '阳' : '阴');
/** 地支阴阳：子寅辰午申戌为阳 */
export const zhiYinYang = (z) => (zhiIndex(z) % 2 === 0 ? '阳' : '阴');

/** 六十甲子 */
export const JIAZI = Array.from({ length: 60 }, (_, i) => GAN[i % 10] + ZHI[i % 12]);

/** 干支 → 六十甲子序号 0..59；非法组合（如"甲丑"）返回 -1 */
export const jiaziIndex = (gz) => JIAZI.indexOf(gz);

// ───────────────────────── 五行 ─────────────────────────

export const WUXING = ['木', '火', '土', '金', '水'];

export const GAN_WUXING = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};

export const ZHI_WUXING = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
  午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
};

/** 我生者（木生火 火生土 土生金 金生水 水生木） */
export const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
/** 我克者（木克土 土克水 水克火 火克金 金克木） */
export const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

export const isSheng = (a, b) => SHENG[a] === b; // a 生 b
export const isKe = (a, b) => KE[a] === b; // a 克 b

/**
 * 五行关系（以 a 为主体看 b）
 * @returns {'同我'|'我生'|'生我'|'我克'|'克我'}
 */
export function wuxingRelation(a, b) {
  if (a === b) return '同我';
  if (SHENG[a] === b) return '我生';
  if (SHENG[b] === a) return '生我';
  if (KE[a] === b) return '我克';
  if (KE[b] === a) return '克我';
  throw new Error(`无法判定五行关系: ${a} vs ${b}`);
}

/** 地支五行关系简写 */
export const zhiRelation = (a, b) => wuxingRelation(ZHI_WUXING[a], ZHI_WUXING[b]);

// ───────────────────────── 刑冲合害 ─────────────────────────

/** 六冲：相隔 6 位 */
export const zhiChong = (z) => zhiAdd(z, 6);
export const isChong = (a, b) => zhiFwd(a, b) === 6;

/**
 * 三刑 / 自刑 —— "我所刑"的单向映射
 * 子卯相刑（互刑）；寅→巳→申→寅（三刑循环）；丑→戌→未→丑（三刑循环）；
 * 辰午酉亥自刑。
 * 大六壬伏吟课取中末传要用这张表。
 */
export const XING = {
  子: '卯', 卯: '子',
  寅: '巳', 巳: '申', 申: '寅',
  丑: '戌', 戌: '未', 未: '丑',
  辰: '辰', 午: '午', 酉: '酉', 亥: '亥',
};
/** 自刑之支（伏吟课"自刑则取冲"的判定） */
export const SELF_XING = ['辰', '午', '酉', '亥'];
export const isSelfXing = (z) => SELF_XING.includes(z);

/** 六合：子丑 寅亥 卯戌 辰酉 巳申 午未 */
export const LIU_HE = {
  子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯',
  辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午',
};

/** 六害（六穿）：子未 丑午 寅巳 卯辰 申亥 酉戌 */
export const LIU_HAI = {
  子: '未', 未: '子', 丑: '午', 午: '丑', 寅: '巳', 巳: '寅',
  卯: '辰', 辰: '卯', 申: '亥', 亥: '申', 酉: '戌', 戌: '酉',
};

/** 三合局：申子辰水、亥卯未木、寅午戌火、巳酉丑金 */
export const SAN_HE = [
  { zhi: ['申', '子', '辰'], wuxing: '水' },
  { zhi: ['亥', '卯', '未'], wuxing: '木' },
  { zhi: ['寅', '午', '戌'], wuxing: '火' },
  { zhi: ['巳', '酉', '丑'], wuxing: '金' },
];
/** 某支所属三合局 */
export const sanHeOf = (z) => SAN_HE.find((s) => s.zhi.includes(z));

/** 五合（天干化合）：甲己 乙庚 丙辛 丁壬 戊癸 —— 大六壬别责课要用 */
export const GAN_HE = {
  甲: '己', 己: '甲', 乙: '庚', 庚: '乙', 丙: '辛',
  辛: '丙', 丁: '壬', 壬: '丁', 戊: '癸', 癸: '戊',
};

// ───────────────────────── 孟仲季 ─────────────────────────

/** 四孟（寅申巳亥）—— 大六壬涉害「见机格」优先取孟 */
export const MENG = ['寅', '申', '巳', '亥'];
/** 四仲（子午卯酉）—— 「察微格」取仲 */
export const ZHONG = ['子', '午', '卯', '酉'];
/** 四季（辰戌丑未）—— 孟仲皆无则「缀瑕格」取干上神 */
export const JI = ['辰', '戌', '丑', '未'];

/** @returns {'孟'|'仲'|'季'} */
export function mengZhongJi(z) {
  if (MENG.includes(z)) return '孟';
  if (ZHONG.includes(z)) return '仲';
  return '季';
}

// ───────────────────────── 旬 / 空亡 ─────────────────────────

/**
 * 旬首与旬空
 * 六十甲子分六旬，每旬十日，旬中缺两支即"空亡"（旬空）。
 *   甲子旬(0-9)   旬首甲子  空 戌亥
 *   甲戌旬(10-19) 旬首甲戌  空 申酉
 *   甲申旬(20-29) 旬首甲申  空 午未
 *   甲午旬(30-39) 旬首甲午  空 辰巳
 *   甲辰旬(40-49) 旬首甲辰  空 寅卯
 *   甲寅旬(50-59) 旬首甲寅  空 子丑
 * 推导（非查表）：旬内第 k 日（k=0..9）的支 = 旬首支 + k；
 * 旬首支之后第 10、11 位即为空亡二支。
 *
 * @param {string} gz 干支，如 '癸酉'
 * @returns {{xunShou:string, xunKong:[string,string], xunIndex:number, dayInXun:number}}
 */
export function xun(gz) {
  const idx = jiaziIndex(gz);
  if (idx < 0) throw new Error(`非法干支组合: ${gz}`);
  const dayInXun = idx % 10; // 0..9，甲=0
  const xunIndex = Math.floor(idx / 10); // 0..5
  const shouZhi = ZHI[(idx - dayInXun) % 12];
  return {
    xunShou: '甲' + shouZhi,
    xunKong: [zhiAdd(shouZhi, 10), zhiAdd(shouZhi, 11)],
    xunIndex,
    dayInXun,
  };
}

/** 该支在此日是否旬空 */
export const isXunKong = (dayGz, z) => xun(dayGz).xunKong.includes(z);

/**
 * 旬遁 —— 求某地支在本旬中所配的天干（六壬「遁干」、六爻不用）
 * 旬首为甲，旬内地支依次配十干；超出十日的两支（空亡）无遁干，返回 null。
 */
export function dunGan(dayGz, z) {
  const { xunShou } = xun(dayGz);
  const step = zhiFwd(xunShou[1], z);
  if (step > 9) return null; // 空亡，无遁干
  return GAN[step];
}

// ───────────────────────── 时辰 ─────────────────────────

/**
 * 钟点 → 时辰地支
 * 采用**通行两小时制**：子时 23:00–00:59，丑时 01:00–02:59 …
 * （即所谓"晚子时归当日"与否属另一议题，此处只做时辰归属，
 *   日干支的换日由 lunar-javascript 按其规则处理，见 core/calendar.js 注释）
 */
export const hourToZhi = (hour) => ZHI[Math.floor(((hour + 1) % 24) / 2) % 12];

/** 时辰地支 → 起止钟点，用于 UI 展示 */
export function zhiToHourRange(z) {
  const i = zhiIndex(z);
  const start = (i * 2 + 23) % 24;
  return [start, (start + 1) % 24];
}

// ───────────────────────── 驿马 / 贵人等神煞 ─────────────────────────

/**
 * 驿马 —— 按日支三合局取
 *   申子辰 → 马在寅 ；寅午戌 → 马在申 ；巳酉丑 → 马在亥 ；亥卯未 → 马在巳
 * 大六壬返吟课「无依格」以驿马发用。
 * 规律：三合局首支之冲。
 */
export function yiMa(dayZhi) {
  const he = sanHeOf(dayZhi);
  if (!he) throw new Error(`无法定位三合局: ${dayZhi}`);
  return zhiChong(he.zhi[0]);
}

/** 长生十二宫（顺序），六爻/八字用 */
export const CHANG_SHENG = [
  '长生', '沐浴', '冠带', '临官', '帝旺', '衰',
  '病', '死', '墓', '绝', '胎', '养',
];
