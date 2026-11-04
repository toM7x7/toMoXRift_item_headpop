/** xr-standard controllers in that hand with a pressable stick (R3/L3 = buttons[3]). */
export function menuControllers(session,hand='right'){
 return Array.from(session?.inputSources??[]).filter(s=>s.handedness===hand&&s.targetRayMode==='tracked-pointer'&&!s.hand&&s.gamepad?.mapping==='xr-standard'&&s.gamepad.connected!==false&&s.gamepad.buttons?.length>3&&s.gamepad.axes?.length>=4)
}
/** Read live WebXR inputSources; retain button values rather than live gamepad references. */
export function createVRMenuGesture(){
 let previousSource=null,armed=false,wasPressed=false
 const reset=()=>{previousSource=null;armed=false;wasPressed=false}
 return {reset,
 /** @param {{session?: any, ownedCount?: number, editing?: boolean, hand?: 'left'|'right'}} [context] */
 poll({session,ownedCount,editing=false,hand='right'}={}){
  if(!session||session.visibilityState!=='visible'||ownedCount!==1||editing){reset();return {fire:false,reason:'inactive'}}
  const candidates=menuControllers(session,hand)
  if(candidates.length!==1){reset();return {fire:false,reason:'controller-unavailable'}}
  const source=candidates[0],g=source.gamepad,pressed=g.buttons[3]?.pressed===true
  if(source!==previousSource){previousSource=source;armed=false;wasPressed=pressed}
  if(!pressed){armed=true;wasPressed=false;return {fire:false,reason:'ready'}}
  const rising=armed&&!wasPressed;wasPressed=true
  const x=g.axes[2],y=g.axes[3],neutral=Number.isFinite(x)&&Number.isFinite(y)&&Math.hypot(x,y)<=.25
  const busy=g.buttons[0]?.pressed===true||g.buttons[1]?.pressed===true
  return {fire:rising&&neutral&&!busy,reason:!rising?'held-or-needs-release':!neutral?'stick-tilted':busy?'trigger-or-grip-held':'menu-toggle'}
 }}
}
/** @param {any} target */
export function isEditing(target){return !!(target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"],[role="dialog"]'))}
