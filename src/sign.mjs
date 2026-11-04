/**
 * Living with the head status tag (頭上看板, toMoXRift_item_headkanban v8) on the same head.
 *
 * No shared key or change to that item: its placed root carries `userData.presence`
 * (`ownerId` = who wears it) and its tag group holds the Interactable whose id ends in
 * `:presence:tag-menu`. The tag is a camera-facing plate 0.72 x 0.17 m just above the head,
 * exactly where a reaction pops, so a reaction:
 * - stacks above the plate instead of overlapping it, and
 * - makes the plate step back (fainter, a little smaller) while it shows.
 * The plate is only changed during this client's render and restored right after, so nothing
 * is synced and nothing stays changed if either item goes away.
 */
import {Vector3} from 'three'

const RESCAN_S=.4,_s=new Vector3()
/** Gap between the plate's top edge and the reaction's bottom edge. */
export const SIGN_GAP_M=.05
/** At full strength the plate keeps this much of its opacity and size. */
export const SIGN_DIM_OPACITY=.35, SIGN_DIM_SCALE=.86

const finite=v=>Number.isFinite(v)

/** @param {any} root a scene object whose userData.presence names its wearer */
function readSign(root){
 let menu=null
 root.traverse(o=>{if(!menu&&typeof o.userData?.id==='string'&&o.userData.id.endsWith(':presence:tag-menu'))menu=o})
 if(!menu)return null
 let group=menu
 while(group.parent&&group.parent!==root)group=group.parent
 let plate=null
 menu.traverse(o=>{if(!plate&&o.isMesh)plate=o})
 return plate?{root,group,plate}:null
}

/** @param {{scene:any}} options */
export function createSignFinder({scene}){
 let lastScan=-Infinity,byOwner=new Map()
 const touched=new Map()
 const api={
  /** Re-reads the scene at most every 0.4 s. */
  scan(t){
   if(t-lastScan<RESCAN_S&&t>=lastScan)return
   lastScan=t
   const next=new Map()
   scene.traverse(o=>{
    const owner=o.userData?.presence?.ownerId
    if(typeof owner!=='string'||!owner||next.has(owner))return
    const sign=readSign(o);if(sign)next.set(owner,sign)
   })
   byOwner=next
  },
  /**
   * The plate over userId's head, if it is showing.
   * @returns {{sign:any,x:number,y:number,z:number,top:number}|null}
   */
  locate(userId,out){
   const sign=byOwner.get(userId)
   if(!sign)return null
   // Still in this scene and showing (the tag hides itself while its wearer is not found).
   let rootOf=sign.plate
   for(let o=sign.plate;o;o=o.parent){if(!o.visible)return null;rootOf=o}
   if(rootOf!==scene)return null
   const g=sign.plate.geometry
   if(!g.boundingBox)g.computeBoundingBox()
   const h=(g.boundingBox.max.y-g.boundingBox.min.y)
   const touch=touched.get(sign.plate),scaleY=sign.plate.getWorldScale(_s).y
   const fullY=touch&&sign.plate.scale.y?scaleY*touch.scale.y/sign.plate.scale.y:scaleY // measure the plate at full size
   sign.plate.getWorldPosition(out)
   const top=out.y+h*fullY/2
   if(!finite(out.x)||!finite(top))return null
   return {sign,x:out.x,y:out.y,z:out.z,top}
  },
  /** Fade and shrink the plate for this render (k: 0 = as is, 1 = fully stepped back). */
  dim(sign,k){
   const m=sign.plate,mat=m.material
   if(!mat||Array.isArray(mat)||!(k>0))return
   let o=touched.get(m)
   if(!o){o={opacity:mat.opacity,scale:m.scale.clone(),k:0};touched.set(m,o)}
   if(k<=o.k)return
   o.k=k
   mat.opacity=o.opacity*(1-(1-SIGN_DIM_OPACITY)*k)
   m.scale.copy(o.scale).multiplyScalar(1-(1-SIGN_DIM_SCALE)*k)
   m.updateMatrixWorld(true)
  },
  /** Put every plate back exactly as it was (after the render). */
  restore(){
   for(const [m,o] of touched){if(m.material&&!Array.isArray(m.material))m.material.opacity=o.opacity;m.scale.copy(o.scale);m.updateMatrixWorld(true)}
   touched.clear()
  },
  report(){return [...byOwner].map(([owner,s])=>({owner,visible:s.group.visible}))},
  clear(){api.restore();byOwner=new Map();lastScan=-Infinity},
 }
 return api
}

const TAG_SHORTCUTS=Symbol.for('xrift.presence.shortcuts.v1')
/**
 * True while this browser wears a 頭上看板 (its own key registry says a copy is owned).
 * Then keys are shared out: digits stay reactions (taken first, and the tag ignores a key
 * that was already handled), M is left to the tag's menu and the palette moves to N;
 * in VR the tag keeps R3 and the palette moves to L3.
 */
export function headTagWornHere(){
 const r=globalThis[TAG_SHORTCUTS]
 if(!r?.entries?.values)return false
 for(const c of r.entries.values()){try{if(c?.owned?.()===true)return true}catch{}}
 return false
}
/** Keys and hand for the palette, given whether the head tag is worn here too. */
export function paletteControls(tagWorn){return tagWorn?{key:'KeyN',label:'N',hand:'left'}:{key:'KeyM',label:'M',hand:'right'}}
