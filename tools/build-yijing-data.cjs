#!/usr/bin/env node
/**
 * build-yijing-data.js —— 从 npm 包 `yidao` 里的《易经》通行本全文抽取结构化卦爻辞
 * =====================================================================
 * 为什么要这么做：
 *   64 卦卦辞 + 384 爻辞属于古籍原文，**不能由模型凭记忆生成**（必然出现讹字）。
 *   本脚本从第三方 npm 包 `yidao`（ISC 许可）附带的 `易经.json` 全文中机械抽取，
 *   来源可追溯、可复核。
 *
 * 用法：
 *   npm i yidao --no-save            # 仅构建期需要
 *   node tools/build-yijing-data.js
 *   → 生成 src/data/yijing64.json
 *
 * 输出结构（数组，64 项，按《周易》通行本上下经序 1..64）：
 *   { no, name, lower, upper, guaci, yaoci: [6], yongjiu?, yongliu? }
 *   yaoci[0] = 初爻（最下），yaoci[5] = 上爻（最上）
 *
 * 已知局限（务必写进文档）：
 *   - 源文本存在少量录入讹字（例如 乾卦彖辞"万国威宁"应为"万国咸宁"）。
 *     本脚本只抽取「卦辞 + 爻辞」，不抽取彖/象/文言，讹字影响面因此较小，
 *     但仍**未逐字校勘**，以中华书局点校本为准时可能有个别差异。
 *   - 卦名用源文本的简名（如"贲""遯""大畜"），另在 hexagram-meta 里补全俗称
 *     （"山火贲""天山遁"）。异体字（遯/遁、贲/賁、恒/恆）沿用源文本写法。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_CANDIDATES = [
  path.join(__dirname, '..', 'node_modules', 'yidao', '易经.json'),
  path.join(__dirname, '..', '..', 'node_modules', 'yidao', '易经.json'),
  process.env.YIDAO_JSON || '',
].filter(Boolean);

const srcPath = SRC_CANDIDATES.find((p) => fs.existsSync(p));
if (!srcPath) {
  console.error('找不到 易经.json。请先运行: npm i yidao --no-save');
  console.error('尝试过的路径:\n  ' + SRC_CANDIDATES.join('\n  '));
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
if (!Array.isArray(raw) || raw.length !== 64) {
  console.error('源数据异常：期望 64 项数组，实际', Array.isArray(raw) ? raw.length : typeof raw);
  process.exit(1);
}

/** 爻题：阳爻用九、阴爻用六 */
const YAO_TITLES = ['初九', '初六', '九二', '六二', '九三', '六三', '九四', '六四', '九五', '六五', '上九', '上六'];
const EXTRA_TITLES = ['用九', '用六'];
const ALL_TITLES = [...YAO_TITLES, ...EXTRA_TITLES];
/** 爻题在 6 爻中的位序（0 = 初爻） */
const TITLE_POS = {
  初九: 0, 初六: 0, 九二: 1, 六二: 1, 九三: 2, 六三: 2,
  九四: 3, 六四: 3, 九五: 4, 六五: 4, 上九: 5, 上六: 5,
};

const TITLE_RE = new RegExp('^(' + ALL_TITLES.join('|') + ')\\s*[：:，,]\\s*');

/**
 * 源文本勘误表 —— 逐条记录，**不静默修改**
 * 每条都是被下面「爻题阴阳 vs 卦象」自检抓出来的源数据录入错误。
 * 格式: '卦序:爻位(1-6)' -> { wrong: 源文本爻题, right: 正确爻题, why: 依据 }
 */
const ERRATA = {
  '37:4': {
    wrong: '九四',
    right: '六四',
    why: '风火家人 = 巽上离下，卦象自下而上为 阳阴阳·阴阳阳，第四爻为阴爻，' +
      '通行本作「六四：富家，大吉。」源 json 误录为「九四」。',
  },
};

/** 传注行（彖/象/文言/系辞…）—— 一律丢弃，不属于卦爻辞 */
const COMMENTARY_RE = /^[<《【]/;

/** 去掉行内可能夹带的传注尾巴 */
function stripInlineCommentary(s) {
  return s.replace(/[<《][彖象][>》].*$/, '').trim();
}

/** 归一化全角/异体标点，让前端渲染一致 */
function normalizePunct(s) {
  return s
    .replace(/[”“]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s+/g, '')
    .replace(/,/g, '，')
    .replace(/:/g, '：')
    .trim();
}

