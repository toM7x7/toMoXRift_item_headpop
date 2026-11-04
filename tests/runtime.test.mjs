import test from 'node:test'
import assert from 'node:assert/strict'
import {Bone,Float32BufferAttribute,Group,MeshBasicMaterial,PerspectiveCamera,PlaneGeometry,Quaternion,Scene,Skeleton,SkinnedMesh,SphereGeometry,Uint16BufferAttribute,Vector3} from 'three'
import {createHeadTracker,ICON_CLEARANCE_M} from '../src/head.mjs'
import {attachRenderHook} from '../src/render-hook.mjs'
import {createPopRuntime} from '../src/pops.mjs'
import {POP_IN_S,POP_TOTAL_S} from '../src/motion.mjs'

function humanoid(headTop=1.8){
 const hips=new Bone(),head=new Bone();hips.name='Hips';head.name='Head'
 hips.position.y=1;head.position.y=headTop-1-.2;hips.add(head)
 const g=new SphereGeometry(.12,8,6);g.translate(0,headTop-.12,0)
 const n=g.getAttribute('position').count
 g.setAttribute('skinIndex',new Uint16BufferAttribute(new Uint16Array(n*4).map((_,i)=>i%4===0?1:0),4))
 g.setAttribute('skinWeight',new Float32BufferAttribute(new Float32Array(n*4).map((_,i)=>i%4===0?1:0),4))
 const mesh=new SkinnedMesh(g,new MeshBasicMaterial());mesh.add(hips);mesh.bind(new Skeleton([hips,head]))
 const root=new Group();root.add(mesh);return {root,head}
}
const users=(over={})=>({getLocalMovement:()=>({position:{x:5,y:0,z:5}}),getMovement:id=>id==='far'?undefined:{position:{x:-2,y:.5,z:0}},getLocalAvatarHeight:()=>({height:1.5,eyeHeight:1.4}),getAvatarHeight:()=>undefined,...over})

test('local head: icon sits above the measured head top',()=>{
 const scene=new Scene(),{root}=humanoid(1.8);scene.add(root);scene.updateMatrixWorld(true)
 const tracker=createHeadTracker({scene,excludeRoot:null,users:users()}),out=new Vector3()
 assert.equal(tracker.locate('me','me',0,out),'head')
 assert.ok(Math.abs(out.y-(1.8+ICON_CLEARANCE_M))<.01,`y=${out.y}`)
 assert.ok(Math.abs(out.x)<.01&&Math.abs(out.z)<.01)
})

test('remote head is found only under its own remote-player marker',()=>{
 const scene=new Scene(),mine=humanoid(1.6),theirs=humanoid(2.0)
 const holder=new Group();holder.position.set(3,0,0);holder.add(theirs.root)
 const marker=new Group();marker.userData={id:'remote-player-them',onInteract(){}};holder.add(marker)
 scene.add(mine.root,holder);scene.updateMatrixWorld(true)
 const tracker=createHeadTracker({scene,excludeRoot:null,users:users()}),out=new Vector3()
 assert.equal(tracker.locate('them','me',0,out),'head')
 assert.ok(Math.abs(out.x-3)<.01&&Math.abs(out.y-(2+ICON_CLEARANCE_M))<.01)
 assert.equal(tracker.locate('me','me',0,out),'head','local head ignores the claimed remote rig')
 assert.ok(Math.abs(out.y-(1.6+ICON_CLEARANCE_M))<.01)
})

test('no rig: falls back to feet + avatar height; unknown user gives nothing',()=>{
 const scene=new Scene(),tracker=createHeadTracker({scene,excludeRoot:null,users:users()}),out=new Vector3()
 assert.equal(tracker.locate('me','me',0,out),'movement')
 assert.deepEqual(out.toArray().map(v=>+v.toFixed(3)),[5,+(1.5+ICON_CLEARANCE_M).toFixed(3),5])
 assert.equal(tracker.locate('other','me',0,out),'movement')
 assert.ok(Math.abs(out.y-(.5+1.65+ICON_CLEARANCE_M))<1e-9,'default height for remote users')
 assert.equal(tracker.locate('far','me',0,out),null)
})

test('two identical local rigs are ambiguous, so the fallback is used',()=>{
 const scene=new Scene();scene.add(humanoid(1.7).root,humanoid(1.7).root);scene.updateMatrixWorld(true)
 const tracker=createHeadTracker({scene,excludeRoot:null,users:users()})
 assert.equal(tracker.locate('me','me',0,new Vector3()),'movement')
})

test('render hook chains, places once per outer render, re-faces nested cameras, and unwraps',()=>{
 const scene=new Scene(),calls=[]
 scene.onBeforeRender=()=>calls.push('host-before');scene.onAfterRender=()=>calls.push('host-after')
 const original=scene.onBeforeRender
 const a=attachRenderHook(scene,{place:c=>calls.push('place:'+c.name),face:c=>calls.push('face:'+c.name)})
 const outer=new PerspectiveCamera(),mirror=new PerspectiveCamera();outer.name='outer';mirror.name='mirror'
 scene.onBeforeRender(null,scene,outer,null)
 scene.onBeforeRender(null,scene,mirror,null)
 scene.onAfterRender(null,scene,mirror)
 scene.onAfterRender(null,scene,outer)
 assert.deepEqual(calls,['host-before','place:outer','face:outer','host-before','face:mirror','host-after','face:outer','host-after'])
 const b=attachRenderHook(scene,{place(){throw new Error('boom')},face(){}})
 const warn=console.warn;console.warn=()=>{}
 try{assert.doesNotThrow(()=>scene.onBeforeRender(null,scene,outer,null))}finally{console.warn=warn}
 scene.onAfterRender(null,scene,outer)
 a.dispose();b.dispose()
 assert.equal(scene.onBeforeRender,original)
})

test('pop runtime: shows, replaces per user, faces the camera upright, expires',()=>{
 const scene=new Scene(),layer=new Group();scene.add(layer)
 let t=0
 const geometries=Array.from({length:8},()=>new PlaneGeometry(1,1))
 const tracker=createHeadTracker({scene,excludeRoot:layer,users:users()})
 const pops=createPopRuntime({layer,texture:null,geometries,tracker,getLocalId:()=>'me',now:()=>t})
 const camera=new PerspectiveCamera();camera.position.set(5,2,10);camera.updateMatrixWorld(true)
 const s1=pops.show('me',2),s2=pops.show('me',5)
 assert.ok(s2>s1)
 assert.equal(pops.report().length,1,'same user replaces')
 assert.equal(pops.report()[0].icon,5)
 pops.show('other',0)
 t=POP_IN_S+.5;pops.place();pops.face(camera)
 const rep=pops.report()
 assert.equal(rep.length,2)
 assert.ok(rep.every(r=>r.visible&&r.source==='movement'))
 for(const holder of layer.children.filter(c=>c.visible)){
  const q=holder.getWorldQuaternion(new Quaternion())
  const normal=new Vector3(0,0,1).applyQuaternion(q).setY(0).normalize()
  const toCam=camera.position.clone().sub(holder.getWorldPosition(new Vector3())).setY(0).normalize()
  assert.ok(normal.dot(toCam)>.99,'faces the camera')
  assert.ok(Math.abs(new Vector3(1,0,0).applyQuaternion(q).y)<1e-6,'no roll')
 }
 t=POP_TOTAL_S+.01;pops.place()
 assert.equal(pops.report().length,0)
 pops.dispose()
 assert.equal(layer.children.length,0)
})
