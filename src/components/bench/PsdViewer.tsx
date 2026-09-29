import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { TextOverlay } from "./TextOverlay";
import type { TextRegion } from "@/lib/bench/translation";
import { Eye, EyeOff } from "lucide-react";

type Layer = { name: string; visible: boolean };

export function PsdViewer({ url, zoom, onZoom, pan, onPan, regions, dimensions }: {
  url: string;
  regions: TextRegion[];
  dimensions: { width: number; height: number };
  zoom: number;
  onZoom: Dispatch<SetStateAction<number>>;
  pan: { x: number; y: number };
  onPan: Dispatch<SetStateAction<{ x: number; y: number }>>;
}) {
  const [layers, setLayers] = useState<Layer[] | null>(null);
  const [shown, setShown] = useState<boolean[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const previewRef = useRef<string | null>(null);
  const imageArea = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const area = imageArea.current;
    if (!area) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      onZoom((value) => Math.min(8, Math.max(0.25, value * Math.exp(-event.deltaY * 0.001))));
    };
    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  }, [onZoom, layers]);

  useEffect(() => {
    let cancelled = false;
    const worker = new Worker(new URL("../../lib/board/psd-viewer.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    setLayers(null);
    setPreview(null);
    setError("");
    worker.onmessage = (event: MessageEvent<{ kind: "layers" | "preview" | "error"; layers?: Layer[]; blob?: Blob; error?: string }>) => {
      if (cancelled) return;
      if (event.data.kind === "layers" && event.data.layers) {
        setLayers(event.data.layers);
        setShown(event.data.layers.map((layer) => layer.visible));
        setSelected(Math.max(0, event.data.layers.length - 1));
      } else if (event.data.kind === "preview" && event.data.blob) {
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = URL.createObjectURL(event.data.blob);
        setPreview(previewRef.current);
      } else if (event.data.kind === "error") setError(event.data.error || "No pude abrir las capas.");
    };
    worker.onerror = () => setError("No se pudo iniciar el lector de Photoshop.");
    void fetch(url)
      .then((response) => response.arrayBuffer())
      .then((buffer) => { if (!cancelled) worker.postMessage({ kind: "open", buffer }, [buffer]); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "No pude leer el archivo."); });
    return () => {
      cancelled = true;
      worker.terminate();
      workerRef.current = null;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    if (layers) workerRef.current?.postMessage({ kind: "render", shown });
  }, [layers, shown]);

  if (error) return <p className="p-4 text-sm text-muted">{error}</p>;
  if (!layers) return <p className="p-4 text-sm text-muted">Leyendo capas… Puedes seguir usando el visor.</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div
        ref={imageArea}
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-[#0b1924]"
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          onPan({ x: drag.current.px + event.clientX - drag.current.x, y: drag.current.py + event.clientY - drag.current.y });
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        {preview ? <div className="absolute top-1/2 left-1/2 max-h-full max-w-full select-none" style={{ transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, containerType: "inline-size" }}><img src={preview} alt="Vista de las capas" draggable={false} className="block max-h-[80vh] max-w-full" /><TextOverlay regions={regions} {...dimensions} /></div> : <p className="p-4 text-sm text-muted">Preparando vista…</p>}
      </div>
      <aside className="flex max-h-56 w-full shrink-0 flex-col border-t border-border bg-bg-elevated lg:max-h-none lg:w-60 lg:border-t-0 lg:border-l">
        <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted">Capas · {layers.length}</p>
        <div className="mesa-scroll min-h-0 flex-1 overflow-auto p-1">
          {[...layers].reverse().map((layer, reverseIndex) => {
            const index = layers.length - 1 - reverseIndex;
            const visible = shown[index] !== false;
            return (
              <div key={`${layer.name}-${index}`} className={`flex items-center gap-1 rounded-control px-1 py-1 ${selected === index ? "bg-bg-subtle" : ""}`}>
                <button type="button" className="flex size-8 items-center justify-center text-muted" aria-label={visible ? `Ocultar ${layer.name}` : `Mostrar ${layer.name}`} onClick={() => setShown((current) => current.map((value, item) => item === index ? !value : value))}>
                  {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </button>
                <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => setSelected(index)}>{layer.name || "Capa"}</button>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
