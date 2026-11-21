// Build a single-file presentation from the local dashboard and recorded receipts.
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
let page=read('index.html');
page=page.replace(/<link rel="stylesheet" href="([^"]+)">/g,(_,file)=>'<style>'+read(file)+'</style>');
page=page.replace(/<script src="([^"]+)"><\/script>/g,(_,file)=>'<script>'+read(file).replace(/<\/script/gi,'<\\/script')+'</script>');
page=page.replace('</html>',()=>'<script type="text/plain" id="ethers-license">'+read('ethers-LICENSE.md')+'</script></html>');
fs.writeFileSync(path.resolve(process.argv[2]||'VoxelAir-demo.html'),page);
