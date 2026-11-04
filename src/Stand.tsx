import {useEffect,useMemo,useRef} from 'react'
import {useFrame} from '@react-three/fiber'
import {Interactable} from '@xrift/world-components'
import {CanvasTexture,Group,Mesh,MeshBasicMaterial,Vector3,type PlaneGeometry,type Texture} from 'three'
import {flight,stepFlight} from './flight.mjs'
import {standMotion} from './motion.mjs'

export const STAND_HEIGHT_M=1.25
const SIZE_M=.34
const _v=new Vector3()

/**
 * - live: the room's one active stand; keeps popping through the reactions.
 * - ghost: an extra copy in the same room; grey and still, does nothing.
 * - preview / preview-blocked: while placing. A floor ring and a stem show exactly where
 *   it lands; grey when the room already has one.
 */
export type StandMode='live'|'ghost'|'preview'|'preview-blocked'
/** Where the stand is between its spot and the wearer's head (see flight.mjs). */
export type StandFlight={p:number;kind:'head'|'shrink';away:boolean;target:'head'|'movement'|null;icon:number}

function useSoftShadow(){
 const texture=useMemo(()=>{
  const c=document.createElement('canvas');c.width=c.height=64
  const g=c.getContext('2d')!,grad=g.createRadialGradient(32,32,0,32,32,32)
  grad.addColorStop(0,'rgba(0,0,0,0.55)');grad.addColorStop(.6,'rgba(0,0,0,0.22)');grad.addColorStop(1,'rgba(0,0,0,0)')
  g.fillStyle=grad;g.fillRect(0,0,64,64)
  return new CanvasTexture(c)
 },[])
 useEffect(()=>()=>texture.dispose(),[texture])
 return texture
}

