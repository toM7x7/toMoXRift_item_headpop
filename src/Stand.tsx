import {useEffect,useMemo,useRef} from 'react'
import {useFrame} from '@react-three/fiber'
import {Interactable} from '@xrift/world-components'
import {CanvasTexture,Group,Mesh,MeshBasicMaterial,Vector3,type PlaneGeometry,type Texture} from 'three'
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

export function Stand({id,mode,texture,geometries,interactionText,enabled,onInteract}:{id:string;mode:StandMode;texture:Texture;geometries:PlaneGeometry[];interactionText:string;enabled:boolean;onInteract:()=>void}){
 const facing=useRef<Group>(null),icon=useRef<Mesh>(null),material=useRef<MeshBasicMaterial>(null)
 const shadow=useSoftShadow()
 const preview=mode==='preview'||mode==='preview-blocked',grey=mode==='ghost'||mode==='preview-blocked'
 useFrame(({clock,camera})=>{
  const t=clock.elapsedTime
  if(facing.current){
   // Turn toward the viewer around the vertical axis only.
   const g=facing.current
   camera.getWorldPosition(_v);g.parent?.worldToLocal(_v)
   g.rotation.set(0,Math.atan2(_v.x-g.position.x,_v.z-g.position.z),0)
  }
  if(!icon.current||!material.current)return
  if(mode==='live'){
   const m=standMotion(t)
   icon.current.geometry=geometries[m.icon]
   icon.current.position.set(0,m.dy,0)
   icon.current.scale.set(SIZE_M*m.sx,SIZE_M*m.sy,1)
  }else{
   // Still: 👍 while placing, ！ for an extra copy.
   icon.current.geometry=geometries[mode==='ghost'?0:3]
   icon.current.position.set(0,0,0);icon.current.scale.set(SIZE_M,SIZE_M,1)
  }
 })
 const iconColor=grey?'#9aa0a8':'#ffffff',iconOpacity=grey?.55:1
 return <group>
  {/* Floor: soft shadow when placed, a clear ring + stem while placing. */}
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.004,0]} renderOrder={1}>
   <planeGeometry args={[.46,.46]}/>
   <meshBasicMaterial map={shadow} transparent depthWrite={false} opacity={grey?.35:preview?.7:.8} toneMapped={false}/>
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
   <mesh ref={icon} geometry={geometries[0]} renderOrder={6}>
    <meshBasicMaterial ref={material} map={texture} color={iconColor} opacity={iconOpacity} transparent depthWrite={false} toneMapped={false} alphaTest={.02}/>
   </mesh>
   {!preview&&<Interactable key={mode} id={`${id}:head-pop:stand`} interactionText={interactionText} enabled={enabled} onInteract={onInteract}>
    <mesh>
     <circleGeometry args={[SIZE_M*.58,24]}/>
     <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false}/>
    </mesh>
   </Interactable>}
  </group>
 </group>
}
