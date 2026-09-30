import { useEffect, useRef, useState } from "react";
import { Languages, LocateFixed, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PsdViewer } from "@/components/bench/PsdViewer";
import { FittedImage } from "./FittedImage";
import { TextOverlay } from "@/components/bench/TextOverlay";
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
  const [pdfPages, setPdfPages] = useState(1);
  const [pdfError, setPdfError] = useState("");
  const [pdfImage, setPdfImage] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
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
    setImageSize({ width: 0, height: 0 });
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
      {pdf ? <label className="flex items-center gap-2 border-b border-border px-3 py-1 text-xs">Página <input aria-label="Página del PDF" type="number" min={1} max={pdfPages} value={page} className="w-16 rounded border border-border bg-bg p-1" onChange={(event) => { setPage(Math.min(pdfPages, Math.max(1, Number(event.target.value) || 1))); setRegions([]); }} /> de {pdfPages}</label> : null}
      {photoshop ? (
        <PsdViewer url={url} regions={regions} dimensions={dimensions} zoom={zoom} onZoom={setZoom} pan={pan} onPan={setPan} />
      ) : pdf ? (
        <div className="relative min-h-0 flex-1 overflow-auto bg-bg p-3" ref={imageArea}>
          {pdfImage ? <div className="relative mx-auto" style={{ width: `min(100%, ${dimensions.width || 1200}px)`, zoom }}>
            <img src={pdfImage} alt={`${diagram.name}, página ${page}`} draggable={false} className="block w-full select-none" />
            <TextOverlay regions={regions} {...dimensions} />
          </div> : <p className="p-4 text-sm text-muted">{pdfError || "Preparando página…"}</p>}
        </div>
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
          <FittedImage url={url} alt={diagram.name} zoom={zoom} pan={pan} regions={regions} dimensions={dimensions} />
        </div>
      )}
      {translationOpen ? <TranslationPanel url={url} name={diagram.name} mime={diagram.mime} page={page} onPage={(value) => { setPage(value); setRegions([]); }} onOverlay={(next, width, height) => { setRegions(next); setDimensions({ width, height }); }} onClose={() => setTranslationOpen(false)} /> : null}
    </section>
  );
}
