import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,Mesh,MeshBasicMaterial,PerspectiveCamera,PlaneGeometry,Scene,Vector3} from 'three'
import {createSignFinder,SIGN_DIM_OPACITY,SIGN_DIM_SCALE,SIGN_GAP_M} from '../src/sign.mjs'
import {createHeadTracker,ICON_SIZE_M} from '../src/head.mjs'
import {createPopRuntime,TOWARD_VIEWER_M} from '../src/pops.mjs'
import {attachRenderHook} from '../src/render-hook.mjs'
import {BURST_S,POP_IN_S,POP_TOTAL_S,burstMotion,yieldEnvelope} from '../src/motion.mjs'

/** The shape of a worn 頭上看板 v8: root with userData.presence, tag group, tag-menu Interactable, plate. */
function headTag(owner,at=[5,2.2,5]){
 const root=new Group();root.userData.presence={ownerId:owner,phase:'ready'}
 const tag=new Group();tag.position.fromArray(at)
 const interactable=new Group();interactable.userData={id:'k1:presence:tag-menu',onInteract(){},enabled:true}
 const plate=new Mesh(new PlaneGeometry(.72,.17),new MeshBasicMaterial({transparent:true}))
 interactable.add(plate);tag.add(interactable);root.add(tag)
 return {root,tag,plate}
}
const users={getLocalMovement:()=>({position:{x:5,y:0,z:5}}),getMovement:()=>({position:{x:-2,y:0,z:0}}),getLocalAvatarHeight:()=>({height:1.5}),getAvatarHeight:()=>undefined}

test('finds the tag by its wearer and measures the plate top',()=>{
 const scene=new Scene(),{root,tag}=headTag('me');scene.add(root);scene.updateMatrixWorld(true)
 const signs=createSignFinder({scene}),out=new Vector3()
 signs.scan(0)
 const s=signs.locate('me',out)
 assert.ok(s);assert.ok(Math.abs(s.top-(2.2+.085))<1e-6,`top=${s?.top}`)
 assert.equal(signs.locate('you',out),null)
 tag.visible=false
 assert.equal(signs.locate('me',out),null,'a hidden tag (wearer not found) does not count')
 tag.visible=true;scene.remove(root)
 assert.equal(signs.locate('me',out),null,'a removed tag does not count')
})

test('a reaction stacks above the tag, the tag steps back, and is restored after the render',()=>{
 const scene=new Scene(),layer=new Group(),{root,plate}=headTag('me');scene.add(root,layer);scene.updateMatrixWorld(true)
 let t=0
 const geometries=Array.from({length:8},()=>new PlaneGeometry(1,1))
 const signs=createSignFinder({scene})
 const pops=createPopRuntime({layer,texture:null,geometries,tracker:createHeadTracker({scene,excludeRoot:layer,users}),getLocalId:()=>'me',now:()=>t,signs,burstTexture:{}})
 pops.show('me',2);pops.show('other',0)
 t=.05;pops.place()
 let r=Object.fromEntries(pops.report().map(p=>[p.userId,p]))
 assert.ok(r.me.burst,'burst at pop-in');assert.equal(r.other.burst,true)
 t=POP_IN_S+.5;pops.place()
 r=Object.fromEntries(pops.report().map(p=>[p.userId,p]))
 assert.equal(r.me.stacked,true);assert.equal(r.other.stacked,false)
 assert.ok(Math.abs(r.me.position[1]-(2.2+.085+SIGN_GAP_M+ICON_SIZE_M/2))<1e-6,'bottom edge clears the plate top')
 assert.deepEqual([r.me.position[0],r.me.position[2]],[5,5],'in line with the tag')
 assert.equal(r.me.burst,false,'burst is over')
 assert.equal(r.me.yielded,1)
 assert.ok(Math.abs(plate.material.opacity-SIGN_DIM_OPACITY)<1e-9);assert.ok(Math.abs(plate.scale.x-SIGN_DIM_SCALE)<1e-9)
 // the same plate measured mid-dim still reports its full size
 assert.ok(Math.abs(signs.locate('me',new Vector3()).top-(2.2+.085))<1e-6)
 pops.after()
 assert.equal(plate.material.opacity,1);assert.equal(plate.scale.x,1)
 t=POP_TOTAL_S+.01;pops.place();pops.after()
 assert.equal(plate.material.opacity,1,'nothing left changed after the pop')
 pops.dispose()
})

test('drawn toward each viewer so a plate at the same spot cannot hide it',()=>{
 const scene=new Scene(),layer=new Group();scene.add(layer)
 const geometries=Array.from({length:8},()=>new PlaneGeometry(1,1))
 const pops=createPopRuntime({layer,texture:null,geometries,tracker:createHeadTracker({scene,excludeRoot:layer,users}),getLocalId:()=>'me',now:()=>POP_IN_S+.2})
 const camera=new PerspectiveCamera();camera.position.set(5,2,10);camera.updateMatrixWorld(true)
 pops.show('me',1);pops.place();pops.face(camera)
 const at=pops.report()[0].position,holder=layer.children.find(c=>c.visible).getWorldPosition(new Vector3())
 const base=new Vector3().fromArray(at)
 assert.ok(Math.abs(holder.distanceTo(base)-TOWARD_VIEWER_M)<1e-6)
 assert.ok(camera.position.distanceTo(holder)<camera.position.distanceTo(base))
})

test('render hook calls after() once per outermost render',()=>{
 const scene=new Scene(),calls=[]
 const h=attachRenderHook(scene,{place:()=>calls.push('place'),face:()=>calls.push('face'),after:()=>calls.push('after')})
 const cam=new PerspectiveCamera()
 scene.onBeforeRender(null,scene,cam,null);scene.onBeforeRender(null,scene,cam,null)
 scene.onAfterRender(null,scene,cam);scene.onAfterRender(null,scene,cam)
 assert.deepEqual(calls,['place','face','face','face','after'])
 h.dispose()
})

test('burst flares and fades early; the tag steps back for the whole pop',()=>{
 assert.equal(burstMotion(0).visible,true);assert.ok(burstMotion(BURST_S*.9).opacity<.2);assert.equal(burstMotion(BURST_S).visible,false)
 assert.equal(yieldEnvelope(0),0);assert.equal(yieldEnvelope(1),1);assert.equal(yieldEnvelope(POP_TOTAL_S),0)
 assert.ok(yieldEnvelope(POP_TOTAL_S-.1)<.5)
})
