const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve(__dirname, '../../스태커크레인_실행.html');
const server = http.createServer((request, response) => {
  if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  if (request.url !== '/' && request.url !== '/index.html') { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(response);
});
server.listen(8765, '127.0.0.1', () => console.log('STC preview: http://127.0.0.1:8765'));
