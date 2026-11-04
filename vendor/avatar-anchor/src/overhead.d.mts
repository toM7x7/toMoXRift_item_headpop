import type {Object3D,SkinnedMesh} from 'three'
export interface HeadTopInput {
 head:Object3D|null
 avatarRoot:Object3D|null
 /** Fixed world-meter gap above the sampled head region. Defaults to .12. */
 clearance?:number
 /** Total CPU-skinned probes across all meshes. Defaults to 6000. */
 maxVertices?:number
 /** Minimum combined influence from head and its descendant bones. Defaults to .5. */
 minHeadWeight?:number
 /** Optional explicitly scoped mesh subset; outside-root meshes are ignored. */
 meshes?:SkinnedMesh[]
}
export interface HeadTopReport {
 status:'ready'|'waiting-for-head'|'waiting-for-avatar-root'|'mismatched-avatar-root'|'no-head-geometry'|'unsupported-transform'
 reason:string|null
 position:[number,number,number]|null
 /** World-axis meter offset from the current head, for updateAnchor offsetSpace:'world'. */
 offset:[number,number,number]|null
 headPosition:[number,number,number]|null
 bounds:{min:number[];max:number[]}|null
 source:'head-skinned-vertices'|'none'
 /** Complete refers to vertex coverage, not visual fit acceptance. */
 confidence:'complete'|'sampled'|null
 sampledVertices:number
 acceptedVertices:number
 meshCount:number
}
export function estimateHeadTop(input:HeadTopInput):HeadTopReport
