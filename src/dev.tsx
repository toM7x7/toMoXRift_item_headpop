import {Suspense,useEffect,useMemo,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Canvas,useFrame,useThree,type ThreeEvent} from '@react-three/fiber'
import {OrbitControls} from '@react-three/drei'
import {RigidBody,CuboidCollider} from '@react-three/rapier'
import {DevEnvironment,Item as SDKItem,ItemProvider,PlacementStateProvider,XRiftProvider,useUsers,type InstanceEventContextValue,type PlayerMovement,type UsersContextValue} from '@xrift/world-components'
import {Group,Object3D,Vector3} from 'three'
import {Item} from './Item'
import {CHANNEL,makePayload} from './channel.mjs'
import {ICONS} from './icons.mjs'
import {createBoxAvatar,createMannequin} from './dev/mannequin'
import './style.css'

const PLACEMENT='head-pop-one',SDK_ITEM_ID='00000000-0000-4000-8000-0000000000a1'
/** ?shot: thumbnail framing (two people close together, no panel, no hint). */
const SHOT=new URLSearchParams(location.search).has('shot')
const REMOTES=[
 {id:'remote-a',displayName:'となりの人',position:SHOT?{x:.82,y:0,z:-.3}:{x:1.25,y:0,z:-.55},yaw:SHOT?Math.PI-.75:Math.PI-.5,kind:'humanoid' as const,color:'#7fa7c9'},
 {id:'remote-b',displayName:'箱の人',position:{x:-1.3,y:0,z:-.5},yaw:Math.PI+.5,kind:'box' as const,color:'#c9a77f'},
]
const movement=(position:{x:number;y:number;z:number},yaw:number):PlayerMovement=>({position,direction:{x:0,z:0},horizontalSpeed:0,verticalSpeed:0,rotation:{yaw,pitch:0},isGrounded:true,isJumping:false})

/** Development event bus. Like production, a sender never receives its own event. */
function createDevEvents(){
 const subs=new Map<string,Set<(data:unknown)=>void>>(),sent:{name:string;data:unknown;at:number}[]=[]
 const impl:InstanceEventContextValue={
  subscribe(name,cb){let set=subs.get(name);if(!set)subs.set(name,set=new Set());set.add(cb);return()=>{set!.delete(cb)}},
  emit(name,data){sent.push({name,data,at:performance.now()})},
 }
 return {impl,sent,deliver(name:string,senderId:string,payload:unknown){for(const cb of subs.get(name)??[])cb({payload,senderId,timestamp:Date.now()})}}
}

/** Frame-steppable clock for captures (only the dev page passes it to the Item). */
function createDevClock(){
 let frozen:number|null=null
 return {now:()=>frozen??performance.now()/1000,freeze(){frozen=performance.now()/1000;return frozen},step(dt:number){if(frozen===null)frozen=performance.now()/1000;frozen+=dt;return frozen},run(){frozen=null}}
}

function clickInteractable(event:ThreeEvent<MouseEvent>){
 if(event.delta>4)return
 for(let node:Object3D|null=event.object;node;node=node.parent)if(!node.visible)return
 for(let node:Object3D|null=event.object;node;node=node.parent){const d=node.userData;if(d.enabled&&typeof d.onInteract==='function'){event.stopPropagation();d.onInteract(d.id);return}}
}

function Avatars({localYaw}:{localYaw:number}){
 const local=useMemo(()=>createMannequin('#e3d7c4'),[])
 const remoteA=useMemo(()=>createMannequin(REMOTES[0].color,1.7),[])
 const remoteB=useMemo(()=>createBoxAvatar(REMOTES[1].color),[])
 useEffect(()=>()=>{local.dispose();remoteA.dispose();remoteB.dispose()},[local,remoteA,remoteB])
 useFrame(({clock})=>{local.step(clock.elapsedTime);remoteA.step(clock.elapsedTime)})
 // Remote avatars sit under a parent that also holds the host's "remote-player-<id>" marker.
 const marker=(id:string)=>({id:`remote-player-${id}`,onInteract:()=>{}})
 const [a,b]=REMOTES
 return <>
  <group rotation={[0,localYaw+Math.PI,0]}><primitive object={local.root}/></group>
  <group position={[a.position.x,a.position.y,a.position.z]} rotation={[0,a.yaw+Math.PI,0]}><group userData={marker(a.id)}/><primitive object={remoteA.root}/></group>
  <group position={[b.position.x,b.position.y,b.position.z]} rotation={[0,b.yaw+Math.PI,0]}><group userData={marker(b.id)}/><primitive object={remoteB.root}/></group>
 </>
}

