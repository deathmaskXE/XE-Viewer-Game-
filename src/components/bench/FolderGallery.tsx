import { FileText, Image as ImageIcon } from "lucide-react";
import type { DiagramRecord } from "@/lib/bench/model";

export function FolderGallery({ name, items, urls, activeId, onOpen }: {
  name: string;
  items: DiagramRecord[];
  urls: Record<string, string>;
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="mesa-scroll min-h-0 w-full overflow-auto bg-bg p-4">
      <div className="mb-4">
        <h2 className="truncate text-lg font-semibold text-fg">{name}</h2>
        <p className="text-xs text-muted">{items.length} archivos · Elige una imagen o PDF para verla</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => {
          const pdf = item.mime.includes("pdf") || /\.pdf$/i.test(item.name);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.id)}
              className={`group min-w-0 overflow-hidden rounded-panel border bg-bg-elevated text-left transition-colors hover:border-accent/70 focus-visible:outline-2 focus-visible:outline-accent ${activeId === item.id ? "border-accent/70" : "border-border"}`}
            >
              <span className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-bg-subtle">
                {pdf ? <FileText className="size-12 text-accent/70" /> : urls[item.id] ? (
                  <img loading="lazy" decoding="async" src={urls[item.id]} alt="" className="h-full w-full object-contain" />
                ) : <ImageIcon className="size-10 text-muted" />}
              </span>
              <span className="block truncate px-2.5 py-2 text-xs text-fg" title={item.name}>{item.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
