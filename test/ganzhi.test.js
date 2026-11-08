/**
 * test/ganzhi.test.js —— 干支 / 五行 / 刑冲合害 / 旬空 基础层
 * 全部为纯函数，可离线断言。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/core/ganzhi.js';

test('十天干十二地支基本长度与索引', () => {
  assert.equal(G.GAN.length, 10);
  assert.equal(G.ZHI.length, 12);
  assert.equal(G.ganIndex('甲'), 0);
  assert.equal(G.ganIndex('癸'), 9);
  assert.equal(G.zhiIndex('子'), 0);
  assert.equal(G.zhiIndex('亥'), 11);
  assert.throws(() => G.ganIndex('X'), /未知天干/);
  assert.throws(() => G.zhiIndex('X'), /未知地支/);
});

test('六十甲子：60 项、无重复、首尾正确、非法组合返回 -1', () => {
  assert.equal(G.JIAZI.length, 60);
  assert.equal(new Set(G.JIAZI).size, 60);
  assert.equal(G.JIAZI[0], '甲子');
  assert.equal(G.JIAZI[59], '癸亥');
  assert.equal(G.jiaziIndex('甲子'), 0);
  assert.equal(G.jiaziIndex('癸酉'), 9);
  assert.equal(G.jiaziIndex('甲丑'), -1, '甲丑不存在（阳干只配阳支）');
  // 阴阳同性校验：干支阴阳必须一致
  for (const gz of G.JIAZI) {
    assert.equal(G.ganYinYang(gz[0]), G.zhiYinYang(gz[1]), `${gz} 干支阴阳应同性`);
  }
});

test('地支加减与顺行步数（含负数取模）', () => {
  assert.equal(G.zhiAdd('子', 1), '丑');
  assert.equal(G.zhiAdd('子', 12), '子');
  assert.equal(G.zhiAdd('子', -1), '亥');
  assert.equal(G.zhiAdd('子', -13), '亥');
  assert.equal(G.zhiFwd('子', '亥'), 11);
  assert.equal(G.zhiFwd('亥', '子'), 1);
  assert.equal(G.zhiFwd('子', '子'), 0);
});

test('五行生克与关系判定', () => {
  assert.equal(G.SHENG.木, '火');
  assert.equal(G.KE.木, '土');
  assert.equal(G.wuxingRelation('水', '水'), '同我');
  assert.equal(G.wuxingRelation('水', '木'), '我生');
  assert.equal(G.wuxingRelation('水', '金'), '生我');
  assert.equal(G.wuxingRelation('水', '火'), '我克');
  assert.equal(G.wuxingRelation('水', '土'), '克我');
  // 五行两两关系必须恰好覆盖五类且互为对偶
  for (const a of G.WUXING) {
    const seen = G.WUXING.map((b) => G.wuxingRelation(a, b));
    assert.equal(new Set(seen).size, 5, `${a} 对五行应恰好呈现五种关系`);
  }
});

test('六冲：十二支两两互冲、相隔六位', () => {
  const pairs = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
  for (const [a, b] of pairs) {
    assert.equal(G.zhiChong(a), b);
    assert.equal(G.zhiChong(b), a);
    assert.ok(G.isChong(a, b) && G.isChong(b, a));
  }
  assert.ok(!G.isChong('子', '丑'));
});

test('六合 / 六害：对称且各 12 项', () => {
  for (const [a, b] of Object.entries(G.LIU_HE)) assert.equal(G.LIU_HE[b], a, `六合应对称 ${a}-${b}`);
  for (const [a, b] of Object.entries(G.LIU_HAI)) assert.equal(G.LIU_HAI[b], a, `六害应对称 ${a}-${b}`);
  assert.equal(G.LIU_HE.子, '丑');
  assert.equal(G.LIU_HAI.子, '未');
});

test('三合局：四局各三支、十二支不重不漏', () => {
  assert.equal(G.SAN_HE.length, 4);
  const all = G.SAN_HE.flatMap((s) => s.zhi);
  assert.equal(all.length, 12);
  assert.equal(new Set(all).size, 12);
  assert.equal(G.sanHeOf('申').wuxing, '水');
  assert.equal(G.sanHeOf('午').wuxing, '火');
  // 三合局三支两两相隔四位
  for (const s of G.SAN_HE) {
    assert.equal(G.zhiFwd(s.zhi[0], s.zhi[1]), 4);
    assert.equal(G.zhiFwd(s.zhi[1], s.zhi[2]), 4);
  }
});

test('三刑 / 自刑', () => {
  assert.equal(G.XING.子, '卯');
  assert.equal(G.XING.卯, '子');
  // 寅→巳→申→寅 三刑循环
  assert.equal(G.XING.寅, '巳');
  assert.equal(G.XING.巳, '申');
  assert.equal(G.XING.申, '寅');
  // 丑→戌→未→丑
  assert.equal(G.XING.丑, '戌');
  assert.equal(G.XING.戌, '未');
  assert.equal(G.XING.未, '丑');
  for (const z of G.SELF_XING) {
    assert.equal(G.XING[z], z, `${z} 应自刑`);
    assert.ok(G.isSelfXing(z));
  }
  assert.ok(!G.isSelfXing('子'));
});

test('孟仲季：十二支三分不重不漏', () => {
  const all = [...G.MENG, ...G.ZHONG, ...G.JI];
  assert.equal(new Set(all).size, 12);
  assert.equal(G.mengZhongJi('寅'), '孟');
  assert.equal(G.mengZhongJi('子'), '仲');
  assert.equal(G.mengZhongJi('辰'), '季');
});

test('旬首 / 旬空：六旬逐一核对（传统口诀）', () => {
  const expect = [
    ['甲子', '甲子', ['戌', '亥']],
    ['癸酉', '甲子', ['戌', '亥']], // 甲子旬末日
    ['甲戌', '甲戌', ['申', '酉']],
    ['甲申', '甲申', ['午', '未']],
    ['甲午', '甲午', ['辰', '巳']],
    ['甲辰', '甲辰', ['寅', '卯']],
    ['甲寅', '甲寅', ['子', '丑']],
    ['丙午', '甲辰', ['寅', '卯']],
  ];
  for (const [gz, shou, kong] of expect) {
    const r = G.xun(gz);
    assert.equal(r.xunShou, shou, `${gz} 旬首`);
    assert.deepEqual(r.xunKong, kong, `${gz} 旬空`);
  }
  assert.throws(() => G.xun('甲丑'), /非法干支/);
});

test('旬空的结构性质：每旬恰好两支空、旬内十日之支不空', () => {
  for (let i = 0; i < 60; i += 10) {
    const shou = G.JIAZI[i];
    const { xunKong } = G.xun(shou);
    assert.equal(xunKong.length, 2);
    const inXun = G.JIAZI.slice(i, i + 10).map((gz) => gz[1]);
    for (const z of inXun) assert.ok(!xunKong.includes(z), `${shou}旬内 ${z} 不应空亡`);
    // 空亡二支恰是十二支减去旬内十支
    const rest = G.ZHI.filter((z) => !inXun.includes(z));
    assert.deepEqual([...xunKong].sort(), [...rest].sort());
  }
});

test('旬遁：旬首为甲、空亡支无遁干', () => {
  assert.equal(G.dunGan('甲子', '子'), '甲');
  assert.equal(G.dunGan('甲子', '酉'), '癸');
  assert.equal(G.dunGan('甲子', '戌'), null, '甲子旬戌空亡，无遁干');
  assert.equal(G.dunGan('甲子', '亥'), null);
  // 遁干应与六十甲子一致
  for (let i = 0; i < 60; i++) {
    const gz = G.JIAZI[i];
    assert.equal(G.dunGan(gz, gz[1]), gz[0], `${gz} 自身遁干应为 ${gz[0]}`);
  }
});

test('钟点 → 时辰地支（子时跨 23:00）', () => {
  const cases = [
    [23, '子'], [0, '子'], [1, '丑'], [2, '丑'], [3, '寅'],
    [11, '午'], [12, '午'], [13, '未'], [21, '亥'], [22, '亥'],
  ];
  for (const [h, z] of cases) assert.equal(G.hourToZhi(h), z, `${h} 时应为 ${z} 时`);
  // 24 小时应覆盖全部十二支，每支两小时
  const cnt = {};
  for (let h = 0; h < 24; h++) cnt[G.hourToZhi(h)] = (cnt[G.hourToZhi(h)] || 0) + 1;
  assert.equal(Object.keys(cnt).length, 12);
  for (const z of G.ZHI) assert.equal(cnt[z], 2, `${z} 时应占 2 小时`);
});

test('时辰 → 钟点区间与 hourToZhi 互逆', () => {
  for (const z of G.ZHI) {
    const [a, b] = G.zhiToHourRange(z);
    assert.equal(G.hourToZhi(a), z);
    assert.equal(G.hourToZhi(b), z);
  }
  assert.deepEqual(G.zhiToHourRange('子'), [23, 0]);
  assert.deepEqual(G.zhiToHourRange('午'), [11, 12]);
});

test('驿马：三合局首支之冲', () => {
  assert.equal(G.yiMa('子'), '寅'); // 申子辰 → 寅
  assert.equal(G.yiMa('午'), '申'); // 寅午戌 → 申
  assert.equal(G.yiMa('酉'), '亥'); // 巳酉丑 → 亥
  assert.equal(G.yiMa('卯'), '巳'); // 亥卯未 → 巳
  // 同局三支驿马相同
  for (const s of G.SAN_HE) {
    const m = s.zhi.map(G.yiMa);
    assert.equal(new Set(m).size, 1);
  }
});

test('长生十二宫 12 项', () => {
  assert.equal(G.CHANG_SHENG.length, 12);
  assert.equal(G.CHANG_SHENG[0], '长生');
});
