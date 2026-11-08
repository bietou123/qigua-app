#!/usr/bin/env node
/**
 * shots.cjs —— 起卦后按屏截图，供人眼检查排版
 * 用法：node tools/serve.cjs 之后，node tools/shots.cjs [端口]
 * 输出 screenshots/<视图>-<屏号>.png，每张就是一屏 412×915。
 */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const smoke = path.join(__dirname, 'smoke.cjs');
// 复用 smoke.cjs 里的 CDP 连接逻辑：把它拆出来不值得，这里直接内联一份最小版
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn } = require('node:child_process');

const PORT = Number(process.argv[2]) || 5173;
const CDP_PORT = 9333;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qigua-shot-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--window-size=412,915',
  '--force-device-scale-factor=2', 'about:blank'], { stdio: 'ignore' });

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (r) => {
    let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});

function connect(wsUrl) {
  const u = new URL(wsUrl);
  const sock = net.connect(Number(u.port), u.hostname);
  const handlers = new Map();
  let id = 0, buf = Buffer.alloc(0), open = false;
  const ready = new Promise((resolve) => {
    sock.on('connect', () => sock.write(`GET ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!open) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; buf = buf.subarray(i + 4); open = true; resolve(); }
      for (;;) {
        if (buf.length < 2) return;
        const l0 = buf[1] & 0x7f; let off = 2, len = l0;
        if (l0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (l0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const s = buf.subarray(off, off + len).toString('utf8'); buf = buf.subarray(off + len);
        let m; try { m = JSON.parse(s); } catch { continue; }
        if (m.id && handlers.has(m.id)) { handlers.get(m.id)(m); handlers.delete(m.id); }
      }
    });
  });
  const frame = (text) => {
    const d = Buffer.from(text, 'utf8'); const mask = crypto.randomBytes(4);
    let h;
    if (d.length < 126) h = Buffer.from([0x81, 0x80 | d.length]);
    else if (d.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 0xfe; h.writeUInt16BE(d.length, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 0xff; h.writeBigUInt64BE(BigInt(d.length), 2); }
    const m2 = Buffer.from(d); for (let i = 0; i < m2.length; i++) m2[i] ^= mask[i % 4];
    return Buffer.concat([h, mask, m2]);
  };
  const send = (method, params = {}) => ready.then(() => new Promise((resolve, reject) => {
    const mid = ++id;
    handlers.set(mid, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
    sock.write(frame(JSON.stringify({ id: mid, method, params })));
  }));
  return { send, close: () => sock.destroy() };
}

(async () => {
  for (let i = 0; i < 60; i++) { try { await getJSON('/json/list'); break; } catch { await new Promise((r) => setTimeout(r, 300)); } }
  const t = (await getJSON('/json/list')).find((x) => x.type === 'page');
  const cdp = connect(t.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await new Promise((r) => setTimeout(r, 2500));
  const ev = async (e) => (await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;

  const dir = path.join(__dirname, '..', 'screenshots');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const plan = [
    { v: 'xlr', pre: '' },
    { v: 'ly', pre: '' },
    { v: 'dlr', pre: '' },
    { v: 'mh', pre: '' },
  ];
  for (const p of plan) {
    await ev(`document.querySelector('.tab[data-go="${p.v}"]').click()`);
    await ev(`document.getElementById('${p.v}-q').value='工作能否顺利'`);
    await ev(`document.getElementById('${p.v}-go').click()`);
    await new Promise((r) => setTimeout(r, 400));
    const h = await ev('document.documentElement.scrollHeight');
    const screens = Math.min(6, Math.ceil(h / 860));
    for (let s = 0; s < screens; s++) {
      await ev(`window.scrollTo(0,${s * 860})`);
      await new Promise((r) => setTimeout(r, 180));
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(dir, `${p.v}-${s + 1}.png`), Buffer.from(shot.data, 'base64'));
    }
    console.log(`${p.v}: 全高 ${h}px → ${screens} 屏`);
  }
  cdp.close(); chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(2); });
