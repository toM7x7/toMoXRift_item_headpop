import {Suspense,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {InstanceEventContext,useItem,usePlacementState,useUsers,type UsersContextValue} from '@xrift/world-components'
import {Group,Vector3} from 'three'
import {useIconAtlas,useIconGeometries} from './assets'
import {CHANNEL,createRateGate,makePayload,readEvent} from './channel.mjs'
import {createHeadTracker,ICON_CLEARANCE_M} from './head.mjs'
import {isIconIndex} from './icons.mjs'
import {isEditing} from './input.mjs'
import {Echo,type EchoState} from './Echo'
import {createHaptics} from './haptics.mjs'
import {Palette} from './Palette'
import {bindRenderer,locateUser,placementRole,registerPlacement,rendererId,showPop,subscribePlacements} from './placements.mjs'
import {createPopRuntime} from './pops.mjs'
import {attachRenderHook} from './render-hook.mjs'
import {registerShortcuts} from './shortcuts.mjs'
import {ShortcutHint} from './ShortcutHint'
import {Stand,type StandFlight,type StandMode} from './Stand'
import {menuControllers} from './vr-menu.mjs'
import {setWearing,subscribeWearing,wearingAny} from './wearing.mjs'

export interface ItemProps{
 position?:[number,number,number]
 rotation?:[number,number,number]
 scale?:number
 /** Development only: replace the pop clock (seconds) for frame-stepped captures. */
 clock?:()=>number
}
type Action={type:'pop';icon:number;from?:[number,number,number]}|{type:'palette';open?:boolean}|{type:'wear'}|{type:'remove'}
const LOCAL_GAP_S=.11
/** Phones and tablets have no M key: there the stand stays put so it can open the palette. */
const touchOnly=()=>typeof matchMedia==='function'&&!matchMedia('(any-pointer: fine)').matches

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
 const [echo,setEcho]=useState<EchoState|null>(null)
 // Worn = taken off the stand: for the wearer every live stand leaves its spot (the worn one
 // hops to the head) and comes back on 外す. Only when the palette can be opened without it
 // (PC keys: M, VR controller: R3); otherwise it stays as the way to the palette.
 const wearingHere=useSyncExternalStore(subscribeWearing,wearingAny,()=>false)
 const [summonable,setSummonable]=useState(()=>!touchOnly())
 const standState=useRef<StandFlight>({p:0,kind:'shrink',away:false,target:null,icon:0})
 const haptics=useMemo(()=>createHaptics(),[]),haptic=useRef({pops:0,ticks:0})
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
    latest.current={...ctx,worn:true};setWorn(true);if(haptics.tick())haptic.current.ticks++;return true
   case 'remove':
    if(ctx.worn&&haptics.tick())haptic.current.ticks++
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
    // In VR the top of your own head is out of view: confirm in the hand and at the button.
    if(action.from)setEcho({icon:action.icon,start:now(),position:action.from})
    if(haptics.pop())haptic.current.pops++ // no XR session, no controller: does nothing
    if(ctx.paletteOpen){latest.current={...ctx,paletteOpen:false};setPaletteOpen(false)}
    return true
   }
  }
  return false
 },[name,now,gl,haptics])

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
  const unbind=bindRenderer(id,(userId:string,icon:number)=>pops.show(userId,icon),(userId:string,out:Vector3)=>pops.locate(userId,out))
  return()=>{unbind();hook.dispose();pops.dispose();tracker.clear();runtime.current=null}
 },[scene,id,renderer,texture,geometries,now])

 useEffect(()=>()=>haptics.attach(null),[haptics])

 useEffect(()=>{setWearing(id,worn&&live);return()=>setWearing(id,false)},[id,worn,live])
 /** Where the worn stand hops to: where this user's pops appear. */
 const locateHead=useCallback((out:Vector3)=>{
  const me=latest.current.localId;if(!me)return null
  const found=locateUser(me,out);if(found)return found
  const p=usersRef.current.getLocalMovement?.()?.position
  if(!p||!Number.isFinite(p.x+p.y+p.z))return null
  const h=usersRef.current.getLocalAvatarHeight?.()?.height
  out.set(p.x,p.y+(Number.isFinite(h)&&h!>.2?h!:1.65)+ICON_CLEARANCE_M,p.z);return 'movement' as const
 },[])

 // A copy that stops being the room's stand (another copy took over) lets go of the wearer.
 useEffect(()=>{if(!live&&latest.current.worn){latest.current={...latest.current,worn:false,paletteOpen:false};setWorn(false);setPaletteOpen(false)}},[live])

 useFrame(({clock:frameClock})=>{
  const ctx=latest.current,session=gl.xr.getSession(),editing=isEditing(document.activeElement)
  haptics.attach(session)
  const vr=shortcuts.current?.pollXR(session,editing)??{fire:false,reason:'inactive'}
  if(vr.fire){vrFires.current++;if(haptics.tick())haptic.current.ticks++}
  const inVR=gl.xr.isPresenting||!!session||users.getLocalMovement?.().isInVR===true
  const canSummon=session?menuControllers(session).length===1:!inVR&&!touchOnly()
  if(canSummon!==summonable)setSummonable(canSummon)
  const show=!!(ctx.worn&&ctx.live&&!ctx.paletteOpen&&!inVR&&!editing&&shortcuts.current?.ownsControls())
  if(show!==hintVisible)setHintVisible(show)
  const t=frameClock.elapsedTime
  if(root.current&&t-lastReport.current>.1){
   lastReport.current=t
   root.current.userData.headPop={itemId:id,role,renderer,placer,worn:ctx.worn,paletteOpen:ctx.paletteOpen,hint:show,events:events?'instance-event':'unavailable',channel:name,pops:runtime.current?.report()??[],vr:{...vr,fires:vrFires.current,haptics:{...haptic.current}},stand:{...standState.current,summonable},echo,palette:ctx.paletteOpen?paletteLayout.current:null,fired}
  }
 })

 const mode:StandMode=preview?(role==='preview-duplicate'?'preview-blocked':'preview'):live?'live':'ghost'
 const ghostText=placedBy?.isLocalUser?'もう1個置いてあります（これは止まっています。片付けてください）':placer?'同じ人がもう1個置いています（これは止まっています）':'もう1個置いてあります（これは止まっています）'
 const standText=mode==='ghost'?ghostText:worn?'リアクションを選ぶ':'頭に付ける（キー1〜8／VRは右スティック押し込み）'
 return <group ref={root}>
  <group position={position} rotation={rotation} scale={scale}>
   <Stand id={id} mode={mode} texture={texture} geometries={geometries} interactionText={standText} enabled={!preview&&!!localId} onInteract={()=>{if(latest.current.live)act(latest.current.worn?{type:'palette',open:true}:{type:'wear'})}}
    away={live&&wearingHere&&summonable} worn={worn} locateHead={locateHead} now={now} state={standState.current}/>
  </group>
  <group ref={layer}/>
  {paletteOpen&&worn&&live&&<Palette id={id} texture={texture} geometries={geometries} onPick={(icon,from)=>act({type:'pop',icon,from})} onRemove={()=>act({type:'remove'})} onClose={()=>act({type:'palette',open:false})} report={layout=>{paletteLayout.current=layout}}/>}
  {live&&<Echo echo={echo} texture={texture} geometries={geometries} now={now}/>}
  {hintVisible&&<ShortcutHint id={id} fired={fired}/>}
 </group>
}
