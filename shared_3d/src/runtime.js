(function(root){'use strict';
const LIB=/* BLENDER_LIBRARY */,APP=/* BLENDER_APP */;
function bytes(value,Type){const raw=atob(value),b=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)b[i]=raw.charCodeAt(i);return new Type(b.buffer);}
function resources(owner,id){owner.__blenderResources??=new Map();if(owner.__blenderResources.has(id))return owner.__blenderResources.get(id);const T=root.THREE,asset=LIB.models[id];if(!asset)throw Error('Missing Blender asset: '+id);const bounds=new T.Box3(),parts=asset.parts.map(p=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(bytes(p.position,Float32Array),3));g.setAttribute('normal',new T.BufferAttribute(bytes(p.normal,Float32Array),3));g.setIndex(new T.BufferAttribute(bytes(p.index,Uint32Array),1));g.computeBoundingBox();g.computeBoundingSphere();bounds.union(g.boundingBox);owner.geometries.push(g);const m=new T.MeshStandardMaterial({name:'Blender / '+p.material,color:new T.Color(...p.color),metalness:p.metalness,roughness:p.roughness,emissive:new T.Color(...p.emissive),emissiveIntensity:p.emissiveIntensity});owner.materials.push(m);return{geometry:g,material:m,name:p.material};});const v={parts,bounds};owner.__blenderResources.set(id,v);return v;}
function create(owner,id,w,h,d,centerY=false,lamp=null){const T=root.THREE,r=resources(owner,id),group=new T.Group(),inner=new T.Group(),size=r.bounds.getSize(new T.Vector3()),center=r.bounds.getCenter(new T.Vector3());group.name='Blender / '+id;group.userData={blenderAsset:id,blenderVersion:LIB.blenderVersion,sourceSHA256:LIB.sourceSHA256};inner.scale.set(w/size.x,h/size.y,d/size.z);inner.position.set(-center.x*inner.scale.x,-(centerY?center.y:r.bounds.min.y)*inner.scale.y,-center.z*inner.scale.z);for(const p of r.parts){const mesh=new T.Mesh(p.geometry,lamp&&p.name==='Green status lens'?lamp:p.material);mesh.name=p.name;inner.add(mesh);}group.add(inner);return group;}
function clearMeshes(parent,keep=null){for(const child of parent.children.slice())if(child.isMesh&&!child.material?.wireframe&&child!==keep)parent.remove(child);}
function add(owner,parent,id,w,h,d,y=0,lamp=null){const obj=create(owner,id,w,h,d,false,lamp);obj.position.y=y;parent.add(obj);return obj;}
function replaceCargo(owner,parent,w,h,d,y=0){for(const group of parent.children){clearMeshes(group);const obj=create(owner,'cargo_pallet',w,h,d,true);obj.position.y=y;group.add(obj);}}
function convert(scene){
 const c=scene.config;
 if(APP==='stacker'){
  const px=c.length/c.bays,py=scene.layout.pitch,loadW=Math.min(px*.74,1.6),loadH=Math.min(py*.6,1.2),loadD=Math.min(1,c.stroke*.7);
  scene.aisles.forEach((a,i)=>{const bounds=root.STCModel.envelope(root.STCModel.aisleConfig(c,i));clearMeshes(a.crane);add(scene,a.crane,'stacker_base',Math.min(1.8,px),.34,Math.min(1,c.stroke),bounds.yMin-loadH/2-.65);add(scene,a.crane,'stacker_mast',.62,bounds.height+loadH/2+1.07,.4,bounds.yMin-loadH/2-.37);clearMeshes(a.carriage);add(scene,a.carriage,'stacker_carriage',Math.min(1.4,px),.20,Math.min(.8,c.stroke),-loadH/2-.27);clearMeshes(a.fork,a.cargo);add(scene,a.fork,'stacker_fork',loadW*.75,.075,loadD,-loadH/2-.075);a.fork.remove(a.cargo);a.cargo=create(scene,'cargo_pallet',loadW,loadH,loadD,true);a.cargo.visible=false;a.fork.add(a.cargo);a.lastPose='';});scene.cargo=scene.aisles[0].cargo;
  // Keep mechanical clearance beneath the lowest input load center.
  const matrix=new root.THREE.Matrix4();
  for(const obj of scene.scene.children)if(obj.isInstancedMesh&&obj.material?.color){
   const color=obj.material.color.getHex();let changed=false;
   for(let i=0;i<obj.count;i++){obj.getMatrixAt(i,matrix);const m=matrix.elements;
    if(color===0x1b3546){m[13]-=loadH/2+.59;changed=true;}
    else if(color===0xc0d6df&&Math.abs(m[5]-.06)<1e-7&&Math.abs(m[10]-.05)<1e-7){m[13]-=loadH/2+.60;changed=true;}
    if(changed)obj.setMatrixAt(i,matrix);
   }
   if(changed)obj.instanceMatrix.needsUpdate=true;
  }

 }else if(APP==='linear'){
  const u=scene.diagram.unit;for(const a of scene.cars){clearMeshes(a.body);add(scene,a.body,'rgv_linear',1.95*u,1.1*u,1.55*u,.07*u,a.lampMaterial);replaceCargo(scene,a.cargo,.64*u,.48*u,.56*u,-.03*u);}for(const p of scene.stocks)if(p.cargo)replaceCargo(scene,p.cargo,.64*u,.48*u,.56*u,-.03*u);
 }else if(APP==='loop'){
  const h=Math.max(.15,Math.min(.7,c.carLength*.4)),size=Math.min(.65,c.carLength*.35);
  for(const a of scene.cars){clearMeshes(a.body);add(scene,a.body,'rgv_loop',c.carLength,h*1.35,scene.carWidth,.02,a.lamp);replaceCargo(scene,a.cargo,size*1.06,size*.65*1.14,size*.85,-size*.65*.035);}for(const p of scene.ports)replaceCargo(scene,p.cargo,size*1.06,size*.65*1.14,size*.85,-size*.65*.035);
 }else if(APP==='shuttle'){
  for(const a of scene.actors.values()){clearMeshes(a.body);if(a.kind==='lift')add(scene,a.body,'lift',c.cargoLength+.25,.13,c.cargoWidth+.25);else add(scene,a.body,'shuttle',c.carLength,scene.bodyHeight,c.carWidth);scene.scene.remove(a.cargo);a.cargo=create(scene,'cargo_pallet',c.cargoLength,c.cargoHeight,c.cargoWidth,true);a.cargo.visible=false;scene.scene.add(a.cargo);}scene.lastTime=null;
 }
 scene.__blenderReady=true;scene.needsRender=true;scene.lastRender=-Infinity;
}
function focus(scene,aisle=0){const T=root.THREE,c=scene.config;let p,size;if(APP==='stacker'){const a=scene.aisles[Math.max(0,Math.min(scene.aisles.length-1,Number(aisle)||0))];p=new T.Vector3(a.crane.position.x,a.carriage.position.y,a.z);size=Math.max(1.2,Math.min(c.length/c.bays,1.8));scene.controls.target.copy(p);scene.camera.position.copy(p).add(new T.Vector3(-size*2.4,size*1.1,.65));}else{const actor=APP==='shuttle'?scene.actors.get(scene.selected):scene.cars[scene.selected],body=actor.body;p=body.position.clone().add(new T.Vector3(0,APP==='linear'?scene.diagram.unit*.55:APP==='shuttle'?.3:.5,0));size=APP==='linear'?scene.diagram.unit*1.8:APP==='shuttle'?Math.max(c.carLength,c.carWidth,c.cargoWidth,1):Math.max(c.carLength,scene.carWidth,1);scene.controls.target.copy(p);scene.camera.position.copy(p).add(new T.Vector3(size*1.1,size*1.0,(APP==='shuttle'?-1:1)*size*1.65));}scene.controls.update();scene.needsRender=true;scene.lastRender=-Infinity;}
function badge(scene){const box=scene.container;if(scene.fallback){box.dataset.modelSource='2D';box.querySelector('.blender-model-badge')?.remove();return;}box.dataset.modelSource='Blender '+LIB.blenderVersion;if(!box.querySelector('.blender-model-badge')){const el=document.createElement('span');el.className='blender-model-badge';el.textContent='Blender 모델 ';el.style.cssText='position:absolute;right:12px;bottom:12px;padding:4px 7px;border:1px solid #5d929b;border-radius:5px;background:#123744e8;color:#bce9df;font:11px Segoe UI,Malgun Gothic,sans-serif;z-index:2';if(APP==='stacker')el.style.bottom='54px';const button=document.createElement('button');button.type='button';button.textContent='장비 확대';button.style.cssText='font-size:10px;margin-left:5px;padding:2px 6px;background:#244954;color:#d8f5eb;border:1px solid #5d929b;cursor:pointer';button.onclick=e=>{e.stopPropagation();if(APP==='stacker')focus(scene,Number(document.getElementById('simAisle')?.value)||0);else scene.setView('selected');};el.append(button);if(getComputedStyle(box).position==='static')box.style.position='relative';box.append(el);}}
const name={stacker:'STCScene',linear:'RGVScene',loop:'LoopScene',shuttle:'ShuttleScene'}[APP],api=root[name],Original=api.Scene;
api.Scene=class BlenderScene extends Original{
 constructor(...args){super(...args);if(!this.fallback){convert(this);if(this.latestFleet)this.update(this.latestFleet);else if(this.engine)this.update(this.engine);}badge(this);}
 setView(mode,...args){const value=super.setView(mode,...args);if(mode==='selected'&&this.__blenderReady&&!this.fallback)focus(this,args[0]);return value;}
 update(...args){const value=super.update(...args);if(this.__blenderReady||this.fallback)badge(this);return value;}
};
root.BlenderEquipment={version:'1.0.0',blenderVersion:LIB.blenderVersion,app:APP,models:Object.keys(LIB.models),sourceSHA256:LIB.sourceSHA256,create};
})(globalThis);


