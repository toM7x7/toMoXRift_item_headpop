import {Bone,BufferGeometry,CapsuleGeometry,Float32BufferAttribute,Group,MeshStandardMaterial,Skeleton,SkinnedMesh,SphereGeometry,Uint16BufferAttribute,BoxGeometry,Mesh} from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'

/** Development-only humanoid: a skinned mesh whose head bone is literally named "Head",
 * like VRM/Mixamo rigs, so the production head detection runs unchanged. */
export type Mannequin={root:Group;head:Bone;step:(t:number)=>void;dispose:()=>void;height:number;eyeHeight:number}

function part(geometry:BufferGeometry,bone:number,x:number,y:number,z:number,sx=1,sy=1,sz=1){
 geometry.scale(sx,sy,sz);geometry.translate(x,y,z)
 const n=geometry.getAttribute('position').count
 geometry.setAttribute('skinIndex',new Uint16BufferAttribute(new Uint16Array(n*4).map((_,i)=>i%4===0?bone:0),4))
 geometry.setAttribute('skinWeight',new Float32BufferAttribute(new Float32Array(n*4).map((_,i)=>i%4===0?1:0),4))
 return geometry
}

export function createMannequin(color:string,phase=0):Mannequin{
 const hips=new Bone(),spine=new Bone(),neck=new Bone(),head=new Bone()
 hips.name='Hips';spine.name='Spine';neck.name='Neck';head.name='Head'
 hips.position.set(0,.95,0);spine.position.set(0,.25,0);neck.position.set(0,.3,0);head.position.set(0,.08,0)
 hips.add(spine);spine.add(neck);neck.add(head)
 const body=mergeGeometries([
  part(new CapsuleGeometry(.075,.72,4,12),0,-.1,.48,0), // legs (hips)
  part(new CapsuleGeometry(.075,.72,4,12),0,.1,.48,0),
  part(new CapsuleGeometry(.17,.42,6,16),1,0,1.2,0,1,1,.72), // torso (spine)
  part(new CapsuleGeometry(.055,.5,4,10),1,-.25,1.16,0), // arms
  part(new CapsuleGeometry(.055,.5,4,10),1,.25,1.16,0),
  part(new CapsuleGeometry(.05,.06,4,8),2,0,1.5,0), // neck
  part(new SphereGeometry(.125,24,16),3,0,1.67,0,1,1.08,1), // head
  part(new BoxGeometry(.17,.045,.03),3,0,1.69,.112), // visor: shows which way it faces (+Z)
 ])!
 const mesh=new SkinnedMesh(body,new MeshStandardMaterial({color,roughness:.6}))
 mesh.add(hips);mesh.bind(new Skeleton([hips,spine,neck,head]))
 mesh.castShadow=true
 const root=new Group();root.add(mesh)
 return {
  root,head,height:1.81,eyeHeight:1.68,
  step(t){
   head.rotation.set(Math.sin(t*.9+phase)*.08,Math.sin(t*.6+phase)*.25,Math.sin(t*.7+phase)*.05)
   spine.rotation.set(0,0,Math.sin(t*.8+phase)*.03)
  },
  dispose(){body.dispose();(mesh.material as MeshStandardMaterial).dispose();mesh.skeleton.dispose()},
 }
}

/** A box avatar without any bones: exercises the foot-position + height fallback. */
export function createBoxAvatar(color:string){
 const root=new Group(),geometry=new BoxGeometry(.42,1.7,.3),material=new MeshStandardMaterial({color,roughness:.7})
 const box=new Mesh(geometry,material);box.position.y=.85;root.add(box)
 return {root,height:1.7,dispose(){geometry.dispose();material.dispose()}}
}
