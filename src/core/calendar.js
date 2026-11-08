/**
 * core/calendar.js —— 历法层
 * ==========================================================
 * 职责：公历 → 农历 / 四柱干支 / 24 节气 / 真太阳时 / 月将 / 旬空
 *
 * ## 为什么委派给 lunar-javascript 而不是自己写天文算法
 * 用户已有的 zhanbu 排盘项目（Python）用的是同作者 6tail 的 lunar-python，
 * 其节气用「寿星万年历」天文算法推算（分钟级精度），不是固定日期近似。
 * 本 APP 直接用同源的 lunar-javascript，好处：
 *   1. 不重复造轮子；
 *   2. 与 zhanbu 的排盘结果可逐字段互校（已用用户本人命例验证，见 算法说明.md）。
 * 唯一自己实现的天文公式是**均时差**（见下），因为该库不提供。
 *
 * ## 换日与时辰的流派分歧（重要，已实测确认库行为）
 * lunar-javascript 的 `EightChar` 有 `sect`（流派）开关，本模块透出为 `sect` 参数：
 *
 * - **sect = 2（库默认，本 APP 默认）**：晚子时（23:00–23:59）的**日柱算当日**，
 *   即以 00:00 换日；但**时柱仍作子时，且时干由「次日」日干起五鼠遁**。
 *   实测：2026-07-15 23:30 → 日柱 庚寅、时柱 戊子（戊子对应辛日子时，辛卯为次日）。
 *   ⚠️ 也就是说这一小时里日柱与时柱来自**不同口径**，是子平术通行的折中做法，
 *      但确实自相矛盾，用户在 23 时起卦须知情。
 * - **sect = 1**：晚子时的**日柱算次日**（以 23:00 换日），日柱与时柱口径一致。
 *   实测同一时刻 → 日柱 辛卯、时柱 戊子。
 *
 * 两派只在 23:00–23:59 有差异，其余 23 小时完全相同。
 * 六爻/六壬以日辰为纲，此差异会直接改变旬空、贵人、六神等，故 UI 必须在 23 时提示。
 * - 时辰划分：通行两小时制（子 23–01，丑 01–03 …）。
 */

import { Solar, Lunar, LUNAR_JS_VERSION } from '../../vendor/lunar.esm.js';
import { ZHI, hourToZhi, xun, zhiAdd } from './ganzhi.js';

export { LUNAR_JS_VERSION };

/** 东八区标准经线 */
export const CST_STANDARD_LONGITUDE = 120.0;
export const CST_OFFSET_HOURS = 8.0;

// ───────────────────────── 真太阳时 ─────────────────────────

/**
 * 均时差 (Equation of Time)，单位分钟
 * Spencer, J.W. (1971) "Fourier series representation of the position of the sun",
 * Search 2(5):172. 精度约 ±30 秒。
 *
 * 这与 zhanbu 项目 backend/app/utils/calendar_core.py::_equation_of_time_minutes
 * 是同一公式的逐行移植，两边结果应一致（已在 test/calendar.test.js 中用
 * zhanbu 的输出值做回归比对）。
 *
 * @param {Date} dt 北京时间（本地钟点）
 * @returns {number} 分钟
 */
export function equationOfTimeMinutes(dt) {
  // 转 UT
  const ut = new Date(dt.getTime() - CST_OFFSET_HOURS * 3600_000);
  const startOfYear = Date.UTC(ut.getUTCFullYear(), 0, 1);
  const days = (ut.getTime() - startOfYear) / 86_400_000;
  // n = 年内累积日（1 月 1 日 00:00 → n=1）
  const n = Math.floor(days) + 1 + (ut.getUTCHours() + ut.getUTCMinutes() / 60) / 24;
  const B = (2 * Math.PI * (n - 1)) / 365.0;
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(B) -
      0.032077 * Math.sin(B) -
      0.014615 * Math.cos(2 * B) -
      0.04089 * Math.sin(2 * B))
  );
}

/**
 * 真太阳时 = 北京时间 + 经度时差 + 均时差
 * 经度时差 = (当地经度 - 120°) × 4 分钟
 *
 * @param {Date} dt 北京时间
 * @param {number} longitude 当地经度（东经正、西经负）
 */
export function trueSolarTime(dt, longitude) {
  const longitudeOffsetMin = (longitude - CST_STANDARD_LONGITUDE) * 4.0;
  const eotMin = equationOfTimeMinutes(dt);
  const deltaMin = longitudeOffsetMin + eotMin;
  return {
    civil: dt,
    trueSolar: new Date(dt.getTime() + deltaMin * 60_000),
    longitude,
    longitudeOffsetMin,
    eotMin,
    deltaMin,
  };
}

// ───────────────────────── 四柱 / 农历 ─────────────────────────