function SdkActor(){
 const root=useRef<Group>(null),users=useUsers(),actor=useMemo(()=>createMannequin('#e3d7c4'),[])
 useEffect(()=>()=>actor.dispose(),[actor])
 useFrame(({clock})=>{const m=users.getLocalMovement();if(!root.current)return;root.current.position.set(m.position.x,m.position.y,m.position.z);root.current.rotation.set(0,m.rotation.yaw+Math.PI,0);actor.step(clock.elapsedTime)},-1)
 return <group ref={root}><primitive object={actor.root}/></group>
}

function Readback({clock,bus}:{clock:ReturnType<typeof createDevClock>;bus:ReturnType<typeof createDevEvents>}){
 const {scene,camera,gl}=useThree(),controls=useThree(state=>state.controls) as any
 useEffect(()=>{
  const find=(id=PLACEMENT)=>{let found:any=null;scene.traverse(o=>{if(!found&&o.userData.headPop?.itemId===id)found=o});return found}
  ;(window as any).__headPop={
   report:(id?:string)=>find(id)?.userData.headPop??null,
   act:(action:unknown,id?:string)=>find(id)?.userData.headPopActions?.act(action)??false,
   deliver:(senderId:string,icon:number)=>bus.deliver(CHANNEL,senderId,makePayload(icon)),
   sent:()=>bus.sent.map(s=>({...s})),
   clock,scene,camera,
   /** Screen position of an Interactable by id (for real clicks). */
   project(id:string){let r:any=null;scene.traverse(o=>{if(o.userData.id!==id)return;for(let n:Object3D|null=o;n;n=n.parent)if(!n.visible)return;const p=o.getWorldPosition(new Vector3()).project(camera),rect=gl.domElement.getBoundingClientRect();r={x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2,text:o.userData.interactionText,enabled:o.userData.enabled}});return r},
   point(world:number[]){const p=new Vector3().fromArray(world).project(camera),rect=gl.domElement.getBoundingClientRect();return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2}},
   view(position:number[],target:number[]){camera.position.fromArray(position);camera.lookAt(new Vector3().fromArray(target));if(controls?.target){controls.target.fromArray(target);controls.update()}},
  }
  return()=>{delete (window as any).__headPop}
 },[scene,camera,gl,clock,bus,controls])
 return null
}

