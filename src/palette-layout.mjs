import {Quaternion,Vector3} from 'three'

/** Palette geometry in metres (before the body-size scale). */
export const PALETTE = Object.freeze({cols:4,button:.135,gap:.035,rowGap:.035,pillHeight:.075,pillWidth:.2})
export const PALETTE_WIDTH_M = PALETTE.cols*PALETTE.button+(PALETTE.cols-1)*PALETTE.gap
export const PALETTE_HEIGHT_M = 2*PALETTE.button+PALETTE.rowGap*2+PALETTE.pillHeight

/** Local x/y of each cell: icons 0–7 in two rows, then the two pills. */
export function paletteCells(){
 const {cols,button,gap,rowGap,pillHeight,pillWidth}=PALETTE
 const top=PALETTE_HEIGHT_M/2-button/2
 const icons=Array.from({length:8},(_,i)=>{const col=i%cols,row=Math.floor(i/cols);return {x:-PALETTE_WIDTH_M/2+button/2+col*(button+gap),y:top-row*(button+rowGap)}})
 const pillY=-PALETTE_HEIGHT_M/2+pillHeight/2
 return {icons,remove:{x:-(pillWidth/2+gap/2),y:pillY},close:{x:pillWidth/2+gap/2,y:pillY}}
}

const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)?new Vector3(...v):null

/**
 * Owner-relative, upright palette in front of the wearer's body, slightly below the eyes.
 * Uses the avatar (movement) rather than the camera, so third-person PC users see it in
 * front of their avatar. Facing turns toward the viewer around the vertical axis only.
 */
export function computePaletteLayout({movement,avatarHeight,xrEyePosition,viewerPosition,forward,projectionY=1,projectionX=1,minDistance=.7}={}){
 const p=movement?.position,foot=p&&[p.x,p.y,p.z].every(Number.isFinite)?new Vector3(p.x,p.y,p.z):null
 if(!foot)return {status:'waiting-for-local-movement'}
 let eye=vector(xrEyePosition)
 if(xrEyePosition!==undefined&&(!eye||eye.y-foot.y<.05))return {status:'waiting-for-xr-viewer'}
 if(!eye){
  const h=avatarHeight?.eyeHeight
  eye=Number.isFinite(h)&&h>0?foot.clone().add(new Vector3(0,h,0)):foot.clone().add(new Vector3(0,1.5,0))
 }
 let dir=vector(forward)
 if(dir){dir.y=0;if(dir.lengthSq()<1e-8)dir=null;else dir.normalize()}
 if(!dir){
  const yaw=movement?.rotation?.yaw
  if(!Number.isFinite(yaw))return {status:'waiting-for-body-direction'}
  dir=new Vector3(0,0,-1).applyAxisAngle(new Vector3(0,1,0),yaw)
 }
 const scale=Math.max(.6,Math.min(1,(eye.y-foot.y)/1.5)),drop=.2*scale
 const halfH=PALETTE_HEIGHT_M/2*scale
 const distance=Math.max(minDistance*scale,(drop+halfH)*(projectionY>0?projectionY:1)*1.15,PALETTE_WIDTH_M*scale*(projectionX>0?projectionX:1)/1.6)
 const position=eye.clone().addScaledVector(dir,distance);position.y-=drop
 const toward=vector(viewerPosition)?.sub(position)??dir.clone().negate();toward.y=0
 if(toward.lengthSq()<1e-8)toward.copy(dir).negate()
 const quaternion=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.atan2(toward.x,toward.z))
 return {status:'ready',position:position.toArray(),quaternion:quaternion.toArray(),scale,distanceM:distance,forward:dir.toArray()}
}