function parseOne(entry) {
  const lines = String(entry.content || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const name = String(entry.n || '').trim();
  const no = parseInt(entry.i, 10);

  // ---- 上下卦：源字段 g 形如 "乾下乾上" ----
  const gm = /^(.)下(.)上$/.exec(String(entry.g || '').trim());
  if (!gm) throw new Error(`卦 ${no}${name}: 无法解析上下卦字段 g="${entry.g}"`);
  const lower = gm[1];
  const upper = gm[2];

  // ---- 卦辞 ----
  // 主格式: "<乾>:元，亨，利，贞。"   少数（咸/恒）: "咸：亨。利贞。取女吉。"
  let guaci = null;
  for (const l of lines) {
    let m = /^[<《]([^>》]+)[>》]\s*[：:]\s*(.+)$/.exec(l);
    if (m && !['彖', '象', '文言', '系辞'].includes(m[1])) {
      guaci = m[2];
      break;
    }
  }
  if (!guaci) {
    // 回退：第 3 行（第 1 行卦名、第 2 行上下卦）形如 "咸：亨。利贞。"
    for (const l of lines.slice(0, 5)) {
      if (COMMENTARY_RE.test(l)) continue;
      const m = /^(.{1,4})\s*[：:]\s*(.+)$/.exec(l);
      if (m && !TITLE_RE.test(l)) { guaci = m[2]; break; }
    }
  }
  if (!guaci) throw new Error(`卦 ${no}${name}: 找不到卦辞`);

  // ---- 爻辞 ----
  const yaoci = new Array(6).fill(null);
  const extras = {};
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (COMMENTARY_RE.test(l)) continue;
    const m = TITLE_RE.exec(l);
    if (!m) continue;
    const title = m[1];
    let body = l.slice(m[0].length);

    // 爻辞可能续到下一行（源文本偶有换行），续行不以爻题/传注开头
    for (let j = i + 1; j < lines.length; j++) {
      const nx = lines[j];
      if (COMMENTARY_RE.test(nx) || TITLE_RE.test(nx)) break;
      body += nx;
      i = j;
    }
    body = normalizePunct(stripInlineCommentary(body));
    if (!body) continue;

    if (EXTRA_TITLES.includes(title)) {
      extras[title] = body;
    } else {
      const pos = TITLE_POS[title];
      // 只保留首次出现（后续重复多为传注引用）
      if (yaoci[pos] === null) yaoci[pos] = { title, text: body };
    }
  }

  const missing = yaoci.map((v, i) => (v === null ? i + 1 : null)).filter((v) => v !== null);
  if (missing.length) throw new Error(`卦 ${no}${name}: 缺爻辞，位序 ${missing.join(',')}`);

  const out = {
    no,
    name,
    lower,
    upper,
    guaci: normalizePunct(guaci),
    yaoci,
  };
  if (extras['用九']) out.yongjiu = extras['用九'];
  if (extras['用六']) out.yongliu = extras['用六'];
  return out;
}

const result = [];
const errors = [];
for (const entry of raw) {
  try {
    result.push(parseOne(entry));
  } catch (e) {
    errors.push(e.message);
  }
}

if (errors.length) {
  console.error('解析失败:\n  ' + errors.join('\n  '));
  process.exit(1);
}

result.sort((a, b) => a.no - b.no);

// ---------- 应用勘误表 ----------
const errataApplied = [];
for (const [key, fix] of Object.entries(ERRATA)) {
  const [noStr, posStr] = key.split(':');
  const h = result.find((x) => x.no === Number(noStr));
  if (!h) throw new Error(`勘误表 key ${key} 找不到对应卦`);
  const y = h.yaoci[Number(posStr) - 1];
  if (y.title !== fix.wrong) {
    console.error(`勘误表已过期: 卦${noStr} 第${posStr}爻 期望源文本为"${fix.wrong}"，实际为"${y.title}"。` +
      '源数据可能已更新，请人工复核后再改勘误表。');
    process.exit(1);
  }
  y.title = fix.right;
  y.errata = fix.why;
  errataApplied.push(`${h.no}${h.name} 第${posStr}爻 ${fix.wrong}→${fix.right}`);
}

// ---------- 自检 ----------
const problems = [];
if (result.length !== 64) problems.push(`卦数 ${result.length} != 64`);
result.forEach((h, i) => {
  if (h.no !== i + 1) problems.push(`序号不连续: 第 ${i + 1} 项 no=${h.no}`);
  if (h.yaoci.length !== 6) problems.push(`${h.name}: 爻辞数 ${h.yaoci.length}`);
  h.yaoci.forEach((y, k) => {
    if (!y.text || y.text.length < 2) problems.push(`${h.name} 第${k + 1}爻辞过短: "${y.text}"`);
  });
});
// 上下卦组合必须两两不重（64 种组合正好穷尽 8x8）
const combo = new Set(result.map((h) => h.lower + h.upper));
if (combo.size !== 64) problems.push(`上下卦组合去重后 ${combo.size} != 64`);
// 阴阳爻题必须与卦象一致（用 8 经卦二进制校验）
const TRI_BIN = { 乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0], 巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0] };
// 说明：上面数组按「初→中→上」自下而上排列
for (const h of result) {
  const lb = TRI_BIN[h.lower], ub = TRI_BIN[h.upper];
  if (!lb || !ub) { problems.push(`${h.name}: 未知经卦 ${h.lower}/${h.upper}`); continue; }
  const yao = [...lb, ...ub]; // 自下而上 6 爻
  h.yaoci.forEach((y, k) => {
    const isYang = y.title.includes('九');
    if (isYang !== (yao[k] === 1)) {
      problems.push(`${h.no}${h.name} 第${k + 1}爻: 爻题"${y.title}"与卦象(${yao[k] ? '阳' : '阴'})不符`);
    }
  });
}

if (problems.length) {
  console.error('自检发现问题（' + problems.length + ' 条）:');
  problems.slice(0, 40).forEach((p) => console.error('  - ' + p));
  process.exit(1);
}

const outPath = path.join(__dirname, '..', 'src', 'data', 'yijing64.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      _source: 'npm 包 yidao (ISC) 附带的《易经》通行本全文 易经.json',
      _extractedBy: 'tools/build-yijing-data.js',
      _note: '仅含卦辞与爻辞原文；彖/象/文言未收录。未逐字校勘，以中华书局点校本为准可能有个别字差异。',
      _selfCheck: '64 卦齐备、上下卦 8x8 穷尽、384 爻爻题阴阳与卦象逐爻校验通过',
      _errata: errataApplied,
      hexagrams: result,
    },
    null,
    1
  ),
  'utf8'
);

console.log('OK  ->', outPath);
console.log('    64 卦、' + result.length * 6 + ' 爻辞；用九/用六:',
  result.filter((h) => h.yongjiu || h.yongliu).map((h) => h.name).join(','));
console.log('    自检全部通过（含 384 爻爻题阴阳 vs 卦象一致性校验）');
if (errataApplied.length) console.log('    已应用勘误: ' + errataApplied.join('; '));
