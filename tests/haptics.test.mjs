import test from 'node:test'
import assert from 'node:assert/strict'
import {createHaptics,pulse} from '../src/haptics.mjs'

function controller(handedness,kind='pulse'){
 const calls=[]
 const gamepad=kind==='pulse'?{hapticActuators:[{pulse:(i,ms)=>calls.push([i,ms])}]}:kind==='rumble'?{hapticActuators:[],vibrationActuator:{playEffect:(type,o)=>calls.push([type,o.strongMagnitude,o.duration])}}:{}
 return {handedness,gamepad,calls}
}
function fakeSession(sources){
 const listeners=new Map()
 return {inputSources:sources,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n,f)=>{if(listeners.get(n)===f)listeners.delete(n)},fire:(n,e)=>listeners.get(n)?.(e),listeners}
}

test('the hand that just pressed the trigger vibrates, else the right hand',()=>{
 let t=0
 const later=[]
 const left=controller('left'),right=controller('right'),session=fakeSession([left,right])
 const h=createHaptics({now:()=>t,later:(fn,ms)=>later.push([fn,ms])})
 h.attach(session)
 assert.equal(h.hand(),right,'no recent select: right hand')
 session.fire('selectstart',{inputSource:left});t=300
 assert.equal(h.hand(),left)
 assert.equal(h.pop(),true)
 assert.deepEqual(left.calls,[[.45,30]])
 assert.equal(later.length,1);assert.equal(later[0][1],85)
 later[0][0]()
 assert.deepEqual(left.calls,[[.45,30],[.85,55]],'second, stronger tap')
 t=2000
 assert.equal(h.hand(),right,'an old select no longer counts')
 assert.equal(h.tick(),true);assert.deepEqual(right.calls,[[.25,18]])
})

test('session changes re-wire the listener; no session means no vibration',()=>{
 const a=fakeSession([controller('right')]),b=fakeSession([controller('right')])
 const h=createHaptics({now:()=>0,later:()=>{}})
 h.attach(a);assert.ok(a.listeners.has('selectstart'))
 h.attach(b);assert.ok(!a.listeners.has('selectstart'));assert.ok(b.listeners.has('selectstart'))
 h.attach(null);assert.ok(!b.listeners.has('selectstart'))
 assert.equal(h.pop(),false);assert.equal(h.tick(),false)
})

test('falls back to vibrationActuator and survives missing or throwing actuators',()=>{
 const rumble=controller('right','rumble')
 assert.equal(pulse(rumble,.5,40),true)
 assert.deepEqual(rumble.calls,[['dual-rumble',.5,40]])
 assert.equal(pulse(controller('right','none'),.5,40),false)
 assert.equal(pulse({gamepad:{hapticActuators:[{pulse(){throw new Error('busy')}}]}},.5,40),false)
 assert.equal(pulse(null,.5,40),false)
 const handOnly=fakeSession([{handedness:'right',hand:{}}])
 const h=createHaptics({now:()=>0,later:()=>{}});h.attach(handOnly)
 assert.equal(h.hand(),null,'hand tracking without a gamepad: nothing to vibrate')
})
