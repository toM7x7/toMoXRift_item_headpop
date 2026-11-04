export const PALETTE:{readonly cols:number;readonly button:number;readonly gap:number;readonly rowGap:number;readonly pillHeight:number;readonly pillWidth:number}
export const PALETTE_WIDTH_M:number
export const PALETTE_HEIGHT_M:number
export function paletteCells():{icons:{x:number;y:number}[];remove:{x:number;y:number};close:{x:number;y:number}}
export type PaletteLayout={status:'ready';position:number[];quaternion:number[];scale:number;distanceM:number;forward:number[]}|{status:'waiting-for-local-movement'|'waiting-for-xr-viewer'|'waiting-for-body-direction'}
export function computePaletteLayout(options?:{
 movement?:{position?:{x:number;y:number;z:number};rotation?:{yaw:number;pitch?:number}}
 avatarHeight?:{eyeHeight?:number;height?:number}
 xrEyePosition?:number[]
 viewerPosition?:number[]
 forward?:number[]
 projectionY?:number
 projectionX?:number
 /** Metres in front of the eyes before the body-size scale (VR reach 0.7, PC screen 0.95). */
 minDistance?:number
}):PaletteLayout