const toSolar = (dt) =>
  Solar.fromYmdHms(
    dt.getFullYear(), dt.getMonth() + 1, dt.getDate(),
    dt.getHours(), dt.getMinutes(), dt.getSeconds()
  );

/**
 * 四柱干支 + 农历 + 节气上下文
 * @param {Date} dt 用于起盘的时刻（**通常应传真太阳时**）
 * @param {1|2} [sect] 晚子时流派，见文件头。2 = 日柱算当日（默认），1 = 日柱算次日
 */
export function chart(dt, sect = 2) {
  if (sect !== 1 && sect !== 2) throw new Error(`sect 只能是 1 或 2，实得 ${sect}`);
  const solar = toSolar(dt);
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();
  if (sect !== ec.getSect()) ec.setSect(sect);

  const dayGz = ec.getDay();
  const prevJie = lunar.getPrevJie(); // 上一个"节"（立春、惊蛰…）
  const prevQi = lunar.getPrevQi();   // 上一个"中气"（雨水、春分…）—— 月将用它

  /** 是否落在晚子时（此时 sect 会影响日柱） */
  const isLateZi = dt.getHours() === 23;

  return {
    solar: {
      y: solar.getYear(), m: solar.getMonth(), d: solar.getDay(),
      h: solar.getHour(), mi: solar.getMinute(), s: solar.getSecond(),
      text: solar.toYmdHms(),
      week: solar.getWeekInChinese(),
    },
    lunar: {
      year: lunar.getYear(),
      month: Math.abs(lunar.getMonth()),
      day: lunar.getDay(),
      isLeapMonth: lunar.getMonth() < 0,
      monthInChinese: lunar.getMonthInChinese(),
      dayInChinese: lunar.getDayInChinese(),
      text: `${lunar.getYearInChinese()}年 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
      zodiac: lunar.getYearShengXiao(),
    },
    /** 四柱（年月日时），干支两字 */
    pillars: {
      year: ec.getYear(), month: ec.getMonth(),
      day: dayGz, hour: ec.getTime(),
    },
    naYin: {
      year: ec.getYearNaYin(), month: ec.getMonthNaYin(),
      day: ec.getDayNaYin(), hour: ec.getTimeNaYin(),
    },
    /** 时辰地支（由钟点直接推，与 pillars.hour 的支应一致） */
    hourZhi: hourToZhi(dt.getHours()),
    /** 晚子时流派信息（UI 在 23 时须提示） */
    lateZi: {
      isLateZi,
      sect,
      note: isLateZi
        ? `⚠️ 现为晚子时（23 时）。本次采用流派 ${sect}：日柱算${sect === 2 ? '当日' : '次日'}。` +
          '另一派结论不同，会改变日辰、旬空、贵人、六神等，请确认。'
        : null,
    },
    /** 日干支所在旬、旬首、旬空 */
    xun: xun(dayGz),
    jieqi: {
      prevJie: prevJie ? { name: prevJie.getName(), at: prevJie.getSolar().toYmdHms() } : null,
      prevQi: prevQi ? { name: prevQi.getName(), at: prevQi.getSolar().toYmdHms() } : null,
      nextJie: lunar.getNextJie() ? { name: lunar.getNextJie().getName(), at: lunar.getNextJie().getSolar().toYmdHms() } : null,
      nextQi: lunar.getNextQi() ? { name: lunar.getNextQi().getName(), at: lunar.getNextQi().getSolar().toYmdHms() } : null,
    },
  };
}

/**
 * 一站式：从北京时间 + 经度 → 真太阳时 + 全部起盘上下文
 * @param {Date} dt 北京时间
 * @param {number} longitude 经度，默认 120（东八区标准经线，即不做经度校正）
 * @param {boolean} useTrueSolar 是否用真太阳时起盘（默认 true）
 * @param {1|2} sect 晚子时流派（默认 2，见文件头）
 */
export function resolve(dt, longitude = CST_STANDARD_LONGITUDE, useTrueSolar = true, sect = 2) {
  const tst = trueSolarTime(dt, longitude);
  const base = useTrueSolar ? tst.trueSolar : dt;
  return {
    input: { civil: dt.toISOString(), longitude, useTrueSolar, sect },
    trueSolarTime: {
      civilText: fmt(dt),
      trueSolarText: fmt(tst.trueSolar),
      longitudeOffsetMin: round4(tst.longitudeOffsetMin),
      eotMin: round4(tst.eotMin),
      deltaMin: round4(tst.deltaMin),
    },
    basedOn: fmt(base),
    ...chart(base, sect),
  };
}

const round4 = (x) => Math.round(x * 1e4) / 1e4;

export function fmt(dt) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ` +
    `${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
}

// ───────────────────────── 月将（太阳过宫） ─────────────────────────

/**
 * 月将表 —— **中气换将**（"过宫"）
 *
 * 十二月将（神名 / 地支）：
 *   登明亥 河魁戌 从魁酉 传送申 小吉未 胜光午
 *   太乙巳 天罡辰 太冲卯 功曹寅 大吉丑 神后子
 *
 * 换将规则（本 APP 采用「中气换将」派）：
 *   雨水后 → 亥(登明)   春分后 → 戌(河魁)   谷雨后 → 酉(从魁)
 *   小满后 → 申(传送)   夏至后 → 未(小吉)   大暑后 → 午(胜光)
 *   处暑后 → 巳(太乙)   秋分后 → 辰(天罡)   霜降后 → 卯(太冲)
 *   小雪后 → 寅(功曹)   冬至后 → 丑(大吉)   大寒后 → 子(神后)
 *
 * ## 流派分歧（必读）
 * 1. **中气换将（本 APP 采用）**：以太阳实际过宫（黄经每 30°）为界，
 *    对应二十四节气中的十二「中气」。这是《六壬大全》《毕法赋》主流做法，
 *    也是绝大多数现代六壬排盘软件的默认。
 * 2. **节换将**：少数流派以十二「节」（立春、惊蛰…）换将。
 * 3. **月建代月将**：极简派直接用农历月建对应的将，误差可达一个宫。
 * 与 zhanbu 项目 liuren_service.py 的 YUE_JIANG_TABLE 一致（同为中气派）。
 */
export const YUE_JIANG_TABLE = [
  { qi: '雨水', zhi: '亥', name: '登明' },
  { qi: '春分', zhi: '戌', name: '河魁' },
  { qi: '谷雨', zhi: '酉', name: '从魁' },
  { qi: '小满', zhi: '申', name: '传送' },
  { qi: '夏至', zhi: '未', name: '小吉' },
  { qi: '大暑', zhi: '午', name: '胜光' },
  { qi: '处暑', zhi: '巳', name: '太乙' },
  { qi: '秋分', zhi: '辰', name: '天罡' },
  { qi: '霜降', zhi: '卯', name: '太冲' },
  { qi: '小雪', zhi: '寅', name: '功曹' },
  { qi: '冬至', zhi: '丑', name: '大吉' },
  { qi: '大寒', zhi: '子', name: '神后' },
];

/** 十二地支 → 月将神名（六壬盘上标注用） */
export const ZHI_TO_JIANG_NAME = Object.fromEntries(
  YUE_JIANG_TABLE.map((r) => [r.zhi, r.name])
);

/**
 * 求某时刻的月将
 * @param {Date} dt 起卦时刻（真太阳时）
 * @returns {{zhi:string, name:string, qi:string, qiAt:string}}
 */
export function yueJiang(dt) {
  const lunar = toSolar(dt).getLunar();
  const prevQi = lunar.getPrevQi();
  if (!prevQi) throw new Error('无法取得上一个中气，日期可能超出历法库支持范围');
  const qiName = prevQi.getName();
  const row = YUE_JIANG_TABLE.find((r) => r.qi === qiName);
  if (!row) {
    // getPrevQi() 理论上只会返回十二中气之一；若不是，说明库行为变更
    throw new Error(`getPrevQi() 返回了非中气「${qiName}」，请检查 lunar-javascript 版本`);
  }
  return { zhi: row.zhi, name: row.name, qi: qiName, qiAt: prevQi.getSolar().toYmdHms() };
}

// ───────────────────────── 昼夜 ─────────────────────────

/**
 * 昼夜判定（决定大六壬用昼贵人还是夜贵人）
 * 本 APP 采用**卯至申为昼、酉至寅为夜**的传统时辰法
 * （卯时日出、酉时日落的理想化模型）。
 *
 * 流派分歧：另有按当地**实际日出日落**判昼夜的做法，在高纬度或
 * 夏冬季差异明显。本 APP 未实现实际日出日落法（需纬度+大气折射修正），
 * 已在 算法说明.md 列为 TODO。
 */
export const DAY_HOURS = ['卯', '辰', '巳', '午', '未', '申'];
export const isDayTime = (zhanShiZhi) => DAY_HOURS.includes(zhanShiZhi);

// ───────────────────────── 月建 / 月破 ─────────────────────────

/**
 * 月建（当月节气月的地支）—— 取月柱地支
 * 六爻判「月破」用：月破 = 月建所冲之支
 */
export function yueJian(dt) {
  const ec = toSolar(dt).getLunar().getEightChar();
  return ec.getMonth()[1];
}
export const yuePo = (dt) => zhiAdd(yueJian(dt), 6);

/** 导出以便上层直接用（避免上层重复 import vendor） */
export { Solar, Lunar, ZHI };
