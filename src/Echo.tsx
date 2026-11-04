import {useMemo,useRef} from 'react'
import {useFrame} from '@react-three/fiber'
import {Mesh,MeshBasicMaterial,Quaternion,Vector3,type PlaneGeometry,type Texture} from 'three'
import {easeOutBack} from './motion.mjs'
import {setWorldTransform} from './pops.mjs'

export type EchoState={icon:number;start:number;position:[number,number,number]}
export const ECHO_S=1.1
const SIZE_M=.13

/**
 * Local-only confirmation: a small copy of the reaction hops up from the palette button that
 * was pressed and fades. Nobody else sees it; the real pop is above the head.
 */
export function Echo({echo,texture,geometries,now}:{echo:EchoState|null;texture:Texture;geometries:PlaneGeometry[];now:()=>number}){
 const mesh=useRef<Mesh>(null),material=useRef<MeshBasicMaterial>(null)
 const tmp=useMemo(()=>({p:new Vector3(),q:new Quaternion()}),[])
 useFrame(({camera})=>{
  const m=mesh.current,mat=material.current
  if(!m||!mat)return
  const t=echo?now()-echo.start:-1
  if(!echo||t<0||t>ECHO_S){m.visible=false;return}
  m.visible=true
  m.geometry=geometries[echo.icon]
  const x=t/ECHO_S,rise=.05+.17*(1-(1-x)*(1-x))
  tmp.p.set(echo.position[0],echo.position[1]+rise,echo.position[2])
  camera.getWorldQuaternion(tmp.q)
  setWorldTransform(m,tmp.p,tmp.q,SIZE_M*easeOutBack(Math.min(1,t/.24)))
  mat.opacity=t<.55?1:Math.max(0,1-(t-.55)/(ECHO_S-.55))
 })
 return <mesh ref={mesh} visible={false} renderOrder={30} frustumCulled={false}>
  <planeGeometry args={[1,1]}/>
  <meshBasicMaterial ref={material} map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false}/>
 </mesh>
}
