import { useEffect, useRef, useState } from "react";
import { Languages, LocateFixed, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PsdViewer } from "@/components/bench/PsdViewer";
import { FittedImage } from "./FittedImage";
import type { TextRegion } from "@/lib/bench/translation";
import { TranslationPanel } from "@/components/bench/TranslationPanel";

import type { DiagramRecord } from "@/lib/bench/model";

export function DiagramPane({
  diagram,
  url,
  onClose,
}: {
  diagram: DiagramRecord;
  url: string;
  onClose: () => void;
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
  const [pdfImage, setPdfImage] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const imageArea = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const area = imageArea.current;
    if (!area) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((value) => Math.min(8, Math.max(0.25, value * Math.exp(-event.deltaY * 0.001))));
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
    setPdfError("");
    let cancelled = false;
    let imageUrl: string | null = null;
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      const response = await fetch(url);
      const task = pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()) });
      try {
        const document = await task.promise;
        setPdfPages(document.numPages);
        const sheet = await document.getPage(page);
        const base = sheet.getViewport({ scale: 1 });
        const viewport = sheet.getViewport({ scale: Math.min(2.5, 2400 / Math.max(base.width, base.height)) });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) return;
        await sheet.render({ canvas, canvasContext: context, viewport }).promise;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
        if (blob && !cancelled) { imageUrl = URL.createObjectURL(blob); setPdfImage(imageUrl); }
      } finally { await task.destroy(); }
    })().catch((error) => { if (!cancelled) { setPdfImage(null); setPdfError(error instanceof Error ? error.message : "No pude abrir el PDF."); } });
    return () => { cancelled = true; if (imageUrl) URL.revokeObjectURL(imageUrl); setPdfImage(null); };
  }, [pdf, url, page]);

  const searchPdf = async () => {
    const query = pdfQuery.trim().toLocaleLowerCase();
    const token = ++searchToken.current;
    setPdfMatches([]); setPdfSearchNotice("");
    if (!query) { setPdfSearching(false); return; }
    setPdfSearching(true);
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      const response = await fetch(url);
      task = pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()) });
      const document = await task.promise;
      const matches: { page: number; excerpt: string }[] = [];
      let hasText = false;
      for (let number = 1; number <= document.numPages; number++) {
        if (token !== searchToken.current) break;
        const sheet = await document.getPage(number);
        const content = await sheet.getTextContent();
        const text = content.items.map(item => "str" in item ? item.str : "").join(" ");
        if (text.trim()) hasText = true;
        const found = text.toLocaleLowerCase().indexOf(query);
        if (found >= 0) matches.push({ page: number, excerpt: text.slice(Math.max(0, found - 45), found + query.length + 85) });
      }
      if (token === searchToken.current) {
        setPdfMatches(matches);
        setPdfSearchNotice(matches.length ? `${matches.length} páginas con coincidencias` : hasText ? "No hay coincidencias." : "Este PDF no contiene texto buscable; necesita OCR.");
        if (matches[0]) { setPage(matches[0].page); setZoom(1); setPan({ x: 0, y: 0 }); setRegions([]); }
      }
    } catch (error) { if (token === searchToken.current) setPdfSearchNotice(error instanceof Error ? error.message : "No pude buscar en el PDF."); }
    finally { await task?.destroy(); if (token === searchToken.current) setPdfSearching(false); }
  };
  useEffect(() => () => { searchToken.current++; }, [url]);

  return (
    <section className="relative flex min-h-0 min-w-0 flex-col border-border bg-bg-elevated border-l" onContextMenu={(event) => event.preventDefault()}>
      <div className="xe-diagram-toolbar flex shrink-0 items-center border-b border-border px-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{diagram.name}</h2>
        <Button size="sm" variant={translationOpen ? "primary" : "quiet"} aria-label="Traducir texto de la imagen" onClick={() => setTranslationOpen((value) => !value)}><Languages className="size-4" /><span className="hidden sm:inline">Traducir</span></Button>
        <Button size="icon" variant="ghost" aria-label="Alejar diagrama" onClick={() => setZoom((value) => Math.max(0.25, value / 1.25))}><Minus className="size-4" /></Button>
        <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button size="icon" variant="ghost" aria-label="Acercar diagrama" onClick={() => setZoom((value) => Math.min(8, value * 1.25))}><Plus className="size-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Encuadrar diagrama" title="Encuadrar" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><LocateFixed className="size-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Cerrar diagrama" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      {pdf ? <label className="flex items-center gap-2 border-b border-border px-3 py-1 text-xs">Página <input aria-label="Página del PDF" type="number" min={1} max={pdfPages} value={page} className="w-16 rounded border border-border bg-bg p-1" onChange={(event) => { setPage(Math.min(pdfPages, Math.max(1, Number(event.target.value) || 1))); setRegions([]); setZoom(1); setPan({ x: 0, y: 0 }); }} /> de {pdfPages}</label> : null}
      {pdf ? <div className="shrink-0 border-b border-border p-2">
        <form className="flex gap-1" onSubmit={event => { event.preventDefault(); void searchPdf(); }}>
          <input aria-label="Buscar texto en el PDF" placeholder="Buscar referencia o señal…" value={pdfQuery} onChange={event => setPdfQuery(event.target.value)} className="h-11 min-w-0 flex-1 rounded-control border border-border bg-bg px-2 text-sm" />
          <Button type="submit" variant="primary" disabled={pdfSearching}>{pdfSearching ? "Buscando…" : "Buscar"}</Button>
        </form>
        {pdfSearchNotice ? <p role="status" className="mt-1 text-xs text-muted">{pdfSearchNotice}</p> : null}
        {pdfMatches.length ? <div className="mesa-scroll mt-1 max-h-28 overflow-auto">{pdfMatches.map(match => <button key={match.page} className="block min-h-11 w-full rounded-control px-2 py-2 text-left text-xs hover:bg-bg-subtle" onClick={() => { setPage(match.page); setZoom(1); setPan({ x: 0, y: 0 }); setRegions([]); }}><strong>Pág. {match.page}</strong> · {match.excerpt}</button>)}</div> : null}
      </div> : null}
      {photoshop ? (
        <PsdViewer url={url} regions={regions} dimensions={dimensions} zoom={zoom} onZoom={setZoom} pan={pan} onPan={setPan} />
      ) : (
        <div
          ref={imageArea}
          className="relative min-h-0 flex-1 touch-none overflow-hidden bg-bg"
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
          {pdf && !pdfImage ? <p className="p-4 text-sm text-muted">{pdfError || "Preparando página…"}</p> : <FittedImage url={pdf ? pdfImage! : url} alt={pdf ? `${diagram.name}, página ${page}` : diagram.name} zoom={zoom} pan={pan} regions={regions} dimensions={dimensions} /> }
        </div>
      )}
      {translationOpen ? <TranslationPanel url={url} name={diagram.name} mime={diagram.mime} page={page} onPage={(value) => { setPage(value); setRegions([]); }} onOverlay={(next, width, height) => { setRegions(next); setDimensions({ width, height }); }} onClose={() => setTranslationOpen(false)} /> : null}
    </section>
  );
}
