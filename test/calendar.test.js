/**
 * test/calendar.test.js —— 历法层
 *
 * 关键回归点：
 *   1. 四柱干支（用一个**已知正确**的命例做基准，见 CASE_KNOWN）
 *   2. 节气边界（节气不是固定日期，必须秒级精确；跨界前后一秒月柱应改变）
 *   3. 真太阳时（Spencer 均时差；与 zhanbu 项目 Python 实现同公式）
 *   4. 月将（中气换将）在中气交接的前后一秒必须换宫
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/core/calendar.js';
import { ZHI, JIAZI } from '../src/core/ganzhi.js';

/**
 * 基准命例（外部已知正确值）
 * 1990-01-01 08:00（北京时间，东经 120 附近）→ 己巳 丙子 丙寅 壬辰
 * 核验方式：
 *   - 年柱取立春界，1 月 1 日尚属己巳年；月柱在小寒前仍为子月，己年「丙作首」→ 丙子
 *   - 日柱用六十甲子序数独立推算：距 2000-01-07（甲子日）3658 天，3658 mod 60 = 58 → 丙寅
 *   - 时柱用五鼠遁：丙日辰时 → 壬辰
 */
const CASE_KNOWN = {
  dt: new Date(1990, 0, 1, 8, 0, 0),
  pillars: { year: '己巳', month: '丙子', day: '丙寅', hour: '壬辰' },
};

test('vendor lunar-javascript 已成功以 ESM 方式加载', () => {
  assert.equal(typeof C.LUNAR_JS_VERSION, 'string');
  assert.ok(C.LUNAR_JS_VERSION.length > 0, '版本号应非空');
  assert.equal(typeof C.Solar.fromYmdHms, 'function');
});

test('四柱干支：基准命例逐柱一致（不用真太阳时）', () => {
  const r = C.chart(CASE_KNOWN.dt);
  assert.equal(r.pillars.year, CASE_KNOWN.pillars.year);
  assert.equal(r.pillars.month, CASE_KNOWN.pillars.month);
  assert.equal(r.pillars.day, CASE_KNOWN.pillars.day);
  assert.equal(r.pillars.hour, CASE_KNOWN.pillars.hour);
});

test('四柱干支：加真太阳时校正（经度 120）后仍一致', () => {
  // 经度 120 时只有均时差（数分钟），不应把 08:00 推出辰时（07:00–08:59）
  const r = C.resolve(CASE_KNOWN.dt, 120, true);
  assert.equal(r.pillars.day, CASE_KNOWN.pillars.day);
  assert.equal(r.pillars.hour, CASE_KNOWN.pillars.hour);
  assert.equal(r.hourZhi, '辰');
});

test('时柱地支与 hourZhi 在全天 24 个整点上一致', () => {
  for (let h = 0; h < 24; h++) {
    const dt = new Date(2026, 6, 15, h, 30, 0);
    const r = C.chart(dt);
    assert.equal(r.pillars.hour[1], r.hourZhi, `${h}:30 时柱支应与 hourZhi 一致`);
  }
});

test('日干支连续 400 天严格按六十甲子递进', () => {
  let prev = null;
  for (let i = 0; i < 400; i++) {
    // 取 12:00 避开 23:00 换日争议
    const dt = new Date(2025, 0, 1 + i, 12, 0, 0);
    const gz = C.chart(dt).pillars.day;
    if (prev !== null) {
      const a = JIAZI.indexOf(prev), b = JIAZI.indexOf(gz);
      assert.ok(a >= 0 && b >= 0, `${prev}/${gz} 应为合法干支`);
      assert.equal(b, (a + 1) % 60, `${prev} 之后应为 ${JIAZI[(a + 1) % 60]}，实得 ${gz}`);
    }
    prev = gz;
  }
});

