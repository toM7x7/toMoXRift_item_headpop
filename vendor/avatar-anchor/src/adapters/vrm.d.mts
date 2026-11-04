import type {Object3D} from 'three'
import type {HumanoidBoneRole} from '../index.mjs'
export interface VRMSource {
 scene:Object3D
 humanoid:{getRawBoneNode?:(role:HumanoidBoneRole)=>Object3D|null;getNormalizedBoneNode?:(role:HumanoidBoneRole)=>Object3D|null}
}
export type BoneSpace='raw'|'normalized'
export interface VRMBoneSelection {status:'ready'|'unsupported-bone-role'|'unsupported-bone-space'|'waiting-for-humanoid'|'waiting-for-bone'|'mismatched-avatar-root';bone:Object3D|null;space:BoneSpace}
export function selectVRMBone(input:{vrm:VRMSource;bone?:HumanoidBoneRole;space?:BoneSpace}):VRMBoneSelection
export function mapVRMBones(vrm:VRMSource,options?:{space?:BoneSpace}):Partial<Record<HumanoidBoneRole,Object3D>>
