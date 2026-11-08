/**
 * baseline.test.js —— 把 ALGORITHM-BASELINE.md 的验收清单变成可执行断言
 *
 * 这份测试的定位：**验收，不是单元测试**。
 * 术数的特点是「一张表错一格整个卦全错，但程序照样跑得欢不报错」，
 * 所以这里检的都是「错了不会崩、只会静默出错卦」的地方。
 *
 * 凡涉及流派分歧处，只断言「内部自洽」与「与 zhanbu 项目一致」，
 * 不断言「哪派才对」—— 见 §贵人表分歧（文件末尾注释）。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as DLR from '../src/modules/daliuren.js';
import * as LY from '../src/modules/liuyao.js';
import * as XLR from '../src/modules/xiaoliuren.js';
import * as MH from '../src/modules/meihua.js';
import { yueJiang } from '../src/core/calendar.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const GAN10 = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

// ══════════════════════════════════════════════════════════
describe('大六壬', () => {
  // 清单 1
  test('十干寄宫：甲→寅、壬→亥；一课下神落在寄宫位', () => {
    assert.equal(DLR.GAN_JI_GONG['甲'], '寅');
    assert.equal(DLR.GAN_JI_GONG['壬'], '亥');
    // 戊寄巳（同丙）、己寄未（同丁）—— 主流《六壬大全》系统
    assert.equal(DLR.GAN_JI_GONG['戊'], '巳');
    assert.equal(DLR.GAN_JI_GONG['己'], '未');
    for (const g of GAN10) {
      assert.ok(ZHI.includes(DLR.GAN_JI_GONG[g]), `${g} 寄宫非法`);
    }

    // 一课：下位显示日干本身，其所踏地盘位必须是寄宫
    const { tian } = DLR.buildTianPan('亥', '午');
    const c甲 = DLR.buildFourCourses('甲', '子', tian)[0];
    assert.equal(c甲.xia, '甲', '一课下位应显示日干');
    assert.equal(c甲.panPos, '寅', '甲日一课必须踏寅');
    assert.equal(DLR.buildFourCourses('壬', '子', tian)[0].panPos, '亥');
  });

  // 清单 4 + 7
  test('将名不互换：天罡=辰、河魁=戌；天将天空第7、天后第12', () => {
    const nameOf = (z) =>
      DLR.paipan({ dt: new Date(2026, 6, 31, 20, 0), yueJiang: z }).yueJiang.name;
    assert.equal(nameOf('辰'), '天罡', '辰 必须是天罡');
    assert.equal(nameOf('戌'), '河魁', '戌 必须是河魁');

    assert.equal(DLR.TIAN_JIANG.length, 12);
    assert.equal(new Set(DLR.TIAN_JIANG).size, 12, '天将有重复');
    assert.equal(DLR.TIAN_JIANG[6], '天空', '天空必须在第 7 位');
    assert.equal(DLR.TIAN_JIANG[11], '天后', '天后必须在第 12 位');
  });

  // 清单 2 + 3 —— 第一大坑
  test('月将按中气换将，不按农历月', () => {
    // 2026-07-31 大暑已过、处暑未到 → 午（胜光）
    const yj = yueJiang(new Date(2026, 6, 31, 20, 0));
    assert.equal(yj.zhi, '午');
    assert.equal(yj.name, '胜光');
    // 3 月 25 日 春分后、谷雨前 → 戌（河魁）
    assert.equal(yueJiang(new Date(2026, 2, 25, 12, 0)).zhi, '戌');
    // 实现必须基于中气，源码里应见「中气」而非农历月
    const src = fs.readFileSync(path.join(ROOT, 'src/core/calendar.js'), 'utf8');
    assert.ok(/中气/.test(src), '月将实现里找不到中气');
  });

  // 清单 5（天盘）
  test('天盘是同一偏移量的循环，绝不逆行', () => {
    for (const [yj, zs] of [['亥', '午'], ['子', '子'], ['寅', '申'], ['午', '卯']]) {
      const { k, tian } = DLR.buildTianPan(yj, zs);
      assert.equal(tian[zs], yj, '月将必须落在占时位上');
      assert.equal(new Set(Object.values(tian)).size, 12, '天盘有重复支');
      for (let i = 0; i < 12; i++) {
        assert.equal(tian[ZHI[i]], ZHI[(i + k) % 12], `偏移不一致 @${ZHI[i]}`);
      }
    }
  });

  // 清单 5（基准 §1.6 完整用例）
  test('§1.6 用例：甲子日/月将亥/占时午 → 四课三传逐项对上', () => {
    const { tian } = DLR.buildTianPan('亥', '午');
    assert.equal(tian['寅'], '未');
    assert.equal(tian['未'], '子');
    assert.equal(tian['子'], '巳');
    assert.equal(tian['巳'], '戌');

    const c = DLR.buildFourCourses('甲', '子', tian);
    assert.deepEqual(
      c.map((x) => `${x.shang}/${x.panPos}`),
      ['未/寅', '子/未', '巳/子', '戌/巳'],
      '四课与手推不符'
    );
    // 三个下贼上、第四课无克
    assert.deepEqual(c.map((x) => x.isZeiShang), [true, true, true, false]);

    const sc = DLR.buildSanChuan({ dayGan: '甲', dayZhi: '子', k: 5, tian, di: null, courses: c });
    assert.deepEqual([sc.chu, sc.zhong, sc.mo], ['子', '巳', '戌'], '三传应为 子→巳→戌');
    assert.equal(sc.gate, '比用', `三个贼应走比用，实际「${sc.gate}」`);
    assert.match(sc.keTi, /知一|比用/);
  });

  test('中末传取法：把前一传当地盘位再查天盘', () => {
    const { tian } = DLR.buildTianPan('亥', '午');
    const c = DLR.buildFourCourses('甲', '子', tian);
    const sc = DLR.buildSanChuan({ dayGan: '甲', dayZhi: '子', k: 5, tian, di: null, courses: c });
    assert.equal(sc.zhong, tian[sc.chu], '中传 ≠ 天盘[初传位]');
    assert.equal(sc.mo, tian[sc.zhong], '末传 ≠ 天盘[中传位]');
  });

  // 清单 6 —— 最容易写错的执行顺序
  test('伏吟/返吟的判定优先于贼克法', () => {
    const at = (yj, zs) =>
      DLR.paipan({ dt: new Date(2026, 6, 31, 20, 0), yueJiang: yj, zhanShi: zs });

    const fu = at('戌', '戌'); // 偏移 0
    assert.equal(fu.pan.k, 0);
    assert.equal(fu.sanChuan.gate, '伏吟', `偏移 0 必须判伏吟，实际「${fu.sanChuan.gate}」`);

    const fan = at('辰', '戌'); // 偏移 6
    assert.equal(fan.pan.k, 6);
    assert.equal(fan.sanChuan.gate, '返吟', `偏移 6 必须判返吟，实际「${fan.sanChuan.gate}」`);

    // 遍历十二时：偏移 0/6 一定不落到贼克/比用/涉害
    for (const zs of ZHI) {
      const r = at('戌', zs);
      if (r.pan.k === 0) assert.equal(r.sanChuan.gate, '伏吟');
      if (r.pan.k === 6) assert.equal(r.sanChuan.gate, '返吟');
      else if (r.pan.k !== 0) {
        assert.ok(!/伏吟|返吟/.test(r.sanChuan.gate),
          `偏移 ${r.pan.k} 不该判伏吟/返吟`);
      }
    }
  });

  test('十二天将布满十二位，顺逆只由贵人所乘地盘决定', () => {
    for (const zs of ['午', '子', '寅', '酉']) {
      const r = DLR.paipan({ dt: new Date(2026, 6, 31, 14, 0), yueJiang: '亥', zhanShi: zs });
      const tj = r.tianJiang;
      assert.equal(new Set(Object.values(tj.byTianPan)).size, 12, '天将未布满或有重复');
      assert.equal(tj.guiRenPos, r.pan.di[tj.guiRenZhi], '贵人地盘位自相矛盾');
      const shouldShun = DLR.GUI_SHUN_POS.includes(tj.guiRenPos);
      assert.equal(tj.direction, shouldShun ? '顺行' : '逆行',
        `贵人乘地盘${tj.guiRenPos} → 应${shouldShun ? '顺' : '逆'}行`);
    }
  });

  test('贵人表：昼夜互异、口诀同组共用两支、与 zhanbu 逐格一致', () => {
    // zhanbu backend/app/services/liuren_service.py 的 DAY_GUI_REN
    const ZHANBU_DAY = {
      甲: '未', 戊: '未', 庚: '丑', 乙: '申', 己: '子',
      丙: '酉', 丁: '亥', 壬: '卯', 癸: '巳', 辛: '午',
    };
    for (const [g, day] of Object.entries(ZHANBU_DAY)) {
      assert.equal(DLR.GUI_REN[g].day, day, `${g} 昼贵与 zhanbu 不一致`);
      assert.notEqual(DLR.GUI_REN[g].night, DLR.GUI_REN[g].day, `${g} 昼夜贵相同`);
      assert.ok(ZHI.includes(DLR.GUI_REN[g].night), `${g} 夜贵非法`);
    }
    // 口诀分组内共用同一对地支（甲戊庚牛羊 / 乙己鼠猴 / 丙丁猪鸡 / 壬癸兔蛇）
    for (const grp of [['甲', '戊', '庚'], ['乙', '己'], ['丙', '丁'], ['壬', '癸']]) {
      const pairs = grp.map((g) =>
        [DLR.GUI_REN[g].day, DLR.GUI_REN[g].night].sort().join(''));
      assert.equal(new Set(pairs).size, 1, `组 ${grp.join('')} 未共用同一对贵人支`);
    }
  });
});

// ══════════════════════════════════════════════════════════
describe('六爻（京房纳甲）', () => {
  // 清单 8 + 9
  test('八宫纳支：乾震序列相同（非笔误）、每宫隔一位循环', () => {
    const SHOU_GUA = {
      乾: [1, 1, 1, 1, 1, 1], 坎: [0, 1, 0, 0, 1, 0], 艮: [0, 0, 1, 0, 0, 1],
      震: [1, 0, 0, 1, 0, 0], 巽: [0, 1, 1, 0, 1, 1], 离: [1, 0, 1, 1, 0, 1],
      坤: [0, 0, 0, 0, 0, 0], 兑: [1, 1, 0, 1, 1, 0],
    };
    const seq = (p) => LY.dressGua(SHOU_GUA[p]).yaos.map((y) => y.zhi);

    assert.deepEqual(seq('乾'), ['子', '寅', '辰', '午', '申', '戌']);
    assert.deepEqual(seq('震'), ['子', '寅', '辰', '午', '申', '戌'], '震宫应与乾宫同支序');
    assert.deepEqual(seq('坎'), ['寅', '辰', '午', '申', '戌', '子']);
    assert.deepEqual(seq('艮'), ['辰', '午', '申', '戌', '子', '寅']);
    assert.deepEqual(seq('巽'), ['丑', '亥', '酉', '未', '巳', '卯']);
    assert.deepEqual(seq('离'), ['卯', '丑', '亥', '酉', '未', '巳']);
    assert.deepEqual(seq('坤'), ['未', '巳', '卯', '丑', '亥', '酉']);
    assert.deepEqual(seq('兑'), ['巳', '卯', '丑', '亥', '酉', '未']);

    for (const p of LY.EIGHT_PALACES) {
      const s = seq(p);
      assert.equal(new Set(s).size, 6, `${p}宫有重复支`);
      const step = ['乾', '坎', '艮', '震'].includes(p) ? 2 : 10; // 阳顺阴逆，均隔一位
      for (let i = 1; i < 6; i++) {
        assert.equal(ZHI.indexOf(s[i]), (ZHI.indexOf(s[i - 1]) + step) % 12,
          `${p}宫第${i + 1}爻不是「隔一位」递进`);
      }
    }
    // 乾坤各纳两干：内甲外壬 / 内乙外癸
    assert.equal(LY.NAJIA['乾'].innerGan, '甲');
    assert.equal(LY.NAJIA['乾'].outerGan, '壬');
    assert.equal(LY.NAJIA['坤'].innerGan, '乙');
    assert.equal(LY.NAJIA['坤'].outerGan, '癸');
  });

  // 清单 11 —— 唯一不成对处
  test('六神起点：戊=勾陈、己=螣蛇', () => {
    assert.deepEqual(LY.LIU_SHEN, ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武']);
    assert.equal(LY.liuShenOf('戊')[0], '勾陈');
    assert.equal(LY.liuShenOf('己')[0], '螣蛇');
    // 其余干成对
    for (const [a, b] of [['甲', '乙'], ['丙', '丁'], ['庚', '辛'], ['壬', '癸']]) {
      assert.equal(LY.liuShenOf(a)[0], LY.liuShenOf(b)[0], `${a}${b} 应同起点`);
    }
    // 起于初爻并循环
    const s = LY.liuShenOf('戊');
    assert.equal(s[4], '青龙', '第 5 爻应绕回青龙');
    assert.equal(new Set(s).size, 6);
  });

  // 清单 12 —— 最好用的自检
  test('世应间隔恒为 3（遍历全部 64 卦）', () => {
    for (let m = 0; m < 64; m++) {
      const yao6 = Array.from({ length: 6 }, (_, i) => (m >> i) & 1);
      const { shiPos, yingPos, palace } = LY.palaceOf(yao6);
      const gap = Math.abs(shiPos - yingPos);
      assert.equal(gap === 3 ? 3 : gap, 3,
        `${palace}宫 ${yao6.join('')}：世${shiPos} 应${yingPos} 间隔≠3`);
    }
  });

  test('八宫表穷尽 64 卦且不重复', () => {
    const t = LY.buildPalaceTable();
    assert.equal(t.length, 64, '八宫 × 8 卦应为 64');
    assert.equal(new Set(t.map((r) => r.yao.join(''))).size, 64, '八宫表有重卦');
  });

  // 清单 10
  test('六亲以卦宫五行为我，不随日干变', () => {
    const qin = (dt) =>
      LY.paipan({ yao: [1, 1, 1, 1, 1, 1], movingPositions: [], dt })
        .benGua.yaos.map((y) => y.liuQin);
    // 换两个日干完全不同的日子，六亲必须一模一样
    assert.deepEqual(qin(new Date(2026, 0, 1)), qin(new Date(2026, 0, 7)),
      '六亲随日干变了 —— 应只由卦宫五行决定');
    // 乾宫属金，逐格核对
    assert.deepEqual(
      LY.dressGua([1, 1, 1, 1, 1, 1]).yaos.map((y) => y.liuQin),
      ['子孙', '妻财', '父母', '官鬼', '兄弟', '父母'],
      '乾为天六亲不对（乾宫属金：子水=子孙、寅木=妻财、辰土=父母、午火=官鬼、申金=兄弟、戌土=父母）'
    );
    assert.equal(LY.liuQin('金', '金'), '兄弟');
    assert.equal(LY.liuQin('金', '水'), '子孙', '金生水 → 我生者为子孙');
    assert.equal(LY.liuQin('金', '土'), '父母', '土生金 → 生我者为父母');
    assert.equal(LY.liuQin('金', '火'), '官鬼', '火克金 → 克我者为官鬼');
    assert.equal(LY.liuQin('金', '木'), '妻财', '金克木 → 我克者为妻财');
  });

  test('互卦取中间四爻（重叠三、四爻），错卦综卦为对合', () => {
    const y = [1, 0, 1, 1, 0, 0];
    assert.deepEqual(LY.huGua(y), [y[1], y[2], y[3], y[2], y[3], y[4]]);
    assert.deepEqual(LY.cuoGua(LY.cuoGua(y)), y, '错卦不是对合');
    assert.deepEqual(LY.zongGua(LY.zongGua(y)), y, '综卦不是对合');
  });

  test('摇钱成爻：背数 0~3 → 四象，且只有两种为动爻', () => {
    const got = [0, 1, 2, 3].map((n) => LY.yaoFromCoins(n));
    assert.equal(new Set(got.map((g) => g.name)).size, 4, '四象应互不相同');
    assert.equal(got.filter((g) => g.moving).length, 2, '恰应两种是动爻');
  });
});

// ══════════════════════════════════════════════════════════
describe('小六壬', () => {
  const names = (r) => r.gongs.map((g) => g.shen);

  test('六神顺序固定', () => {
    assert.deepEqual(XLR.SHEN_ORDER,
      ['大安', '留连', '速喜', '赤口', '小吉', '空亡']);
  });

  // 清单 13 —— 专抓 off-by-one
  test('起点本身计为 1：正月初一子时 = 大安/大安/大安', () => {
    assert.deepEqual(names(XLR.castByNumbers({ nums: [1, 1, 1] })),
      ['大安', '大安', '大安'], '若得到「留连」说明把起点算成了 0');
  });

  // 清单 14
  test('三月初五午时 = 速喜/大安/大安', () => {
    assert.deepEqual(names(XLR.castByNumbers({ nums: [3, 5, 7] })),
      ['速喜', '大安', '大安']);
  });

  test('countFrom：从自身起数 1 原地不动，数 7 绕一圈回原位', () => {
    assert.equal(XLR.countFrom('大安', 1), '大安');
    assert.equal(XLR.countFrom('大安', 2), '留连');
    assert.equal(XLR.countFrom('大安', 7), '大安');
    assert.equal(XLR.countFrom('空亡', 2), '大安', '第 6 宫下一位应绕回第 1 宫');
  });

  test('三宫角色是 始/中/终，不是三个独立结果', () => {
    const r = XLR.castByNumbers({ nums: [3, 5, 7] });
    assert.equal(r.gongs.length, 3);
    assert.ok(r.gongs.every((g) => g.role), '每宫应有 role 说明');
    assert.ok(r.conclusion, '应给出最终结论');
  });
});

// ══════════════════════════════════════════════════════════
describe('梅花易数', () => {
  // 清单 15 —— 另一个高频 off-by-one
  test('mod 为 0 时卦取 8、爻取 6', () => {
    assert.equal(MH.guaByNum(1), '乾');
    assert.equal(MH.guaByNum(8), '坤');
    assert.equal(MH.guaByNum(16), '坤', '16 mod 8 = 0 → 应取第 8 卦坤');
    assert.equal(MH.guaByNum(9), '乾');
    assert.equal(MH.yaoByNum(6), 6);
    assert.equal(MH.yaoByNum(12), 6, '12 mod 6 = 0 → 应取第 6 爻');
    assert.equal(MH.yaoByNum(7), 1);
  });

  test('先天八卦数：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8', () => {
    assert.deepEqual(MH.XIANTIAN, ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤']);
    assert.equal(MH.XIANTIAN_NUM['乾'], 1);
    assert.equal(MH.XIANTIAN_NUM['坤'], 8);
    assert.equal(new Set(Object.values(MH.XIANTIAN_NUM)).size, 8);
  });

  // 清单 16 —— 搞反则吉凶全反
  test('体用：动爻在下三爻→下卦为用；在上三爻→上卦为用', () => {
    const y = [1, 0, 1, 0, 1, 1];
    for (const pos of [1, 2, 3]) {
      const t = MH.tiYongOf(y, pos);
      assert.match(t.yongPos, /下卦/, `动爻${pos}：下卦应为用，得「${t.yongPos}」`);
      assert.match(t.tiPos, /上卦/);
    }
    for (const pos of [4, 5, 6]) {
      const t = MH.tiYongOf(y, pos);
      assert.match(t.yongPos, /上卦/, `动爻${pos}：上卦应为用，得「${t.yongPos}」`);
      assert.match(t.tiPos, /下卦/);
    }
    // 体用五行关系必须是五种之一
    for (const pos of [1, 4]) {
      assert.match(MH.tiYongOf(y, pos).key, /体生用|用生体|体克用|用克体|体用比和/);
    }
  });
});

// ══════════════════════════════════════════════════════════
describe('历法地基（错了上面全白搭）', () => {
  // 清单 17
  test('真太阳时可开关，且开关真的改变结果', () => {
    const dt = new Date(2026, 6, 31, 20, 0);
    const on = DLR.paipan({ dt, longitude: 90, useTrueSolar: true });
    const off = DLR.paipan({ dt, longitude: 90, useTrueSolar: false });
    assert.equal(on.input.useTrueSolar, true);
    assert.equal(off.input.useTrueSolar, false);
    // 东经 90° 与 120° 差约 2 小时，20:00 必然跨时辰
    assert.notEqual(on.zhanShi.zhi, off.zhanShi.zhi,
      '经度差 30° 应改变时辰，真太阳时开关似未生效');
  });

  test('64 卦原文齐备：卦辞 + 384 爻辞，上下卦 8×8 穷尽，且来源可溯', () => {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/yijing64.json'), 'utf8'));
    const hx = j.hexagrams ?? j;
    assert.equal(hx.length, 64);
    assert.equal(new Set(hx.map((h) => h.lower + h.upper)).size, 64, '上下卦未穷尽 8×8');
    let n = 0;
    for (const h of hx) {
      assert.ok(h.guaci?.length >= 2, `${h.name} 卦辞缺失`);
      assert.equal(h.yaoci.length, 6, `${h.name} 爻辞数≠6`);
      for (const y of h.yaoci) {
        assert.ok(y.text?.length >= 2, `${h.name} 爻辞过短`);
        n++;
      }
    }
    assert.equal(n, 384);
    // 古籍原文必须是机械抽取、来源可追溯，不能由模型生成
    assert.ok(j._source, '数据缺少 _source 溯源字段');
  });
});

/*
 * ══════════════════════════ §贵人表分歧 ══════════════════════════
 *
 * 天乙贵人的昼/夜分配是本项目最大的流派分歧点，这里刻意**不做对错断言**。
 *
 * 口诀「甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，六辛逢马虎」
 * 只给出每组共用的**两支**，没说哪支属昼、哪支属夜。于是各家书表互有出入。
 *
 * 本实现取「昼贵：甲未 乙申 丙酉 丁亥 戊未 己子 庚丑 辛午 壬卯 癸巳」，
 * 与用户已有的 zhanbu 项目 (liuren_service.py DAY_GUI_REN) 逐格一致，
 * 两个项目结果可互校 —— 上面的测试断言的就是这个一致性。
 *
 * ⚠️ 注意：ALGORITHM-BASELINE.md §1.7 早期版本写的是另一派
 * （甲戊庚 昼丑夜未 / 乙己 昼子夜申 / 丙丁 昼亥夜酉 / 壬癸 昼巳夜卯），
 * 那张表是凭记忆写的、未经典籍校勘，与本实现冲突。已在基准文档中标注为
 * 「待校勘的分歧点」，**不作为验收依据**。
 *
 * 因此基准文档 §1.6 用例的「第六步·天将」（螣蛇/太常/六合）同样依赖那张表，
 * 也不作为验收依据；本文件只验到三传（子→巳→戌），天将部分改为验
 * 「布满十二位 + 顺逆规则自洽」这两条与流派无关的结构性质。
 *
 * 要改派别：只改 daliuren.js 的 GUI_REN 一张表即可，其余逻辑不受影响，
 * 同时把本文件 ZHANBU_DAY 与 zhanbu 项目一起改，保持三处同步。
 */
