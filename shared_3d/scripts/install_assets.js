const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const base=path.resolve(__dirname,'..'),root=path.resolve(base,'..'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const apps=[['stacker','01_stacker_crane','스태커크레인_실행.html',['stacker_base','stacker_mast','stacker_carriage','stacker_fork','cargo_pallet']],['linear','02_rgv_linear','직선RGV_실행.html',['rgv_linear','cargo_pallet']],['loop','03_rgv_loop','LoopRGV_실행.html',['rgv_loop','cargo_pallet']],['shuttle','04_shuttle_4way','셔틀_실행.html',['shuttle','lift','cargo_pallet']]];
const assetDir=path.join(base,'assets');fs.mkdirSync(assetDir,{recursive:true});
if(process.argv[2])for(const name of ['equipment_models.blend','equipment_models.glb','mesh_library.json','asset_manifest.json'])fs.copyFileSync(path.join(process.argv[2],name),path.join(assetDir,name));
const library=JSON.parse(fs.readFileSync(path.join(assetDir,'mesh_library.json'),'utf8')),template=fs.readFileSync(path.join(base,'src/runtime.js'),'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(assetDir,'asset_manifest.json'),'utf8'));
for(const[name,item]of Object.entries(manifest.files))if(hash(fs.readFileSync(path.join(assetDir,name)))!==item.sha256)throw Error('Asset hash mismatch '+name);
const backup=path.join(base,'backup_before_blender_20260914');fs.mkdirSync(backup,{recursive:true});const baselineFile=path.join(backup,'baseline.json'),baseline=fs.existsSync(baselineFile)?JSON.parse(fs.readFileSync(baselineFile,'utf8')):{};
for(const[app,folder,html,models]of apps){
 const appDir=path.join(root,folder);
 for(const file of ['src/scene.js','scripts/build.js','scripts/shipcheck.js','src/motion.js','src/model.js','src/engine.js','../'+html]){
  const key=folder+'/'+file,from=path.resolve(appDir,file),dest=file.startsWith('../')?path.join(backup,html):path.join(backup,folder,file);
  if(!(key in baseline)){const data=fs.readFileSync(from);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);baseline[key]=hash(data);fs.writeFileSync(baselineFile,JSON.stringify(baseline,null,2));}
 }
 const payload={...library,sourceSHA256:manifest.files['equipment_models.blend'].sha256,models:Object.fromEntries(models.map(n=>[n,library.models[n]]))};
 fs.writeFileSync(path.join(appDir,'src/blender-models.js'),template.replace('/* BLENDER_LIBRARY */',JSON.stringify(payload)).replace('/* BLENDER_APP */',JSON.stringify(app)));
 const buildPath=path.join(appDir,'scripts/build.js');let build=fs.readFileSync(buildPath,'utf8');
 if(!build.includes('blender-models')){build=app==='stacker'?build.replace("'src/scene.js', 'src/app.js'","'src/scene.js', 'src/blender-models.js', 'src/app.js'"):build.replace("'scene','app'","'scene','blender-models','app'");if(!build.includes('blender-models'))throw Error('Build injection failed '+folder);fs.writeFileSync(buildPath,build);}
 const shipPath=path.join(appDir,'scripts/shipcheck.js');let ship=fs.readFileSync(shipPath,'utf8');
 if(app!=='stacker'&&!ship.includes("'scene','blender-models','app'")){ship=ship.replace("'report','scene','app'","'report','scene','blender-models','app'").replace('9 inline modules','10 inline modules');fs.writeFileSync(shipPath,ship);}
 console.log('Installed Blender assets: '+folder);
}
fs.mkdirSync(path.join(base,'qa'),{recursive:true});fs.writeFileSync(path.join(base,'qa/integration-manifest.json'),JSON.stringify({blenderVersion:library.blenderVersion,assetManifest:manifest,apps:apps.map(([app,folder,html,models])=>({app,folder,html,models}))},null,2));

