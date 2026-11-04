const KEY=Symbol.for('xrift.head-pop.wearing.v1')

/**
 * Which copies this browser is wearing. Local only: other people never see it.
 * While the local user wears one, the live stands leave their spot for this user (the worn one
 * hops to the head), and come back when it is taken off.
 */
function store(){return globalThis[KEY]??={worn:new Set(),listeners:new Set()}}
function cleanup(s){if(!s.worn.size&&!s.listeners.size&&globalThis[KEY]===s)delete globalThis[KEY]}

/** @param {string} id placement id @param {boolean} on */
export function setWearing(id,on){
 const s=store(),had=s.worn.has(id)
 if(!!on===had){cleanup(s);return}
 if(on)s.worn.add(id);else s.worn.delete(id)
 for(const l of [...s.listeners])l()
 cleanup(s)
}

/** True while this browser wears any copy. */
export function wearingAny(){return (globalThis[KEY]?.worn.size??0)>0}

/** @param {()=>void} listener */
export function subscribeWearing(listener){
 const s=store();s.listeners.add(listener)
 return ()=>{s.listeners.delete(listener);cleanup(s)}
}
