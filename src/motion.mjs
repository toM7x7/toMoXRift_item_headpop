import {ICON_COUNT} from './icons.mjs'

/**
 * Pop animation as a pure function of seconds since the pop started.
 * Exaggerated on purpose: it must read from across a room and in captures.
 */
export const POP_IN_S = .38
export const POP_HOLD_S = 2.35
export const POP_OUT_S = .32
export const POP_TOTAL_S = POP_IN_S+POP_HOLD_S+POP_OUT_S

const clamp01=v=>Math.max(0,Math.min(1,v))
/** Overshooting ease-out: 0→~1.12→1. */
export function easeOutBack(x,s=2.4){const t=clamp01(x)-1;return 1+(s+1)*t*t*t+s*t*t}
function easeInBack(x,s=1.9){const t=clamp01(x);return (s+1)*t*t*t-s*t*t}
const TAU=Math.PI*2

/** Idle personality per icon while it is held (h seconds into the hold). */
function idle(icon,h){
 switch(icon){
  case 0:return {rot:.32*Math.sin(h*38)*Math.exp(-h*5)} // ！ shakes, then settles
  case 1:return {rot:.16*Math.sin(h*3.1)} // ？ tilts its head
  case 2:{const beat=Math.pow(Math.max(0,Math.sin(h*TAU*1.25)),6);return {pulse:.13*beat}} // ♥ beats
  case 3:return {dy:.035*Math.abs(Math.sin(h*5.2))*Math.exp(-h*.9),rot:-.06*Math.sin(h*5.2)*Math.exp(-h*.9)} // 👍 bounces
  case 4:return {pulse:.05*Math.sin(h*9)*Math.exp(-h*1.4),glow:Math.exp(-h*2.2)} // 💡 flashes
  case 5:return {dx:.006*Math.sin(h*31),dy:-.012*h} // 💦 shivers and slides
  case 6:return {dx:.022*Math.sin(h*4.2),rot:.2*Math.sin(h*4.2)} // ♪ sways
  case 7:return {dx:.016*Math.sin(h*2.1),dy:.026*h} // 💤 drifts up
  default:return {}
 }
}

/**
 * @param {number} icon
 * @param {number} t seconds since the pop started
 * @param {number} [hold] seconds to stay after popping in
 * @returns {{visible:boolean,done:boolean,dx:number,dy:number,rot:number,sx:number,sy:number,opacity:number,glow:number}}
 */
export function popMotion(icon,t,hold=POP_HOLD_S){
 const out={visible:false,done:false,dx:0,dy:0,rot:0,sx:0,sy:0,opacity:1,glow:0}
 if(!Number.isFinite(t)||t<0)return out
 if(t>=POP_IN_S+hold+POP_OUT_S){out.done=true;return out}
 out.visible=true
 let s=1,dy=0
 if(t<POP_IN_S){
  const x=t/POP_IN_S
  s=easeOutBack(x)
  dy=-.11*(1-easeOutBack(x,1.6)) // hops up from just above the head
  // squash on take-off, stretch at the top
  const wobble=Math.sin(x*Math.PI)*.16
  out.sx=s*(1-wobble*.6);out.sy=s*(1+wobble)
 }else{
  const h=t-POP_IN_S,m=idle(icon,h)
  // landing jiggle, decays fast
  const j=.09*Math.sin(h*22)*Math.exp(-h*9)
  const pulse=m.pulse??0
  out.sx=(1+j+pulse);out.sy=(1-j+pulse)
  out.dx=m.dx??0;dy=m.dy??0;out.rot=m.rot??0;out.glow=m.glow??0
  const outT=t-POP_IN_S-hold
  if(outT>0){
   const k=easeInBack(outT/POP_OUT_S)
   const shrink=Math.max(0,1-k)
   out.sx*=shrink;out.sy*=shrink;dy+=.08*clamp01(outT/POP_OUT_S);out.opacity=clamp01(1-outT/POP_OUT_S*1.15)
  }
 }
 out.dy=dy
 return out
}

/** The placed sticker cycles through the icons but never shrinks below 60%,
 * so on PC there is always something to aim the center ray at. */
export const STAND_CYCLE_S = 1.9
export function standMotion(t){
 const cycle=Math.floor(t/STAND_CYCLE_S),p=t-cycle*STAND_CYCLE_S,icon=((cycle%ICON_COUNT)+ICON_COUNT)%ICON_COUNT
 const IN=.34,OUT=.2
 let s=1,j=0
 if(p<IN)s=.6+.4*easeOutBack(p/IN)
 else if(p>STAND_CYCLE_S-OUT){const x=(p-(STAND_CYCLE_S-OUT))/OUT;s=1-.4*x*x}
 else j=.06*Math.sin((p-IN)*20)*Math.exp(-(p-IN)*8)
 return {icon,sx:s*(1+j),sy:s*(1-j),dy:.02*Math.sin(t*1.4)}
}

/** A comic burst behind the icon as it pops in: rays flare out and fade. */
export const BURST_S = .42
export function burstMotion(t){
 if(!(t>=0)||t>=BURST_S)return {visible:false,scale:0,opacity:0,rot:0}
 const x=t/BURST_S
 return {visible:true,scale:.75+1.05*(1-(1-x)*(1-x)),opacity:x<.35?1:1-(x-.35)/.65,rot:.35*x}
}

/** How far a head tag steps back while a reaction shows (0..1), over the pop's life. */
export function yieldEnvelope(t,hold=POP_HOLD_S){
 const total=POP_IN_S+hold+POP_OUT_S
 if(!(t>=0)||t>=total)return 0
 const IN=.15,OUT=.35
 if(t<IN)return t/IN
 if(t>total-OUT)return (total-t)/OUT
 return 1
}
