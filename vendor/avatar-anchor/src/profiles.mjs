import {normalizeAnchorSettings} from './index.mjs'

export const ATTACHMENT_PROFILE_SCHEMA = 'xrift-avatar-anchor.profile'
export const ATTACHMENT_PROFILE_VERSION = 1
export const HUMANOID_BONE_ROLES = Object.freeze([
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftEye', 'rightEye', 'jaw',
  ...['left', 'right'].flatMap(side => [
    ...['UpperLeg', 'LowerLeg', 'Foot', 'Toes', 'Shoulder', 'UpperArm', 'LowerArm', 'Hand'].map(part => side + part),
    ...['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'].map(part => side + part),
    ...['Index', 'Middle', 'Ring', 'Little'].flatMap(finger => ['Proximal', 'Intermediate', 'Distal'].map(part => side + finger + part)),
  ]),
])

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function identifier(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(`${label} must be a nonempty identifier of at most 200 characters`)
  }
  return value
}

/** Profiles are inert numeric calibration records; no source filenames or object references. */
export function normalizeAttachmentProfile(value) {
  if (!object(value)) throw new TypeError('Attachment profile must be an object')
  if (value.schema !== ATTACHMENT_PROFILE_SCHEMA) throw new TypeError('Unknown attachment profile schema')
  if (value.version !== ATTACHMENT_PROFILE_VERSION) throw new TypeError('Unsupported attachment profile version')
  const avatarId = identifier(value.avatarId, 'avatarId'), attachmentId = identifier(value.attachmentId, 'attachmentId')
  if (!HUMANOID_BONE_ROLES.includes(value.bone)) throw new TypeError('Unknown humanoid bone role')
  if (!object(value.settings)) throw new TypeError('Profile settings must be an object')
  return {
    schema: ATTACHMENT_PROFILE_SCHEMA, version: ATTACHMENT_PROFILE_VERSION,
    avatarId, attachmentId, bone: value.bone, settings: normalizeAnchorSettings(value.settings),
  }
}

export function serializeAttachmentProfile(value) {
  return JSON.stringify(normalizeAttachmentProfile(value), null, 2)
}

/** Exact matches only. Ambiguous/missing calibration must never reuse another avatar's settings. */
export function resolveAttachmentProfile(profiles, {avatarId, attachmentId, bone} = {}) {
  identifier(avatarId, 'avatarId')
  identifier(attachmentId, 'attachmentId')
  if (bone !== undefined && !HUMANOID_BONE_ROLES.includes(bone)) throw new TypeError('Unknown humanoid bone role')
  if (!Array.isArray(profiles)) throw new TypeError('profiles must be an array')
  const candidates = profiles.map(normalizeAttachmentProfile).filter(profile => profile.avatarId === avatarId && profile.attachmentId === attachmentId)
  if (candidates.length !== 1) return {status: candidates.length ? 'ambiguous-profile' : 'missing-profile', profile: null}
  if (bone !== undefined && candidates[0].bone !== bone) return {status: 'bone-mismatch', profile: null}
  return {status: 'ready', profile: candidates[0]}
}
