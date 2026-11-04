import {shortcutAction} from './input.mjs'
import {createVRMenuGesture} from './vr-menu.mjs'

const KEY=Symbol.for('xrift.head-pop.shortcuts.v1')

/**
 * One keydown listener shared by every placed copy. Keys go only to the single copy the
 * local user is wearing; a loose copy gets nothing, and two worn copies get nothing.
 * @param {string} id placement id
 * @param {{worn:()=>boolean,handle:(action:any)=>boolean}} controller
 */
export function registerShortcuts(id,controller){
 const registry=globalThis[KEY]??={entries:new Map(),listener:null,gesture:null,gestureOwner:null}
 registry.entries.set(id,controller)
 registry.gesture??=createVRMenuGesture()
 const wornEntries=()=>[...registry.entries].filter(([,c])=>c.worn())
 const resetGesture=()=>{registry.gesture.reset();registry.gestureOwner=null}
 if(!registry.listener&&typeof window!=='undefined'){
  registry.listener=event=>{
   const action=shortcutAction(event);if(!action)return
   const worn=wornEntries()
   if(worn.length!==1)return
   if(worn[0][1].handle(action))event.preventDefault()
  }
  window.addEventListener('keydown',registry.listener)
 }
 return {
  /** True when no other copy is worn by this browser. */
  canWear(){return !wornEntries().some(([other])=>other!==id)},
  ownsControls(){const worn=wornEntries();return worn.length===1&&worn[0][0]===id&&registry.entries.get(id)===controller},
  /** Right-stick press (R3) toggles the palette in VR. */
  pollXR(session,editing=false){
   const worn=wornEntries()
   if(worn.length!==1){resetGesture();return {fire:false,reason:'inactive'}}
   if(worn[0][0]!==id||registry.entries.get(id)!==controller)return {fire:false,reason:'not-owner'}
   if(registry.gestureOwner!==id){resetGesture();registry.gestureOwner=id}
   const result=registry.gesture.poll({session,ownedCount:1,editing})
   return result.fire?{fire:controller.handle({type:'palette'})===true,reason:result.reason}:result
  },
  dispose(){
   if(registry.entries.get(id)===controller)registry.entries.delete(id)
   if(registry.gestureOwner===id)resetGesture()
   if(!registry.entries.size){resetGesture();if(registry.listener)window.removeEventListener('keydown',registry.listener);delete globalThis[KEY]}
  },
 }
}
