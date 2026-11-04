/**
 * How a placed stand leaves its spot when it is put on, and comes back when taken off.
 * Pure functions of progress so tests and frame-stepped captures agree.
 *
 * Progress p: 0 = on the stand, 1 = arrived (the stand is gone for this user).
 * - head: the worn stand hops along an arc to the wearer's head and fades into it.
 * - shrink: any other live stand folds away where it stands.
 */
export const FLY_S=.55
const clamp01=v=>Math.max(0,Math.min(1,v))
const smooth=x=>{const t=clamp01(x);return t*t*(3-2*t)}

/** @param {number} p @param {boolean} away @param {number} dt seconds */
export function stepFlight(p,away,dt){return clamp01(p+(away?dt:-dt)/FLY_S)}

/**
 * @param {number} p progress 0..1
 * @param {'head'|'shrink'} kind
 * @returns {{along:number,lift:number,scale:number,opacity:number,shadow:number,visible:boolean}}
 */
export function flight(p,kind){
 if(!(p>0))return {along:0,lift:0,scale:1,opacity:1,shadow:1,visible:true}
 if(p>=1)return {along:1,lift:0,scale:0,opacity:0,shadow:0,visible:false}
 const e=smooth(p),shadow=1-smooth(p*2.2)
 if(kind==='shrink')return {along:0,lift:.08*e,scale:1-e,opacity:1-smooth((p-.5)*2),shadow,visible:true}
 return {along:e,lift:.38*Math.sin(Math.PI*e),scale:1-.4*e,opacity:p>.78?1-smooth((p-.78)/.22):1,shadow,visible:true}
}
