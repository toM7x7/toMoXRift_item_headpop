import test from 'node:test'
import assert from 'node:assert/strict'
import {Vector3} from 'three'
import {FLY_S,flight,stepFlight} from '../src/flight.mjs'
import {setWearing,subscribeWearing,wearingAny} from '../src/wearing.mjs'
import {bindRenderer,locateUser,registerPlacement} from '../src/placements.mjs'
import {menuControllers} from '../src/vr-menu.mjs'

test('the worn stand hops to the head and is gone; taking it off brings it back',()=>{
 assert.deepEqual(flight(0,'head'),{along:0,lift:0,scale:1,opacity:1,shadow:1,visible:true})
 assert.equal(flight(1,'head').visible,false)
 let p=0,prev=-1
 for(let i=0;i<30;i++){p=stepFlight(p,true,1/60);const m=flight(p,'head');assert.ok(m.along>=prev,'moves only toward the head');prev=m.along}
 assert.ok(p>.7&&p<1,'not there yet after 0.5 s')
 const mid=flight(.5,'head')
 assert.ok(mid.lift>.3,'arcs up on the way')
 assert.ok(mid.shadow<.2,'the floor shadow goes first')
 for(let i=0;i<Math.ceil(FLY_S*60)+2;i++)p=stepFlight(p,true,1/60)
 assert.equal(p,1)
 for(let i=0;i<Math.ceil(FLY_S*60)+2;i++)p=stepFlight(p,false,1/60)
 assert.equal(p,0,'back on its spot')
 assert.equal(stepFlight(0,false,1),0);assert.equal(stepFlight(1,true,1),1)
})

test('other stands fold away where they stand',()=>{
 for(const p of [.1,.4,.8]){const m=flight(p,'shrink');assert.equal(m.along,0);assert.ok(m.scale<1&&m.visible)}
 assert.ok(flight(.9,'shrink').scale<.1)
})

test('wearing is tracked per copy and notifies once per change',()=>{
 let calls=0
 const off=subscribeWearing(()=>calls++)
 assert.equal(wearingAny(),false)
 setWearing('a',true);setWearing('a',true)
 assert.equal(wearingAny(),true);assert.equal(calls,1)
 setWearing('b',false);assert.equal(calls,1,'no change, no notice')
 setWearing('a',false);assert.equal(wearingAny(),false);assert.equal(calls,2)
 off()
 assert.equal(globalThis[Symbol.for('xrift.head-pop.wearing.v1')],undefined,'cleans up')
})

test('the head position comes from the room renderer',()=>{
 const out=new Vector3()
 assert.equal(locateUser('me',out),null,'no renderer yet')
 const off=registerPlacement('a',false,'me')
 const unbind=bindRenderer('a',()=>1,(userId,o)=>{o.set(1,2,3);return userId==='me'?'head':null})
 assert.equal(locateUser('me',out),'head');assert.deepEqual(out.toArray(),[1,2,3])
 assert.equal(locateUser('you',out),null)
 unbind();off()
})

test('R3 needs one right controller with a stick; hands alone do not count',()=>{
 const pad=(extra={})=>({mapping:'xr-standard',connected:true,buttons:[{},{},{},{}],axes:[0,0,0,0],...extra})
 const right={handedness:'right',targetRayMode:'tracked-pointer',gamepad:pad()}
 assert.equal(menuControllers({inputSources:[right]}).length,1)
 assert.equal(menuControllers({inputSources:[{handedness:'right',targetRayMode:'tracked-pointer',hand:{},gamepad:pad()}]}).length,0)
 assert.equal(menuControllers({inputSources:[{...right,handedness:'left'}]}).length,0)
 assert.equal(menuControllers(null).length,0)
})

test('a stand is held only by a wearer who is in the room',async()=>{
 const {FREE,currentWearer,nextWear}=await import('../src/wearing.mjs')
 assert.equal(currentWearer(FREE,'me',['a']),null)
 assert.equal(currentWearer({ownerId:'me',revision:1},'me',[]),'me')
 assert.equal(currentWearer({ownerId:'a',revision:2},'me',['a','b']),'a','someone here has it on')
 assert.equal(currentWearer({ownerId:'gone',revision:3},'me',['a']),null,'left the room: free again')
 assert.equal(currentWearer(undefined,'me',[]),null)
 assert.deepEqual(nextWear({ownerId:null,revision:4},'me'),{ownerId:'me',revision:5})
 assert.deepEqual(nextWear(undefined,null),{ownerId:null,revision:1})
})
