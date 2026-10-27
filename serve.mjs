// Local preview server with no dependencies: run `node serve.mjs`, then open
// http://localhost:8000. Browsers won't load ES modules from file://, so the
// app has to be served. GitHub Pages doesn't use this file.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.argv[2]) || 8000; // `node serve.mjs 8001` picks another port

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) throw new Error('outside the project');
    const body = await readFile(file);
    // no-store, so a reload always shows your latest edits
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} is busy. Try another: node serve.mjs ${port + 1}` : err.message);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Aurum Tasks is running at http://localhost:${port}  (Ctrl+C to stop)`);
});
