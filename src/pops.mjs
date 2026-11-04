import {Color,DoubleSide,Group,Matrix4,Mesh,MeshBasicMaterial,PlaneGeometry,Quaternion,Vector3} from 'three'
import {burstMotion,popMotion,yieldEnvelope} from './motion.mjs'
import {ICON_SIZE_M} from './head.mjs'
import {ICONS} from './icons.mjs'
import {SIGN_GAP_M} from './sign.mjs'

const POOL_SIZE=16
/** Drawn this far toward each viewer, so a plate at the same spot (a head tag, a name label)
 * never hides or flickers through the reaction. Real depth, so walls still hide it. */
export const TOWARD_VIEWER_M=.12
/** Burst size relative to the icon. */
const BURST_SIZE=1.9
const _p=new Vector3(),_s=new Vector3(),_pq=new Quaternion(),_m=new Matrix4(),UP=new Vector3(0,1,0)
const _dir=new Vector3(),_at=new Vector3()

/** Put `object` at a world transform regardless of its parent's transform. */
export function setWorldTransform(object,position,quaternion,scale=1){
 const parent=object.parent
 if(parent){
  parent.updateWorldMatrix(true,false)
  object.position.copy(parent.worldToLocal(_p.copy(position)))
  parent.getWorldQuaternion(_pq)
  object.quaternion.copy(_pq.invert().multiply(quaternion))
  parent.getWorldScale(_s)
  object.scale.set(scale/(_s.x||1),scale/(_s.y||1),scale/(_s.z||1))
 }else{object.position.copy(position);object.quaternion.copy(quaternion);object.scale.setScalar(scale)}
 object.updateMatrixWorld(true)
}

/**
 * Pooled head icons. show() starts (or restarts) a user's pop; place()/face() run from the
 * render hook, after() once the outermost render is done. No React work per pop.
 * @param {{layer:import('three').Object3D,texture:any,geometries:any[],tracker:ReturnType<import('./head.mjs').createHeadTracker>,getLocalId:()=>string|null,now:()=>number,signs?:ReturnType<import('./sign.mjs').createSignFinder>|null,burstTexture?:any}} options
 */
export function createPopRuntime({layer,texture,geometries,tracker,getLocalId,now,signs=null,burstTexture=null}){
 const burstGeometry=new PlaneGeometry(1,1)
 const slots=Array.from({length:POOL_SIZE},()=>{
  const holder=new Group(),material=new MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:DoubleSide,toneMapped:false,alphaTest:.02})
  const mesh=new Mesh(geometries[0],material)
  mesh.scale.setScalar(ICON_SIZE_M);mesh.renderOrder=12;mesh.frustumCulled=false
  holder.add(mesh)
  const burstMaterial=new MeshBasicMaterial({map:burstTexture,transparent:true,depthWrite:false,side:DoubleSide,toneMapped:false})
  const burst=new Mesh(burstGeometry,burstMaterial)
  burst.renderOrder=11;burst.frustumCulled=false;burst.visible=false;burst.position.z=-.01
  holder.add(burst)
  holder.visible=false;holder.matrixAutoUpdate=true;layer.add(holder)
  return {holder,mesh,material,burst,burstMaterial,userId:null,icon:0,start:0,seq:0,source:null,stacked:false,yielded:0,position:new Vector3()}
 })
 const active=new Map()
 let seq=0
 const release=slot=>{active.delete(slot.userId);tracker.forget(slot.userId);slot.userId=null;slot.holder.visible=false}
 const camQ=new Quaternion(),camP=new Vector3()
 /** Where userId's reaction goes: above the head, or above their head tag if they wear one. */
 function resolve(userId,localId,t,out){
  const source=tracker.locate(userId,localId,t,out)
  if(!source||!signs)return {source,sign:null}
  signs.scan(t)
  const sign=signs.locate(userId,_at)
  if(sign)out.set(sign.x,sign.top+SIGN_GAP_M+ICON_SIZE_M/2,sign.z)
  return {source,sign}
 }
 return {
  /** Start a pop over userId's head; the same user's previous pop is replaced. */
  show(userId,icon){
   let slot=active.get(userId)
   if(!slot){
    slot=slots.find(s=>!s.userId)??[...active.values()].sort((a,b)=>a.start-b.start)[0]
    if(slot.userId)release(slot)
    slot.userId=userId;active.set(userId,slot)
   }
   slot.icon=icon;slot.start=now();slot.seq=++seq;slot.mesh.geometry=geometries[icon]
   slot.burstMaterial.color.set(ICONS[icon]?.color??'#ffffff')
   return slot.seq
  },
  place(){
   const t=now(),localId=getLocalId()
   for(const slot of [...active.values()]){
    const age=t-slot.start,m=popMotion(slot.icon,age)
    if(m.done){release(slot);continue}
    const {source,sign}=resolve(slot.userId,localId,t,slot.position)
    slot.source=source;slot.stacked=!!sign;slot.yielded=0
    if(!source||!m.visible){slot.holder.visible=false;continue}
    // The reaction is the news: the tag under it steps back while it shows.
    if(sign){slot.yielded=yieldEnvelope(age);signs?.dim(sign.sign,slot.yielded)}
    slot.holder.visible=true
    slot.mesh.position.set(m.dx,m.dy,0);slot.mesh.rotation.set(0,0,m.rot)
    slot.mesh.scale.set(ICON_SIZE_M*Math.max(1e-4,m.sx),ICON_SIZE_M*Math.max(1e-4,m.sy),1)
    slot.material.opacity=m.opacity;slot.material.color.setScalar(1+.45*m.glow)
    const b=burstMotion(age)
    slot.burst.visible=!!burstTexture&&b.visible
    if(slot.burst.visible){
     slot.burst.position.set(m.dx,m.dy,-.01);slot.burst.rotation.set(0,0,b.rot)
     slot.burst.scale.setScalar(ICON_SIZE_M*BURST_SIZE*b.scale)
     slot.burstMaterial.opacity=b.opacity
    }
   }
  },
  /** Upright billboard toward this render's camera (no head-roll tilt in VR), pulled toward it. */
  face(camera){
   if(!active.size)return
   camera.getWorldPosition(camP)
   for(const slot of active.values()){
    if(!slot.holder.visible)continue
    _dir.copy(camP).sub(slot.position)
    const d=_dir.length()
    _at.copy(slot.position)
    if(d>1e-3)_at.addScaledVector(_dir,Math.min(TOWARD_VIEWER_M,d*.5)/d)
    camQ.setFromRotationMatrix(_m.lookAt(camP,_at,UP))
    setWorldTransform(slot.holder,_at,camQ,1)
   }
  },
  /** After the outermost render: head tags go back exactly as they were. */
  after(){signs?.restore()},
  /** Where userId's pops appear right now (for the stand's hop to the head). */
  locate(userId,out){return resolve(userId,getLocalId(),now(),out).source},
  report(){return [...active.values()].map(s=>({userId:s.userId,icon:s.icon,seq:s.seq,age:now()-s.start,source:s.source,stacked:s.stacked,yielded:+s.yielded.toFixed(3),visible:s.holder.visible,burst:s.burst.visible,position:s.position.toArray()}))},
  dispose(){signs?.restore();for(const s of slots){s.material.dispose();s.burstMaterial.dispose();layer.remove(s.holder)}burstGeometry.dispose();active.clear()},
 }
}
