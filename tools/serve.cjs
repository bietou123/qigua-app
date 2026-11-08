#!/usr/bin/env node
/**
 * serve.cjs —— 开发用静态服务器，根目录 www/
 *
 * 只服务本机、只读、只暴露 www/ 目录下的文件。
 * 路径做了规范化并校验必须落在 www/ 内，防止 ../ 穿越读到项目外的文件。
 *
 * 用法: node tools/serve.cjs [端口]   默认 5173
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const WWW = path.resolve(__dirname, '..', 'www');
const PORT = Number(process.argv[2]) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

http
  .createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(url.parse(req.url).pathname);
    } catch {
      res.writeHead(400).end('bad url');
      return;
    }
    if (pathname === '/') pathname = '/index.html';

    // 规范化后必须仍在 www/ 内，否则拒绝（防目录穿越）
    const target = path.resolve(WWW, '.' + pathname);
    if (target !== WWW && !target.startsWith(WWW + path.sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    fs.stat(target, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          .end('404 ' + pathname);
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      fs.createReadStream(target).pipe(res);
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`起卦 App  →  http://127.0.0.1:${PORT}`);
    console.log(`根目录     ${WWW}`);
    console.log('改了 src/ 之后要重跑 node tools/build-www.cjs');
  });
