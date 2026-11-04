import {Html} from '@react-three/drei'
import {createPortal,useThree} from '@react-three/fiber'
import {useXRift} from '@xrift/world-components'
import {ATLAS,ICONS} from './icons.mjs'

const css=`.xrift-head-pop-hint,.xrift-head-pop-hint *{pointer-events:none!important}
.xrift-head-pop-hint .hp-bar{position:absolute;right:18px;bottom:18px;display:flex;align-items:center;gap:6px;padding:6px 10px;color:#f3f6f4;background:rgba(28,32,44,.62);border-radius:8px;font:600 11px/1 "Yu Gothic",system-ui,sans-serif;user-select:none;white-space:nowrap}
.xrift-head-pop-hint .hp-key{position:relative;width:26px;height:26px}
.xrift-head-pop-hint .hp-icon{position:absolute;inset:0;background-repeat:no-repeat;background-size:${ATLAS.cols*100}% ${ATLAS.rows*100}%}
.xrift-head-pop-hint .hp-key b{position:absolute;right:-3px;bottom:-3px;min-width:12px;height:12px;border-radius:6px;background:#2a2e3d;color:#fff;font:700 9px/12px system-ui,sans-serif;text-align:center}
.xrift-head-pop-hint .hp-key.fired .hp-icon{animation:hp-pop .5s cubic-bezier(.2,1.8,.4,1)}
.xrift-head-pop-hint kbd{font:700 10px system-ui,sans-serif;border:1px solid #c9d1e080;border-radius:3px;padding:1px 4px;color:#fff;margin-left:4px}
@keyframes hp-pop{0%{transform:scale(.4) translateY(6px)}60%{transform:scale(1.5) translateY(-6px)}100%{transform:scale(1)}}
@media(max-width:720px){.xrift-head-pop-hint .hp-bar{right:10px;bottom:10px;gap:3px}.xrift-head-pop-hint .hp-key{width:20px;height:20px}}`

/** PC-only key strip, screen bottom-right, shown only while worn. The fired icon bounces here
 * too, because the wearer cannot see the top of their own head in first person. */
export function ShortcutHint({id,fired}:{id:string;fired:{icon:number;seq:number}|null}){
 const camera=useThree(state=>state.camera),{baseUrl}=useXRift()
 const url=`${baseUrl}${ATLAS.file}`
 return createPortal(<Html position={[0,0,-1]} fullscreen calculatePosition={(_el,_camera,size)=>[size.width/2,size.height/2]} wrapperClass="xrift-head-pop-hint">
  <style>{css}</style>
  <div className="hp-bar" data-testid="head-pop-hint" data-head-pop-item={id} role="note" aria-label="頭上リアクションのキー">
   {ICONS.map((icon,i)=>{
    const col=i%ATLAS.cols,row=Math.floor(i/ATLAS.cols),hit=fired?.icon===i
    return <span key={hit?`${icon.key}-${fired!.seq}`:icon.key} className={hit?'hp-key fired':'hp-key'} title={icon.label}>
     <span className="hp-icon" style={{backgroundImage:`url("${url}")`,backgroundPosition:`${col*100/(ATLAS.cols-1)}% ${row*100/(ATLAS.rows-1)}%`}}/>
     <b>{i+1}</b>
    </span>})}
   <span><kbd>M</kbd> パレット</span>
  </div>
 </Html>,camera)
}
