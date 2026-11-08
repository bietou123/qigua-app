#!/usr/bin/env node
/**
 * build-www.cjs —— 把算法层拷进 www/，让 www 成为自包含的可部署目录
 *
 * 为什么需要这一步：
 *   算法层在 src/、依赖在 vendor/，而 Capacitor 只会把 webDir（= www）整个打进 apk。
 *   所以打包前必须把 src/ 和 vendor/ 复制进 www/，保持原有相对路径不变
 *   （src/modules/*.js 里写的是 '../core/…' 和 '../../vendor/lunar.esm.js'）。
 *
 * 另外把 yijing64.json 包一层成 ESM 模块 www/src/data/yijing64.js：
 *   古籍原文数据若用 fetch 加载，在 file:// 下会被 CORS 挡住（直接双击 index.html 打不开），
 *   包成 ESM 后 file:// / http:// / Capacitor 三种场景都能用同一份代码。
 *
 * 用法: node tools/build-www.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');

if (!fs.existsSync(path.join(WWW, 'index.html'))) {
  console.error('www/index.html 不存在 —— 这个脚本只负责拷贝依赖，不生成界面。');
  process.exit(1);
}

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

copyDir(path.join(ROOT, 'src'), path.join(WWW, 'src'));

fs.rmSync(path.join(WWW, 'vendor'), { recursive: true, force: true });
fs.mkdirSync(path.join(WWW, 'vendor'), { recursive: true });
fs.copyFileSync(
  path.join(ROOT, 'vendor', 'lunar.esm.js'),
  path.join(WWW, 'vendor', 'lunar.esm.js')
);

// 古籍原文 → ESM 模块（内容一字不改，只加 export）
const jsonPath = path.join(ROOT, 'src', 'data', 'yijing64.json');
const raw = fs.readFileSync(jsonPath, 'utf8');
const parsed = JSON.parse(raw); // 解析一次，确保拷进去的是合法 JSON
if (!Array.isArray(parsed.hexagrams) || parsed.hexagrams.length !== 64) {
  console.error('yijing64.json 异常：hexagrams 不是 64 项数组。先跑 npm run build。');
  process.exit(1);
}
fs.writeFileSync(
  path.join(WWW, 'src', 'data', 'yijing64.js'),
  '// 由 tools/build-www.cjs 生成，勿手改。原文来源见 _source 字段。\n' +
    'export default ' + raw.trim() + ';\n',
  'utf8'
);

const count = (dir) => {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? count(path.join(dir, e.name)) : 1;
  }
  return n;
};

console.log('OK  www/ 已自包含');
console.log('    www/src      ', count(path.join(WWW, 'src')), '个文件');
console.log('    www/vendor   1 个文件 (lunar.esm.js)');
console.log('    64 卦 384 爻辞已包成 ESM');
