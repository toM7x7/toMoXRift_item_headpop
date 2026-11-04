import {isIconIndex} from './icons.mjs'

/** Event name per placement: copies placed side by side never echo each other. */
export const channelName=placementId=>`head-pop:v1:${placementId}`

/** Wire format sent through useInstanceEvent. */
export const makePayload=icon=>({v:1,icon})

/**
 * Validate an incoming instance event ({payload,senderId,timestamp}). senderId is set by the
 * server, so a client cannot pop an icon over somebody else's head.
 * @returns {{senderId:string,icon:number}|null}
 */
export function readEvent(event){
 if(!event||typeof event!=='object')return null
 const senderId=event.senderId,payload=event.payload
 if(typeof senderId!=='string'||!senderId||senderId.length>200)return null
 if(!payload||typeof payload!=='object'||payload.v!==1||!isIconIndex(payload.icon))return null
 return {senderId,icon:payload.icon}
}

/** Drop bursts: at most one pop per sender every `minGapMs`. */
export function createRateGate(minGapMs=110){
 const last=new Map()
 return {
  allow(senderId,nowMs){
   const prev=last.get(senderId)
   if(prev!==undefined&&nowMs-prev<minGapMs&&nowMs>=prev)return false
   last.set(senderId,nowMs)
   if(last.size>256)last.delete(last.keys().next().value)
   return true
  },
 }
}
