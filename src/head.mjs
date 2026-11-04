import {selectXRiftAvatar,isXRiftAvatarBindingCurrent} from '../vendor/avatar-anchor/src/adapters/xrift-runtime.mjs'
import {estimateHeadTop} from '../vendor/avatar-anchor/src/overhead.mjs'

/** Rendered icon edge length in metres. */
export const ICON_SIZE_M = .32
/** Icon centre above the measured head top. Clears the host's name label (see head-tag v8). */
export const ICON_CLEARANCE_M = .42
const RESCAN_S = .4, REMEASURE_S = .5, FALLBACK_HEIGHT_M = 1.65

const finite3=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)

/**
 * Finds where a user's icon goes. Prefers the rendered head (measured top of the skinned head
 * mesh); falls back to the reported foot position + avatar height so a pop is never lost.
 * Call from scene.onBeforeRender so the host's animation for this frame is already applied.
 */
export function createHeadTracker({scene,excludeRoot,users}){
 const cache=new Map()
 function entry(userId){let c=cache.get(userId);if(!c){c={binding:null,estimate:null,lastScan:-Infinity,lastMeasure:-Infinity};cache.set(userId,c)}return c}
 /**
  * @param {string} userId
  * @param {string|null} localId
  * @param {number} t seconds (monotonic)
  * @param {import('three').Vector3} out receives the world position
  * @returns {'head'|'movement'|null}
  */
 function locate(userId,localId,t,out){
  const c=entry(userId),excludeRoots=excludeRoot?[excludeRoot]:[]
  if(!isXRiftAvatarBindingCurrent(c.binding,{scene,excludeRoots})||t-c.lastScan>RESCAN_S){
   const next=selectXRiftAvatar({scene,userId,localUserId:localId??undefined,excludeRoots});c.lastScan=t
   if(next.identity!==c.binding?.identity){c.estimate=null;c.lastMeasure=-Infinity}
   c.binding=next
  }
  if(c.binding?.status==='ready'){
   if(!c.estimate||t-c.lastMeasure>REMEASURE_S){
    c.lastMeasure=t
    try{const e=estimateHeadTop({head:c.binding.head,avatarRoot:c.binding.avatarRoot,meshes:c.binding.meshes,clearance:ICON_CLEARANCE_M,maxVertices:4000});c.estimate=e.status==='ready'?e:null}
    catch{c.estimate=null}
   }
   if(c.estimate){
    c.binding.head.getWorldPosition(out)
    out.x+=c.estimate.offset[0];out.y+=c.estimate.offset[1];out.z+=c.estimate.offset[2]
    if(finite3(out))return 'head'
   }
  }
  const local=userId===localId
  const movement=local?users.getLocalMovement?.():users.getMovement?.(userId)
  const p=movement?.position
  if(!finite3(p))return null
  const height=(local?users.getLocalAvatarHeight?.():users.getAvatarHeight?.(userId))?.height
  out.set(p.x,p.y+(Number.isFinite(height)&&height>.2?height:FALLBACK_HEIGHT_M)+ICON_CLEARANCE_M,p.z)
  return 'movement'
 }
 return {locate,forget:userId=>cache.delete(userId),clear:()=>cache.clear()}
}
