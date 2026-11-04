const KEY=Symbol.for('xrift.head-pop.render-hook.v1')

/**
 * Run work inside scene.onBeforeRender, after every useFrame and after the renderer has
 * updated world matrices, so icons follow this frame's head (no one-frame lag).
 * Nested renders (mirrors, render targets) only re-face; the outermost render also places.
 * One chained hook per scene is shared by every copy; other wrappers are preserved.
 * @param {any} scene
 * @param {{place:(camera:any)=>void,face:(camera:any)=>void}} entry
 */
export function attachRenderHook(scene,entry){
 let hook=scene[KEY]
 if(!hook){
  const entries=new Set(),stack=[],before=scene.onBeforeRender,after=scene.onAfterRender
  const run=(fn,camera)=>{for(const e of entries){try{fn(e,camera)}catch(error){if(!e.failed){e.failed=true;console.warn('[head-pop]',error)}}}}
  function onBefore(...args){
   before.apply(this,args)
   const camera=args[2];stack.push(camera)
   if(stack.length===1)run((e,c)=>e.place(c),camera)
   run((e,c)=>e.face(c),camera)
  }
  function onAfter(...args){
   try{after.apply(this,args)}
   finally{stack.pop();if(stack.length)run((e,c)=>e.face(c),stack[stack.length-1])}
  }
  scene.onBeforeRender=onBefore;scene.onAfterRender=onAfter
  hook={entries,release(){if(entries.size)return;if(scene.onBeforeRender===onBefore&&scene.onAfterRender===onAfter){scene.onBeforeRender=before;scene.onAfterRender=after;delete scene[KEY]}}}
  scene[KEY]=hook
 }
 hook.entries.add(entry)
 let disposed=false
 return {dispose(){if(disposed)return;disposed=true;hook.entries.delete(entry);hook.release()}}
}
