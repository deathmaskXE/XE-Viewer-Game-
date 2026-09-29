import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PsdViewer } from "@/components/bench/PsdViewer";

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
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [diagram.id]);

  return (
    <section className="flex min-h-0 min-w-0 flex-col border-border bg-bg-elevated lg:border-l">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{diagram.name}</h2>
        <Button size="icon" variant="ghost" aria-label="Cerrar diagrama" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      {photoshop ? (
        <PsdViewer url={url} />
      ) : pdf ? (
        <iframe title={diagram.name} src={url} className="min-h-0 w-full flex-1 bg-fg" />
      ) : (
        <div
          className="relative min-h-0 flex-1 overflow-hidden bg-bg"
          onWheel={(event) => {
            event.preventDefault();
            setZoom((value) => Math.min(8, Math.max(0.25, value * Math.exp(-event.deltaY * 0.001))))
          }}
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
        >
          <img
            src={url}
            alt={diagram.name}
            draggable={false}
            className="absolute top-1/2 left-1/2 max-h-none max-w-none select-none"
            style={{
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          />
        </div>
      )}
    </section>
  );
}