test('晚子时流派：sect=2（默认）日柱算当日，sect=1 算次日；两派只在 23 时有别', () => {
  const late = new Date(2026, 6, 15, 23, 30, 0);
  const s2 = C.chart(late, 2);
  const s1 = C.chart(late, 1);
  const sameDayNoon = C.chart(new Date(2026, 6, 15, 12, 0, 0)).pillars.day;
  const nextDayNoon = C.chart(new Date(2026, 6, 16, 12, 0, 0)).pillars.day;

  assert.equal(s2.pillars.day, sameDayNoon, 'sect=2 晚子时日柱应算当日');
  assert.equal(s1.pillars.day, nextDayNoon, 'sect=1 晚子时日柱应算次日');
  // 两派的时柱都作子时，且时干都由「次日」日干起五鼠遁（库的既定行为）
  assert.equal(s2.pillars.hour, s1.pillars.hour);
  assert.equal(s2.pillars.hour[1], '子');
  assert.equal(s2.hourZhi, '子');
  // sect=2 时这一小时里日柱与时柱来自不同口径 —— 必须被 lateZi 提示出来
  assert.equal(s2.lateZi.isLateZi, true);
  assert.equal(s2.lateZi.sect, 2);
  assert.match(s2.lateZi.note, /晚子时/);

  // 其余 23 小时两派完全相同
  for (const h of [0, 1, 6, 12, 18, 22]) {
    const dt = new Date(2026, 6, 15, h, 30, 0);
    assert.deepEqual(C.chart(dt, 1).pillars, C.chart(dt, 2).pillars, `${h} 时两派应相同`);
    assert.equal(C.chart(dt).lateZi.isLateZi, false);
  }
  assert.throws(() => C.chart(late, 3), /sect 只能是/);
});

test('日柱在 00:00 换（sect=2）：22:30 与 23:30 同日、次日 00:30 已换', () => {
  const a = C.chart(new Date(2026, 6, 15, 22, 30, 0)).pillars.day;
  const b = C.chart(new Date(2026, 6, 15, 23, 30, 0)).pillars.day;
  const c = C.chart(new Date(2026, 6, 16, 0, 30, 0)).pillars.day;
  assert.equal(a, b, 'sect=2 下 22:30 与 23:30 日柱相同');
  assert.equal(JIAZI.indexOf(c), (JIAZI.indexOf(b) + 1) % 60, '00:30 应已进次日');
});

// ───────────────────────── 节气边界 ─────────────────────────

test('节气不是固定日期：同一节气在不同年份的日期/时刻不同', () => {
  const times = [2023, 2024, 2025, 2026].map((y) => {
    const lunar = C.Solar.fromYmdHms(y, 3, 1, 12, 0, 0).getLunar();
    // 三月初的上一个「节」是惊蛰或雨水，取下一个「节」更稳定
    return lunar.getNextJie().getSolar().toYmdHms();
  });
  assert.equal(new Set(times).size, 4, `四年的同一节气时刻应各不相同：${times.join(' | ')}`);
  // 时刻必须带时分秒（不是 00:00:00 的固定日期近似）
  assert.ok(times.some((t) => !t.endsWith('00:00:00')), '节气时刻应精确到时分秒，而非整日');
});

test('节气边界：立春交接前后一秒，年柱与月柱必须改变', () => {
  // 找 2026 年的立春时刻
  const lunar = C.Solar.fromYmdHms(2026, 2, 1, 12, 0, 0).getLunar();
  const jie = lunar.getNextJie();
  assert.equal(jie.getName(), '立春', `2026-02-01 之后的下一个节应是立春，实得 ${jie.getName()}`);
  const s = jie.getSolar();
  const at = new Date(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond());

  const before = C.chart(new Date(at.getTime() - 1000)).pillars;
  const after = C.chart(new Date(at.getTime() + 1000)).pillars;
  assert.notEqual(before.year, after.year, `立春前后年柱应变：${before.year} → ${after.year}`);
  assert.notEqual(before.month, after.month, `立春前后月柱应变：${before.month} → ${after.month}`);
  assert.equal(after.month[1], '寅', '立春后月支应为寅');
  assert.equal(before.month[1], '丑', '立春前月支应为丑');
});

