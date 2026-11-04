/**
 * Controller vibration for VR feedback. In first person you cannot see the top of your own
 * head, so a pop from the palette is confirmed in the hand that pressed it.
 *
 * The hand is the controller that most recently started a select (trigger) on the session;
 * otherwise the right controller. Uses `gamepad.hapticActuators[0].pulse()` (WebXR on Quest)
 * and falls back to `gamepad.vibrationActuator.playEffect()`.
 */
const RECENT_MS=1500

/** @returns {boolean} whether a pulse was sent */
export function pulse(source,intensity,ms){
 const pad=source?.gamepad
 const actuator=pad?.hapticActuators?.[0]
 try{
  if(typeof actuator?.pulse==='function'){actuator.pulse(intensity,ms);return true}
  const v=pad?.vibrationActuator
  if(typeof v?.playEffect==='function'){v.playEffect('dual-rumble',{duration:ms,strongMagnitude:intensity,weakMagnitude:intensity});return true}
 }catch{}
 return false
}

/**
 * @param {{now?:()=>number,later?:(fn:()=>void,ms:number)=>unknown}} [options]
 */
export function createHaptics({now=()=>performance.now(),later=(fn,ms)=>setTimeout(fn,ms)}={}){
 let session=null,lastSource=null,lastAt=-Infinity
 const onSelect=event=>{lastSource=event?.inputSource??null;lastAt=now()}
 const api={
  /** Follow the current XR session (null when not presenting). */
  attach(next){
   if(next===session)return
   if(session?.removeEventListener)session.removeEventListener('selectstart',onSelect)
   session=next??null;lastSource=null;lastAt=-Infinity
   if(session?.addEventListener)session.addEventListener('selectstart',onSelect)
  },
  /** The controller to vibrate. */
  hand(){
   const sources=Array.from(session?.inputSources??[]).filter(s=>s?.gamepad)
   if(lastSource&&now()-lastAt<RECENT_MS&&sources.includes(lastSource))return lastSource
   return sources.find(s=>s.handedness==='right')??sources[0]??null
  },
  /** ぴょこん: short, then a stronger tap. */
  pop(){const h=api.hand();if(!h)return false;const ok=pulse(h,.45,30);later(()=>pulse(h,.85,55),85);return ok},
  /** A light tick when the palette opens or closes. */
  tick(){const h=api.hand();return h?pulse(h,.25,18):false},
 }
 return api
}
