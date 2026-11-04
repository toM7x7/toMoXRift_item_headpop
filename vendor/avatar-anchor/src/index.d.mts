import type {Object3D, Quaternion} from 'three'

export interface AnchorSettings {
  offset: [number, number, number]
  offsetSpace: 'world' | 'bone' | 'head'
  rotationMode: 'world-up' | 'bone' | 'head' | 'camera-facing'
  scale: number
  /** Local quaternion applied after the selected orientation, in [x,y,z,w] order. */
  rotationOffset?: [number, number, number, number]
}
export interface BoneAnchorInput {bone: Object3D; cameraQuaternion?: Quaternion; settings?: Partial<AnchorSettings>}
/** Backward-compatible head input. */
export interface AnchorInput {head: Object3D; cameraQuaternion?: Quaternion; settings?: Partial<AnchorSettings>}
export interface BoneAnchorReport {bone: number[]; position: number[]; settings: AnchorSettings}
export interface AnchorReport {head: number[]; position: number[]; settings: AnchorSettings}
export interface AnchorController<Input, Report> {settings: AnchorSettings; update: (options: Input) => Report; dispose: () => void}
export const DEFAULT_ANCHOR_SETTINGS: Readonly<Omit<AnchorSettings, 'offset'> & {offset: readonly [number, number, number]}>
export function normalizeAnchorSettings(value?: Partial<AnchorSettings>): AnchorSettings
export function updateAnchor(target: Object3D, input: BoneAnchorInput): BoneAnchorReport
export function createAnchor(target: Object3D, initial?: Partial<AnchorSettings>): AnchorController<BoneAnchorInput, BoneAnchorReport>
export function updateHeadAnchor(target: Object3D, input: AnchorInput): AnchorReport
export function createHeadAnchor(target: Object3D, initial?: Partial<AnchorSettings>): AnchorController<AnchorInput, AnchorReport>
export {
  ATTACHMENT_PROFILE_SCHEMA, ATTACHMENT_PROFILE_VERSION, HUMANOID_BONE_ROLES,
  normalizeAttachmentProfile, serializeAttachmentProfile, resolveAttachmentProfile,
} from './profiles.mjs'
export type {HumanoidBoneRole, AttachmentProfile, AttachmentProfileInput, AttachmentProfileResolution} from './profiles.mjs'
