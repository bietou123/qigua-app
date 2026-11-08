/**
 * modules/daliuren.js —— 大六壬 完整排盘（九宗门）
 * ==========================================================================
 * 排盘流程：
 *   月将（中气换将） → 占时 → 天盘（月将加时） → 四课 → 三传（九宗门） → 十二天将
 *   → 旬空 / 旬首 / 遁干 → 课体
 *
 * ## 关键实现要点（与常见简化实现的区别）
 * 1. **第一课的克关系用「日干本身的五行」判，不用寄宫的五行。**
 *    寄宫只用来在天盘上*定位*干上神。乙(木)寄辰(土)、丁(火)寄未(土)、
 *    戊(土)寄巳(火)、辛(金)寄戌(土)、癸(水)寄丑(土) 这五个干，
 *    寄宫五行与本气五行不同，用错会导致三传发用整个错掉。
 *    （用户已有的 zhanbu 项目 liuren_service.py 就是用寄宫五行判的，本模块不沿用。）
 * 2. **九宗门全部实现**，含比用、涉害（深浅计数 + 孟仲季三格）、遥克蒿矢/弹射、
 *    昴星阳仰阴俯、别责、八专、伏吟（自任/自信 + 刑冲取中末）、返吟（驿马）。
 * 3. 凡有流派分歧处，代码里就地注明"分歧:"并在返回值 `notes[]` 里带出，
 *    UI 会显示，不静默替用户做唯一解释。
 *
 * ## 参考体系
 * 《六壬大全》《六壬视斯》《毕法赋》所载通行法。本模块**未**与权威排盘书
 * 逐例校对（见 算法说明.md「已验证/未验证清单」）。
 */

import {
  ZHI, GAN, zhiIndex, zhiAdd, zhiFwd, ZHI_WUXING, GAN_WUXING, isKe,
  ganYinYang, zhiYinYang, mengZhongJi, xun, dunGan, yiMa, GAN_HE,
  XING, isSelfXing, zhiChong, hourToZhi,
} from '../core/ganzhi.js';
import { yueJiang, isDayTime, ZHI_TO_JIANG_NAME, chart, resolve } from '../core/calendar.js';

// ───────────────────────── 常量表 ─────────────────────────

/**
 * 十干寄宫
 * 口诀：「甲寅乙辰丙戊巳，丁己未上庚申。辛戌壬亥是其真，癸课丑宫细推寻。」
 * 无争议，各家一致。
 */
export const GAN_JI_GONG = {
  甲: '寅', 乙: '辰', 丙: '巳', 丁: '未', 戊: '巳',
  己: '未', 庚: '申', 辛: '戌', 壬: '亥', 癸: '丑',
};

/** 十二天将，顺序固定 */
export const TIAN_JIANG = [
  '贵人', '螣蛇', '朱雀', '六合', '勾陈', '青龙',
  '天空', '白虎', '太常', '玄武', '太阴', '天后',
];

/**
 * 六吉将 / 六凶将 —— 课体「三光」等判定用
 * 分歧：天空归凶、六合归吉是通行说法；也有把勾陈算中性的。
 */
export const JI_JIANG = ['贵人', '青龙', '六合', '太常', '太阴', '天后'];
export const XIONG_JIANG = ['螣蛇', '朱雀', '勾陈', '天空', '白虎', '玄武'];

/**
 * 天乙贵人（昼贵 / 夜贵）
 *
 * ⚠️ 这是本模块**最大的流派分歧点**，务必先读：
 * 口诀「甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，六辛逢马虎」
 * 只给出每组干共用的**两个**地支，**没有明确哪个属昼、哪个属夜**，
 * 于是各家书表在 甲/戊/庚/辛/丙/丁 上互有出入。
 *
 * 本表采用与用户已有 zhanbu 项目 (liuren_service.py DAY_GUI_REN) 一致的一派，
 * 便于两个项目结果互校。夜贵取同组的另一支。
 *
 * 若你惯用的排盘书与此不同，改这张表的一行即可，其余逻辑不受影响。
 * **本表未经权威典籍逐条校勘**，见 算法说明.md。
 */
export const GUI_REN = {
  //        昼贵   夜贵
  甲: { day: '未', night: '丑' },
  乙: { day: '申', night: '子' },
  丙: { day: '酉', night: '亥' },
  丁: { day: '亥', night: '酉' },
  戊: { day: '未', night: '丑' },
  己: { day: '子', night: '申' },
  庚: { day: '丑', night: '未' },
  辛: { day: '午', night: '寅' },
  壬: { day: '卯', night: '巳' },
  癸: { day: '巳', night: '卯' },
};

/** 贵人顺行的地盘六位（亥子丑寅卯辰）；其余六位（巳午未申酉戌）逆行 */
export const GUI_SHUN_POS = ['亥', '子', '丑', '寅', '卯', '辰'];

// ───────────────────────── 天盘 ─────────────────────────

