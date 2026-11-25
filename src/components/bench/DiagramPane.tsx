import { useEffect, useRef, useState } from "react";
import { Languages, LocateFixed, Minus, Plus, X, Columns2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PsdViewer } from "@/components/bench/PsdViewer";
import { TextOverlay } from "./TextOverlay";
import { FittedImage } from "./FittedImage";
import type { TextRegion } from "@/lib/bench/translation";
import { TranslationPanel } from "@/components/bench/TranslationPanel";

import type { DiagramRecord } from "@/lib/bench/model";

export function DiagramPane({
  diagram,
  url,
  onClose,
  layout,
  onLayoutChange,
  syncReference, onReference, onLinkReference,
}: {
  syncReference?: string;
  onLinkReference?: (name:string)=>void;
  onReference?: (name: string) => void;
  diagram: DiagramRecord;
  url: string;
  onClose: () => void;
  layout: "full" | "split";
  onLayoutChange: (layout: "full" | "split") => void;
}) {
  const photoshop =
    diagram.mime.includes("photoshop") || /\.(psd|psb)$/i.test(diagram.name);
  const pdf = diagram.mime.includes("pdf") || diagram.name.toLowerCase().endsWith(".pdf");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [translationOpen, setTranslationOpen] = useState(false);
  const [regions, setRegions] = useState<TextRegion[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(1);
  const [pdfQuery, setPdfQuery] = useState("");
  const [pdfSearching, setPdfSearching] = useState(false);
  const [pdfMatches, setPdfMatches] = useState<{ page: number; excerpt: string }[]>([]);
  const [pdfSearchNotice, setPdfSearchNotice] = useState("");
  const searchToken = useRef(0);
  const [pdfPages, setPdfPages] = useState(1);
  const [pdfError, setPdfError] = useState("");
  const pdfCanvas = useRef<HTMLCanvasElement>(null);
  const [pageSize, setPageSize] = useState({width:0,height:0});
  const [doc, setDoc] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const indexRef = useRef<Promise<{page:number; text:string}[]> | null>(null);
  const [areaSize, setAreaSize] = useState({width:800,height:600});
  useEffect(() => { const el=imageArea.current; if (!el) return; const observer=new ResizeObserver(([e])=>setAreaSize({width:e.contentRect.width,height:e.contentRect.height})); observer.observe(el); return ()=>observer.disconnect(); }, [pdf, diagram.id]);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const imageArea = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const area = imageArea.current;
    if (!area) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((value) => Math.min(32, Math.max(0.25, value * Math.exp(-event.deltaY * 0.001))));
    };
    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  }, [diagram.id, pdf, photoshop]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setTranslationOpen(false);
    setRegions([]);
    setPage(1);
    setPdfQuery(""); setPdfMatches([]); setPdfSearchNotice(""); searchToken.current++;
    setDimensions({ width: 0, height: 0 });
  }, [diagram.id]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled=false;
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    setDoc(null); setPageSize({width:0,height:0}); setPdfError(""); indexRef.current=null;
    void (async()=>{
      const lib=await import("pdfjs-dist");
      lib.GlobalWorkerOptions.workerSrc=(await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      const response=await fetch(url);
      const data=new Uint8Array(await response.arrayBuffer());
      if(cancelled)return;
      task=lib.getDocument({data});
      const loaded=await task.promise;
      if(!cancelled){setDoc(loaded);setPdfPages(loaded.numPages);}
    })().catch(e=>{if(!cancelled)setPdfError(String(e));});
    return ()=>{cancelled=true;void task?.destroy();};
  },[pdf,url]);
  useEffect(()=>{
    if(!doc || !pdfCanvas.current)return;
    let cancelled=false;
    let render: ReturnType<import("pdfjs-dist").PDFPageProxy["render"]> | undefined;
    const timer=setTimeout(()=>{void (async()=>{
      const sheet=await doc.getPage(page); if(cancelled)return;
      const base=sheet.getViewport({scale:1});
      const w=Math.max(1,areaSize.width), h=Math.max(1,areaSize.height);
      const fit=Math.min(Math.max(1,w-16)/base.width,Math.max(1,h-16)/base.height);
      const viewport=sheet.getViewport({scale:fit*zoom});
      const left=(w-viewport.width)/2+pan.x, top=(h-viewport.height)/2+pan.y;
      const dpr=Math.min(3,window.devicePixelRatio||1);
      // Render only the visible viewport at native pixel density, not a scaled page bitmap.
      const canvas=document.createElement("canvas");
      canvas.width=Math.ceil(w*dpr); canvas.height=Math.ceil(h*dpr);
      const context=canvas.getContext("2d",{alpha:false}); if(!context)return;
      context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);
      render=sheet.render({canvas,canvasContext:context,viewport,transform:[dpr,0,0,dpr,left*dpr,top*dpr]});
      await render.promise;
      if(cancelled||!pdfCanvas.current)return;
      const target=pdfCanvas.current;target.width=canvas.width;target.height=canvas.height;
      target.getContext("2d")?.drawImage(canvas,0,0);
      setPageSize({width:base.width,height:base.height});setPdfError("");
    })().catch(e=>{if(!cancelled)setPdfError(String(e));});},35);
    return ()=>{cancelled=true;clearTimeout(timer);render?.cancel();};
  },[doc,page,zoom,areaSize,pan]);
  const pageFit=pageSize.width?Math.min(Math.max(1,areaSize.width-16)/pageSize.width,Math.max(1,areaSize.height-16)/pageSize.height)*zoom:0;

  const searchPdf = async (value = pdfQuery, exact = false) => {
    const query = value.trim().toLocaleLowerCase();
    const token = ++searchToken.current;
    setPdfMatches([]); setPdfSearchNotice("");
    if (!query) { setPdfSearching(false); return; }
    setPdfSearching(true);
    try {
      if(!doc){setPdfSearchNotice("Preparando PDF…");return;}
      if(!indexRef.current) indexRef.current=(async()=>{
        const result:{page:number;text:string}[]=[];
        for(let number=1;number<=doc.numPages;number++){
          const sheet=await doc.getPage(number);const content=await sheet.getTextContent();
          result.push({page:number,text:content.items.map(item=>"str" in item?item.str:"").join(" ")});
        }return result;
      })().catch(e=>{indexRef.current=null;throw e;});
      const pages=await indexRef.current;
      const matches:{page:number;excerpt:string}[]=[];
      const hasText=pages.some(p=>p.text.trim());
      for(const {page:number,text} of pages){
        const lower=text.toLocaleLowerCase();
        let found=lower.indexOf(query);
        if(exact)while(found>=0&&(/[a-z0-9_]/i.test(lower[found-1]||"")||/[a-z0-9_]/i.test(lower[found+query.length]||"")))found=lower.indexOf(query,found+1);
        if(found>=0)matches.push({page:number,excerpt:text.slice(Math.max(0,found-45),found+query.length+85)});
      }
      if (token === searchToken.current) {
        setPdfMatches(matches);
        setPdfSearchNotice(matches.length ? `${matches.length} páginas con coincidencias` : hasText ? (exact ? "Referencia no presente en el PDF. Vincula una equivalencia verificada o busca manualmente." : "No hay coincidencias.") : "Este PDF no contiene texto buscable; necesita OCR.");
        if (matches[0]) { setPage(matches[0].page); setZoom(1); setPan({ x: 0, y: 0 }); setRegions([]); }
      }
    } catch (error) { if (token === searchToken.current) setPdfSearchNotice(error instanceof Error ? error.message : "No pude buscar en el PDF."); }
    finally { if (token === searchToken.current) setPdfSearching(false); }
  };
  useEffect(() => () => { searchToken.current++; }, [url]);
  useEffect(() => {
    if (!pdf || !doc || !syncReference) return;
    setPdfQuery(syncReference);
    void searchPdf(syncReference, true);
  }, [pdf, url, doc, syncReference]);

  return (
    <section className="relative flex min-h-0 min-w-0 flex-col border-border bg-bg-elevated border-l" onContextMenu={(event) => event.preventDefault()}>
      <div className="xe-diagram-toolbar flex shrink-0 items-center border-b border-border px-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{diagram.name}</h2>
        <Button size="sm" variant={layout === "full" ? "primary" : "quiet"} aria-label="Ver archivo en pantalla completa" title="Vista completa" onClick={() => onLayoutChange("full")}><Maximize2 className="size-4" /><span className="hidden sm:inline">Completa</span></Button>
        <Button size="sm" variant={layout === "split" ? "primary" : "quiet"} aria-label="Ver archivo en pantalla dividida" title="Vista dividida" onClick={() => onLayoutChange("split")}><Columns2 className="size-4" /><span className="hidden sm:inline">Dividida</span></Button>
        <Button size="sm" variant={translationOpen ? "primary" : "quiet"} aria-label="Traducir texto de la imagen" onClick={() => setTranslationOpen((value) => !value)}><Languages className="size-4" /><span className="hidden sm:inline">Traducir</span></Button>
        <Button size="icon" variant="ghost" aria-label="Alejar diagrama" onClick={() => setZoom((value) => Math.max(0.25, value / 1.25))}><Minus className="size-4" /></Button>
        <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button size="icon" variant="ghost" aria-label="Acercar diagrama" onClick={() => setZoom((value) => Math.min(32, value * 1.25))}><Plus className="size-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Encuadrar diagrama" title="Encuadrar" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><LocateFixed className="size-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Cerrar diagrama" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      {pdf ? <label className="flex items-center gap-2 border-b border-border px-3 py-1 text-xs">Página <input aria-label="Página del PDF" type="number" min={1} max={pdfPages} value={page} className="w-16 rounded border border-border bg-bg p-1" onChange={(event) => { setPage(Math.min(pdfPages, Math.max(1, Number(event.target.value) || 1))); setRegions([]); setZoom(1); setPan({ x: 0, y: 0 }); }} /> de {pdfPages}</label> : null}
      {pdf ? <div className="shrink-0 border-b border-border p-2">
        <form className="flex gap-1" onSubmit={event => { event.preventDefault(); void searchPdf(pdfQuery, true); }}>
          <input aria-label="Buscar texto en el PDF" placeholder="Buscar referencia o señal…" value={pdfQuery} onChange={event => setPdfQuery(event.target.value)} className="h-11 min-w-0 flex-1 rounded-control border border-border bg-bg px-2 text-sm" />
          <Button type="submit" variant="primary" disabled={pdfSearching}>{pdfSearching ? "Buscando…" : "Buscar"}</Button>
        </form>
        {onLinkReference && <Button size="sm" variant="quiet" disabled={!pdfMatches.length || pdfSearching} onClick={()=>{if(window.confirm(`¿Guardar ${pdfQuery.trim()} como referencia del componente seleccionado?`))onLinkReference(pdfQuery.trim());}}>Vincular referencia verificada</Button>}
        {onReference && <Button size="sm" variant="quiet" onClick={() => onReference(pdfQuery.trim())}>Localizar referencia en placa</Button>}
        {pdfSearchNotice ? <p role="status" className="mt-1 text-xs text-muted">{pdfSearchNotice}</p> : null}
        {pdfMatches.length ? <div className="mesa-scroll mt-1 max-h-28 overflow-auto">{pdfMatches.map(match => <button key={match.page} className="block min-h-11 w-full rounded-control px-2 py-2 text-left text-xs hover:bg-bg-subtle" onClick={() => { setPage(match.page); setZoom(1); setPan({ x: 0, y: 0 }); setRegions([]); }}><strong>Pág. {match.page}</strong> · {match.excerpt}</button>)}</div> : null}
      </div> : null}
      {photoshop ? (
        <PsdViewer url={url} regions={regions} dimensions={dimensions} zoom={zoom} onZoom={setZoom} pan={pan} onPan={setPan} />
      ) : (
        <div
          ref={imageArea}
          className="relative min-h-0 flex-1 touch-none overflow-hidden bg-white xe-workspace-black"
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            setPan({
              x: drag.current.px + event.clientX - drag.current.x,
              y: drag.current.py + event.clientY - drag.current.y,
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => { drag.current = null; }}
        >
          {pdf ? <>
            <canvas ref={pdfCanvas} className="pointer-events-none absolute inset-0 h-full w-full" aria-label={`${diagram.name}, página ${page}`} />
            {pageFit>0 && <div className="pointer-events-none absolute" style={{left:(areaSize.width-pageSize.width*pageFit)/2+pan.x,top:(areaSize.height-pageSize.height*pageFit)/2+pan.y,width:pageSize.width*pageFit,height:pageSize.height*pageFit,containerType:"inline-size"}}><TextOverlay regions={regions} {...dimensions}/></div>}
            {(!doc || pdfError) && <p className="relative p-4 text-sm text-muted">{pdfError || "Preparando página…"}</p>}
          </> : <FittedImage url={url} alt={diagram.name} zoom={zoom} pan={pan} regions={regions} dimensions={dimensions} />}

        </div>
      )}
      {translationOpen ? <TranslationPanel url={url} name={diagram.name} mime={diagram.mime} page={page} onPage={(value) => { setPage(value); setRegions([]); }} onOverlay={(next, width, height) => { setRegions(next); setDimensions({ width, height }); }} onClose={() => setTranslationOpen(false)} /> : null}
    </section>
  );
}
