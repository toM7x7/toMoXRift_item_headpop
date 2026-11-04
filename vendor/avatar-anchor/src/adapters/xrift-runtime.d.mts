import type {Object3D, Skeleton, SkinnedMesh} from 'three'
export type XRiftAvatarStatus = 'ready' | 'empty' | 'waiting-for-scene' | 'waiting-for-avatar' | 'ambiguous-owner' | 'waiting-for-head' | 'ambiguous-head' | 'waiting-for-head-mesh' | 'ambiguous-avatar-root'
export type XRiftAvatarSource = 'none' | 'explicit-avatar-root' | 'local-unclaimed-head' | 'remote-player-marker'
export interface XRiftAvatarBinding {
  status: XRiftAvatarStatus
  source: XRiftAvatarSource
  userId: string | null
  head: Object3D | null
  avatarRoot: Object3D | null
  meshes: SkinnedMesh[]
  skeletons: Skeleton[]
  identity: string | null
  meshBindings: {mesh: SkinnedMesh; skeleton: Skeleton; bonesKey: string}[]
}
export function withinAvatar(node: Object3D | null, root: Object3D): boolean
export function selectXRiftAvatar(input: {scene: Object3D; userId: string | null; localUserId?: string | null; avatarRoot?: Object3D; excludeRoots?: Object3D[]}): XRiftAvatarBinding
export function isXRiftAvatarBindingCurrent(binding: XRiftAvatarBinding | null, input: {scene: Object3D; excludeRoots?: Object3D[]}): boolean