/**
 * 月将加时 → 天盘
 * 把月将安在占时所在的地盘位上，其余十一支顺次布满。
 * 结果等价于：天盘[地盘z] = z + k，其中 k = (月将 - 占时) mod 12
 *
 * @returns {{ k:number, tian:Object<string,string>, di:Object<string,string> }}
 *   tian: 地盘支 → 其上的天盘支
 *   di  : 天盘支 → 它所乘的地盘支（tian 的逆映射）
 */
export function buildTianPan(yueJiangZhi, zhanShiZhi) {
  const k = zhiFwd(zhanShiZhi, yueJiangZhi); // (月将 - 占时) mod 12
  const tian = {};
  const di = {};
  for (const z of ZHI) {
    const t = zhiAdd(z, k);
    tian[z] = t;
    di[t] = z;
  }
  return { k, tian, di };
}

// ───────────────────────── 四课 ─────────────────────────

/**
 * 起四课
 *
 * 一课：日干 / 干上神      （下书**日干**，上为日干寄宫之上神）
 * 二课：干上神 / 干阴神    （以一课上神为地盘，再取其上神）
 * 三课：日支 / 支上神
 * 四课：支上神 / 支阴神
 *
 * `xiaWuxing` 是判克用的"下"的五行：
 *   一课用**日干**五行（不是寄宫五行！），二三四课用地支五行。
 */
export function buildFourCourses(dayGan, dayZhi, tian) {
  const jiGong = GAN_JI_GONG[dayGan];

  const c1Tian = tian[jiGong];
  const c2Tian = tian[c1Tian];
  const c3Tian = tian[dayZhi];
  const c4Tian = tian[c3Tian];

  return [
    {
      index: 1, name: '干上神',
      xia: dayGan, xiaLabel: dayGan, xiaWuxing: GAN_WUXING[dayGan],
      // 天盘定位用的地盘位（涉害归家计数要用），一课是寄宫
      panPos: jiGong,
      shang: c1Tian, shangWuxing: ZHI_WUXING[c1Tian],
    },
    {
      index: 2, name: '干阴神',
      xia: c1Tian, xiaLabel: c1Tian, xiaWuxing: ZHI_WUXING[c1Tian],
      panPos: c1Tian,
      shang: c2Tian, shangWuxing: ZHI_WUXING[c2Tian],
    },
    {
      index: 3, name: '支上神',
      xia: dayZhi, xiaLabel: dayZhi, xiaWuxing: ZHI_WUXING[dayZhi],
      panPos: dayZhi,
      shang: c3Tian, shangWuxing: ZHI_WUXING[c3Tian],
    },
    {
      index: 4, name: '支阴神',
      xia: c3Tian, xiaLabel: c3Tian, xiaWuxing: ZHI_WUXING[c3Tian],
      panPos: c3Tian,
      shang: c4Tian, shangWuxing: ZHI_WUXING[c4Tian],
    },
  ].map((c) => ({
    ...c,
    /** 上克下 —— 传统叫「克」 */
    isKeXia: isKe(c.shangWuxing, c.xiaWuxing),
    /** 下贼上 —— 传统叫「贼」，优先于「克」 */
    isZeiShang: isKe(c.xiaWuxing, c.shangWuxing),
  }));
}

/** 四课去重后的课数：2 = 八专（干支同位），3 = 课不备（别责），4 = 全备 */
export function distinctCourseCount(courses) {
  return new Set(courses.map((c) => `${c.panPos}|${c.shang}`)).size;
}

/**
 * 候选课去重
 * 当干上神与日支同位、或支上神与干寄宫同位时，四课中会出现**完全相同的两课**
 * （同一地盘位、同一天盘神）。传统发用是按"课"数，重复的课只算一个，
 * 否则会被误判成"克有多"而错走比用/涉害。
 */
