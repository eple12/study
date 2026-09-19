// 로컬 미리보기 서버. content/index.json은 요청할 때마다 새로 만든다.
//   node serve.mjs          (PORT=8080 node serve.mjs 로 포트 변경)
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
};

let lastWarn = '';

http.createServer(async (req, res) => {
  const send = (code, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/content/index.json') {
      const { index, problems } = await build();
      const warn = problems.flatMap(pr => pr.errors.map(e => `⚠ ${pr.file}: ${e}`)).join('\n');
      if (warn && warn !== lastWarn) console.log(warn);
      lastWarn = warn;
      return send(200, JSON.stringify(index), TYPES['.json']);
    }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT + path.sep)) return send(403, 'forbidden');
    send(200, await fs.readFile(file), TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch (e) {
    send(e.code === 'ENOENT' || e.code === 'EISDIR' ? 404 : 500, String(e.message));
  }
}).listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`http://localhost:${PORT}`);
  for (const ip of lan) console.log(`http://${ip}:${PORT}   ← 같은 와이파이의 폰에서`);
});
