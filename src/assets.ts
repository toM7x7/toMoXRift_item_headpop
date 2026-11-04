import {useEffect,useMemo} from 'react'
import {useLoader} from '@react-three/fiber'
import {useXRift} from '@xrift/world-components'
import {CanvasTexture,LinearMipmapLinearFilter,PlaneGeometry,SRGBColorSpace,TextureLoader,type Texture} from 'three'
import {ATLAS,ICON_COUNT,atlasRect} from './icons.mjs'

/** The 4x2 sticker atlas, read relative to the item's delivery URL. */
export function useIconAtlas():Texture{
 const {baseUrl}=useXRift()
 const texture=useLoader(TextureLoader,`${baseUrl}${ATLAS.file}`)
 texture.colorSpace=SRGBColorSpace
 texture.minFilter=LinearMipmapLinearFilter
 texture.anisotropy=4
 return texture
}

/** One unit plane per icon with UVs cut to its atlas cell (no per-icon texture clones). */
export function useIconGeometries():PlaneGeometry[]{
 const geometries=useMemo(()=>Array.from({length:ICON_COUNT},(_,i)=>{
  const g=new PlaneGeometry(1,1),uv=g.getAttribute('uv'),r=atlasRect(i)
  for(let k=0;k<uv.count;k++)uv.setXY(k,uv.getX(k)?r.u1:r.u0,uv.getY(k)?r.v1:r.v0)
  uv.needsUpdate=true
  return g
 }),[])
 useEffect(()=>()=>geometries.forEach(g=>g.dispose()),[geometries])
 return geometries
}

/** Small canvas label texture (Japanese text, digits). */
export function useLabelTexture(draw:(c:CanvasRenderingContext2D,w:number,h:number)=>void,width:number,height:number,deps:unknown[]):CanvasTexture{
 const texture=useMemo(()=>{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
  const c=canvas.getContext('2d')!;draw(c,width,height)
  const t=new CanvasTexture(canvas);t.colorSpace=SRGBColorSpace;return t
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },deps)
 useEffect(()=>()=>texture.dispose(),[texture])
 return texture
}

/** White comic rays with the stickers' navy outline; each pop tints it with its icon colour. */
export function useBurstTexture():CanvasTexture{
 return useLabelTexture((c,w,h)=>{
  const cx=w/2,cy=h/2,rays=12
  const path=(i:number)=>{
   const long=i%2===0,a=i/rays*Math.PI*2-Math.PI/2,inner=long?.27*w:.31*w,outer=long?.48*w:.41*w,half=long?.13:.1
   c.beginPath()
   c.moveTo(cx+Math.cos(a-half)*inner,cy+Math.sin(a-half)*inner)
   c.lineTo(cx+Math.cos(a)*outer,cy+Math.sin(a)*outer)
   c.lineTo(cx+Math.cos(a+half)*inner,cy+Math.sin(a+half)*inner)
   c.closePath()
  }
  c.lineJoin='round'
  c.strokeStyle='#1f2638';c.lineWidth=w*.035
  for(let i=0;i<rays;i++){path(i);c.stroke()}
  c.fillStyle='#ffffff'
  for(let i=0;i<rays;i++){path(i);c.fill()}
 },256,256,[])
}

export const FONT='"Yu Gothic","Hiragino Sans","Noto Sans JP","Noto Sans CJK JP",sans-serif'