test('节气边界：十二节逐一验证「交节前后月支相邻递进」', () => {
  const JIE = ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒'];
  const MONTH_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
  let checked = 0;
  for (let m = 1; m <= 12; m++) {
    const lunar = C.Solar.fromYmdHms(2026, m, 1, 12, 0, 0).getLunar();
    const jie = lunar.getNextJie();
    if (!jie) continue;
    const idx = JIE.indexOf(jie.getName());
    if (idx < 0) continue; // 该月的下一个节落到次年，跳过
    const s = jie.getSolar();
    const at = new Date(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond());
    const after = C.chart(new Date(at.getTime() + 2000)).pillars.month[1];
    assert.equal(after, MONTH_ZHI[idx], `${jie.getName()}（${s.toYmdHms()}）后月支应为 ${MONTH_ZHI[idx]}，实得 ${after}`);
    checked++;
  }
  assert.ok(checked >= 10, `应至少验证 10 个节，实际 ${checked}`);
});

// ───────────────────────── 真太阳时 ─────────────────────────

test('均时差：全年幅度落在天文学公认区间（约 -14 ~ +16 分钟）', () => {
  let min = Infinity, max = -Infinity;
  for (let d = 0; d < 365; d++) {
    const v = C.equationOfTimeMinutes(new Date(2026, 0, 1 + d, 12, 0, 0));
    min = Math.min(min, v); max = Math.max(max, v);
  }
  assert.ok(min > -17 && min < -12, `均时差最小值应约 -14 分钟，实得 ${min.toFixed(2)}`);
  assert.ok(max > 14 && max < 18, `均时差最大值应约 +16 分钟，实得 ${max.toFixed(2)}`);
});

test('均时差：四次零点附近（约 4/15、6/13、9/1、12/25）确实变号', () => {
  const sign = (d) => Math.sign(C.equationOfTimeMinutes(new Date(2026, 0, 1 + d, 12, 0, 0)));
  let flips = 0;
  for (let d = 1; d < 365; d++) if (sign(d) !== sign(d - 1)) flips++;
  assert.equal(flips, 4, `均时差一年应变号 4 次，实得 ${flips}`);
});

test('真太阳时：经度时差 = (经度-120)×4 分钟', () => {
  const dt = new Date(2026, 5, 21, 12, 0, 0);
  const beijing = C.trueSolarTime(dt, 116.4); // 北京
  const urumqi = C.trueSolarTime(dt, 87.6); // 乌鲁木齐
  assert.ok(Math.abs(beijing.longitudeOffsetMin - (116.4 - 120) * 4) < 1e-9);
  assert.ok(Math.abs(urumqi.longitudeOffsetMin - (87.6 - 120) * 4) < 1e-9);
  // 乌鲁木齐真太阳时应比北京时间晚约两小时
  assert.ok(urumqi.deltaMin < -120 && urumqi.deltaMin > -135, `实得 ${urumqi.deltaMin}`);
  // 经度 120 时只剩均时差
  const std = C.trueSolarTime(dt, 120);
  assert.equal(std.longitudeOffsetMin, 0);
  assert.equal(std.deltaMin, std.eotMin);
});

test('真太阳时能把时辰推过界（乌鲁木齐 07:30 应仍在卯时之前）', () => {
  const dt = new Date(2026, 5, 21, 7, 30, 0);
  const std = C.resolve(dt, 120, true);
  const wlmq = C.resolve(dt, 87.6, true);
  assert.equal(std.hourZhi, '辰', '东八区标准经线 7:30 属辰时');
  assert.equal(wlmq.hourZhi, '卯', '乌鲁木齐真太阳时约 5:25，属卯时');
});

// ───────────────────────── 月将（中气换将） ─────────────────────────

