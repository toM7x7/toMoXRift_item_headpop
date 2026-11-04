// Scenario checks + screenshots for the local dev page with GPU Chrome.
// Usage: node scripts/capture.mjs [scenario ...]   (dev server on 5262)
// Scenarios: room, strip, keys, palette, wear, sign, thumb, dup, other, vr, touch, preview, sdk
import {chromium} from 'playwright'
import {mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'

const BASE='http://127.0.0.1:5262/'
const OUT=join(import.meta.dirname,'..','output','capture')
const exe=join(process.env.LOCALAPPDATA??'','ms-playwright','chromium-1243','chrome-win64','chrome.exe')
mkdirSync(OUT,{recursive:true})
const browser=await chromium.launch({executablePath:exe,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu']})
const results={},errors=[]
const check=(name,ok,detail)=>{results[name]={ok:!!ok,detail};console.log(ok?'PASS':'FAIL',name,detail===undefined?'':JSON.stringify(detail))}

async function open(query='',waitId,options={}){
 const page=await browser.newPage({viewport:{width:1280,height:800},...options})
 page.on('pageerror',e=>errors.push(String(e)))
 page.on('console',m=>{if(m.type()==='error'||m.text().includes('[head-pop]'))errors.push(m.text())})
 await page.goto(BASE+query)
 await page.waitForFunction(id=>!!window.__headPop?.report?.(id),waitId,{timeout:30000})
 await page.waitForTimeout(600)
 return page
}
const report=page=>page.evaluate(()=>window.__headPop.report())
const reportOf=(page,id)=>page.evaluate(id=>window.__headPop.report(id),id)
const onScreen=(page,id)=>page.evaluate(id=>!!window.__headPop.project(id),id)
/** Real mouse click on an Interactable by id. */
async function clickId(page,id){
 const p=await page.evaluate(id=>window.__headPop.project(id),id)
 if(!p)throw new Error('not on screen: '+id)
 await page.mouse.click(p.x,p.y)
 await page.waitForTimeout(150)
 return p
}

const scenarios={
 async room(){
  const page=await open()
  await clickId(page,'head-pop-one:head-pop:stand')
  check('room: stand click wears',(await report(page)).worn)
  await page.evaluate(()=>{const hp=window.__headPop;hp.clock.freeze();hp.act({type:'pop',icon:3});hp.deliver('remote-a',0);hp.deliver('remote-b',7);hp.clock.step(1.05)})
  await page.waitForTimeout(200)
  const r=await report(page)
  const by=Object.fromEntries(r.pops.map(p=>[p.userId,p]))
  check('room: three users pop at once',r.pops.length===3&&r.pops.every(p=>p.visible),r.pops.map(p=>[p.userId,p.icon,p.source]))
  check('room: humanoids use the head, box uses feet+height',by['local-dev']?.source==='head'&&by['remote-a']?.source==='head'&&by['remote-b']?.source==='movement')
  check('room: remote-a icon is above remote-a',Math.abs(by['remote-a'].position[0]-1.25)<.15&&Math.abs(by['remote-a'].position[2]+.55)<.15&&by['remote-a'].position[1]>2.1,by['remote-a'].position)
  check('room: own pop was broadcast once',(await page.evaluate(()=>window.__headPop.sent())).length===1)
  await page.screenshot({path:join(OUT,'room.png')})
  await page.close()
 },
 async strip(){
  const page=await open()
  await page.evaluate(()=>window.__headPop.act({type:'wear'}))
  await page.waitForTimeout(100)
  for(const [icon,label] of [[3,'like'],[0,'surprise'],[2,'heart']]){
   await page.evaluate(icon=>{const hp=window.__headPop;hp.clock.freeze();hp.act({type:'pop',icon})},icon)
   // Pin the crop on where the icon rests (after the hop), then step from t=0.
   await page.evaluate(()=>window.__headPop.clock.step(1));await page.waitForTimeout(120)
   const rest=await page.evaluate(()=>{const p=window.__headPop.report().pops.find(p=>p.userId==='local-dev');return window.__headPop.point(p.position)})
   const clip={x:Math.round(rest.x-110),y:Math.round(rest.y-120),width:220,height:220}
   await page.evaluate(icon=>{const hp=window.__headPop;hp.clock.run();hp.clock.freeze();hp.act({type:'pop',icon})},icon)
   const times=[0,.04,.08,.12,.17,.23,.3,.38,.5,.7,1.2,2.8,2.9,3.0]
   let last=0
   for(const t of times){
    await page.evaluate(dt=>window.__headPop.clock.step(dt),t-last);last=t
    await page.waitForTimeout(90)
    await page.screenshot({path:join(OUT,`strip-${label}-${String(Math.round(t*100)).padStart(3,'0')}.png`),clip})
   }
   await page.evaluate(()=>{window.__headPop.clock.step(5);window.__headPop.clock.run()})
   await page.waitForTimeout(150)
  }
  await page.close()
 },
 async keys(){
  const page=await open()
  await page.mouse.click(640,700) // focus the canvas, not a UI element
  await page.keyboard.press('Digit1')
  check('keys: ignored while not worn',(await report(page)).pops.length===0)
  await clickId(page,'head-pop-one:head-pop:stand')
  const seen=[]
  for(let i=1;i<=8;i++){await page.keyboard.press(`Digit${i}`);await page.waitForTimeout(160);const r=await report(page);seen.push(r.fired?.icon)}
  check('keys: 1–8 pop icons 0–7',JSON.stringify(seen)===JSON.stringify([0,1,2,3,4,5,6,7]),seen)
  await page.keyboard.press('Control+Alt+Digit2');await page.waitForTimeout(160)
  check('keys: Ctrl+Alt fallback',(await report(page)).fired?.icon===1)
  await page.keyboard.press('Digit9');await page.keyboard.press('Shift+Digit3');await page.waitForTimeout(160)
  check('keys: 9 and Shift are ignored',(await report(page)).fired?.icon===1)
  const sent=await page.evaluate(()=>window.__headPop.sent().length)
  check('keys: one event per accepted key',sent===9,sent)
  await page.keyboard.press('KeyM');await page.waitForTimeout(200)
  check('keys: M opens the palette and hides the hint',(await report(page)).paletteOpen&&!(await report(page)).hint&&!(await page.$('[data-testid=head-pop-hint]')))
  await page.keyboard.press('KeyM');await page.waitForTimeout(200)
  check('keys: M closes it',!(await report(page)).paletteOpen&&(await report(page)).hint)
  await page.close()
 },
 async palette(){
  const page=await open()
  await clickId(page,'head-pop-one:head-pop:stand')
  await page.waitForTimeout(800)
  let r=await report(page)
  check('palette: the worn stand leaves its spot',r.worn&&r.stand.away&&r.stand.p===1&&r.stand.kind==='head'&&!(await onScreen(page,'head-pop-one:head-pop:stand')),r.stand)
  await page.keyboard.press('KeyM');await page.waitForTimeout(200)
  r=await report(page)
  check('palette: M opens it while worn',r.paletteOpen&&r.palette?.status==='ready',r.palette)
  await page.waitForTimeout(300)
  await page.screenshot({path:join(OUT,'palette.png')})
  const ids=['icon-0','icon-3','icon-7','remove','close'].map(k=>`head-pop-one:head-pop:${k}`)
  const where=await page.evaluate(ids=>ids.map(id=>window.__headPop.project(id)),ids)
  check('palette: buttons on screen with texts',where.every(w=>w&&w.x>0&&w.x<1280&&w.y>0&&w.y<800),where.map(w=>w&&[Math.round(w.x),Math.round(w.y),w.text]))
  await clickId(page,'head-pop-one:head-pop:icon-4')
  r=await report(page)
  check('palette: a button pops and closes',r.fired?.icon===4&&!r.paletteOpen&&r.pops.some(p=>p.userId==='local-dev'&&p.icon===4))
  await page.keyboard.press('KeyM');await page.waitForTimeout(200)
  await clickId(page,'head-pop-one:head-pop:remove')
  r=await report(page)
  check('palette: 外す takes it off',!r.worn&&!r.paletteOpen&&!r.hint)
  await page.waitForTimeout(800)
  r=await report(page)
  check('palette: the stand is back on its spot and can be worn again',r.stand.p===0&&!r.stand.away&&(await onScreen(page,'head-pop-one:head-pop:stand')),r.stand)
  await page.keyboard.press('Digit2');await page.waitForTimeout(150)
  check('palette: keys stop after taking off',(await report(page)).fired?.icon===4)
  await page.close()
 },
 async wear(){
  const page=await open()
  await page.evaluate(()=>window.__headPop.view([2.9,1.75,3.0],[.25,1.6,.55]))
  await page.waitForTimeout(300)
  // Frame-stepped: the clock is frozen before the real click, so the hop starts at 0.
  await page.evaluate(()=>window.__headPop.clock.freeze())
  await clickId(page,'head-pop-one:head-pop:stand')
  let r=await report(page)
  check('wear: real click wears it',r.worn,r.stand)
  const shots=[]
  let last=0
  for(const t of [0,.08,.16,.24,.32,.4,.48,.56]){
   await page.evaluate(dt=>window.__headPop.clock.step(dt),t-last);last=t;await page.waitForTimeout(160)
   const s=(await report(page)).stand
   shots.push([t,+s.p.toFixed(2),s.target])
   await page.screenshot({path:join(OUT,`wear-${String(Math.round(t*100)).padStart(3,'0')}.png`)})
  }
  r=await report(page)
  check('wear: it hops to where my pops appear and is gone',r.stand.p===1&&shots.some(s=>s[2]==='head'),shots)
  check('wear: nothing left to select at the spot',!(await onScreen(page,'head-pop-one:head-pop:stand')))
  await page.evaluate(()=>window.__headPop.act({type:'remove'}))
  last=0
  for(const t of [0,.16,.32,.48,.6]){
   await page.evaluate(dt=>window.__headPop.clock.step(dt),t-last);last=t;await page.waitForTimeout(110)
   await page.screenshot({path:join(OUT,`back-${String(Math.round(t*100)).padStart(3,'0')}.png`)})
  }
  r=await report(page)
  check('wear: 外す brings it back to the spot',!r.worn&&r.stand.p===0&&(await onScreen(page,'head-pop-one:head-pop:stand')),r.stand)
  await page.evaluate(()=>window.__headPop.clock.run())
  await page.close()
 },
 async sign(){
  // The real 頭上看板 v8 (../../references/headkanban-ref) worn on the same head.
  const page=await open('?sign=1')
  const loaded=await page.waitForFunction(()=>!!window.__headPop.sign(),null,{timeout:20000}).then(()=>true).catch(()=>false)
  check('sign: the real head tag loads next to the item',loaded)
  if(!loaded){await page.close();return}
  await page.evaluate(()=>window.__headPop.sign().act({type:'equip'}))
  await page.evaluate(()=>window.__headPop.act({type:'wear'}))
  await page.evaluate(()=>window.__headPop.view([.55,2.35,2.1],[0,2.2,0]))
  await page.waitForFunction(()=>!!window.__headPop.sign()?.presence?.tagPosition,null,{timeout:15000}).catch(()=>{})
  await page.waitForTimeout(900)
  const tag=(await page.evaluate(()=>window.__headPop.sign().presence))
  check('sign: the tag sits over my head',tag?.ownerId==='local-dev'&&Array.isArray(tag.tagPosition),{owner:tag?.ownerId,phase:tag?.phase,at:tag?.tagPosition})
  // The plate itself, read between renders.
  const plate=()=>page.evaluate(()=>{let m=null;window.__headPop.scene.traverse(o=>{if(!m&&typeof o.userData?.id==='string'&&o.userData.id.endsWith(':presence:tag-menu'))o.traverse(c=>{if(!m&&c.isMesh)m=c})});if(!m)return null;const b=new m.geometry.boundingBox.constructor().setFromObject(m);return {opacity:m.material.opacity,scale:m.scale.x,top:b.max.y,depthTest:m.material.depthTest}})
  const before=await plate()
  await page.screenshot({path:join(OUT,'sign-0-tag.png')})
  await page.evaluate(()=>{const hp=window.__headPop;hp.clock.freeze();hp.act({type:'pop',icon:2})})
  await page.evaluate(()=>window.__headPop.clock.step(.09));await page.waitForTimeout(200)
  let r=await report(page)
  check('sign: a burst flares as it pops',r.pops[0]?.burst===true,r.pops[0])
  await page.screenshot({path:join(OUT,'sign-1-burst.png')})
  await page.evaluate(()=>window.__headPop.clock.step(.9));await page.waitForTimeout(200)
  r=await report(page)
  const p=r.pops[0]
  check('sign: the reaction stacks above the tag (bottom edge clears the plate top)',p?.stacked&&p.position[1]-.16>before.top+.02,{bottom:+(p?.position[1]-.16).toFixed(3),plateTop:+before.top.toFixed(3)})
  check('sign: the tag steps back while it shows',p?.yielded===1,p?.yielded)
  const between=await plate()
  check('sign: the tag is untouched between renders',between.opacity===before.opacity&&between.scale===before.scale,{before,between})
  await page.screenshot({path:join(OUT,'sign-2-hold.png')})
  await page.evaluate(()=>window.__headPop.clock.step(2.4));await page.waitForTimeout(200)
  await page.screenshot({path:join(OUT,'sign-3-after.png')})
  r=await report(page)
  check('sign: after the pop the tag is back as it was',r.pops.length===0&&(await plate()).opacity===before.opacity)
  await page.evaluate(()=>window.__headPop.clock.run())
  await page.close()
 },
 async touch(){
  // A phone: no M key, so the stand stays and opens the palette.
  const page=await open('',undefined,{hasTouch:true,isMobile:true,viewport:{width:900,height:800}})
  let r=await report(page)
  check('touch: no fine pointer, the stand stays as the way to the palette',r.stand.summonable===false,{summonable:r.stand.summonable,any:await page.evaluate(()=>matchMedia('(any-pointer: fine)').matches)})
  await page.evaluate(()=>window.__headPop.act({type:'wear'}));await page.waitForTimeout(800)
  r=await report(page)
  check('touch: worn, still on its spot',r.worn&&!r.stand.away&&r.stand.p===0&&(await onScreen(page,'head-pop-one:head-pop:stand')),r.stand)
  await page.close()
 },
 async thumb(){
  const page=await browser.newPage({viewport:{width:1024,height:1024}})
  page.on('pageerror',e=>errors.push(String(e)))
  await page.goto(BASE+'?shot=1')
  await page.waitForFunction(()=>!!window.__headPop?.report?.(),null,{timeout:30000})
  await page.waitForTimeout(800)
  await page.evaluate(async()=>{const hp=window.__headPop;hp.act({type:'wear'});await new Promise(r=>setTimeout(r,100))
   hp.view([.42,2.12,2.55],[.42,1.62,-.15]);hp.clock.freeze();hp.act({type:'pop',icon:2});hp.deliver('remote-a',3);hp.clock.step(1.05)})
  await page.waitForTimeout(300)
  await page.screenshot({path:join(OUT,'thumb-1024.png')})
  await page.close()
 },
 async dup(){
  const page=await open('?dup=1')
  const one=await page.evaluate(()=>window.__headPop.report()),two=await page.evaluate(()=>window.__headPop.report('head-pop-two'))
  check('dup: my first copy is live, my second is an extra',one.role==='primary'&&two.role==='duplicate',[one.role,two.role])
  const ghost=await clickId(page,'head-pop-two:head-pop:stand')
  check('dup: the extra copy says it is already placed and does not wear',/もう1個置いて/.test(ghost.text)&&!(await page.evaluate(()=>window.__headPop.report('head-pop-two'))).worn&&!(await report(page)).worn,ghost.text)
  await clickId(page,'head-pop-one:head-pop:stand')
  await page.evaluate(()=>{const hp=window.__headPop;hp.clock.freeze();hp.act({type:'pop',icon:2});hp.deliver('remote-a',0);hp.clock.step(1)})
  await page.waitForTimeout(250)
  const counts=await page.evaluate(()=>{let n=0;window.__headPop.scene.traverse(o=>{if(o.isMesh&&o.renderOrder===12&&o.parent?.visible)n++});return n})
  check('dup: each reaction shows once, not once per copy',counts===2,counts)
  await page.evaluate(()=>{window.__headPop.clock.run()})
  await page.waitForTimeout(400)
  await page.screenshot({path:join(OUT,'dup.png')})
  await page.close()
 },
 async other(){
  const page=await open('?dup=1&other=1')
  const [one,two,three]=await page.evaluate(()=>['head-pop-one','head-pop-two','head-pop-three'].map(id=>window.__headPop.report(id)))
  check('other: my extra stops, the neighbour keeps theirs',one.role==='primary'&&two.role==='duplicate'&&three.role==='primary',[one.role,two.role,three.role])
  check('other: exactly one copy renders the pops',one.renderer&&!two.renderer&&!three.renderer)
  await clickId(page,'head-pop-three:head-pop:stand')
  check('other: I can wear the stand the neighbour placed',(await reportOf(page,'head-pop-three')).worn)
  await page.waitForTimeout(800)
  {const [a,b,c]=await Promise.all(['head-pop-one','head-pop-two','head-pop-three'].map(id=>reportOf(page,id)))
   check('other: while worn, both live stands leave for me (the worn one to my head, the other folds)',c.stand.p===1&&c.stand.kind==='head'&&a.stand.p===1&&a.stand.kind==='shrink',[a.stand,c.stand])
   check('other: my grey extra stays so it can be cleaned up',b.stand.p===0&&(await onScreen(page,'head-pop-two:head-pop:stand')))}
  await page.mouse.click(640,760)
  await page.keyboard.press('Digit3');await page.waitForTimeout(200)
  await page.evaluate(()=>window.__headPop.deliver('remote-a',0));await page.waitForTimeout(200)
  const counts=await page.evaluate(()=>{let n=0;window.__headPop.scene.traverse(o=>{if(o.isMesh&&o.renderOrder===12&&o.parent?.visible)n++});return n})
  const pops=(await report(page)).pops.map(p=>[p.userId,p.icon])
  check('other: pops from a non-renderer stand show once, over my head',counts===2&&JSON.stringify(pops)===JSON.stringify([['local-dev',2],['remote-a',0]]),{counts,pops})
  check('other: one event sent',(await page.evaluate(()=>window.__headPop.sent())).length===1)
  await page.screenshot({path:join(OUT,'other.png')})
  await page.close()
 },
 async vr(){
  const page=await open()
  await page.evaluate(()=>window.__headPop.act({type:'wear'}));await page.waitForTimeout(150)
  // A fake XR session with one right xr-standard controller, fed to the real code path.
  await page.evaluate(()=>{
   const calls=[],buttons=[0,1,2,3].map(()=>({pressed:false,value:0}))
   const right={handedness:'right',targetRayMode:'tracked-pointer',gamepad:{mapping:'xr-standard',connected:true,buttons,axes:[0,0,0,0],hapticActuators:[{pulse:(i,ms)=>calls.push([+i.toFixed(2),ms])}]}}
   const session={visibilityState:'visible',inputSources:[right],addEventListener(){},removeEventListener(){}}
   window.__fakeXR={calls,buttons,session,right}
   window.__headPop.gl.xr.getSession=()=>session
  })
  await page.waitForTimeout(250)
  check('vr: the PC key hint hides while an XR session exists',!(await report(page)).hint)
  await page.evaluate(()=>{window.__fakeXR.buttons[3].pressed=true});await page.waitForTimeout(250)
  await page.evaluate(()=>{window.__fakeXR.buttons[3].pressed=false});await page.waitForTimeout(150)
  let r=await report(page)
  check('vr: R3 opens the palette with a light tick',r.paletteOpen&&r.vr.fires===1&&JSON.stringify(await page.evaluate(()=>window.__fakeXR.calls))==='[[0.25,18]]',{open:r.paletteOpen,fires:r.vr.fires,calls:await page.evaluate(()=>window.__fakeXR.calls)})
  await page.evaluate(()=>{window.__fakeXR.buttons[0].pressed=true;window.__fakeXR.buttons[3].pressed=true});await page.waitForTimeout(200)
  await page.evaluate(()=>{window.__fakeXR.buttons[0].pressed=false;window.__fakeXR.buttons[3].pressed=false});await page.waitForTimeout(150)
  check('vr: R3 with the trigger held does nothing',(await report(page)).paletteOpen&&(await report(page)).vr.fires===1)
  await page.evaluate(()=>window.__headPop.clock.freeze())
  const at=await clickId(page,'head-pop-one:head-pop:icon-2')
  await page.waitForTimeout(200)
  r=await report(page)
  const calls=await page.evaluate(()=>window.__fakeXR.calls)
  check('vr: picking a button pops it and taps twice in the hand',r.fired?.icon===2&&!r.paletteOpen&&JSON.stringify(calls)==='[[0.25,18],[0.45,30],[0.85,55]]',calls)
  check('vr: an echo starts at the pressed button',r.echo?.icon===2&&Array.isArray(r.echo.position),r.echo)
  check('vr: with a controller the stand is away (R3 opens the palette)',r.stand.away&&r.stand.summonable,r.stand)
  const clip={x:Math.round(at.x-110),y:Math.round(at.y-190),width:220,height:240}
  let last=0
  for(const t of [.04,.12,.24,.45,.7,.95]){
   await page.evaluate(dt=>window.__headPop.clock.step(dt),t-last);last=t;await page.waitForTimeout(90)
   await page.screenshot({path:join(OUT,`echo-${String(Math.round(t*100)).padStart(3,'0')}.png`),clip})
  }
  await page.evaluate(()=>window.__headPop.clock.run())
  // Hand tracking only: no R3, so the stand comes back as the way to the palette.
  await page.evaluate(()=>{window.__fakeXR.session.inputSources=[{handedness:'right',targetRayMode:'tracked-pointer',hand:{}}]})
  await page.waitForTimeout(900)
  r=await report(page)
  const hand=await page.evaluate(()=>window.__headPop.project('head-pop-one:head-pop:stand'))
  check('vr: hands only, the stand comes back and opens the palette',r.worn&&!r.stand.summonable&&!r.stand.away&&r.stand.p===0&&hand?.text==='リアクションを選ぶ',{stand:r.stand,text:hand?.text})
  await page.evaluate(()=>{window.__fakeXR.session.inputSources=[window.__fakeXR.right]})
  await page.waitForTimeout(900)
  r=await report(page)
  check('vr: controllers back, the stand leaves again',r.stand.away&&r.stand.p===1,r.stand)
  await page.evaluate(()=>window.__headPop.act({type:'remove'}));await page.waitForTimeout(150)
  check('vr: taking it off ticks the hand',(await report(page)).vr.haptics.ticks===2,(await report(page)).vr.haptics)
  await page.close()
 },
 async preview(){
  for(const [query,expect,file] of [['?preview=solo','preview-first','preview.png'],['?preview=1','preview-duplicate','preview-blocked.png']]){
   const page=await open(query,'head-pop-preview')
   const r=await page.evaluate(()=>window.__headPop.report('head-pop-preview'))
   check(`preview: ${query} role`,r?.role===expect&&!r.worn,r?.role)
   const hit=await page.evaluate(()=>window.__headPop.project('head-pop-preview:head-pop:stand'))
   check(`preview: ${query} has no selectable target`,hit===null)
   await page.evaluate(()=>window.__headPop.view([1.0,1.9,3.6],[1.3,.7,1.0]))
   await page.waitForTimeout(300)
   await page.screenshot({path:join(OUT,file)})
   await page.close()
  }
 },
 async sdk(){
  const page=await browser.newPage({viewport:{width:1280,height:800}})
  page.on('pageerror',e=>errors.push(String(e)))
  await page.goto(BASE+'?sdk=1')
  await page.waitForFunction(()=>!!window.__headPop?.report?.(),null,{timeout:40000})
  await page.waitForTimeout(3000)
  // Official CenterRaycaster: turn toward the sticker and click with pointer lock.
  // The player spawns facing the sticker: the first click locks the pointer, the next one
  // goes through the official CenterRaycaster.
  await page.mouse.click(640,400);await page.waitForTimeout(400)
  if(!(await report(page)).worn){await page.mouse.click(640,400);await page.waitForTimeout(400)}
  const before=await report(page)
  check('sdk: center-ray click on the sticker wears it',before.worn)
  await page.waitForTimeout(800)
  {const r=await report(page);check('sdk: worn, the sticker leaves its spot for my head',r.stand.away&&r.stand.p===1&&r.stand.kind==='head',r.stand)}
  await page.evaluate(()=>window.__headPop.act({type:'remove'}));await page.waitForTimeout(150)
  await page.keyboard.press('Control+Alt+Digit3');await page.waitForTimeout(200)
  check('sdk: keys do nothing before wearing',(await report(page)).pops.length===0)
  await page.evaluate(()=>window.__headPop.act({type:'wear'}))
  await page.keyboard.press('Control+Alt+Digit3');await page.waitForTimeout(200)
  let r=await report(page)
  check('sdk: Ctrl+Alt+3 pops a heart through DevEnvironment',r.fired?.icon===2&&r.pops.length===1,r.pops.map(p=>[p.icon,p.source]))
  await page.keyboard.press('Digit4');await page.waitForTimeout(200)
  r=await report(page)
  check('sdk: plain 4 (host may capture it)',true,{plainReached:r.fired?.icon===3})
  await page.keyboard.press('Control+Alt+KeyM');await page.waitForTimeout(300)
  r=await report(page)
  check('sdk: Ctrl+Alt+M opens the palette',r.paletteOpen&&r.palette?.status==='ready',r.palette?.status)
  void before
  await page.screenshot({path:join(OUT,'sdk.png')})
  await page.close()
 },
}

const names=process.argv.slice(2).length?process.argv.slice(2):Object.keys(scenarios)
for(const n of names){try{await scenarios[n]()}catch(e){check(n+': crashed',false,String(e))}}
console.log('errors',errors)
writeFileSync(join(OUT,'results.json'),JSON.stringify({results,errors},null,1))
await browser.close()
const failed=Object.values(results).filter(r=>!r.ok).length
process.exit(failed||errors.length?1:0)