export function dedupeCourses(courses) {
  const seen = new Set();
  return courses.filter((c) => {
    const key = `${c.panPos}|${c.shang}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ───────────────────────── 涉害深浅 ─────────────────────────

/**
 * 涉害深浅计数
 *
 * 发用神 S 乘于地盘位 L（= 该课的 panPos）。S 的"本家"是地盘 S 位。
 * 因天盘顺布 k 位，S 归本家须**顺行 k 步**：途经地盘位 L, L+1, …, L+k-1。
 * 数其中"克 S"的地盘支个数，多者为涉害深。
 *
 * ⚠️ 分歧：
 *   (a) 方向 —— 多数书作"归本家"，按天盘顺布方向即**顺行**（本实现的 fwd）；
 *       也有书写作"逆行数至本家"（本实现同时算出 bwd 供对照）。
 *   (b) 端点 —— 本实现取"含起点、不含本家"（即恰好 k 个宫）。
 *       另有含本家（k+1 宫）的算法。
 *   两种方向若给出不同的深浅排序，返回值会打上 ambiguous 标记，UI 会提示。
 */
export function sheHaiDepth(shang, panPos, k) {
  const w = ZHI_WUXING[shang];
  const count = (dir) => {
    let n = 0;
    const passed = [];
    for (let i = 0; i < k; i++) {
      const p = zhiAdd(panPos, dir * i);
      if (isKe(ZHI_WUXING[p], w)) { n++; passed.push(p); }
    }
    return { n, passed };
  };
  const fwd = count(1);
  const bwd = count(-1);
  return { fwd: fwd.n, fwdPassed: fwd.passed, bwd: bwd.n, bwdPassed: bwd.passed };
}

// ───────────────────────── 三传：九宗门 ─────────────────────────

/**
 * 由初传推中末传（贼克/比用/涉害/遥克 共用）
 * 「以初传为地盘取其上神为中传，以中传为地盘取其上神为末传」
 * 等价于 初传 → 初传+k → 初传+2k
 */
const chainFrom = (chu, tian) => {
  const zhong = tian[chu];
  return { chu, zhong, mo: tian[zhong] };
};

/**
 * 从多个候选课中依「比用 → 涉害」定初传
 * @returns {{chu, method, keTi, trace, notes}}
 */
function pickByBiYongThenSheHai(candidates, ctx, typeLabel) {
  const { dayGan, k, courses } = ctx;
  const trace = [];
  const notes = [];

  // ── 比用法：取上神阴阳与日干相同者（"比"） ──
  const dayYY = ganYinYang(dayGan);
  const bi = candidates.filter((c) => zhiYinYang(c.shang) === dayYY);
  trace.push(
    `比用：日干 ${dayGan}(${dayYY})，候选上神 ` +
    candidates.map((c) => `${c.shang}(${zhiYinYang(c.shang)})`).join('、') +
    ` → 与日干同阴阳者 ${bi.length ? bi.map((c) => c.shang).join('、') : '无'}`
  );
  if (bi.length === 1) {
    return {
      chu: bi[0].shang, trigger: bi[0],
      method: '比用法', keTi: '知一课（比用课）',
      desc: `${typeLabel}有多，取与日干比者发用`,
      trace, notes,
    };
  }

  // ── 涉害法 ──
  const pool = bi.length >= 2 ? bi : candidates;
  if (bi.length >= 2) trace.push('比用后仍有多个 → 转涉害法');
  else trace.push('无与日干比者 → 转涉害法');

  const depths = pool.map((c) => ({ c, d: sheHaiDepth(c.shang, c.panPos, k) }));
  depths.forEach(({ c, d }) => {
    trace.push(
      `涉害：${c.shang} 乘地盘${c.panPos}，顺行归家历 ${k} 宫，受克 ${d.fwd} 次` +
      (d.fwdPassed.length ? `（${d.fwdPassed.join('、')}）` : '') +
      `；逆行算法作 ${d.bwd} 次`
    );
  });

  const maxFwd = Math.max(...depths.map((x) => x.d.fwd));
  const deepFwd = depths.filter((x) => x.d.fwd === maxFwd);
  const maxBwd = Math.max(...depths.map((x) => x.d.bwd));
  const deepBwd = depths.filter((x) => x.d.bwd === maxBwd);
  // 两种方向若指向不同的课，标记分歧
  const sameConclusion =
    deepFwd.length === deepBwd.length &&
    deepFwd.every((x) => deepBwd.includes(x));
  if (!sameConclusion) {
    notes.push(
      '⚠️ 涉害深浅：顺行算法与逆行算法结论不同（' +
      `顺行深者 ${deepFwd.map((x) => x.c.shang).join('、')}，` +
      `逆行深者 ${deepBwd.map((x) => x.c.shang).join('、')}）。` +
      '本盘按顺行（归本家）取用，另一派会得到不同三传，请自行斟酌。'
    );
  }

  if (deepFwd.length === 1) {
    return {
      chu: deepFwd[0].c.shang, trigger: deepFwd[0].c,
      method: '涉害法', keTi: '涉害课',
      desc: '比用不决，取涉害深者发用',
      trace, notes,
    };
  }

  // ── 涉害深浅相等 → 孟 / 仲 / 季 三格 ──
  trace.push('涉害深浅相等 → 按孟仲季取用');
  const meng = deepFwd.filter((x) => mengZhongJi(x.c.shang) === '孟');
  if (meng.length >= 1) {
    return {
      chu: meng[0].c.shang, trigger: meng[0].c,
      method: '涉害法·见机格', keTi: '涉害课（见机格）',
      desc: '涉害等，取四孟（寅申巳亥）上神发用',
      trace, notes,
    };
  }
  const zhong = deepFwd.filter((x) => mengZhongJi(x.c.shang) === '仲');
  if (zhong.length >= 1) {
    return {
      chu: zhong[0].c.shang, trigger: zhong[0].c,
      method: '涉害法·察微格', keTi: '涉害课（察微格）',
      desc: '涉害等且无孟，取四仲（子午卯酉）上神发用',
      trace, notes,
    };
  }
  // 皆四季神 → 缀瑕格：取干上神
  const ganShang = courses[0];
  trace.push('孟仲皆无（皆四季神）→ 缀瑕格，取干上神发用');
  return {
    chu: ganShang.shang, trigger: ganShang,
    method: '涉害法·缀瑕格', keTi: '涉害课（缀瑕格／复等格）',
    desc: '涉害等且孟仲皆无，取干上神发用',
    trace, notes,
  };
}

/**
 * 发三传 —— 九宗门主调度
 *
 * ## 判定顺序（本 APP 采用）
 *   1. 伏吟（月将 == 占时，天地盘重合）
 *   2. 返吟（月将冲占时，天地盘全冲）
 *   3. 贼克 → 比用 → 涉害
 *   4. 遥克（蒿矢 / 弹射）
 *   5. 八专（干支同位，只两课）
 *   6. 别责（课不备，只三课）
 *   7. 昴星（四课全备而无克无遥克）
 *
 * 分歧：口诀序为「一贼二比三涉害，四遥五昴六别责，七八专八伏吟九返吟」，
 * 即把伏吟/返吟排在最后。但伏吟/返吟是天地盘的**结构性**特征，
 * 其发用规则与贼克法完全不同，实务与各家排盘软件都先判它们，本 APP 从之。
 * 又：5/6/7 三者按四课去重后的课数（2/3/4）互斥，先后次序不影响结果。
 */
export function buildSanChuan(ctx) {
  const { dayGan, dayZhi, k, tian, di, courses } = ctx;
  const notes = [];
  // 贼 / 克 候选一律先去重（重复课只算一课，见 dedupeCourses 注释）
  const zei = dedupeCourses(courses.filter((c) => c.isZeiShang));
  const ke = dedupeCourses(courses.filter((c) => c.isKeXia));
  const nDistinct = distinctCourseCount(courses);
  const isYangDay = ganYinYang(dayGan) === '阳'; // 刚日 / 柔日
  const ganShang = courses[0].shang;
  const zhiShang = courses[2].shang;

  // ══════════ 1. 伏吟 ══════════
  if (k === 0) {
    const trace = ['月将与占时同支 → 天盘地盘完全重合 = 伏吟'];
    let chu, keTi, method;

    if (zei.length || ke.length) {
      // 伏吟时四课上下同支，本无上下克；但一课的"下"是**日干**，
      // 乙丁戊辛癸 五干的本气五行与寄宫不同，故仍可能有克。
      const cand = zei.length ? zei : ke;
      const label = zei.length ? '贼（下贼上）' : '克（上克下）';
      trace.push(`伏吟有${label}：${cand.map((c) => `第${c.index}课 ${c.shang}/${c.xiaLabel}`).join('，')}`);
      if (cand.length === 1) {
        chu = cand[0].shang;
        method = '伏吟·取克';
        keTi = zei.length ? '伏吟课（重审）' : '伏吟课（元首）';
      } else {
        const r = pickByBiYongThenSheHai(cand, ctx, label);
        chu = r.chu;
        method = '伏吟·' + r.method;
        keTi = '伏吟课（' + r.keTi + '）';
        trace.push(...r.trace);
        notes.push(...r.notes);
      }
    } else {
      // 无克：刚日取干上神（自任），柔日取支上神（自信）
      chu = isYangDay ? ganShang : zhiShang;
      method = isYangDay ? '伏吟·自任' : '伏吟·自信';
      keTi = isYangDay ? '伏吟课（自任格）' : '伏吟课（自信格）';
      trace.push(
        `伏吟无克，${isYangDay ? '刚（阳）日取干上神' : '柔（阴）日取支上神'} ${chu} 发用`
      );
    }

    // 中末传：取刑；初传自刑则改取（阳日支上/阴日干上），末传取中传之冲
    let zhong, mo;
    if (isSelfXing(chu)) {
      zhong = isYangDay ? zhiShang : ganShang;
      mo = zhiChong(zhong);
      trace.push(
        `初传 ${chu} 属自刑之支（辰午酉亥），依「自刑则取冲」：` +
        `中传取${isYangDay ? '支上神' : '干上神'} ${zhong}，末传取中传之冲 ${mo}`
      );
      notes.push(
        '分歧：伏吟遇自刑支时，中末传的取法各家不一。本 APP 用' +
        '「中传取支上/干上神、末传取中传之冲」；另有直接取初传之冲为中传的说法。'
      );
    } else {
      zhong = XING[chu];
      mo = XING[zhong];
      trace.push(`伏吟中末传取刑：中传 = 初传${chu}所刑 = ${zhong}，末传 = 中传所刑 = ${mo}`);
      if (mo === zhong) {
        mo = zhiChong(zhong);
        trace.push(`中传 ${zhong} 自刑，末传改取其冲 ${mo}`);
      }
    }
    notes.push('伏吟：天地盘不动，事多停滞、伏而不发，宜静不宜动。');
    return { chu, zhong, mo, method, keTi, gate: '伏吟', trace, notes };
  }

  // ══════════ 2. 返吟 ══════════
  if (k === 6) {
    const trace = ['月将与占时相冲 → 天盘各支与地盘全冲 = 返吟（反吟）'];
    if (zei.length || ke.length) {
      const cand = zei.length ? zei : ke;
      const label = zei.length ? '贼（下贼上）' : '克（上克下）';
      trace.push(`返吟有${label} → 依贼克法发用`);
      let chu, keTi, method;
      if (cand.length === 1) {
        chu = cand[0].shang;
        method = '返吟·取克';
        keTi = '返吟课（无亲格）';
      } else {
        const r = pickByBiYongThenSheHai(cand, ctx, label);
        chu = r.chu;
        method = '返吟·' + r.method;
        keTi = '返吟课（无亲格，' + r.keTi + '）';
        trace.push(...r.trace);
        notes.push(...r.notes);
      }
      const c = chainFrom(chu, tian);
      notes.push('返吟：天地盘相冲，事主反覆、去而复返、动荡不安。');
      return { ...c, method, keTi, gate: '返吟', trace, notes };
    }
    // 无克 → 驿马发用（井栏射 / 无依格）
    const ma = yiMa(dayZhi);
    trace.push(
      `返吟无克 → 取日支 ${dayZhi} 之驿马 ${ma} 发用；中传取支上神 ${zhiShang}，末传取干上神 ${ganShang}`
    );
    notes.push('返吟：天地盘相冲，事主反覆、去而复返、动荡不安。');
    notes.push('分歧：返吟无克时，也有流派以「初传取驿马之上神」而非驿马本支发用。');
    return {
      chu: ma, zhong: zhiShang, mo: ganShang,
      method: '返吟·驿马', keTi: '返吟课（无依格／井栏射）',
      gate: '返吟', trace, notes,
    };
  }

  // ══════════ 3. 贼克 → 比用 → 涉害 ══════════
  if (zei.length || ke.length) {
    const cand = zei.length ? zei : ke;
    const isZei = zei.length > 0;
    const label = isZei ? '贼（下贼上）' : '克（上克下）';
    const trace = [
      `四课克关系：下贼上 ${zei.length} 个${zei.length ? '（' + zei.map((c) => '第' + c.index + '课') + '）' : ''}，` +
      `上克下 ${ke.length} 个${ke.length ? '（' + ke.map((c) => '第' + c.index + '课') + '）' : ''}`,
      `有贼取贼、无贼取克 → 本盘取 ${label}`,
    ];
    if (cand.length === 1) {
      const c0 = cand[0];
      trace.push(`只一${isZei ? '贼' : '克'}，即以第${c0.index}课上神 ${c0.shang} 发用`);
      const c = chainFrom(c0.shang, tian);
      return {
        ...c,
        method: '贼克法',
        keTi: isZei ? '重审课' : '元首课',
        gate: '贼克',
        trace,
        notes: [
          isZei
            ? '重审课：下贼上，事由下起、外来之扰，宜再三审度。'
            : '元首课：上克下，事由上决、尊长主事，多主顺遂。',
        ],
      };
    }
    const r = pickByBiYongThenSheHai(cand, ctx, label);
    const c = chainFrom(r.chu, tian);
    return {
      ...c, method: r.method, keTi: r.keTi,
      gate: r.method.startsWith('比用') ? '比用' : '涉害',
      trace: [...trace, ...r.trace], notes: r.notes,
    };
  }

  // ══════════ 4. 遥克（蒿矢 / 弹射） ══════════
  // 四课无上下克 → 看四课上神与**日干**的遥相克
  const ganW = GAN_WUXING[dayGan];
  const shenKeRi = dedupeCourses(courses.filter((c) => isKe(ZHI_WUXING[c.shang], ganW))); // 上神克日干
  const riKeShen = dedupeCourses(courses.filter((c) => isKe(ganW, ZHI_WUXING[c.shang]))); // 日干克上神
  if (shenKeRi.length || riKeShen.length) {
    const isHaoShi = shenKeRi.length > 0; // 蒿矢优先于弹射
    const cand = isHaoShi ? shenKeRi : riKeShen;
    const trace = [
      '四课无上下相克 → 转遥克法',
      isHaoShi
        ? `有上神克日干（神克日）：${cand.map((c) => c.shang).join('、')} → 蒿矢课`
        : `无神克日，有日干克上神（日克神）：${cand.map((c) => c.shang).join('、')} → 弹射课`,
    ];
    let chu, extra = '';
    if (cand.length === 1) {
      chu = cand[0].shang;
    } else {
      const dayYY = ganYinYang(dayGan);
      const bi = cand.filter((c) => zhiYinYang(c.shang) === dayYY);
      trace.push(`遥克有多 → 用比法，与日干 ${dayGan}(${dayYY}) 同阴阳者：${bi.map((c) => c.shang).join('、') || '无'}`);
      if (bi.length === 1) {
        chu = bi[0].shang;
      } else {
        const pool = bi.length ? bi : cand;
        chu = pool[0].shang;
        extra = '（比法未能定一，本 APP 取课序在先者）';
        notes.push(
          '⚠️ 遥克有多且比法不能决一，本 APP 取课序在先者发用；' +
          '此情形传统文献少见明文，结论不确定。'
        );
      }
    }
    trace.push(`初传 = ${chu}${extra}`);
    const c = chainFrom(chu, tian);
    return {
      ...c,
      method: isHaoShi ? '遥克法·蒿矢' : '遥克法·弹射',
      keTi: isHaoShi ? '蒿矢课' : '弹射课',
      gate: '遥克',
      trace,
      notes: [
        ...notes,
        isHaoShi
          ? '蒿矢课：神克日，如矢自远来，祸自外至而力浅。'
          : '弹射课：日克神，如弹射远物，事在他方而我主动。',
      ],
    };
  }

  // ══════════ 5. 八专（干支同位，四课只两课） ══════════
  if (nDistinct === 2) {
    const trace = [
      `日干 ${dayGan} 寄宫 ${GAN_JI_GONG[dayGan]} 与日支 ${dayZhi} 同位 → 四课只得两课 = 八专课`,
    ];
    let chu;
    if (isYangDay) {
      chu = zhiAdd(ganShang, 2); // 顺数三位（含自身）
      trace.push(`刚（阳）日：自干上神 ${ganShang} 顺数三位（含本位）得 ${chu} 发用`);
    } else {
      chu = zhiAdd(courses[3].shang, -2); // 逆数三位（含自身）
      trace.push(`柔（阴）日：自第四课上神 ${courses[3].shang} 逆数三位（含本位）得 ${chu} 发用`);
    }
    trace.push(`中末传俱用干上神 ${ganShang}`);
    return {
      chu, zhong: ganShang, mo: ganShang,
      method: '八专法', keTi: '八专课（帷薄不修）', gate: '八专',
      trace,
      notes: [
        '⚠️ 八专课的发用细则各家出入较大：本 APP 用「阳日干上神顺数三位、' +
        '阴日第四课上神逆数三位，中末俱用干上神」。另有以支上神起数、' +
        '或中末传另取的说法。**未经权威校勘。**',
        '⚠️ 传统称「八专」为八日，但按「干寄宫 == 日支」这一结构判据，' +
        '六十甲子中只有 甲寅、丁未、己未、庚申、癸丑 五日成立。' +
        '各家所列八日（常含乙卯、辛酉）在标准寄宫表下并不满足此判据，' +
        '本 APP 以结构判据为准，差异已记录在 算法说明.md。',
        '八专课：干支同宫，人事混杂、内外不分，多主暗昧私情。',
      ],
    };
  }

  // ══════════ 6. 别责（课不备，四课只三课） ══════════
  if (nDistinct === 3) {
    const trace = ['四课去重只得三课（课不备）、无克无遥克 → 别责课'];
    let chu;
    if (isYangDay) {
      const heGan = GAN_HE[dayGan];
      const heJiGong = GAN_JI_GONG[heGan];
      chu = tian[heJiGong];
      trace.push(
        `刚（阳）日：日干 ${dayGan} 五合得 ${heGan}，${heGan} 寄宫 ${heJiGong}，` +
        `取其上神 ${chu} 发用`
      );
    } else {
      chu = zhiAdd(dayZhi, 4);
      trace.push(
        `柔（阴）日：取日支 ${dayZhi} 三合局中前一位（顺行四位）${chu} 发用`
      );
    }
    trace.push(`中末传俱用干上神 ${ganShang}`);
    return {
      chu, zhong: ganShang, mo: ganShang,
      method: '别责法', keTi: '别责课（不备课）', gate: '别责',
      trace,
      notes: [
        '⚠️ 别责课发用有分歧：阳日「取日干合神寄宫之**上神**」与' +
        '「径取该寄宫本支」两说；阴日「日支三合前一位」的"前"指顺行' +
        '第四位（本 APP 采用）还是逆行，亦有异说。**未经权威校勘。**',
        '别责课：四课不全，事有欠缺、所求不周，宜别求他途。',
      ],
    };
  }

  // ══════════ 7. 昴星（四课全备而无克无遥克） ══════════
  {
    const trace = ['四课全备、无上下克、无遥克 → 昴星课（虚一待用）'];
    let chu, keTi, method;
    if (isYangDay) {
      chu = tian['酉']; // 地盘酉位之上神
      method = '昴星法·阳仰';
      keTi = '昴星课（虎视格）';
      trace.push(
        `刚（阳）日「仰视」：取地盘酉位之上神 ${chu} 发用，` +
        `中传取支上神 ${zhiShang}，末传取干上神 ${ganShang}`
      );
      return {
        chu, zhong: zhiShang, mo: ganShang, method, keTi, gate: '昴星', trace,
        notes: ['昴星课（虎视）：无所取用而虚一待之，事多惊疑、进退失据。'],
      };
    }
    chu = di['酉']; // 天盘酉所乘的地盘位
    method = '昴星法·阴俯';
    keTi = '昴星课（冬蛇掩目格）';
    trace.push(
      `柔（阴）日「俯视」：取天盘酉所乘之地盘位 ${chu} 发用，` +
      `中传取干上神 ${ganShang}，末传取支上神 ${zhiShang}`
    );
    return {
      chu, zhong: ganShang, mo: zhiShang, method, keTi, gate: '昴星', trace,
      notes: ['昴星课（冬蛇掩目）：闭目塞听，事主晦滞、有苦难言。'],
    };
  }
}

// ───────────────────────── 十二天将 ─────────────────────────

/**
 * 排十二天将
 * 1. 按日干 + 昼夜取贵人所乘之**天盘支**；
 * 2. 找该天盘支所乘的**地盘位** D；
 * 3. D 在亥子丑寅卯辰六位则十二将顺布，在巳午未申酉戌则逆布；
 * 4. 依次安在各地盘位上（每位的天盘神即乘该将）。
 */
export function buildTianJiang(dayGan, isDay, tian, di) {
  const guiZhi = isDay ? GUI_REN[dayGan].day : GUI_REN[dayGan].night;
  const pos = di[guiZhi]; // 贵人（天盘支 guiZhi）所乘的地盘位
  const dir = GUI_SHUN_POS.includes(pos) ? 1 : -1;
  const map = {}; // 地盘位 → 天将
  for (let i = 0; i < 12; i++) {
    map[zhiAdd(pos, dir * i)] = TIAN_JIANG[i];
  }
  /** 天盘支 → 天将（天将随天盘神走） */
  const byTian = {};
  for (const z of ZHI) byTian[tian[z]] = map[z];
  return {
    guiRenZhi: guiZhi,
    guiRenPos: pos,
    direction: dir === 1 ? '顺行' : '逆行',
    dirReason: `贵人 ${guiZhi} 乘地盘 ${pos} 位，` +
      (dir === 1 ? '在亥子丑寅卯辰六位 → 十二将顺布' : '在巳午未申酉戌六位 → 十二将逆布'),
    byDiPan: map,
    byTianPan: byTian,
  };
}

// ───────────────────────── 课体 ─────────────────────────

/**
 * 课体判断
 *
 * 已实现（判据确定、可机械判定）：
 *   - 九宗门主课名（元首/重审/知一/涉害及三格/蒿矢/弹射/昴星二格/别责/八专/伏吟/返吟）
 *     —— 由 buildSanChuan 直接给出
 *   - 三传结构类：进茹、退茹、顺间传、逆间传、三传成三合
 *   - 六仪课（初传为本旬旬首之支）
 *   - 三光课（干上神、支上神、初传三者皆乘吉将）
 *   - 三传空亡标注
 *
 * **未实现**（各家判据不一或未找到可靠依据，不猜）：
 *   三奇、龙德、时泰、龙战、玄胎、淫泆、degrees 等课体 —— 见 算法说明.md TODO。
 */
export function buildKeTi({ sanChuan, courses, k, dayGz, tianJiang, gate }) {
  const list = [];
  const { chu, zhong, mo } = sanChuan;
  const { xunKong, xunShou } = xun(dayGz);

  // ── 三传结构（仅对中末传按 +k 递推的宗门有效） ──
  const chained = ['贼克', '比用', '涉害', '遥克', '返吟'].includes(gate) &&
    zhiAdd(chu, k) === zhong && zhiAdd(zhong, k) === mo;
  if (chained) {
    if (k === 1) list.push({ name: '进茹课', why: '三传顺次相连（递进一位），事势渐进。' });
    else if (k === 11) list.push({ name: '退茹课', why: '三传逆次相连（递退一位），事势渐退。' });
    else if (k === 2) list.push({ name: '顺间传课', why: '三传顺行隔一位相传。' });
    else if (k === 10) list.push({ name: '逆间传课', why: '三传逆行隔一位相传。' });
    else if (k === 4 || k === 8) {
      list.push({ name: '三传成三合', why: `三传 ${chu}${zhong}${mo} 隔四位，恰成三合局。`, tentative: true });
    }
  }

  // ── 六仪课 ──
  if (chu === xunShou[1]) {
    list.push({ name: '六仪课', why: `初传 ${chu} 即本旬旬首（${xunShou}）之支，谓之六仪，主吉、有贵人扶助。` });
  }

  // ── 三光课 ──
  const ganShang = courses[0].shang;
  const zhiShang = courses[2].shang;
  const jiangOf = (z) => tianJiang.byTianPan[z];
  const three = [ganShang, zhiShang, chu];
  if (three.every((z) => JI_JIANG.includes(jiangOf(z)))) {
    list.push({
      name: '三光课',
      why: `干上神 ${ganShang}(${jiangOf(ganShang)})、支上神 ${zhiShang}(${jiangOf(zhiShang)})、` +
        `初传 ${chu}(${jiangOf(chu)}) 三者皆乘吉将，谓之三光，主事事光明顺遂。`,
      tentative: true,
    });
  }

  // ── 空亡 ──
  const kongList = [['初传', chu], ['中传', zhong], ['末传', mo]]
    .filter(([, z]) => xunKong.includes(z));
  if (kongList.length) {
    list.push({
      name: '三传落空',
      why: `${kongList.map(([n, z]) => `${n}${z}`).join('、')} 落本日旬空（${xunKong.join('')}），` +
        '所主之事易虚而不实。',
    });
  }

  return list;
}

// ───────────────────────── 主入口 ─────────────────────────

/**
 * 大六壬完整排盘
 *
 * @param {Object} opt
 * @param {Date}   opt.dt          起卦时刻（北京时间）
 * @param {number} [opt.longitude] 经度，默认 120（不做经度校正）
 * @param {boolean}[opt.useTrueSolar] 是否用真太阳时起盘，默认 true
 * @param {1|2}    [opt.sect]      晚子时流派：2=23时后日柱进次日（默认），1=仍算当日
 * @param {string} [opt.zhanShi]   手动指定占时地支（覆盖由时刻推出的）
 * @param {string} [opt.yueJiang]  手动指定月将地支（覆盖中气推出的）
 * @param {boolean}[opt.forceDay]  手动指定昼/夜（true=昼, false=夜, undefined=自动）
 */
export function paipan(opt = {}) {
  const {
    dt = new Date(), longitude = 120, useTrueSolar = true, sect = 2,
    zhanShi, yueJiang: yjOverride, forceDay,
  } = opt;

  const ctxCal = resolve(dt, longitude, useTrueSolar, sect);
  const baseDt = useTrueSolar
    ? new Date(dt.getTime() + ctxCal.trueSolarTime.deltaMin * 60_000)
    : dt;

  const dayGz = ctxCal.pillars.day;
  const dayGan = dayGz[0];
  const dayZhi = dayGz[1];

  const yj = yjOverride
    ? { zhi: yjOverride, name: ZHI_TO_JIANG_NAME[yjOverride], qi: '（手动指定）', qiAt: null }
    : yueJiang(baseDt);
  const zs = zhanShi || hourToZhi(baseDt.getHours());
  const isDay = forceDay === undefined ? isDayTime(zs) : !!forceDay;

  const { k, tian, di } = buildTianPan(yj.zhi, zs);
  const courses = buildFourCourses(dayGan, dayZhi, tian);

  const ctx = { dayGan, dayZhi, k, tian, di, courses };
  const sanChuan = buildSanChuan(ctx);
  const tianJiang = buildTianJiang(dayGan, isDay, tian, di);

  const { xunKong, xunShou } = xun(dayGz);
  // 三传遁干（旬内地支配十干；空亡支无遁干）
  const sanChuanDetail = [
    { pos: '初传', zhi: sanChuan.chu },
    { pos: '中传', zhi: sanChuan.zhong },
    { pos: '末传', zhi: sanChuan.mo },
  ].map((s) => ({
    ...s,
    gan: dunGan(dayGz, s.zhi),
    jiang: tianJiang.byTianPan[s.zhi],
    jiangName: ZHI_TO_JIANG_NAME[s.zhi],
    wuxing: ZHI_WUXING[s.zhi],
    kong: xunKong.includes(s.zhi),
    /** 该传所乘的地盘位（天盘 → 地盘） */
    diPos: di[s.zhi],
  }));

  const keTi = buildKeTi({ sanChuan, courses, k, dayGz, tianJiang, gate: sanChuan.gate });

  return {
    input: {
      civil: ctxCal.trueSolarTime.civilText,
      trueSolar: ctxCal.trueSolarTime.trueSolarText,
      longitude, useTrueSolar, sect,
      basedOn: ctxCal.basedOn,
    },
    calendar: {
      solar: ctxCal.solar, lunar: ctxCal.lunar,
      pillars: ctxCal.pillars, jieqi: ctxCal.jieqi,
    },
    day: {
      ganzhi: dayGz, gan: dayGan, zhi: dayZhi,
      ganYinYang: ganYinYang(dayGan),
      gangRou: ganYinYang(dayGan) === '阳' ? '刚日' : '柔日',
      jiGong: GAN_JI_GONG[dayGan],
      xunShou, xunKong,
    },
    yueJiang: yj,
    zhanShi: { zhi: zs, jiangName: ZHI_TO_JIANG_NAME[zs] },
    dayNight: {
      isDay,
      label: isDay ? '昼占' : '夜占',
      reason: forceDay === undefined
        ? `占时 ${zs}，卯至申为昼、酉至寅为夜 → ${isDay ? '昼' : '夜'}`
        : '（手动指定）',
    },
    /** 天盘：offset k、地盘位→天盘支、天盘支→地盘位 */
    pan: {
      k,
      kDesc: `月将 ${yj.zhi} 加占时 ${zs}，天盘相对地盘顺移 ${k} 位`,
      tian, di,
      /** 便于 UI 画圆盘：按地盘子→亥顺序的十二格 */
      cells: ZHI.map((z) => ({
        di: z,
        tian: tian[z],
        jiang: tianJiang.byDiPan[z],
        tianJiangName: ZHI_TO_JIANG_NAME[tian[z]],
        tianKong: xunKong.includes(tian[z]),
      })),
    },
    fourCourses: courses.map((c) => ({
      ...c,
      shangJiang: tianJiang.byTianPan[c.shang],
      shangKong: xunKong.includes(c.shang),
      keRelation: c.isZeiShang ? '下贼上' : c.isKeXia ? '上克下' : '无克',
    })),
    sanChuan: {
      ...sanChuan,
      detail: sanChuanDetail,
    },
    tianJiang,
    keTi,
    /** 全部流派分歧 / 不确定项，UI 必须显示 */
    notes: [
      ...(sanChuan.notes || []),
      '月将采用「中气换将」（雨水后亥将…），另有节换将一派。',
      `贵人用${isDay ? '昼' : '夜'}贵表；六壬贵人昼夜归属各家有出入，见「算法说明」。`,
    ],
  };
}

export default { paipan, buildTianPan, buildFourCourses, buildSanChuan, buildTianJiang, GAN_JI_GONG, GUI_REN, TIAN_JIANG };
