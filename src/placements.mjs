const KEY=Symbol.for('xrift.head-pop.placements.v1')

/**
 * One reaction stand per room, enforced by the item itself.
 *
 * XRift does not document any "single place" switch (no official repo, doc or template has
 * one, and the item loader only reads `Item`), so every placed copy registers here and the
 * copy with the smallest placement id is the primary. Every client sees the same placed
 * copies, so every client picks the same primary. Preview copies never count.
 */
function registry(){
 return globalThis[KEY]??={entries:new Map(),listeners:new Set(),version:0}
}
function notify(r){r.version++;for(const l of [...r.listeners])l()}

/** Placed (non-preview) ids, sorted: the first one is the primary. */
export function placedIds(){
 return [...registry().entries].filter(([,e])=>!e.preview).map(([id])=>id).sort()
}

/** @returns {'primary'|'duplicate'|'preview-first'|'preview-duplicate'} */
export function placementRole(id){
 const r=registry(),entry=r.entries.get(id)
 const placed=placedIds()
 if(entry?.preview)return placed.length?'preview-duplicate':'preview-first'
 return placed[0]===id||!placed.length?'primary':'duplicate'
}

export function registerPlacement(id,preview){
 const r=registry(),token={preview:!!preview}
 r.entries.set(id,token);notify(r)
 return ()=>{if(r.entries.get(id)===token){r.entries.delete(id);notify(r)}if(!r.entries.size&&!r.listeners.size)delete globalThis[KEY]}
}

export function subscribePlacements(listener){
 const r=registry();r.listeners.add(listener)
 return ()=>{r.listeners.delete(listener);if(!r.entries.size&&!r.listeners.size)delete globalThis[KEY]}
}

/** Changes whenever any copy registers or leaves (for useSyncExternalStore). */
export function placementsVersion(){return registry().version}
