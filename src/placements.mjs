const KEY=Symbol.for('xrift.head-pop.placements.v2')

/**
 * One stand per person who placed it, enforced by the item itself.
 *
 * XRift does not document any "single place" switch (no official repo, doc or template has
 * one, and the item loader only reads `Item`), so a user can keep placing copies. Every
 * placed copy registers here with `useItem().placedBy.id` (set by the server):
 * - within one placer, the copy with the smallest placement id is live, the rest are extras;
 * - copies placed by different people all stay live and usable;
 * - exactly one live copy per room (the smallest id) shows and receives the pops, so the
 *   reactions never double however many stands there are.
 * Every client sees the same copies and placers, so every client makes the same choice.
 * Preview copies never count. A null placer (part of the world itself) is its own group.
 */
function registry(){
 return globalThis[KEY]??={entries:new Map(),listeners:new Set(),renderers:new Map(),version:0}
}
function notify(r){r.version++;for(const l of [...r.listeners])l()}
const group=placer=>typeof placer==='string'&&placer?placer:''

function liveIds(r=registry()){
 const first=new Map()
 for(const [id,e] of r.entries){if(e.preview)continue;const g=group(e.placer),cur=first.get(g);if(cur===undefined||id<cur)first.set(g,id)}
 return [...first.values()].sort()
}

/** @returns {'primary'|'duplicate'|'preview-first'|'preview-duplicate'} */
export function placementRole(id){
 const r=registry(),entry=r.entries.get(id)
 if(!entry)return 'primary'
 const g=group(entry.placer)
 const mine=[...r.entries].filter(([,e])=>!e.preview&&group(e.placer)===g).map(([other])=>other).sort()
 if(entry.preview)return mine.length?'preview-duplicate':'preview-first'
 return mine[0]===id?'primary':'duplicate'
}

/** The one live copy in the room that shows and receives pops. */
export function rendererId(){return liveIds()[0]??null}

/**
 * @param {string} id placement id
 * @param {boolean} preview
 * @param {string|null} [placer] useItem().placedBy?.id
 */
export function registerPlacement(id,preview,placer=null){
 const r=registry(),token={preview:!!preview,placer}
 r.entries.set(id,token);notify(r)
 return ()=>{if(r.entries.get(id)===token){r.entries.delete(id);notify(r)}cleanup(r)}
}

export function subscribePlacements(listener){
 const r=registry();r.listeners.add(listener)
 return ()=>{r.listeners.delete(listener);cleanup(r)}
}
function cleanup(r){if(!r.entries.size&&!r.listeners.size&&!r.renderers.size&&globalThis[KEY]===r)delete globalThis[KEY]}

/** Changes whenever any copy registers or leaves (for useSyncExternalStore). */
export function placementsVersion(){return registry().version}

/**
 * The renderer copy offers its display here so a pop fired from any live stand shows once.
 * @param {string} id
 * @param {(userId:string,icon:number)=>number} show
 * @param {((userId:string,out:import('three').Vector3)=>('head'|'movement'|null))|null} [locate] where that user's pops appear
 */
export function bindRenderer(id,show,locate=null){
 const r=registry(),entry={show,locate};r.renderers.set(id,entry)
 return ()=>{if(r.renderers.get(id)===entry)r.renderers.delete(id);cleanup(r)}
}
/** @returns {number|null} the pop sequence number, or null when no renderer is ready */
export function showPop(userId,icon){
 const r=registry(),entry=r.renderers.get(rendererId())
 return entry?entry.show(userId,icon):null
}
/**
 * Where userId's pops appear (the measured head top + clearance), through the renderer.
 * @param {string} userId @param {import('three').Vector3} out
 * @returns {'head'|'movement'|null}
 */
export function locateUser(userId,out){
 const entry=registry().renderers.get(rendererId())
 return entry?.locate?entry.locate(userId,out):null
}
