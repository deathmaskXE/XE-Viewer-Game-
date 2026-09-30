import { useEffect, useRef, useState } from "react";
import type { TextRegion } from "@/lib/bench/translation";
import { TextOverlay } from "./TextOverlay";

export function FittedImage({ url, alt, zoom, pan, regions, dimensions }: { url: string; alt: string; zoom: number; pan: {x:number;y:number}; regions: TextRegion[]; dimensions: {width:number;height:number} }) {
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({width:1,height:1});
  const [natural, setNatural] = useState({width:0,height:0});
  const [error, setError] = useState(false);
  useEffect(() => {
    const node=area.current; if(!node)return;
    const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));
    observer.observe(node); return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    let cancelled=false;setNatural({width:0,height:0});setError(false);
    const image=new Image();image.onload=()=>{if(!cancelled)setNatural({width:image.naturalWidth,height:image.naturalHeight});};image.onerror=()=>{if(!cancelled)setError(true);};image.src=url;
    return ()=>{cancelled=true;image.onload=null;image.onerror=null;};
  },[url]);
  const scale=natural.width?Math.min((size.width-16)/natural.width,(size.height-16)/natural.height,1):0;
  return <div ref={area} className="pointer-events-none absolute inset-0">
    {error?<p className="p-4 text-sm text-danger">No pude cargar esta imagen. Vuelve a abrir el archivo.</p>:!natural.width?<p className="p-4 text-sm text-muted">Cargando imagen…</p>:<div className="absolute top-1/2 left-1/2" style={{width:Math.max(1,natural.width*scale),height:Math.max(1,natural.height*scale),containerType:"inline-size",transform:`translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`}}>
      <img src={url} alt={alt} draggable={false} className="block h-full w-full select-none" />
      <TextOverlay regions={regions} {...dimensions}/>
    </div>}
  </div>;
}
