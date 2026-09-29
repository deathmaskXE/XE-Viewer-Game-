import { useEffect, useRef, useState } from "react";
import { Languages, LocateFixed, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PsdViewer } from "@/components/bench/PsdViewer";
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
  }, [diagram.id]);

  return (
    <section className="relative flex min-h-0 min-w-0 flex-col border-border bg-bg-elevated lg:border-l">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
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
      {photoshop ? (
        <PsdViewer url={url} zoom={zoom} onZoom={setZoom} pan={pan} onPan={setPan} />
      ) : pdf ? (
        <div className="relative min-h-0 flex-1 overflow-auto bg-bg" ref={imageArea}>
          <div className="relative" style={{ width: `${Math.max(100, zoom * 100)}%`, height: `${Math.max(100, zoom * 100)}%` }}>
            <iframe title={diagram.name} src={url} className="absolute top-0 left-0 border-0 bg-fg" style={{ width: `${100 / Math.max(1, zoom)}%`, height: `${100 / Math.max(1, zoom)}%`, transform: `scale(${zoom})`, transformOrigin: "top left" }} />
          </div>
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
          <img
            src={url}
            alt={diagram.name}
            draggable={false}
            className="absolute top-1/2 left-1/2 max-h-full max-w-full select-none"
            style={{
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          />
        </div>
      )}
      {translationOpen ? <TranslationPanel url={url} name={diagram.name} mime={diagram.mime} onClose={() => setTranslationOpen(false)} /> : null}
    </section>
  );
}
