/** The 8 reactions, in key order (1–8) and atlas order (left→right, top→bottom). */
export const ICONS = Object.freeze([
 Object.freeze({key:'surprise',label:'びっくり',glyph:'！'}),
 Object.freeze({key:'question',label:'はてな',glyph:'？'}),
 Object.freeze({key:'heart',label:'すき',glyph:'♥'}),
 Object.freeze({key:'like',label:'いいね',glyph:'👍'}),
 Object.freeze({key:'idea',label:'ひらめき',glyph:'💡'}),
 Object.freeze({key:'sweat',label:'あせ',glyph:'💦'}),
 Object.freeze({key:'music',label:'ごきげん',glyph:'♪'}),
 Object.freeze({key:'sleep',label:'ねむい',glyph:'💤'}),
])
export const ICON_COUNT = ICONS.length

/** public/ root only: Windows uploads break subfolder paths on the CDN. */
export const ATLAS = Object.freeze({file:'head-pop-icons.png',cols:4,rows:2})

/** UV rectangle of one atlas cell, with three's default flipY (v=0 at the bottom). */
export function atlasRect(index){
 if(!isIconIndex(index))throw new RangeError('icon index out of range')
 const col=index%ATLAS.cols,row=Math.floor(index/ATLAS.cols)
 return {u0:col/ATLAS.cols,u1:(col+1)/ATLAS.cols,v0:1-(row+1)/ATLAS.rows,v1:1-row/ATLAS.rows}
}

export function isIconIndex(value){return Number.isInteger(value)&&value>=0&&value<ICON_COUNT}
