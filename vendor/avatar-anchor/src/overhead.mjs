import {Box3,Vector3} from 'three'

const within=(node,root)=>{for(let parent=node;parent;parent=parent.parent)if(parent===root)return true;return false}
const finiteVector=vector=>[vector.x,vector.y,vector.z].every(Number.isFinite)
const pending=(status,reason)=>({status,reason,position:null,offset:null,headPosition:null,bounds:null,source:'none',confidence:null,sampledVertices:0,acceptedVertices:0,meshCount:0})

/**
 * Approximate an explicitly selected avatar's current head surface in world meters.
 * Reads CPU-skinned/morphed head-weighted vertices; never resets an avatar pose.
 * World/skeleton caches are refreshed, including SkinnedMesh.bindMatrixInverse.
 * Call after the host's animation/IK update. No names or model data are returned.
 */
export function estimateHeadTop({head,avatarRoot,clearance=.12,maxVertices=6000,minHeadWeight=.5,meshes}={}){
 if(!Number.isFinite(clearance)||clearance<0)throw new TypeError('clearance must be a finite nonnegative meter value')
 if(!Number.isInteger(maxVertices)||maxVertices<8||maxVertices>100000)throw new TypeError('maxVertices must be an integer between 8 and 100000')
 if(!Number.isFinite(minHeadWeight)||minHeadWeight<=0||minHeadWeight>1)throw new TypeError('minHeadWeight must be between 0 and 1')
 if(meshes!==undefined&&!Array.isArray(meshes))throw new TypeError('meshes must be an array when supplied')
 if(!head?.isObject3D)return pending('waiting-for-head','An explicit head Object3D is required')
 if(!avatarRoot?.isObject3D)return pending('waiting-for-avatar-root','An explicit owning avatar root is required')
 if(!within(head,avatarRoot))return pending('mismatched-avatar-root','The supplied head is outside the owning root')

 const headNodes=new Set();head.traverse(node=>headNodes.add(node))
 const input=[]
 if(meshes)input.push(...meshes)
 else avatarRoot.traverse(node=>{if(node.isSkinnedMesh)input.push(node)})
 const seen=new Set(),candidates=[]
 for(const mesh of input){
  if(seen.has(mesh)||!mesh?.isSkinnedMesh||!within(mesh,avatarRoot))continue
  seen.add(mesh)
  const geometry=mesh.geometry,position=geometry?.getAttribute('position'),indices=geometry?.getAttribute('skinIndex'),weights=geometry?.getAttribute('skinWeight')
  if(!position||!indices||!weights||indices.itemSize!==4||weights.itemSize!==4||indices.count<position.count||weights.count<position.count||position.count===0)continue
  const headIndices=new Set()
  mesh.skeleton?.bones.forEach((bone,index)=>{if(headNodes.has(bone))headIndices.add(index)})
  if(headIndices.size)candidates.push({mesh,position,indices,weights,headIndices,count:position.count,budget:0})
 }
 if(!candidates.length)return pending('no-head-geometry','No owning skinned geometry uses the selected head hierarchy')

 // updateWorldMatrix alone bypasses SkinnedMesh.updateMatrixWorld's bind inverse.
 avatarRoot.updateWorldMatrix(true,false)
 avatarRoot.updateMatrixWorld(true)
 const skeletons=new Set(candidates.map(candidate=>candidate.mesh.skeleton))
 for(const skeleton of skeletons)skeleton.update()
 const headPosition=head.getWorldPosition(new Vector3())
 if(!finiteVector(headPosition)||!avatarRoot.matrixWorld.elements.every(Number.isFinite)||avatarRoot.matrixWorld.determinant()===0)return pending('unsupported-transform','The owning transform is nonfinite or singular')

 // Guarantee at least one evenly positioned probe per mesh before distributing
 // the remaining bounded budget proportionally. Total probes never exceed maxVertices.
 const sampled=candidates.slice(0,maxVertices),total=sampled.reduce((sum,c)=>sum+c.count,0)
 if(total<=maxVertices)for(const candidate of sampled)candidate.budget=candidate.count
 else{
  const remaining=maxVertices-sampled.length,capacity=total-sampled.length
  for(const candidate of sampled)candidate.budget=1+Math.floor(remaining*(candidate.count-1)/capacity)
  let left=maxVertices-sampled.reduce((sum,c)=>sum+c.budget,0)
  for(const candidate of sampled){const extra=Math.min(left,candidate.count-candidate.budget);candidate.budget+=extra;left-=extra;if(!left)break}
 }
 const bounds=new Box3(),point=new Vector3()
 let sampledVertices=0,acceptedVertices=0,meshCount=0
 for(const {mesh,indices,weights,headIndices,count,budget} of sampled){
  let acceptedForMesh=0
  for(let probe=0;probe<budget;probe++){
   const index=budget===1?Math.floor((count-1)/2):Math.floor(probe*(count-1)/(budget-1))
   sampledVertices++
   const boneIndices=[indices.getX(index),indices.getY(index),indices.getZ(index),indices.getW(index)],boneWeights=[weights.getX(index),weights.getY(index),weights.getZ(index),weights.getW(index)]
   let influence=0
   for(let slot=0;slot<4;slot++)if(headIndices.has(boneIndices[slot])&&Number.isFinite(boneWeights[slot])&&boneWeights[slot]>0)influence+=boneWeights[slot]
   if(influence<minHeadWeight)continue
   mesh.getVertexPosition(index,point)
   point.applyMatrix4(mesh.matrixWorld)
   if(!finiteVector(point))continue
   bounds.expandByPoint(point);acceptedVertices++;acceptedForMesh++
  }
  if(acceptedForMesh)meshCount++
 }
 if(bounds.isEmpty())return {...pending('no-head-geometry','No finite sampled vertex meets the head-weight threshold'),sampledVertices}
 const center=bounds.getCenter(new Vector3()),position=new Vector3(center.x,bounds.max.y+clearance,center.z)
 const complete=sampled.length===candidates.length&&sampledVertices===total
 return {status:'ready',reason:null,position:position.toArray(),offset:position.clone().sub(headPosition).toArray(),headPosition:headPosition.toArray(),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},source:'head-skinned-vertices',confidence:complete?'complete':'sampled',sampledVertices,acceptedVertices,meshCount}
}
