import test from 'node:test'
import assert from 'node:assert/strict'
import {ICONS,ICON_COUNT,atlasRect,isIconIndex} from '../src/icons.mjs'
import {shortcutAction} from '../src/input.mjs'
import {popMotion,standMotion,STAND_CYCLE_S,POP_IN_S,POP_HOLD_S,POP_TOTAL_S,easeOutBack} from '../src/motion.mjs'
import {CHANNEL,createRateGate,makePayload,readEvent} from '../src/channel.mjs'
import {placementRole,registerPlacement,subscribePlacements,placementsVersion} from '../src/placements.mjs'
import {computePaletteLayout,paletteCells,PALETTE_WIDTH_M,PALETTE_HEIGHT_M} from '../src/palette-layout.mjs'

const key=(code,extra={})=>({code,repeat:false,isComposing:false,metaKey:false,shiftKey:false,ctrlKey:false,altKey:false,defaultPrevented:false,target:null,...extra})

test('8 icons in key order, atlas cells tile the texture',()=>{
 assert.equal(ICON_COUNT,8)
 assert.deepEqual(ICONS.map(i=>i.glyph),['！','？','♥','👍','💡','💦','♪','💤'])
 assert.deepEqual(atlasRect(0),{u0:0,u1:.25,v0:.5,v1:1})
 assert.deepEqual(atlasRect(7),{u0:.75,u1:1,v0:0,v1:.5})
 assert.throws(()=>atlasRect(8))
 assert.equal(isIconIndex(3),true);assert.equal(isIconIndex(1.5),false);assert.equal(isIconIndex(-1),false)
})

test('digits 1–8 pop, M opens the palette, Ctrl+Alt is the same map',()=>{
 for(let i=1;i<=8;i++){
  assert.deepEqual(shortcutAction(key(`Digit${i}`)),{type:'pop',icon:i-1})
  assert.deepEqual(shortcutAction(key(`Numpad${i}`)),{type:'pop',icon:i-1})
  assert.deepEqual(shortcutAction(key(`Digit${i}`,{ctrlKey:true,altKey:true})),{type:'pop',icon:i-1})
 }
 assert.deepEqual(shortcutAction(key('KeyM')),{type:'palette'})
 assert.deepEqual(shortcutAction(key('KeyM',{ctrlKey:true,altKey:true})),{type:'palette'})
 assert.equal(shortcutAction(key('Digit9')),null)
 assert.equal(shortcutAction(key('Digit0')),null)
 assert.equal(shortcutAction(key('KeyW')),null)
})

test('keys are ignored while typing, repeating, composing or with other modifiers',()=>{
 const input={closest:s=>s.includes('input')?{}:null}
 assert.equal(shortcutAction(key('Digit1',{target:input})),null)
 assert.equal(shortcutAction(key('Digit1',{target:{isContentEditable:true}})),null)
 assert.equal(shortcutAction(key('Digit1',{repeat:true})),null)
 assert.equal(shortcutAction(key('Digit1',{isComposing:true})),null)
 assert.equal(shortcutAction(key('Digit1',{ctrlKey:true})),null)
 assert.equal(shortcutAction(key('Digit1',{altKey:true})),null)
 assert.equal(shortcutAction(key('Digit1',{shiftKey:true})),null)
 assert.equal(shortcutAction(key('Digit1',{defaultPrevented:true})),null)
})

