import {Matrix4, Quaternion, Vector3} from 'three'

const finite = value => typeof value === 'number' && Number.isFinite(value)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
export const DEFAULT_ANCHOR_SETTINGS = Object.freeze({
  offset: Object.freeze([0, .22, 0]), offsetSpace: 'world', rotationMode: 'world-up', scale: 1,
})

function quaternion(values, label) {
  if (!Array.isArray(values) || values.length !== 4 || !values.every(finite)) {
    throw new TypeError(`${label} must contain four finite quaternion values [x,y,z,w]`)
  }
  const q = new Quaternion().fromArray(values), length = q.length()
  if (!finite(length) || length < 1e-12) throw new TypeError(`${label} must be a nonzero quaternion`)
  // Avoid introducing round-trip drift into already normalized profile quaternions.
  if (Math.abs(length - 1) > 1e-12) q.normalize()
  return q
}

export function normalizeAnchorSettings(value = {}) {
  if (!object(value)) throw new TypeError('settings must be an object')
  const offset = value.offset ?? DEFAULT_ANCHOR_SETTINGS.offset
  if (!Array.isArray(offset) || offset.length !== 3 || !offset.every(finite)) {
    throw new TypeError('offset must contain three finite meter values')
  }
  const offsetSpace = value.offsetSpace ?? 'world', rotationMode = value.rotationMode ?? 'world-up'
  if (!['world', 'bone', 'head'].includes(offsetSpace)) throw new TypeError('Unknown offsetSpace')
  if (!['world-up', 'bone', 'head', 'camera-facing'].includes(rotationMode)) throw new TypeError('Unknown rotationMode')
  const scale = value.scale ?? 1
  if (!finite(scale) || scale <= 0) throw new TypeError('scale must be positive')
  const result = {offset: [...offset], offsetSpace, rotationMode, scale}
  if (value.rotationOffset !== undefined) result.rotationOffset = quaternion(value.rotationOffset, 'rotationOffset').toArray()
  return result
}

function assertObject3D(value, label) {
  if (!value?.isObject3D) throw new TypeError(`${label} Object3D is required`)
}

function assertFiniteMatrix(matrix, label) {
  if (!matrix.elements.every(finite)) throw new Error(`${label} transform is not finite`)
  const determinant = matrix.determinant()
  if (!finite(determinant) || determinant === 0) throw new Error(`${label} transform is singular`)
}

// Object3D stores TRS, which cannot express shear. Check before assigning any target fields.
function decomposeTRS(matrix, label) {
  assertFiniteMatrix(matrix, label)
  const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3()
  matrix.decompose(position, rotation, scale)
  const recomposed = new Matrix4().compose(position, rotation, scale)
  if (!recomposed.elements.every(finite)) throw new Error(`${label} transform cannot be decomposed`)
  if (recomposed.elements.some((value, index) => Math.abs(value - matrix.elements[index]) > 1e-8 * Math.max(1, Math.abs(value), Math.abs(matrix.elements[index])))) {
    throw new Error(`${label} transform contains unsupported shear`)
  }
  return {position, rotation, scale}
}

/**
 * Attach to an explicitly supplied bone/Object3D. All distances and display scale
 * are world units. Bone offsets use authored bone axes rotated without inheriting
 * avatar scale; no uniform VRM forward direction is assumed.
 */
export function updateAnchor(target, {bone, cameraQuaternion, settings = {}} = {}) {
  assertObject3D(target, 'target')
  assertObject3D(bone, 'bone')
  if (!target.matrixWorldAutoUpdate) throw new Error('Anchor target requires matrixWorldAutoUpdate=true')
  for (let ancestor = bone; ancestor; ancestor = ancestor.parent) {
    if (ancestor === target) throw new Error('Anchor target must not be the source bone or its ancestor')
  }
  const config = normalizeAnchorSettings(settings)
  bone.updateWorldMatrix(true, false)
  const source = decomposeTRS(bone.matrixWorld, 'Source bone')
  if (source.scale.x < 0 || source.scale.y < 0 || source.scale.z < 0) {
    throw new Error('Source bone transform is reflected; authored orientation is ambiguous')
  }
  const offset = new Vector3().fromArray(config.offset)
  if (config.offsetSpace !== 'world') offset.applyQuaternion(source.rotation)
  let rotation
  if (config.rotationMode === 'bone' || config.rotationMode === 'head') rotation = source.rotation.clone()
  else if (config.rotationMode === 'camera-facing') {
    if (!cameraQuaternion?.isQuaternion) throw new TypeError('camera-facing requires an explicit cameraQuaternion')
    rotation = quaternion(cameraQuaternion.toArray(), 'cameraQuaternion')
  } else rotation = new Quaternion()
  if (config.rotationOffset) rotation.multiply(new Quaternion().fromArray(config.rotationOffset))
  const position = source.position.clone().add(offset)
  const world = new Matrix4().compose(position, rotation, new Vector3().setScalar(config.scale))
  if (target.parent) {
    target.parent.updateWorldMatrix(true, false)
    decomposeTRS(target.parent.matrixWorld, 'Anchor parent')
    world.premultiply(target.parent.matrixWorld.clone().invert())
  }
  const local = decomposeTRS(world, 'Anchor local')
  target.position.copy(local.position)
  target.quaternion.copy(local.rotation)
  target.scale.copy(local.scale)
  // Also support an attachment with matrixAutoUpdate=false without changing that flag.
  target.updateMatrix()
  target.updateWorldMatrix(true, true)
  return {bone: source.position.toArray(), position: position.toArray(), settings: config}
}

function createController(target, initial, update) {
  assertObject3D(target, 'target')
  const saved = {
    position: target.position.clone(), quaternion: target.quaternion.clone(),
    scale: target.scale.clone(), matrix: target.matrix.clone(),
  }
  const settings = normalizeAnchorSettings(initial)
  let disposed = false
  return {
    settings,
    update(options) {
      if (disposed) throw new Error('Anchor disposed')
      return update(target, {...options, settings: options?.settings ?? settings})
    },
    dispose() {
      if (disposed) return
      disposed = true
      target.position.copy(saved.position)
      target.quaternion.copy(saved.quaternion)
      target.scale.copy(saved.scale)
      target.matrix.copy(saved.matrix)
      target.matrixWorldNeedsUpdate = true
      target.updateWorldMatrix(true, true)
    },
  }
}

export function createAnchor(target, initial = {}) {
  return createController(target, initial, updateAnchor)
}

/** Backward-compatible head entry point. 'head' settings are aliases of 'bone'. */
export function updateHeadAnchor(target, {head, cameraQuaternion, settings = {}} = {}) {
  const report = updateAnchor(target, {bone: head, cameraQuaternion, settings})
  return {head: report.bone, position: report.position, settings: report.settings}
}

export function createHeadAnchor(target, initial = {}) {
  return createController(target, initial, updateHeadAnchor)
}

export {
  ATTACHMENT_PROFILE_SCHEMA, ATTACHMENT_PROFILE_VERSION, HUMANOID_BONE_ROLES,
  normalizeAttachmentProfile, serializeAttachmentProfile, resolveAttachmentProfile,
} from './profiles.mjs'
