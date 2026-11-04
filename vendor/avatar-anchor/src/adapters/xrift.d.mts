import type {Object3D,Bone} from 'three'
import type {HumanoidBoneRole} from '../index.mjs'
export function selectXRiftHead(input:{scene:Object3D;userId:string|null;localUserId:string|null;avatarRoot?:Object3D}):{status:string;head:Bone|null}
export interface XRiftBoneInput {scene?:Object3D;userId:string|null;localUserId?:string|null;avatarRoot?:Object3D;bones?:Partial<Record<HumanoidBoneRole,Object3D>>;bone?:HumanoidBoneRole}
export function selectXRiftBone(input:XRiftBoneInput):{status:string;bone:Object3D|null;source:'none'|'explicit-map'|'head-name-fallback'}
