import {Suspense,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {InstanceEventContext,useItem,usePlacementState,useUsers,type UsersContextValue} from '@xrift/world-components'
import {Group} from 'three'
import {useIconAtlas,useIconGeometries} from './assets'
import {CHANNEL,createRateGate,makePayload,readEvent} from './channel.mjs'
import {createHeadTracker} from './head.mjs'
import {isIconIndex} from './icons.mjs'
import {isEditing} from './input.mjs'
import {Palette} from './Palette'
import {bindRenderer,placementRole,registerPlacement,rendererId,showPop,subscribePlacements} from './placements.mjs'
import {createPopRuntime} from './pops.mjs'
import {attachRenderHook} from './render-hook.mjs'
import {registerShortcuts} from './shortcuts.mjs'
import {ShortcutHint} from './ShortcutHint'
import {Stand,type StandMode} from './Stand'

export interface ItemProps{
 position?:[number,number,number]
 rotation?:[number,number,number]
 scale?:number
 /** Development only: replace the pop clock (seconds) for frame-stepped captures. */
 clock?:()=>number
}
type Action={type:'pop';icon:number}|{type:'palette';open?:boolean}|{type:'wear'}|{type:'remove'}
const LOCAL_GAP_S=.11

export function Item(props:ItemProps){
 return <Suspense fallback={null}><HeadPop {...props}/></Suspense>
}

function HeadPop({position=[0,0,0],rotation=[0,0,0],scale=1,clock}:ItemProps){
 const {id,placedBy}=useItem(),users=useUsers(),placement=usePlacementState(),{scene,gl}=useThree()
 const texture=useIconAtlas(),geometries=useIconGeometries()
 // Read the context directly: an older host without instance events still shows local pops.
 const events=useContext(InstanceEventContext)
 const preview=placement.mode==='preview',localId=users.localUser?.id??null
 // One stand per placer: a person's extra copies stay grey and inert (XRift has no documented
 // single-place switch). One live copy per room renders the pops (see placements.mjs).
 const placer=placedBy?.id??null
 useLayoutEffect(()=>registerPlacement(id,preview,placer),[id,preview,placer])
 const role=useSyncExternalStore(subscribePlacements,()=>placementRole(id),()=>'primary')
 const isRenderer=useSyncExternalStore(subscribePlacements,()=>rendererId()===id,()=>true)
 const live=!preview&&role==='primary',renderer=live&&isRenderer
 const [worn,setWorn]=useState(false),[paletteOpen,setPaletteOpen]=useState(false)
 const [fired,setFired]=useState<{icon:number;seq:number}|null>(null),[hintVisible,setHintVisible]=useState(false)
 const root=useRef<Group>(null),layer=useRef<Group>(null)
 const latest=useRef({worn,preview,live,localId,paletteOpen});latest.current={worn,preview,live,localId,paletteOpen}
 const usersRef=useRef<UsersContextValue>(users);usersRef.current=users
 const eventsRef=useRef(events);eventsRef.current=events
 const clockRef=useRef(clock);clockRef.current=clock
 const runtime=useRef<ReturnType<typeof createPopRuntime>|null>(null)
 const shortcuts=useRef<ReturnType<typeof registerShortcuts>|null>(null)
 const lastLocalPop=useRef(-Infinity),paletteLayout=useRef<unknown>(null),vrFires=useRef(0),lastReport=useRef(0)
 const name=CHANNEL,gate=useMemo(()=>createRateGate(),[])
 const now=useCallback(()=>clockRef.current?.()??performance.now()/1000,[])

 const act=useCallback((action:Action):boolean=>{
  const ctx=latest.current
  if(!ctx.live||!ctx.localId)return false
  switch(action.type){
   case 'wear':
    if(ctx.worn)return true
    if(!shortcuts.current?.canWear())return false
    latest.current={...ctx,worn:true};setWorn(true);return true
   case 'remove':
    latest.current={...ctx,worn:false,paletteOpen:false};setWorn(false);setPaletteOpen(false);return true
   case 'palette':{
    if(!ctx.worn)return false
    const open=action.open??!ctx.paletteOpen
    latest.current={...ctx,paletteOpen:open};setPaletteOpen(open);return true
   }
   case 'pop':{
    if(!ctx.worn||!isIconIndex(action.icon))return false
    const t=now();if(t-lastLocalPop.current<LOCAL_GAP_S&&t>=lastLocalPop.current)return true
    lastLocalPop.current=t
    const seq=showPop(ctx.localId,action.icon)??0
    eventsRef.current?.emit(name,makePayload(action.icon))
    setFired({icon:action.icon,seq})
    if(ctx.paletteOpen){latest.current={...ctx,paletteOpen:false};setPaletteOpen(false)}
    return true
   }
  }
  return false
 },[name,now])

 // Other people's pops, received once per room by the renderer copy. The sender never
 // receives its own event; act() shows it locally through showPop().
 useEffect(()=>{
  if(!events||!renderer)return
  return events.subscribe(name,data=>{
   const e=readEvent(data);if(!e||e.senderId===latest.current.localId)return
   if(!gate.allow(e.senderId,performance.now()))return
   runtime.current?.show(e.senderId,e.icon)
  })
 },[events,name,renderer,gate])

 // Every live stand can be worn; keys go to the single worn copy (shortcuts.mjs).
 useEffect(()=>{
  if(!live||!root.current)return
  const keys=registerShortcuts(id,{worn:()=>latest.current.worn&&latest.current.live,handle:act})
  shortcuts.current=keys
  const node=root.current
  node.userData.headPopActions={act}
  return()=>{keys.dispose();shortcuts.current=null;delete node.userData.headPopActions}
 },[id,live,act])

 // The room's renderer copy owns the head tracking and the pooled icons.
 useEffect(()=>{
  if(!renderer||!root.current||!layer.current)return
  const proxy={
   getLocalMovement:()=>usersRef.current.getLocalMovement(),
   getMovement:(userId:string)=>usersRef.current.getMovement(userId),
   getLocalAvatarHeight:()=>usersRef.current.getLocalAvatarHeight?.(),
   getAvatarHeight:(userId:string)=>usersRef.current.getAvatarHeight?.(userId),
  }
  const tracker=createHeadTracker({scene,excludeRoot:root.current,users:proxy})
  const pops=createPopRuntime({layer:layer.current,texture,geometries,tracker,getLocalId:()=>latest.current.localId,now})
  runtime.current=pops
  const hook=attachRenderHook(scene,{place:()=>pops.place(),face:camera=>pops.face(camera)})
  const unbind=bindRenderer(id,(userId:string,icon:number)=>pops.show(userId,icon))
  return()=>{unbind();hook.dispose();pops.dispose();tracker.clear();runtime.current=null}
 },[scene,id,renderer,texture,geometries,now])

 // A copy that stops being the room's stand (another copy took over) lets go of the wearer.
 useEffect(()=>{if(!live&&latest.current.worn){latest.current={...latest.current,worn:false,paletteOpen:false};setWorn(false);setPaletteOpen(false)}},[live])

 useFrame(({clock:frameClock})=>{
  const ctx=latest.current,session=gl.xr.getSession(),editing=isEditing(document.activeElement)
  const vr=shortcuts.current?.pollXR(session,editing)??{fire:false,reason:'inactive'}
  if(vr.fire)vrFires.current++
  const inVR=gl.xr.isPresenting||!!session||users.getLocalMovement?.().isInVR===true
  const show=!!(ctx.worn&&ctx.live&&!ctx.paletteOpen&&!inVR&&!editing&&shortcuts.current?.ownsControls())
  if(show!==hintVisible)setHintVisible(show)
  const t=frameClock.elapsedTime
  if(root.current&&t-lastReport.current>.1){
   lastReport.current=t
   root.current.userData.headPop={itemId:id,role,renderer,placer,worn:ctx.worn,paletteOpen:ctx.paletteOpen,hint:show,events:events?'instance-event':'unavailable',channel:name,pops:runtime.current?.report()??[],vr:{...vr,fires:vrFires.current},palette:ctx.paletteOpen?paletteLayout.current:null,fired}
  }
 })

 const mode:StandMode=preview?(role==='preview-duplicate'?'preview-blocked':'preview'):live?'live':'ghost'
 const ghostText=placedBy?.isLocalUser?'もう1個置いてあります（これは止まっています。片付けてください）':placer?'同じ人がもう1個置いています（これは止まっています）':'もう1個置いてあります（これは止まっています）'
 const standText=mode==='ghost'?ghostText:worn?'リアクションを選ぶ':'頭に付ける（キー1〜8／VRは右スティック押し込み）'
 return <group ref={root}>
  <group position={position} rotation={rotation} scale={scale}>
   <Stand id={id} mode={mode} texture={texture} geometries={geometries} interactionText={standText} enabled={!preview&&!!localId} onInteract={()=>{if(latest.current.live)act(latest.current.worn?{type:'palette',open:true}:{type:'wear'})}}/>
  </group>
  <group ref={layer}/>
  {paletteOpen&&worn&&live&&<Palette id={id} texture={texture} geometries={geometries} onPick={icon=>act({type:'pop',icon})} onRemove={()=>act({type:'remove'})} onClose={()=>act({type:'palette',open:false})} report={layout=>{paletteLayout.current=layout}}/>}
  {hintVisible&&<ShortcutHint id={id} fired={fired}/>}
 </group>
}
