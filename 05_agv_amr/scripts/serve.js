'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');const base=path.resolve(__dirname,'../..'),port=Number(process.env.AGV_PORT||8765),target=path.join(base,'AGV_AMR_실행.html');
const server=http.createServer((req,res)=>{if(req.url==='/'||req.url==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});fs.createReadStream(target).pipe(res);}else if(req.url==='/favicon.ico'){res.writeHead(204);res.end();}else{res.writeHead(404);res.end('Not found');}});
server.listen(port,'127.0.0.1',()=>console.log('AGV AMR: http://127.0.0.1:'+port));
