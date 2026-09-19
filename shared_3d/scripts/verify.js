const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process');
const base=path.resolve(__dirname,'..'),root=path.resolve(base,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(fs.readFileSync(path.join(base,'qa/integration-manifest.json'),'utf8')),baseline=JSON.parse(fs.readFileSync(path.join(base,'backup_before_blender_20260914/baseline.json'),'utf8'));
const checks=[];
for(const [name,entry]of Object.entries(manifest.assetManifest.files))assert.equal(sha(fs.readFileSync(path.join(base,'assets',name))),entry.sha256,name);
checks.push('Blender .blend, GLB and exported mesh SHA256 match generated manifest');
const glb=fs.readFileSync(path.join(base,'assets/equipment_models.glb'));assert.equal(glb.toString('ascii',0,4),'glTF');assert.equal(glb.readUInt32LE(4),2);assert.equal(glb.length,glb.readUInt32LE(8));const json=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));assert.ok(json.asset.generator.includes('Blender'));checks.push('GLB v2 header and Blender exporter provenance validated');
const library=JSON.parse(fs.readFileSync(path.join(base,'assets/mesh_library.json'),'utf8'));
for(const [name,model]of Object.entries(library.models)){assert.ok(json.nodes.some(n=>n.name===name));for(const part of model.parts){const pos=Buffer.from(part.position,'base64'),normal=Buffer.from(part.normal,'base64'),indices=Buffer.from(part.index,'base64');assert.equal(pos.length,part.vertices*12);assert.equal(normal.length,pos.length);assert.equal(indices.length,part.triangles*12);for(let i=0;i<indices.length;i+=4)assert.ok(indices.readUInt32LE(i)<part.vertices);for(let i=0;i<normal.length;i+=12){const n=[normal.readFloatLE(i),normal.readFloatLE(i+4),normal.readFloatLE(i+8)];assert.ok(Math.abs(Math.hypot(...n)-1)<1e-4);for(let k=0;k<3;k++)assert.ok(Number.isFinite(pos.readFloatLE(i+k*4)));}}}
checks.push('Nine named Blender assets: index ranges, finite positions and unit normals validated');
const apps=[];
for(const app of manifest.apps){
 const dir=path.join(root,app.folder);
 for(const file of ['motion','model','engine','scene'])assert.equal(sha(fs.readFileSync(path.join(dir,'src',file+'.js'))),baseline[app.folder+'/src/'+file+'.js']);
 const html=fs.readFileSync(path.join(root,app.html),'utf8'),modules=[...html.matchAll(/<script data-module="([^"]+)">\n([\s\S]*?)\n<\/script>/g)];
 assert.ok(!/<script[^>]+src=/i.test(html));const asset=modules.find(m=>m[1]==='blender-models');assert.ok(asset);assert.equal(asset[2],fs.readFileSync(path.join(dir,'src/blender-models.js'),'utf8'));assert.ok(modules.findIndex(m=>m[1]==='scene')<modules.indexOf(asset)&&modules.indexOf(asset)<modules.findIndex(m=>m[1]==='app'));for(const m of modules)new vm.Script(m[2],{filename:m[1]});
 const output=cp.execFileSync(process.execPath,['scripts/shipcheck.js'],{cwd:dir,encoding:'utf8',timeout:120000}).trim();console.log(app.app+': '+output);
 apps.push({...app,htmlBytes:Buffer.byteLength(html),htmlSHA256:sha(html),calculationAndOriginalSceneUnchanged:true,modules:modules.length,shipcheck:output});
}
checks.push('Four calculation engines and original scene modules match pre-change SHA256');
checks.push('Four deployables parse and embed matching Blender model module before app startup');
const result={date:'2026-09-14',graphicsVersion:'1.0.0',blenderVersion:manifest.blenderVersion,checks,apps,browser:JSON.parse(fs.readFileSync(path.join(base,'qa/browser-smoke.json'),'utf8')).map(r=>({app:r.id,source:r.source,aligned:r.aligned,errors:r.errors,externalRequests:r.requests})),loopBrowserChecks:JSON.parse(fs.readFileSync(path.join(root,'03_rgv_loop/qa/browser-results.json'),'utf8')).checks.length,shuttleBrowserChecks:JSON.parse(fs.readFileSync(path.join(root,'04_shuttle_4way/qa/browser-results.json'),'utf8')).passed,linearSceneChecks:JSON.parse(fs.readFileSync(path.join(root,'02_rgv_linear/qa/scene-results.json'),'utf8')).checks.length};
assert.ok(result.browser.every(r=>r.aligned&&!r.errors.length&&!r.externalRequests.length));fs.writeFileSync(path.join(base,'qa/verification.json'),JSON.stringify(result,null,2));console.log('BLENDER INTEGRATION VERIFIED');

