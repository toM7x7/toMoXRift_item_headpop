import type {AnchorSettings} from './index.mjs'

type Side = 'left' | 'right'
type Finger = 'Index' | 'Middle' | 'Ring' | 'Little'
type FingerSegment = 'Proximal' | 'Intermediate' | 'Distal'
export type HumanoidBoneRole = 'hips' | 'spine' | 'chest' | 'upperChest' | 'neck' | 'head' | 'leftEye' | 'rightEye' | 'jaw'
  | `${Side}${'UpperLeg' | 'LowerLeg' | 'Foot' | 'Toes' | 'Shoulder' | 'UpperArm' | 'LowerArm' | 'Hand'}`
  | `${Side}Thumb${'Metacarpal' | 'Proximal' | 'Distal'}` | `${Side}${Finger}${FingerSegment}`
export const ATTACHMENT_PROFILE_SCHEMA: 'xrift-avatar-anchor.profile'
export const ATTACHMENT_PROFILE_VERSION: 1
export const HUMANOID_BONE_ROLES: readonly HumanoidBoneRole[]
export interface AttachmentProfileInput {
  schema: typeof ATTACHMENT_PROFILE_SCHEMA
  version: typeof ATTACHMENT_PROFILE_VERSION
  avatarId: string
  attachmentId: string
  bone: HumanoidBoneRole
  settings: Partial<AnchorSettings>
}
export interface AttachmentProfile extends AttachmentProfileInput {settings: AnchorSettings}
export type AttachmentProfileResolution =
  | {status: 'ready'; profile: AttachmentProfile}
  | {status: 'missing-profile' | 'ambiguous-profile' | 'bone-mismatch'; profile: null}
export function normalizeAttachmentProfile(value: AttachmentProfileInput): AttachmentProfile
export function serializeAttachmentProfile(value: AttachmentProfileInput): string
export function resolveAttachmentProfile(profiles: AttachmentProfileInput[], query: {avatarId: string; attachmentId: string; bone?: HumanoidBoneRole}): AttachmentProfileResolution
