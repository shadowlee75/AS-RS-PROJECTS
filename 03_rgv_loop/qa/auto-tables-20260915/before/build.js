const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const base=path.resolve(__dirname,'..'),files=['motion','model','engine','view','report','xlsx','excel','scene','blender-models','app'];
const vendor=JSON.parse(fs.readFileSync(path.join(base,'vendor/manifest.json'),'utf8'));
for(const item of vendor.files){const bytes=fs.readFileSync(path.join(base,'vendor',item.file));if(crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Vendor SHA-256 mismatch: '+item.file);}
let html=fs.readFileSync(path.join(base,'src/template.html'),'utf8').replace('/* STYLES */',fs.readFileSync(path.join(base,'src/style.css'),'utf8'));
const manifest={version:require('../package.json').version,modules:{},sources:{}};
const sources=['vendor/three.min.js','vendor/OrbitControls.js',...files.map(name=>'src/'+name+'.js')];
html=html.replace('<!-- SCRIPTS -->',sources.map(source=>{const name=path.basename(source,'.js'),code=fs.readFileSync(path.join(base,source),'utf8');if(/<\/script/i.test(code))throw Error('Inline script closing tag in '+name);manifest.modules[name]=crypto.createHash('sha256').update(code).digest('hex');manifest.sources[name]=source;return'<script data-module="'+name+'">\n'+code+'\n</script>';}).join('\n'));
html=html.replace('<!-- LICENSE -->','<!--\n'+fs.readFileSync(path.join(base,'vendor/LICENSE-three.txt'),'utf8')+'\n-->');
function write(file,data){try{fs.writeFileSync(file,data);}catch(e){if(e.code!=='EBUSY')throw e;fs.writeFileSync(file,data);}}
const target=path.resolve(base,'../LoopRGV_실행.html');write(target,html);write(path.join(base,'qa/build-manifest.json'),JSON.stringify(manifest,null,2));
console.log('Built '+target+' ('+Buffer.byteLength(html)+' bytes)');
