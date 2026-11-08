// 交叉比对: 用 qigua-app 的 daliuren.js 参考实现算三传
// 用法: node tools/dlr_cmp.mjs <dates.txt>   每行一个 "YYYY-MM-DD HH:mm"（北京时间）
import fs from 'node:fs';
import { paipan } from '../src/modules/daliuren.js';

const file = process.argv[2];
if (!file) {
  console.error('用法: node tools/dlr_cmp.mjs <dates.txt>');
  process.exit(1);
}
const lines = fs.readFileSync(file, 'utf8').trim().split(/\n/).map((s) => s.trim()).filter(Boolean);
for (const line of lines) {
  const dt = new Date(line.replace(' ', 'T') + '+08:00');
  const r = paipan({ dt, longitude: 120, useTrueSolar: true });
  const sc = r.sanChuan;
  const kt = (r.keTi || []).map((x) => x.name).join(',');
  const dayNight = r.dayNight.isDay ? '昼' : '夜';
  const out = [
    line,
    r.day.ganzhi,
    r.yueJiang.zhi,
    r.zhanShi.zhi,
    String(r.pan.k),
    dayNight,
    sc.gate,
    sc.method,
    sc.keTi,
    sc.chu,
    sc.zhong,
    sc.mo,
    kt,
  ].join('\t');
  console.log(out);
}
