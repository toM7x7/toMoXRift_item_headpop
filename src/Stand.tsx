import {useRef} from 'react'
import {useFrame} from '@react-three/fiber'
import {Interactable} from '@xrift/world-components'
import {Group,Mesh,MeshBasicMaterial,Vector3,type PlaneGeometry,type Texture} from 'three'
import {ICON_COUNT} from './icons.mjs'
import {popMotion,POP_IN_S,POP_OUT_S} from './motion.mjs'

const STAND_HEIGHT_M=1.25,STAND_SIZE_M=.3,HOLD_S=1.1,CYCLE_S=POP_IN_S+HOLD_S+POP_OUT_S+.15
const _v=new Vector3()

/**
 * The placed item itself: one floating sticker that keeps popping through the 8 reactions,
 * so the item explains itself without a sign. Only a fixed invisible disc is selectable.
 */
export function Stand({id,texture,geometries,interactionText,enabled,onInteract}:{id:string;texture:Texture;geometries:PlaneGeometry[];interactionText:string;enabled:boolean;onInteract:()=>void}){
 const facing=useRef<Group>(null),icon=useRef<Mesh>(null),material=useRef<MeshBasicMaterial>(null)
 useFrame(({clock,camera})=>{
  const t=clock.elapsedTime,index=Math.floor(t/CYCLE_S)%ICON_COUNT,m=popMotion(index,t%CYCLE_S,HOLD_S)
  if(facing.current){
   // Turn toward the viewer around the vertical axis only.
   const g=facing.current,parent=g.parent
   camera.getWorldPosition(_v);parent?.worldToLocal(_v)
   g.rotation.set(0,Math.atan2(_v.x-g.position.x,_v.z-g.position.z),0)
   g.position.y=STAND_HEIGHT_M+Math.sin(t*1.4)*.02
  }
  if(icon.current&&material.current){
   icon.current.geometry=geometries[index]
   icon.current.visible=m.visible
   icon.current.position.set(m.dx,m.dy,0);icon.current.rotation.set(0,0,m.rot)
   icon.current.scale.set(STAND_SIZE_M*Math.max(1e-4,m.sx),STAND_SIZE_M*Math.max(1e-4,m.sy),1)
   material.current.opacity=m.opacity;material.current.color.setScalar(1+.45*m.glow)
  }
 })
 return <group ref={facing} position={[0,STAND_HEIGHT_M,0]}>
  <mesh ref={icon} geometry={geometries[0]} renderOrder={6}>
   <meshBasicMaterial ref={material} map={texture} transparent depthWrite={false} toneMapped={false} alphaTest={.02}/>
  </mesh>
  <Interactable id={`${id}:head-pop:stand`} interactionText={interactionText} enabled={enabled} onInteract={onInteract}>
   <mesh>
    <circleGeometry args={[STAND_SIZE_M*.62,24]}/>
    <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false}/>
   </mesh>
  </Interactable>
 </group>
}