function App(){
 const params=new URLSearchParams(location.search),sdk=params.has('sdk'),shot=SHOT,dup=params.has('dup'),previewing=params.has('preview'),solo=params.get('preview')==='solo'
 const clock=useMemo(createDevClock,[]),bus=useMemo(createDevEvents,[])
 const localYaw=SHOT?Math.PI+.45:Math.PI
 const users=useMemo<UsersContextValue>(()=>({
  localUser:{id:'local-dev',displayName:'わたし',avatarUrl:null,isGuest:false},
  remoteUsers:REMOTES.map(r=>({id:r.id,displayName:r.displayName,avatarUrl:null,isGuest:false})),
  getLocalMovement:()=>movement({x:0,y:0,z:0},localYaw),
  getMovement:id=>{const r=REMOTES.find(r=>r.id===id);return r?movement(r.position,r.yaw):undefined},
  getLocalAvatarHeight:()=>({height:1.81,eyeHeight:1.68}),
  getAvatarHeight:id=>REMOTES.some(r=>r.id===id)?{height:id==='remote-b'?1.7:1.81,eyeHeight:1.6}:undefined,
 }),[localYaw])
 const [log,setLog]=useState('')
 const sendRemote=(senderId:string,icon:number)=>{bus.deliver(CHANNEL,senderId,makePayload(icon));setLog(`${REMOTES.find(r=>r.id===senderId)?.displayName}：${ICONS[icon].label}`)}
 const ground=<><color attach="background" args={['#e8eef2']}/><hemisphereLight args={['#ffffff','#8a97a3',2.2]}/><directionalLight position={[3,6,4]} intensity={1.8}/><gridHelper args={[24,24,'#b8c6d0','#d5dee4']} position={[0,.001,0]}/></>
 if(sdk)return <main className="stage"><XRiftProvider baseUrl="/"><DevEnvironment items={{[SDK_ITEM_ID]:Item}} spawnPosition={[0,0,2.5]} camera={{fov:60}} shadows={false}>{ground}<RigidBody type="fixed" colliders={false}><mesh position={[0,-.1,0]}><boxGeometry args={[40,.2,40]}/><meshStandardMaterial color="#dfe6ea"/></mesh><CuboidCollider args={[20,.1,20]} position={[0,-.1,0]}/></RigidBody><SdkActor/><SDKItem placementId={PLACEMENT} itemId={SDK_ITEM_ID} position={[0,0,0]}/><Readback clock={clock} bus={bus}/></DevEnvironment></XRiftProvider><div className="hint">公式DevEnvironment：アイコンを選んで装着 → Ctrl+Alt+1〜8／Ctrl+Alt+M</div></main>
 return <main className="stage">
  <XRiftProvider baseUrl="/" usersImplementation={users} instanceEventImplementation={bus.impl}>
   <Canvas camera={{position:[.4,2.05,3.9],fov:42}}>
    {ground}
    <mesh rotation={[-Math.PI/2,0,0]}><planeGeometry args={[30,30]}/><meshStandardMaterial color="#dfe6ea"/></mesh>
    <Avatars localYaw={localYaw}/>
    <Suspense fallback={null}><group onClick={clickInteractable}>{!solo&&<ItemProvider id={PLACEMENT}><Item position={shot?[3,0,-3]:[.7,0,1.45]} clock={clock.now}/></ItemProvider>}
     {/* ?dup: a second placed copy (larger id, so it is the extra one). ?preview: a copy being placed. */}
     {dup&&<ItemProvider id="head-pop-two"><Item position={[-.75,0,1.35]} clock={clock.now}/></ItemProvider>}
     {previewing&&<PlacementStateProvider mode="preview"><ItemProvider id="head-pop-preview"><Item position={[1.55,0,1.1]} clock={clock.now}/></ItemProvider></PlacementStateProvider>}
    </group></Suspense>
    <Readback clock={clock} bus={bus}/>
    {!shot&&<OrbitControls makeDefault target={[0,1.45,0]}/>}
   </Canvas>
  </XRiftProvider>
  {shot&&<style>{'.xrift-head-pop-hint{display:none!important}'}</style>}
  {!shot&&<aside className="panel" onPointerDown={e=>e.stopPropagation()}>
   <strong>ぴょこんリアクション</strong>
   <p>浮いているアイコンをクリックで装着 → 1〜8 で頭の上に、M でパレット。</p>
   <p className="sub">となりの人（人型）から送る</p>
   <div className="row">{ICONS.map((icon,i)=><button key={icon.key} onClick={()=>sendRemote('remote-a',i)} title={icon.label}>{i+1}</button>)}</div>
   <p className="sub">箱の人（頭の骨なし）から送る</p>
   <div className="row">{ICONS.map((icon,i)=><button key={icon.key} onClick={()=>sendRemote('remote-b',i)} title={icon.label}>{i+1}</button>)}</div>
   <p className="log">{log}</p>
  </aside>}
 </main>
}

createRoot(document.getElementById('root')!).render(<App/>)
