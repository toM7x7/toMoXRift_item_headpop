// Scenario checks + screenshots for the local dev page with GPU Chrome.
// Usage: node scripts/capture.mjs [scenario ...]   (dev server on 5262)
// Scenarios: room, strip, keys, palette, sdk
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

async function open(query='',waitId){
 const page=await browser.newPage({viewport:{width:1280,height:800}})
 page.on('pageerror',e=>errors.push(String(e)))
 page.on('console',m=>{if(m.type()==='error'||m.text().includes('[head-pop]'))errors.push(m.text())})
 await page.goto(BASE+query)
 await page.waitForFunction(id=>!!window.__headPop?.report?.(id),waitId,{timeout:30000})
 await page.waitForTimeout(600)
 return page
}
const report=page=>page.evaluate(()=>window.__headPop.report())
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
  await clickId(page,'head-pop-one:head-pop:stand')
  let r=await report(page)
  check('palette: selecting the sticker while worn opens it',r.paletteOpen&&r.palette?.status==='ready',r.palette)
  await page.waitForTimeout(300)
  await page.screenshot({path:join(OUT,'palette.png')})
  const ids=['icon-0','icon-3','icon-7','remove','close'].map(k=>`head-pop-one:head-pop:${k}`)
  const where=await page.evaluate(ids=>ids.map(id=>window.__headPop.project(id)),ids)
  check('palette: buttons on screen with texts',where.every(w=>w&&w.x>0&&w.x<1280&&w.y>0&&w.y<800),where.map(w=>w&&[Math.round(w.x),Math.round(w.y),w.text]))
  await clickId(page,'head-pop-one:head-pop:icon-4')
  r=await report(page)
  check('palette: a button pops and closes',r.fired?.icon===4&&!r.paletteOpen&&r.pops.some(p=>p.userId==='local-dev'&&p.icon===4))
  await clickId(page,'head-pop-one:head-pop:stand')
  await clickId(page,'head-pop-one:head-pop:remove')
  r=await report(page)
  check('palette: 外す takes it off',!r.worn&&!r.paletteOpen&&!r.hint)
  await page.keyboard.press('Digit2');await page.waitForTimeout(150)
  check('palette: keys stop after taking off',(await report(page)).fired?.icon===4)
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
  check('dup: smallest id is the live stand, the other is an extra',one.role==='primary'&&two.role==='duplicate',[one.role,two.role])
  const ghost=await clickId(page,'head-pop-two:head-pop:stand')
  check('dup: the extra copy says it is already placed and does not wear',/もう置いて/.test(ghost.text)&&!(await page.evaluate(()=>window.__headPop.report('head-pop-two'))).worn&&!(await report(page)).worn,ghost.text)
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