test('月将表：12 项、地支与神名一一对应、中气不重复', () => {
  assert.equal(C.YUE_JIANG_TABLE.length, 12);
  assert.equal(new Set(C.YUE_JIANG_TABLE.map((r) => r.zhi)).size, 12);
  assert.equal(new Set(C.YUE_JIANG_TABLE.map((r) => r.qi)).size, 12);
  assert.equal(new Set(C.YUE_JIANG_TABLE.map((r) => r.name)).size, 12);
  // 相邻中气对应的月将地支应逆行一位（太阳过宫，将逆行）
  for (let i = 1; i < 12; i++) {
    const a = ZHI.indexOf(C.YUE_JIANG_TABLE[i - 1].zhi);
    const b = ZHI.indexOf(C.YUE_JIANG_TABLE[i].zhi);
    assert.equal(b, (a + 11) % 12, `${C.YUE_JIANG_TABLE[i - 1].qi} → ${C.YUE_JIANG_TABLE[i].qi} 月将应逆行一位`);
  }
  assert.equal(C.ZHI_TO_JIANG_NAME.亥, '登明');
  assert.equal(C.ZHI_TO_JIANG_NAME.子, '神后');
});

test('月将：全年任意时刻都能取到，且恰好覆盖十二将', () => {
  const seen = new Set();
  for (let d = 0; d < 365; d++) {
    const r = C.yueJiang(new Date(2026, 0, 1 + d, 12, 0, 0));
    assert.ok(C.ZHI.includes(r.zhi));
    seen.add(r.zhi);
  }
  assert.equal(seen.size, 12, `一年应覆盖十二将，实得 ${seen.size}`);
});

test('月将：中气交接前后一秒必须换将', () => {
  let checked = 0;
  for (const row of C.YUE_JIANG_TABLE) {
    // 在全年里找到该中气的精确时刻
    let at = null;
    for (let m = 1; m <= 12 && !at; m++) {
      const q = C.Solar.fromYmdHms(2026, m, 1, 0, 0, 0).getLunar().getNextQi();
      if (q && q.getName() === row.qi) {
        const s = q.getSolar();
        at = new Date(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond());
      }
    }
    if (!at) continue;
    const after = C.yueJiang(new Date(at.getTime() + 2000));
    assert.equal(after.zhi, row.zhi, `${row.qi} 后月将应为 ${row.zhi}(${row.name})，实得 ${after.zhi}`);
    const before = C.yueJiang(new Date(at.getTime() - 2000));
    assert.notEqual(before.zhi, row.zhi, `${row.qi} 前月将不应已换为 ${row.zhi}`);
    checked++;
  }
  assert.ok(checked >= 11, `应至少验证 11 个中气换将点，实际 ${checked}`);
});

// ───────────────────────── 昼夜 / 月建月破 ─────────────────────────

test('昼夜：卯至申为昼、酉至寅为夜', () => {
  for (const z of ['卯', '辰', '巳', '午', '未', '申']) assert.ok(C.isDayTime(z), `${z} 应为昼`);
  for (const z of ['酉', '戌', '亥', '子', '丑', '寅']) assert.ok(!C.isDayTime(z), `${z} 应为夜`);
  assert.equal(C.DAY_HOURS.length, 6);
});

test('月建 / 月破：月破恒为月建之冲', () => {
  for (let m = 1; m <= 12; m++) {
    const dt = new Date(2026, m - 1, 15, 12, 0, 0);
    const jian = C.yueJian(dt);
    const po = C.yuePo(dt);
    assert.equal(ZHI.indexOf(po), (ZHI.indexOf(jian) + 6) % 12, `${m} 月：月建 ${jian} 之冲应为 ${po}`);
  }
  // 2026-07-31 属未月 → 月破丑
  assert.equal(C.yueJian(new Date(2026, 6, 31, 12, 0, 0)), '未');
  assert.equal(C.yuePo(new Date(2026, 6, 31, 12, 0, 0)), '丑');
});

test('resolve 返回完整上下文字段', () => {
  const r = C.resolve(CASE_KNOWN.dt, 116.4, true);
  for (const k of ['input', 'trueSolarTime', 'basedOn', 'solar', 'lunar', 'pillars', 'naYin', 'hourZhi', 'xun', 'jieqi']) {
    assert.ok(k in r, `resolve 结果应含 ${k}`);
  }
  assert.match(r.trueSolarTime.civilText, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(r.xun.xunKong.length, 2);
  assert.ok(r.jieqi.prevJie && r.jieqi.prevQi);
});