test('pop starts at zero size, overshoots, settles, then disappears',()=>{
 const start=popMotion(0,0)
 assert.equal(start.visible,true);assert.ok(start.sx<1e-9&&start.sy<1e-9)
 const peak=Math.max(...Array.from({length:40},(_,i)=>easeOutBack(i/39)))
 assert.ok(peak>1.08,'overshoot gives the pop')
 for(let icon=0;icon<8;icon++){
  for(let t=POP_IN_S+.4;t<POP_IN_S+POP_HOLD_S;t+=.05){
   const m=popMotion(icon,t)
   assert.ok(m.visible&&m.opacity===1)
   assert.ok(m.sx>.75&&m.sx<1.25&&m.sy>.75&&m.sy<1.25,`icon ${icon} scale at ${t}`)
   assert.ok(Math.abs(m.dx)<.05&&Math.abs(m.dy)<.12&&Math.abs(m.rot)<.4)
  }
  assert.ok(popMotion(icon,POP_TOTAL_S-.01).sx<.2)
  assert.equal(popMotion(icon,POP_TOTAL_S).done,true)
  assert.equal(popMotion(icon,POP_TOTAL_S).visible,false)
 }
 assert.equal(popMotion(0,-1).visible,false)
 assert.equal(popMotion(0,NaN).visible,false)
 assert.equal(popMotion(0,1.2,.5).done,true,'custom hold shortens the pop')
})

test('events: one room-wide name, server sender id, strict payload',()=>{
 assert.equal(CHANNEL,'head-pop:v2')
 assert.deepEqual(readEvent({payload:makePayload(4),senderId:'u1',timestamp:1}),{senderId:'u1',icon:4})
 for(const bad of [null,{},{payload:makePayload(9),senderId:'u'},{payload:{v:2,icon:1},senderId:'u'},{payload:makePayload(1),senderId:''},{payload:makePayload(1)},{payload:{v:1,icon:'1'},senderId:'u'}])assert.equal(readEvent(bad),null)
})

test('rate gate drops bursts per sender only',()=>{
 const gate=createRateGate(100)
 assert.equal(gate.allow('a',0),true)
 assert.equal(gate.allow('a',50),false)
 assert.equal(gate.allow('b',50),true)
 assert.equal(gate.allow('a',120),true)
})

test('palette sits in front of the body below the eyes and faces the viewer',()=>{
 const layout=computePaletteLayout({movement:{position:{x:0,y:0,z:0},rotation:{yaw:Math.PI}},avatarHeight:{eyeHeight:1.6},viewerPosition:[0,1.6,3]})
 assert.equal(layout.status,'ready')
 const [x,y,z]=layout.position
 assert.ok(Math.abs(x)<1e-9&&z>.6&&z<1.2,'in front (+Z for yaw π)')
 assert.ok(y<1.6&&y>1.2,'a little below the eyes')
 assert.equal(computePaletteLayout({}).status,'waiting-for-local-movement')
 const cells=paletteCells()
 assert.equal(cells.icons.length,8)
 for(const c of cells.icons)assert.ok(Math.abs(c.x)<=PALETTE_WIDTH_M/2&&Math.abs(c.y)<=PALETTE_HEIGHT_M/2)
 assert.ok(cells.remove.x<0&&cells.close.x>0)
})

test('one stand per room: smallest placed id is primary, previews never count',()=>{
 let changes=0
 const off=subscribePlacements(()=>changes++)
 const b=registerPlacement('b-copy',false)
 assert.equal(placementRole('b-copy'),'primary')
 const p=registerPlacement('z-preview',true)
 assert.equal(placementRole('z-preview'),'preview-duplicate','placing while one exists is greyed')
 assert.equal(placementRole('b-copy'),'primary','a preview never takes over')
 const a=registerPlacement('a-copy',false)
 assert.equal(placementRole('a-copy'),'primary')
 assert.equal(placementRole('b-copy'),'duplicate')
 const v=placementsVersion()
 a()
 assert.ok(placementsVersion()>v)
 assert.equal(placementRole('b-copy'),'primary','the remaining copy takes over')
 b()
 assert.equal(placementRole('z-preview'),'preview-first')
 p();off()
 assert.ok(changes>=5)
})

test('placed sticker never disappears while cycling',()=>{
 const seen=new Set()
 for(let t=0;t<STAND_CYCLE_S*9;t+=.01){const m=standMotion(t);seen.add(m.icon);assert.ok(m.sx>=.55&&m.sy>=.55,`t=${t.toFixed(2)} ${m.sx}`)}
 assert.equal(seen.size,8)
})