export function Stand({id,mode,texture,geometries,interactionText,enabled,onInteract,away=false,worn=false,locateHead,now,state}:{
 id:string;mode:StandMode;texture:Texture;geometries:PlaneGeometry[];interactionText:string;enabled:boolean;onInteract:()=>void
 /** Leave the spot for this user (they are wearing one and can open the palette without it). */
 away?:boolean
 /** This copy is the one being worn: it hops to the head instead of folding away. */
 worn?:boolean
 locateHead?:(out:Vector3)=>'head'|'movement'|null
 now:()=>number
 /** Written every frame, for the dev readback. */
 state?:StandFlight
}){
 const facing=useRef<Group>(null),icon=useRef<Mesh>(null),material=useRef<MeshBasicMaterial>(null)
 const floor=useRef<Mesh>(null),floorMaterial=useRef<MeshBasicMaterial>(null)
 const fly=useRef<StandFlight>({p:0,kind:'shrink',away:false,target:null,icon:0}),last=useRef<number|null>(null),born=useRef(true)
 const tmp=useMemo(()=>({target:new Vector3(),local:new Vector3()}),[])
 const shadow=useSoftShadow()
 const preview=mode==='preview'||mode==='preview-blocked',grey=mode==='ghost'||mode==='preview-blocked'
 const live=mode==='live',leaving=live&&away
 useFrame(({clock,camera})=>{
  const t=clock.elapsedTime,n=now(),dt=last.current===null?0:Math.max(0,Math.min(.25,n-last.current));last.current=n
  const f=fly.current
  // Already worn when it appears (joined late): already gone, no hop.
  if(born.current){born.current=false;if(leaving){f.kind=worn&&locateHead?'head':'shrink';f.p=1}}
  // The kind is chosen as it leaves and kept for the trip back.
  if(f.p===0&&leaving)f.kind=worn&&locateHead?'head':'shrink'
  f.p=live?stepFlight(f.p,leaving,dt):0;f.away=leaving
  const m=flight(f.p,f.kind)
  const g=facing.current
  if(g){
   // Turn toward the viewer around the vertical axis only.
   camera.getWorldPosition(_v);g.parent?.worldToLocal(_v)
   g.rotation.set(0,Math.atan2(_v.x-g.position.x,_v.z-g.position.z),0)
   g.updateMatrixWorld()
  }
  if(floor.current&&floorMaterial.current){
   floorMaterial.current.opacity=(grey?.35:preview?.7:.8)*m.shadow
   floor.current.visible=m.shadow>0
  }
  if(state)Object.assign(state,f)
  if(!icon.current||!material.current)return
  icon.current.visible=m.visible
  material.current.opacity=(grey?.55:1)*m.opacity
  if(live){
   // In flight it keeps the face it left with (no swapping mid-air).
   const cycle=standMotion(t),s=f.p>0?{icon:f.icon,dy:0,sx:1,sy:1}:cycle
   if(f.p===0)f.icon=cycle.icon
   icon.current.geometry=geometries[s.icon]
   let x=0,y=s.dy+m.lift,z=0
   f.target=null
   if(f.kind==='head'&&f.p>0&&f.p<1&&g){ // only in flight: no head search while it is away
    f.target=locateHead?.(tmp.target)??null
    if(f.target){
     g.worldToLocal(tmp.local.copy(tmp.target))
     x=tmp.local.x*m.along;y=s.dy+(tmp.local.y-s.dy)*m.along+m.lift;z=tmp.local.z*m.along
    }
   }
   if(state)state.target=f.target
   icon.current.position.set(x,y,z)
   icon.current.scale.set(SIZE_M*s.sx*Math.max(1e-4,m.scale),SIZE_M*s.sy*Math.max(1e-4,m.scale),1)
  }else{
   // Still: 👍 while placing, ！ for an extra copy.
   icon.current.geometry=geometries[mode==='ghost'?0:3]
   icon.current.position.set(0,0,0);icon.current.scale.set(SIZE_M,SIZE_M,1)
  }
 })
 const iconColor=grey?'#9aa0a8':'#ffffff'
 return <group>
  {/* Floor: soft shadow when placed, a clear ring + stem while placing. */}
  <mesh ref={floor} rotation={[-Math.PI/2,0,0]} position={[0,.004,0]} renderOrder={1}>
   <planeGeometry args={[.46,.46]}/>
   <meshBasicMaterial ref={floorMaterial} map={shadow} transparent depthWrite={false} toneMapped={false}/>
  </mesh>
  {preview&&<>
   <mesh rotation={[-Math.PI/2,0,0]} position={[0,.008,0]} renderOrder={2}>
    <ringGeometry args={[.19,.225,48]}/>
    <meshBasicMaterial color={grey?'#9aa0a8':'#ffffff'} transparent opacity={.95} depthWrite={false} toneMapped={false}/>
   </mesh>
   <mesh position={[0,(STAND_HEIGHT_M-SIZE_M*.45)/2,0]} renderOrder={2}>
    <cylinderGeometry args={[.006,.006,STAND_HEIGHT_M-SIZE_M*.45,8]}/>
    <meshBasicMaterial color={grey?'#9aa0a8':'#ffffff'} transparent opacity={.75} depthWrite={false} toneMapped={false}/>
   </mesh>
  </>}
  <group ref={facing} position={[0,STAND_HEIGHT_M,0]}>
   <mesh ref={icon} geometry={geometries[0]} renderOrder={6} frustumCulled={false}>
    <meshBasicMaterial ref={material} map={texture} color={iconColor} transparent depthWrite={false} toneMapped={false} alphaTest={.02}/>
   </mesh>
   {/* Nothing to select while it is away; it comes back when taken off. */}
   {!preview&&!leaving&&<Interactable key={mode} id={`${id}:head-pop:stand`} interactionText={interactionText} enabled={enabled} onInteract={onInteract}>
    <mesh>
     <circleGeometry args={[SIZE_M*.58,24]}/>
     <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false}/>
    </mesh>
   </Interactable>}
  </group>
 </group>
}
