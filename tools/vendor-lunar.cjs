#!/usr/bin/env node
/**
 * vendor-lunar.js —— 把 npm 包 lunar-javascript 的 UMD 单文件转成
 * 「浏览器 + Node 都能直接 import」的 ESM 文件，落到 vendor/lunar.esm.js
 *
 * 为什么需要这一步：
 *   lunar.js 是 UMD：AMD → CJS → 全局 三分支。在原生 ESM 里三个分支全落空
 *   （`this` 为 undefined，赋值到 root 会抛异常）。这里在文件头注入一个
 *   假的 `module` 对象把它逼进 CJS 分支，再用 export 把结果导出，
 *   **不改动库本身一个字符**，升级只需重跑本脚本。
 *
 * 为什么不用 CDN：
 *   起卦 APP 必须离线可用（Capacitor 打包进 APK 后没有网络也要能排盘）。
 *
 * 用法: npm i lunar-javascript --no-save && node tools/vendor-lunar.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'lunar-javascript', 'lunar.js');
const pkg = path.join(__dirname, '..', 'node_modules', 'lunar-javascript', 'package.json');
if (!fs.existsSync(src)) {
  console.error('找不到 lunar-javascript。请先: npm i lunar-javascript --no-save');
  process.exit(1);
}
const version = JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
const body = fs.readFileSync(src, 'utf8');

const EXPORTS = [
  'Solar', 'Lunar', 'EightChar', 'LunarUtil', 'SolarUtil', 'ShouXingUtil',
  'LunarYear', 'LunarMonth', 'SolarMonth', 'I18n',
];

const out = `/* eslint-disable */
/**
 * vendor/lunar.esm.js —— 自动生成，请勿手改
 * ============================================
 * 来源: npm 包 lunar-javascript@${version} (MIT, 作者 6tail)
 *       https://github.com/6tail/lunar-javascript
 * 生成: tools/vendor-lunar.js
 *
 * 用途: 公农历互转、干支（年/月/日/时柱）、24 节气（分钟级精度）、旬空、纳音。
 * 选它的理由: 用户已有的 zhanbu 排盘项目用的是同作者的 lunar-python，
 *             两者算法同源，本 APP 与 zhanbu 的排盘结果可直接互校。
 *             节气用寿星（ShouXingUtil）天文算法推算，非固定日期近似。
 */
const module = { exports: {} };
const define = undefined;

${body}

const __L = module.exports;
${EXPORTS.map((n) => `export const ${n} = __L.${n};`).join('\n')}
export const LUNAR_JS_VERSION = ${JSON.stringify(version)};
export default __L;
`;

const dst = path.join(__dirname, '..', 'vendor', 'lunar.esm.js');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, out, 'utf8');
console.log('OK ->', dst, `(lunar-javascript@${version}, ${(out.length / 1024).toFixed(0)} KB)`);
