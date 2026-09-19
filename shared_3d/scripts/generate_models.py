"""Blender-authored equipment library, Y-up web bridge, editable .blend and GLB.
Run: blender --background --python generate_models.py -- --out <directory>
Re-export edits: blender models.blend --background --python generate_models.py -- --out <directory> --export-only
"""
import bpy, math, json, sys, os, base64, array, hashlib
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
out=args[args.index('--out')+1] if '--out' in args else os.path.join(os.path.dirname(__file__),'../assets')
os.makedirs(out,exist_ok=True)
def xyz(p): return (p[0],-p[2],p[1])
def linear(v): return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def material(name,h,metal=.1,rough=.42,glow=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    rgb=[linear(int(h[i:i+2],16)/255) for i in (0,2,4)]
    node=m.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value=(*rgb,1)
    node.inputs['Metallic'].default_value=metal;node.inputs['Roughness'].default_value=rough
    node.inputs['Emission Color'].default_value=(*rgb,1);node.inputs['Emission Strength'].default_value=glow
    m.diffuse_color=(*rgb,1)
    return m
def root(name):
    r=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(r);r['asset_id']=name
    return r
def mesh_finish(o,name,mat,parent,bevel=0):
    o.name=name;o.data.materials.append(mat);o.parent=parent
    if bevel:
        mod=o.modifiers.new('Manufactured edge bevel','BEVEL');mod.width=bevel;mod.segments=2
        mod.affect='EDGES'
        normal=o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL');normal.keep_sharp=True
    return o
def box(parent,name,dims,pos,mat,bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(pos));o=bpy.context.object
    o.dimensions=xyz((dims[0],dims[1],-dims[2]))
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return mesh_finish(o,name,mat,parent,min(bevel,min(dims)*.22))
def cylinder(parent,name,r,depth,pos,mat,axis='z',vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=xyz(pos))
    o=bpy.context.object
    direction=Vector(xyz({'x':(1,0,0),'y':(0,1,0),'z':(0,0,1)}[axis]))
    o.rotation_euler=direction.to_track_quat('Z','Y').to_euler()
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons: p.use_smooth=len(p.vertices)==4
    return mesh_finish(o,name,mat,parent,.004)
def bolt(parent,pos,axis='z'):return cylinder(parent,'Recessed fixing',.013,.009,pos,steel,axis,8)
def vehicle(name,shuttle=False,loop=False):
    r=root(name)
    box(r,'Lower drive frame',(.89,.22,.79),(0,.22,0),dark,.04)
    box(r,'Beveled safety chassis',(1,.30,.92),(0,.43,0),yellow,.055)
    box(r,'Brushed deck',(.88,.09,.87),(0,.625,0),steel,.025)
    # Side service panels, vents, recessed fasteners and independent drive wheels.
    for side in [-1,1]:
        box(r,'Service panel',(.53,.16,.025),(0,.43,side*.466),teal,.012)
        for x in [-.34,.34]:
            cylinder(r,'Polyurethane drive wheel',.13,.07,(x,.19,side*.45),rubber,'z',20)
            cylinder(r,'Wheel hub',.066,.075,(x,.19,side*.451),steel,'z',12)
        for x in [-.23,.23]:bolt(r,(x,.43,side*.481))
        for j in range(5):
            box(r,'Vent slot',(.022,.065,.007),((j-2)*.039,.43,side*.482),dark,.003)
        box(r,'Edge guard',(.96,.075,.045),(0,.69,side*.446),dark,.009)
    for side in [-1,1]:
        box(r,'Impact bumper',(.045,.17,.76),(side*.477,.38,0),rubber,.02)
        for z in [-.27,.27]:
            box(r,'Optical sensor',(.012,.044,.066),(side*.502,.40,z),glass,.006)
    if shuttle:
        for axis in ['x','z']:
            for at in [-.25,.25]:
                p=(at,.715,0) if axis=='z' else (0,.73,at)
                cylinder(r,'Four-way transfer roller',.028,.65,p,steel,axis,12)
        box(r,'Center lifting deck',(.66,.07,.65),(0,.785,0),teal,.02)
        for x in [-.27,.27]:
            box(r,'Transfer chain',(.024,.028,.57),(x,.837,0),dark,.004)
        box(r,'Controller cover',(.16,.15,.22),(-.35,.75,0),teal,.02)
    else:
        # Rollers run along X so goods transfer across Z at stations.
        for j in range(8):
            cylinder(r,'Conveyor roller',.042,.70,(.065,.77,(j-3.5)*.092),steel,'x',16)
        box(r,'Controller cabinet',(.15,.25,.60),(-.36,.765,0),teal,.024)
        for j in range(3):
            box(r,'Controller vent',(.009,.10,.027),(-.441,.77,(j-1)*.075),dark,.002)
    cylinder(r,'Beacon base',.04,.06,(-.36,.895,-.22),dark,'y')
    cylinder(r,'Status beacon',.033,.065,(-.36,.951,-.22),light,'y')
    for z in [-.32,.32]:
        box(r,'Caution reflector',(.06,.03,.004),(.37,.45,z),red,.002)
    r['description']='Four-way wheel shuttle' if shuttle else 'Closed-loop RGV' if loop else 'Linear RGV conveyor'
    return r
def stacker_parts():
    r=root('stacker_base')
    box(r,'Travel bogie',(.93,.42,.80),(0,.36,0),dark,.035)
    box(r,'Base beam',(1,.30,.86),(0,.61,0),yellow,.035)
    for x in [-.33,.33]:
        for z in [-.43,.43]:
            cylinder(r,'Rail drive wheel',.14,.09,(x,.19,z),steel,'z')
            cylinder(r,'Drive hub',.065,.098,(x,.19,z),dark,'z')
    box(r,'Drive motor',(.2,.25,.38),(-.28,.87,0),teal,.025)
    box(r,'Control cabinet',(.21,.22,.65),(.27,.86,0),teal,.018)
    r=root('stacker_mast')
    for x in [-.36,.36]:
        box(r,'Mast structural column',(.18,1,.6),(x,.5,0),yellow,.012)
        box(r,'Precision carriage rail',(.035,.99,.07),(x,.5,.35),steel,.007)
    for j in range(13):
        box(r,'Mast cross tie',(.56,.013,.22),(0,.035+j*.077,0),dark,.003)
    for x in [-.12,.12]:box(r,'Lift transmission belt',(.025,.99,.024),(x,.5,.17),dark,.003)
    box(r,'Top crosshead',(.96,.028,.9),(0,.983,0),yellow,.006)
    r=root('stacker_carriage')
    box(r,'Lift carriage',(.98,.40,.92),(0,.32,0),teal,.035)
    box(r,'Fork bearing plate',(.92,.15,.86),(0,.62,0),steel,.02)
    for x in [-.41,.41]:
        for z in [-.3,.3]:cylinder(r,'Carriage guide roller',.08,.065,(x,.85,z),dark,'x')
    for x in [-.22,.22]:box(r,'Telescopic guide',(.12,.23,.9),(x,.83,0),dark,.014)
    r=root('stacker_fork')
    for x in [-.35,.35]:
        box(r,'Outer telescopic tine',(.25,.48,.85),(x,.25,0),dark,.018)
        box(r,'Sliding steel tine',(.18,.29,1),(x,.64,0),steel,.015)
        for z in [-.35,.35]:bolt(r,(x,.79,z),'y')
    box(r,'Fork cross bearing',(.95,.2,.13),(0,.18,-.42),teal,.01)
def lift():
    r=root('lift')
    box(r,'Lift support frame',(1,.38,1),(0,.26,0),dark,.02)
    box(r,'Lift deck',(1,.22,1),(0,.57,0),teal,.025)
    for j in range(7):cylinder(r,'Lift transfer roller',.05,.82,(0,.8,(j-3)*.13),steel,'x')
    for z in [-.48,.48]:
        box(r,'Lift edge guard',(1,.24,.035),(0,.78,z),yellow,.008)
def pallet():
    r=root('cargo_pallet')
    for z in [-.38,0,.38]:box(r,'Pallet bearer',(.98,.055,.11),(0,.04,z),wood,.01)
    for x in [-.36,0,.36]:
        for z in [-.37,0,.37]:box(r,'Pallet block',(.14,.055,.14),(x,.085,z),wood,.006)
    for j in range(5):box(r,'Pallet top board',(.13,.035,1),((j-2)*.205,.13,0),wood,.006)
    box(r,'Packed load',(.92,.82,.91),(0,.57,0),carton,.018)
    for x in [-.29,.29]:box(r,'Packing strap',(.032,.825,.916),(x,.572,0),strap,.003)
    box(r,'Shipping label',(.19,.19,.002),(.14,.68,.457),white,.001)
    for i in range(7):box(r,'Barcode',(.007,.08,.002),(.08+i*.018,.68,.46),dark,.001)
if '--export-only' not in args:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    yellow=material('Safety yellow','EFB740',.23,.36)
    teal=material('Industrial teal','148892',.35,.35)
    steel=material('Brushed steel','B6C8D4',.7,.29)
    dark=material('Graphite frame','233844',.45,.39)
    rubber=material('Rubber bumper','16212A',0,.72)
    glass=material('Scanner glass','174F71',.55,.15)
    light=material('Green status lens','46EDBA',.15,.2,.65)
    red=material('Safety red','D35740',.1,.45)
    wood=material('Pallet hardwood','BA8C56',0,.7)
    carton=material('Corrugated carton','C99D69',0,.76)
    strap=material('Packing straps','D7C4A1',0,.6)
    white=material('Shipping label','E6E7E2',0,.7)
    vehicle('rgv_linear');vehicle('rgv_loop',loop=True);vehicle('shuttle',shuttle=True);stacker_parts();lift();pallet()
roots=[o for o in bpy.data.objects if o.get('asset_id')]
# Source scene is laid out as an editable asset sheet; each root keeps its local origin.
for i,r in enumerate(roots):r.location=xyz(((i%3)*2.1,0,(i//3)*1.9))
bpy.context.scene.unit_settings.system='METRIC'
bpy.context.scene['provenance']='Created and evaluated in Blender; browser equipment geometry is exported from these mesh objects.'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out,'equipment_models.blend'))
# Export glTF from the same authored scene as an interchange artifact.
bpy.ops.object.select_all(action='DESELECT')
for r in roots:
    r.select_set(True)
    for o in r.children_recursive:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'equipment_models.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True)
deps=bpy.context.evaluated_depsgraph_get()
def blob(vals):
    a=array.array('f',vals)
    if sys.byteorder!='little':a.byteswap()
    return base64.b64encode(a.tobytes()).decode('ascii')
def index_blob(vals):
    a=array.array('I',vals)
    if sys.byteorder!='little':a.byteswap()
    return base64.b64encode(a.tobytes()).decode('ascii')
library={'schema':'blender-equipment@1','blenderVersion':bpy.app.version_string,'axis':'X travel / Y up / Z transverse','models':{}}
for r in roots:
    bymat={}
    inv=r.matrix_world.inverted()
    for o in r.children_recursive:
        if o.type!='MESH':continue
        evaluated=o.evaluated_get(deps);mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
        transform=inv@o.matrix_world;normalmatrix=transform.to_3x3().inverted().transposed()
        for tri in mesh.loop_triangles:
            mat=mesh.materials[tri.material_index];key=mat.name
            entry=bymat.setdefault(key,{'pos':[],'normal':[],'index':[],'map':{},'mat':mat})
            for loop_index in tri.loops:
                v=transform@mesh.vertices[mesh.loops[loop_index].vertex_index].co
                n=(normalmatrix@mesh.corner_normals[loop_index].vector).normalized()
                point=[round(v.x,7),round(v.z,7),round(-v.y,7)]
                normal=[round(n.x,7),round(n.z,7),round(-n.y,7)]
                code=tuple(point+normal)
                if code not in entry['map']:
                    entry['map'][code]=len(entry['pos'])//3;entry['pos'].extend(point);entry['normal'].extend(normal)
                entry['index'].append(entry['map'][code])
        evaluated.to_mesh_clear()
    parts=[]
    for name,e in bymat.items():
        node=e['mat'].node_tree.nodes.get('Principled BSDF')
        parts.append({'material':name,'color':list(node.inputs['Base Color'].default_value)[:3],'metalness':node.inputs['Metallic'].default_value,'roughness':node.inputs['Roughness'].default_value,'emissive':list(node.inputs['Emission Color'].default_value)[:3],'emissiveIntensity':node.inputs['Emission Strength'].default_value,'position':blob(e['pos']),'normal':blob(e['normal']),'index':index_blob(e['index']),'vertices':len(e['pos'])//3,'triangles':len(e['index'])//3})
    library['models'][r['asset_id']]={'parts':parts,'triangles':sum(p['triangles'] for p in parts)}
with open(os.path.join(out,'mesh_library.json'),'w',encoding='utf8') as f:json.dump(library,f,separators=(',',':'))
manifest={'blenderVersion':bpy.app.version_string,'models':{n:{'triangles':v['triangles'],'materials':len(v['parts'])} for n,v in library['models'].items()},'files':{}}
for name in ['equipment_models.blend','equipment_models.glb','mesh_library.json']:
    with open(os.path.join(out,name),'rb') as f:data=f.read()
    manifest['files'][name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
with open(os.path.join(out,'asset_manifest.json'),'w',encoding='utf8') as f:json.dump(manifest,f,indent=2)
print('BLENDER_ASSETS_READY '+json.dumps(manifest['models']))

