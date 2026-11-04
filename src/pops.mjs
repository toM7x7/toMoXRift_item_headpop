import {DoubleSide,Group,Matrix4,Mesh,MeshBasicMaterial,Quaternion,Vector3} from 'three'
import {popMotion} from './motion.mjs'
import {ICON_SIZE_M} from './head.mjs'

const POOL_SIZE=16
const _p=new Vector3(),_s=new Vector3(),_pq=new Quaternion(),_m=new Matrix4(),UP=new Vector3(0,1,0)

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
 * render hook. No React work per pop.
 * @param {{layer:import('three').Object3D,texture:any,geometries:any[],tracker:ReturnType<import('./head.mjs').createHeadTracker>,getLocalId:()=>string|null,now:()=>number}} options
 */
export function createPopRuntime({layer,texture,geometries,tracker,getLocalId,now}){
 const slots=Array.from({length:POOL_SIZE},()=>{
  const holder=new Group(),material=new MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:DoubleSide,toneMapped:false,alphaTest:.02})
  const mesh=new Mesh(geometries[0],material)
  mesh.scale.setScalar(ICON_SIZE_M);mesh.renderOrder=12;mesh.frustumCulled=false
  holder.add(mesh);holder.visible=false;holder.matrixAutoUpdate=true;layer.add(holder)
  return {holder,mesh,material,userId:null,icon:0,start:0,seq:0,source:null,position:new Vector3()}
 })
 const active=new Map()
 let seq=0
 const release=slot=>{active.delete(slot.userId);tracker.forget(slot.userId);slot.userId=null;slot.holder.visible=false}
 const camQ=new Quaternion(),camP=new Vector3()
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
   return slot.seq
  },
  place(){
   const t=now(),localId=getLocalId()
   for(const slot of [...active.values()]){
    const m=popMotion(slot.icon,t-slot.start)
    if(m.done){release(slot);continue}
    const source=tracker.locate(slot.userId,localId,t,slot.position)
    slot.source=source
    if(!source||!m.visible){slot.holder.visible=false;continue}
    slot.holder.visible=true
    slot.mesh.position.set(m.dx,m.dy,0);slot.mesh.rotation.set(0,0,m.rot)
    slot.mesh.scale.set(ICON_SIZE_M*Math.max(1e-4,m.sx),ICON_SIZE_M*Math.max(1e-4,m.sy),1)
    slot.material.opacity=m.opacity;slot.material.color.setScalar(1+.45*m.glow)
   }
  },
  /** Upright billboard toward this render's camera (no head-roll tilt in VR). */
  face(camera){
   if(!active.size)return
   camera.getWorldPosition(camP)
   for(const slot of active.values()){
    if(!slot.holder.visible)continue
    camQ.setFromRotationMatrix(_m.lookAt(camP,slot.position,UP))
    setWorldTransform(slot.holder,slot.position,camQ,1)
   }
  },
  report(){return [...active.values()].map(s=>({userId:s.userId,icon:s.icon,seq:s.seq,age:now()-s.start,source:s.source,visible:s.holder.visible,position:s.position.toArray()}))},
  dispose(){for(const s of slots){s.material.dispose();layer.remove(s.holder)}active.clear()},
 }
}
