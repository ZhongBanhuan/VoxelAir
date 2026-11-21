// Start with: node serve.cjs
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const types={'/index.html':'text/html','/pair.html':'text/html','/app.js':'text/javascript','/deployment.js':'text/javascript','/ethers.min.js':'text/javascript','/ui.css':'text/css','/demo.json':'application/json',
  '/market.js':'text/javascript','/market-data.js':'text/javascript','/market.css':'text/css','/market.json':'application/json'};
http.createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  const file=pathname==='/'?'/index.html':pathname;
  if(!Object.hasOwn(types,file)){response.writeHead(404).end();return}
  fs.readFile(path.join(__dirname,file.slice(1)),(err,content)=>{
    if(err){response.writeHead(404).end();return}
    response.writeHead(200,{'Content-Type':types[file]+'; charset=utf-8','Cache-Control':'no-store'}).end(content);
  });
}).listen(4178,'127.0.0.1',()=>console.log('VoxelAir: http://127.0.0.1:4178/'));
