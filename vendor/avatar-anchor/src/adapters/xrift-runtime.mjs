/**
 * Read-only XRift runtime binding. Marker/name inspection is a host convention,
 * not a public avatar API or an authorization grant. Ambiguity always hides.
 */
export const withinAvatar = (node, root) => {
  for (let current = node; current; current = current.parent) if (current === root) return true
  return false
}

const excluded = (node, roots) => roots.some(root => withinAvatar(node, root))
const headRank = name => {
  if (typeof name !== 'string' || /_sub(?:_\d+)?$/i.test(name)) return null
  const normalized = /^normalized_?/i.test(name)
  const compact = name.toLowerCase().replace(/^normalized_?/, '').replace(/^character\d+[_:]/, '').replace(/[^a-z0-9]/g, '').replace(/^mixamorig/, '').replace(/^jbip/, '')
  return ['head', 'chead'].includes(compact) ? Number(normalized) : null
}

function remoteScopes(scene, excludeRoots) {
  const scopes = []
  scene.traverse(node => {
    if (excluded(node, excludeRoots)) return
    const id = node.userData?.id
    if (typeof id === 'string' && id.startsWith('remote-player-') && typeof node.userData.onInteract === 'function' && node.parent && node.parent !== scene) {
      scopes.push({userId: id.slice('remote-player-'.length), root: node.parent})
    }
  })
  return scopes
}

function commonRoot(nodes, scene) {
  for (let candidate = nodes[0]; candidate && candidate !== scene; candidate = candidate.parent) {
    if (nodes.every(node => withinAvatar(node, candidate))) return candidate
  }
  return null
}

function skeletonKey(skeleton) {
  return skeleton.bones.map(bone => bone.uuid).join(',')
}

const pending = (status, source = 'none') => ({status, source, head: null, avatarRoot: null, meshes: [], skeletons: [], identity: null, userId: null, meshBindings: []})

/**
 * Resolve one user's currently rendered head and only meshes on that rig.
 * avatarRoot is a caller-trusted explicit owner scope. Otherwise local meshes
 * must be unclaimed by every remote-player marker and unique in the scene.
 */
export function selectXRiftAvatar({scene, userId, localUserId, avatarRoot, excludeRoots = []} = {}) {
  if (!userId) return pending('empty')
  if (!scene?.isObject3D) return pending('waiting-for-scene')
  const excludes = excludeRoots.filter(root => root?.isObject3D)
  const scopes = remoteScopes(scene, excludes)
  let scope = scene, source = 'local-unclaimed-head'
  if (avatarRoot !== undefined) {
    source = 'explicit-avatar-root'
    if (!avatarRoot?.isObject3D || !withinAvatar(avatarRoot, scene) || excluded(avatarRoot, excludes)) return pending('waiting-for-avatar', source)
    scope = avatarRoot
  } else if (userId !== localUserId) {
    source = 'remote-player-marker'
    const matches = [...new Set(scopes.filter(entry => entry.userId === userId).map(entry => entry.root))]
    if (matches.length !== 1) return pending(matches.length ? 'ambiguous-owner' : 'waiting-for-avatar', source)
    scope = matches[0]
  }
  const meshes = []
  scope.traverse(node => {
    if (!node.isSkinnedMesh || !node.skeleton?.bones || excluded(node, excludes)) return
    if (source === 'local-unclaimed-head' && scopes.some(entry => withinAvatar(node, entry.root))) return
    meshes.push(node)
  })
  const heads = new Set()
  for (const mesh of meshes) {
    const paletteHeads = []
    for (const bone of mesh.skeleton.bones) {
      const rank = headRank(bone.name)
      if (rank === null || !withinAvatar(bone, scope) || excluded(bone, excludes)) continue
      if (source === 'local-unclaimed-head' && scopes.some(entry => withinAvatar(bone, entry.root))) continue
      paletteHeads.push({bone, rank})
    }
    // Prefer raw over normalized aliases only within one declared skin palette.
    // Independent palettes/heads remain independent candidates, never a guess.
    if (!paletteHeads.length) continue
    const bestRank = Math.min(...paletteHeads.map(entry => entry.rank))
    for (const {bone, rank} of paletteHeads) if (rank === bestRank) heads.add(bone)
  }
  if (!heads.size) return pending('waiting-for-head', source)
  const candidates = [...heads]
  if (candidates.length !== 1) return pending('ambiguous-head', source)
  const head = candidates[0]
  const related = meshes.filter(mesh => mesh.skeleton.bones.some(bone => bone === head || withinAvatar(bone, head)))
  if (!related.length) return pending('waiting-for-head-mesh', source)
  const root = scope !== scene ? scope : commonRoot([head, ...related], scene)
  if (!root) return pending('ambiguous-avatar-root', source)
  const meshBindings = related.map(mesh => ({mesh, skeleton: mesh.skeleton, bonesKey: skeletonKey(mesh.skeleton)}))
  const skeletons = [...new Set(related.map(mesh => mesh.skeleton))]
  return {
    status: 'ready', source, userId, head, avatarRoot: root, meshes: related, skeletons,
    identity: `${userId}:${root.uuid}:${head.uuid}:${skeletons.map(skeleton => skeleton.uuid).sort().join(':')}`,
    meshBindings,
  }
}

/** Cheap cache preflight; periodic fresh scans must still detect new ambiguity. */
export function isXRiftAvatarBindingCurrent(binding, {scene, excludeRoots = []} = {}) {
  if (binding?.status !== 'ready' || !scene?.isObject3D || !binding.head || !binding.avatarRoot) return false
  const excludes = excludeRoots.filter(root => root?.isObject3D)
  if (!withinAvatar(binding.avatarRoot, scene) || !withinAvatar(binding.head, binding.avatarRoot) || excluded(binding.head, excludes)) return false
  return binding.meshBindings.length > 0 && binding.meshBindings.every(({mesh, skeleton, bonesKey}) => (
    withinAvatar(mesh, binding.avatarRoot) && !excluded(mesh, excludes) && mesh.skeleton === skeleton && skeletonKey(skeleton) === bonesKey
  ))
}
