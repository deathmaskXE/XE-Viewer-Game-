import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { readPsdDocument, type PsdDocument } from "@/lib/board/psd";

function paint(doc: PsdDocument, shown: boolean[]) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, doc.width);
  canvas.height = Math.max(1, doc.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  doc.layers.forEach((layer, index) => {
    if (!shown[index] || !layer.rgba || layer.width < 1 || layer.height < 1) return;
    const tile = document.createElement("canvas");
    tile.width = layer.width;
    tile.height = layer.height;
    const tileCtx = tile.getContext("2d");
    if (!tileCtx) return;
    const pixels = new Uint8ClampedArray(layer.rgba);
    tileCtx.putImageData(new ImageData(pixels, layer.width, layer.height), 0, 0);
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(tile, layer.left, layer.top);
  });
  ctx.globalAlpha = 1;
  return canvas;
}

export function PsdViewer({ url }: { url: string }) {
  const [doc, setDoc] = useState<PsdDocument | null>(null);
  const [shown, setShown] = useState<boolean[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  const host = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancel = false;
    setDoc(null);
    setError("");
    void fetch(url)
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        if (cancel) return;
        const next = readPsdDocument(new Uint8Array(buffer));
        setDoc(next);
        setShown(next.layers.map((layer) => layer.visible));
        setSelected(Math.max(0, next.layers.length - 1));
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "No pude abrir las capas.");
      });
    return () => {
      cancel = true;
    };
  }, [url]);

  const preview = useMemo(() => (doc ? paint(doc, shown) : null), [doc, shown]);

  useEffect(() => {
    const canvas = host.current;
    if (!canvas || !preview) return;
    canvas.width = preview.width;
    canvas.height = preview.height;
    canvas.getContext("2d")?.drawImage(preview, 0, 0);
  }, [preview]);

  if (error) return <p className="p-4 text-sm text-muted">{error}</p>;
  if (!doc || !preview) return <p className="p-4 text-sm text-muted">Leyendo capas…</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="mesa-scroll flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#1a1c1b] p-3">
        <canvas ref={host} className="max-w-full shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" />
      </div>
      <aside className="flex max-h-56 w-full shrink-0 flex-col border-t border-border bg-bg-elevated lg:max-h-none lg:w-60 lg:border-t-0 lg:border-l">
        <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted">Capas · {doc.layers.length}</p>
        <div className="mesa-scroll min-h-0 flex-1 overflow-auto p-1">
          {[...doc.layers].reverse().map((layer, reverseIndex) => {
            const index = doc.layers.length - 1 - reverseIndex;
            const visible = shown[index] !== false;
            return (
              <div
                key={`${layer.name}-${index}`}
                className={`flex items-center gap-1 rounded-control px-1 py-1 ${selected === index ? "bg-bg-subtle" : ""}`}
              >
                <button
                  type="button"
                  className="flex size-8 items-center justify-center text-muted"
                  aria-label={visible ? `Ocultar ${layer.name}` : `Mostrar ${layer.name}`}
                  onClick={() =>
                    setShown((current) => current.map((value, item) => (item === index ? !value : value)))
                  }
                >
                  {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm"
                  onClick={() => setSelected(index)}
                >
                  {layer.name || "Capa"}
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
