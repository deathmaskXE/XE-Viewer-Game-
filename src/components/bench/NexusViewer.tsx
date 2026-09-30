import { ExternalLink, RotateCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const NEXUS_URL = "https://web.nexusbv.net/";

export function NexusViewer() {
  const [reload, setReload] = useState(0);
  return <section className="flex min-h-0 flex-1 flex-col bg-bg" aria-label="NexusBV web">
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2">
      <p className="min-w-0 flex-1 text-xs text-muted">Abre tus archivos desde NexusBV. Si la vista está vacía o bloqueada, usa «Abrir aparte».</p>
      <Button size="sm" variant="quiet" onClick={() => setReload((value) => value + 1)}><RotateCw className="size-4" />Recargar</Button>
      <a href={NEXUS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm text-accent hover:bg-bg-elevated"><ExternalLink className="size-4" />Abrir aparte</a>
    </div>
    <iframe key={reload} title="NexusBV — visor web externo" src={NEXUS_URL} className="min-h-0 w-full flex-1 border-0 bg-bg" allow="fullscreen; clipboard-write" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
  </section>;
}
