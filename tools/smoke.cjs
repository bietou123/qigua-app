#!/usr/bin/env node
/**
 * smoke.cjs —— 用 headless Chrome 真实加载 www/ 并逐个功能点一遍
 *
 * 为什么要有这个：界面层全靠字符串拼 DOM，语法错、字段名错、undefined
 * 都只会在浏览器里炸，node --test 一个也抓不到。这个脚本用 Chrome
 * DevTools Protocol（不依赖 puppeteer）加载页面、点按钮、收 console 报错。
 *
 * 用法：先 node tools/serve.cjs，再 node tools/smoke.cjs [端口]
 */
'use strict';

const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = Number(process.argv[2]) || 5173;
const CDP_PORT = 9222;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome/Edge'); process.exit(1); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qigua-smoke-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--window-size=412,915',
  'about:blank',
], { stdio: 'ignore' });

const getJSON = (p) =>
  new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (r) => {
      let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(JSON.parse(b)));
    }).on('error', rej);
  });

async function waitCDP() {
  for (let i = 0; i < 60; i++) {
    try { return await getJSON('/json/list'); } catch { await new Promise((r) => setTimeout(r, 300)); }
  }
  throw new Error('Chrome 调试端口没起来');
}

function connect(wsUrl) {
  // 极简 WebSocket 客户端（只需要文本帧 + 掩码），免得为一个冒烟脚本装依赖
  const net = require('node:net');
  const crypto = require('node:crypto');
  const u = new URL(wsUrl);
  const sock = net.connect(Number(u.port), u.hostname);
  const key = crypto.randomBytes(16).toString('base64');
  const handlers = new Map();
  const events = [];
  let id = 0, buf = Buffer.alloc(0), open = false;
  const ready = new Promise((resolve) => {
    sock.on('connect', () => {
      sock.write(
        `GET ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\n` +
        `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!open) {
        const i = buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        buf = buf.subarray(i + 4); open = true; resolve();
      }
      // 解帧
      for (;;) {
        if (buf.length < 2) return;
        const len0 = buf[1] & 0x7f;
        let off = 2, len = len0;
        if (len0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const payload = buf.subarray(off, off + len).toString('utf8');
        buf = buf.subarray(off + len);
        let msg; try { msg = JSON.parse(payload); } catch { continue; }
        if (msg.id && handlers.has(msg.id)) { handlers.get(msg.id)(msg); handlers.delete(msg.id); }
        else if (msg.method) events.push(msg);
      }
    });
  });

  function frame(text) {
    const data = Buffer.from(text, 'utf8');
    const mask = require('node:crypto').randomBytes(4);
    let head;
    if (data.length < 126) head = Buffer.from([0x81, 0x80 | data.length]);
    else if (data.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xfe; head.writeUInt16BE(data.length, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xff; head.writeBigUInt64BE(BigInt(data.length), 2); }
    const masked = Buffer.from(data);
    for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
    return Buffer.concat([head, mask, masked]);
  }

  const send = (method, params = {}) =>
    ready.then(() => new Promise((resolve, reject) => {
      const mid = ++id;
      handlers.set(mid, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
      sock.write(frame(JSON.stringify({ id: mid, method, params })));
    }));

  return { send, events, close: () => sock.destroy() };
}

const CASES = [
  { view: 'xlr', label: '小六壬 时间起卦', seg: null, go: 'xlr-go', out: 'xlr-out' },
  { view: 'xlr', label: '小六壬 节气月派', pre: `document.getElementById('xlr-cal').value='jieqi'`, go: 'xlr-go', out: 'xlr-out' },
  { view: 'xlr', label: '小六壬 公历派', pre: `document.getElementById('xlr-cal').value='solar'`, go: 'xlr-go', out: 'xlr-out' },
  { view: 'xlr', label: '小六壬 报数起卦', seg: ['xlr-mode', 'nums'], go: 'xlr-go', out: 'xlr-out' },
  { view: 'ly', label: '六爻 摇卦', go: 'ly-go', out: 'ly-out' },
  { view: 'ly', label: '六爻 手动摇六次', seg: ['ly-mode', 'manual'], go: 'ly-go', out: 'ly-out' },
  { view: 'ly', label: '六爻 时间起卦', seg: ['ly-mode', 'time'], go: 'ly-go', out: 'ly-out' },
  { view: 'dlr', label: '大六壬 自动', go: 'dlr-go', out: 'dlr-out' },
  { view: 'dlr', label: '大六壬 override 子时/亥将/强制夜',
    pre: `document.getElementById('dlr-zs').value='子';document.getElementById('dlr-yj').value='亥';document.getElementById('dlr-dn').value='0'`,
    go: 'dlr-go', out: 'dlr-out' },
  { view: 'mh', label: '梅花 年月日时', go: 'mh-go', out: 'mh-out' },
  { view: 'mh', label: '梅花 两数', seg: ['mh-mode', 'two'], pre: `document.getElementById('mh-a').value=16;document.getElementById('mh-b').value=24`, go: 'mh-go', out: 'mh-out' },
  { view: 'mh', label: '梅花 一数加时', seg: ['mh-mode', 'one'], pre: `document.getElementById('mh-n').value=8`, go: 'mh-go', out: 'mh-out' },
  { view: 'mh', label: '梅花 字数', seg: ['mh-mode', 'text'], pre: `document.getElementById('mh-text').value='平安顺遂'`, go: 'mh-go', out: 'mh-out' },
];

(async () => {
  const list = await waitCDP();
  const target = list.find((t) => t.type === 'page');
  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');

  const errs = [];
  const drain = () => {
    for (const e of cdp.events.splice(0)) {
      if (e.method === 'Runtime.exceptionThrown') {
        const d = e.params.exceptionDetails;
        errs.push('EXC ' + (d.exception?.description || d.text));
      } else if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') {
        errs.push('CONSOLE ' + e.params.args.map((a) => a.description || a.value).join(' '));
      } else if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
        errs.push('LOG ' + e.params.entry.text + ' ' + (e.params.entry.url || ''));
      }
    }
  };

  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await new Promise((r) => setTimeout(r, 2500));
  drain();

  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  const booted = await ev(`document.querySelectorAll('#dlr-zs option').length`);
  console.log(booted === 13 ? '✔ 启动：模块加载、数据注入、下拉填充完成' : `✖ 启动异常：占时下拉 ${booted} 项（应为 13）`);
  if (errs.length) { console.log('  启动期报错：'); errs.splice(0).forEach((e) => console.log('   ', e)); }

  let fail = 0;
  for (const c of CASES) {
    await ev(`document.querySelector('.tab[data-go="${c.view}"]').click()`);
    if (c.seg) await ev(`document.querySelector('#${c.seg[0]} .seg-btn[data-m="${c.seg[1]}"]').click()`);
    if (c.pre) await ev(c.pre);
    await ev(`document.getElementById('${c.view}-q').value='冒烟测试'`);
    // toast 有 3.6s 停留，不清掉会被下一个用例误判成自己的报错
    await ev(`document.getElementById('toast').classList.add('hide')`);
    await ev(`document.getElementById('${c.go}').click()`);
    await new Promise((r) => setTimeout(r, 250));
    drain();
    const info = await ev(`(()=>{const o=document.getElementById('${c.out}');
      const t=document.getElementById('toast');
      return {len:o.innerHTML.length, cards:o.querySelectorAll('.card').length,
              undef:(o.innerHTML.match(/undefined|NaN|\\[object Object\\]/g)||[]).length,
              toast: t.classList.contains('hide')?null:t.textContent};})()`);
    const bad = errs.splice(0);
    const ok = info.cards >= 3 && info.undef === 0 && !info.toast && bad.length === 0;
    if (!ok) fail++;
    console.log(`${ok ? '✔' : '✖'} ${c.label} —— ${info.cards} 卡 / ${info.len} 字符${
      info.undef ? ` / ⚠ ${info.undef} 处 undefined` : ''}${info.toast ? ` / ⚠ toast: ${info.toast}` : ''}`);
    bad.forEach((e) => console.log('    ', e));
  }

  // 设置抽屉：改经度 + 早子时，再起一次课，确认参数真的透传
  await ev(`document.getElementById('btn-settings').click()`);
  await ev(`document.getElementById('set-lon').value=104.1;document.getElementById('set-lon').dispatchEvent(new Event('change'))`);
  await ev(`document.getElementById('set-sect').value='1';document.getElementById('set-sect').dispatchEvent(new Event('change'))`);
  await ev(`document.getElementById('btn-sheet-close').click()`);
  const saved = await ev(`localStorage.getItem('qigua.settings.v1')`);
  await ev(`document.querySelector('.tab[data-go="dlr"]').click()`);
  await ev(`document.getElementById('dlr-zs').value='';document.getElementById('dlr-yj').value='';document.getElementById('dlr-dn').value=''`);
  await ev(`document.getElementById('dlr-go').click()`);
  await new Promise((r) => setTimeout(r, 250));
  const disc = await ev(`document.querySelector('#dlr-out .disc').textContent`);
  drain();
  const settingsOk = /104\.1/.test(disc) && /早子时/.test(disc) && errs.length === 0;
  if (!settingsOk) fail++;
  console.log(`${settingsOk ? '✔' : '✖'} 设置透传 —— ${saved}`);
  console.log(`   结果页披露：${disc.replace(/\s+/g, ' ').trim()}`);
  errs.splice(0).forEach((e) => console.log('    ', e));

  // 转义：所占何事里塞标签，不能变成真节点
  await ev(`document.querySelector('.tab[data-go="mh"]').click()`);
  await ev(`document.querySelector('#mh-mode .seg-btn[data-m="time"]').click()`);
  await ev(`document.getElementById('mh-q').value='<img src=x onerror=window.__xss=1>'`);
  await ev(`document.getElementById('mh-go').click()`);
  await new Promise((r) => setTimeout(r, 300));
  const xss = await ev(`!!window.__xss || !!document.querySelector('#mh-out img')`);
  if (xss) fail++;
  console.log(`${xss ? '✖' : '✔'} 输入转义 —— 所占何事中的标签未被当 HTML 执行`);

  // 截四张图存 www/../screenshots
  const shotDir = path.join(__dirname, '..', 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });
  for (const v of ['xlr', 'ly', 'dlr', 'mh']) {
    await ev(`document.querySelector('.tab[data-go="${v}"]').click();window.scrollTo(0,0)`);
    await new Promise((r) => setTimeout(r, 200));
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(shotDir, `${v}.png`), Buffer.from(shot.data, 'base64'));
  }
  console.log(`✔ 截图 4 张 → ${shotDir}`);

  console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项未通过`);
  cdp.close();
  chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome 还没完全退出时删不掉，不影响结论 */ }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('冒烟脚本自身出错：', e);
  chrome.kill();
  process.exit(2);
});
