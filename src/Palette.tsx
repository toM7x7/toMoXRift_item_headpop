import {useEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {Interactable,useUsers} from '@xrift/world-components'
import {Group,PlaneGeometry,Quaternion,Vector3,type Texture} from 'three'
import {ICONS} from './icons.mjs'
import {PALETTE,computePaletteLayout,paletteCells} from './palette-layout.mjs'
import {setWorldTransform} from './pops.mjs'
import {FONT,useLabelTexture} from './assets'

const BADGE=.046

function useBadgeGeometries(){
 const geometries=useMemo(()=>ICONS.map((_,i)=>{
  const g=new PlaneGeometry(BADGE,BADGE),uv=g.getAttribute('uv'),u0=i/ICONS.length,u1=(i+1)/ICONS.length
  for(let k=0;k<uv.count;k++)uv.setX(k,uv.getX(k)?u1:u0)
  uv.needsUpdate=true;return g
 }),[])
 useEffect(()=>()=>geometries.forEach(g=>g.dispose()),[geometries])
 return geometries
}

const overlay={transparent:true,depthTest:false,depthWrite:false,toneMapped:false} as const

/**
 * Choice palette in front of the wearer: 8 sticker buttons (with their PC key) plus 外す / 閉じる.
 * Opened by M, by R3 in VR, or by selecting the floating sticker while worn.
 */
export function Palette({id,paletteKey='M',texture,geometries,onPick,onRemove,onClose,report}:{id:string;paletteKey?:string;texture:Texture;geometries:PlaneGeometry[];onPick:(icon:number,from:[number,number,number])=>void;onRemove:()=>void;onClose:()=>void;report:(layout:unknown)=>void}){
 const root=useRef<Group>(null),heading=useRef<number[]|null>(null),users=useUsers(),{camera,gl}=useThree()
 const cells=useMemo(()=>paletteCells(),[])
 const badges=useBadgeGeometries()
 const badgeTexture=useLabelTexture((c,w,h)=>{
  const cell=w/ICONS.length
  ICONS.forEach((_,i)=>{const cx=cell*i+cell/2;c.fillStyle='#2a2e3d';c.beginPath();c.arc(cx,h/2,h/2-3,0,Math.PI*2);c.fill();c.fillStyle='#ffffff';c.font=`800 ${h*.62}px system-ui,sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(String(i+1),cx,h/2+2)})
 },64*ICONS.length,64,[])
 const pill=(text:string,fill:string,ink:string)=>(c:CanvasRenderingContext2D,w:number,h:number)=>{c.fillStyle='#2a2e3d';c.beginPath();c.roundRect(2,2,w-4,h-4,(h-4)/2);c.fill();c.fillStyle=fill;c.beginPath();c.roundRect(8,8,w-16,h-16,(h-16)/2);c.fill();c.fillStyle=ink;c.font=`700 ${h*.42}px ${FONT}`;c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2,h/2+2,w-40)}
 const removeTexture=useLabelTexture(pill('外す','#ffe2dc','#7a2a1d'),320,120,[])
 const closeTexture=useLabelTexture(pill('閉じる','#fffdf8','#293137'),320,120,[])
 const _p=useMemo(()=>new Vector3(),[]),_q=useMemo(()=>new Quaternion(),[])
 useFrame(()=>{
  const g=root.current;if(!g)return
  const presenting=gl.xr.isPresenting,view=presenting?gl.xr.getCamera():camera
  const projection:any=presenting?((view as any).cameras?.[0]??view):camera
  const layout=computePaletteLayout({movement:users.getLocalMovement(),avatarHeight:users.getLocalAvatarHeight?.(),xrEyePosition:presenting?view.getWorldPosition(new Vector3()).toArray():undefined,viewerPosition:view.getWorldPosition(new Vector3()).toArray(),forward:heading.current??undefined,projectionY:projection.projectionMatrix.elements[5],projectionX:projection.projectionMatrix.elements[0],minDistance:presenting?.7:.95})
  report(layout)
  g.visible=layout.status==='ready'
  if(layout.status!=='ready')return
  // Keep the opening direction so a PC center ray can turn toward a button without moving it.
  heading.current??=layout.forward
  setWorldTransform(g,_p.fromArray(layout.position),_q.fromArray(layout.quaternion),layout.scale)
 })
 const b=PALETTE.button
 /** World position of a button, for the local echo that hops up from it. */
 const buttonWorld=(x:number,y:number):[number,number,number]=>{const p=new Vector3(x,y,.01);root.current?.localToWorld(p);return [p.x,p.y,p.z]}
 return <group ref={root} visible={false}>
  {ICONS.map((icon,i)=>{const {x,y}=cells.icons[i];return <group key={icon.key} position={[x,y,0]}>
   <mesh renderOrder={20} position={[0,0,-.002]}><circleGeometry args={[b/2+.006,40]}/><meshBasicMaterial color="#2a2e3d" {...overlay}/></mesh>
   <Interactable id={`${id}:head-pop:icon-${i}`} interactionText={`${icon.label}（${i+1}）`} onInteract={()=>onPick(i,buttonWorld(x,y))}>
    <mesh renderOrder={21}><circleGeometry args={[b/2,40]}/><meshBasicMaterial color="#fffdf8" {...overlay}/></mesh>
   </Interactable>
   <mesh renderOrder={22} position={[0,0,.002]} geometry={geometries[i]} scale={b*.92}><meshBasicMaterial map={texture} {...overlay}/></mesh>
   <mesh renderOrder={23} position={[b*.38,b*.38,.004]} geometry={badges[i]}><meshBasicMaterial map={badgeTexture} {...overlay}/></mesh>
  </group>})}
  <group position={[cells.remove.x,cells.remove.y,0]}>
   <Interactable id={`${id}:head-pop:remove`} interactionText="外す" onInteract={onRemove}>
    <mesh renderOrder={21}><planeGeometry args={[PALETTE.pillWidth,PALETTE.pillHeight]}/><meshBasicMaterial map={removeTexture} {...overlay}/></mesh>
   </Interactable>
  </group>
  <group position={[cells.close.x,cells.close.y,0]}>
   <Interactable id={`${id}:head-pop:close`} interactionText={`閉じる（${paletteKey}）`} onInteract={onClose}>
    <mesh renderOrder={21}><planeGeometry args={[PALETTE.pillWidth,PALETTE.pillHeight]}/><meshBasicMaterial map={closeTexture} {...overlay}/></mesh>
   </Interactable>
  </group>
 </group>
}
