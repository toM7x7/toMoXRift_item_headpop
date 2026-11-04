import {HUMANOID_BONE_ROLES} from '../index.mjs'

/** Read the loader-owned humanoid explicitly; no mesh/name guessing or pose writes. */
export function selectVRMBone({vrm,bone='head',space='raw'}={}){
 if(!HUMANOID_BONE_ROLES.includes(bone))return {status:'unsupported-bone-role',bone:null,space}
 if(!['raw','normalized'].includes(space))return {status:'unsupported-bone-space',bone:null,space}
 const method=space==='raw'?'getRawBoneNode':'getNormalizedBoneNode'
 if(typeof vrm?.humanoid?.[method]!=='function')return {status:'waiting-for-humanoid',bone:null,space}
 const node=vrm.humanoid[method](bone)
 if(!node?.isObject3D)return {status:'waiting-for-bone',bone:null,space}
 // three-vrm attaches both raw and normalized hierarchies to gltf.scene.
 // A stale or unrelated map must never move somebody else's attachment.
 let belongs=false
 for(let p=node;p;p=p.parent)if(p===vrm.scene){belongs=true;break}
 if(!belongs)return {status:'mismatched-avatar-root',bone:null,space}
 return {status:'ready',bone:node,space}
}

export function mapVRMBones(vrm,{space='raw'}={}){
 const map={}
 for(const role of HUMANOID_BONE_ROLES){const selected=selectVRMBone({vrm,bone:role,space});if(selected.status==='ready')map[role]=selected.bone}
 return map
}
