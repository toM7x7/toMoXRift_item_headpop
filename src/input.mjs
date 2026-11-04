import {ICON_COUNT} from './icons.mjs'

const EDITABLE='input,textarea,select,[contenteditable="true"],[role="textbox"],[role="dialog"]'
/** @param {any} target */
export function isEditing(target){return !!(target?.isContentEditable||target?.closest?.(EDITABLE))}

/**
 * Map a keydown to an action. Plain keys first; Ctrl+Alt+same key is the fallback for
 * hosts that capture plain keys (the official DevEnvironment PhysicsPlayer does).
 * @param {any} event
 * @param {{paletteKey?:string}} [options] KeyN while the 頭上看板 is worn too (M is its menu)
 * @returns {{type:'pop',icon:number}|{type:'palette'}|null}
 */
export function shortcutAction(event,{paletteKey='KeyM'}={}){
 if(!event||event.defaultPrevented||event.repeat||event.isComposing||event.metaKey||event.shiftKey||event.getModifierState?.('AltGraph'))return null
 if(isEditing(event.target))return null
 const plain=!event.ctrlKey&&!event.altKey,fallback=event.ctrlKey&&event.altKey
 if(!plain&&!fallback)return null
 const code=String(event.code??'')
 const digit=/^(?:Digit|Numpad)([1-9])$/.exec(code)
 if(digit){const icon=Number(digit[1])-1;return icon<ICON_COUNT?{type:'pop',icon}:null}
 if(code===paletteKey)return {type:'palette'}
 return null
}
