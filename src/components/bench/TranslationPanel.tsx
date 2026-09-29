import { useEffect, useState } from "react";
import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LANGUAGES, readImageText, translateText, type LanguageCode } from "@/lib/bench/translation";

export function TranslationPanel({ url, name, mime, onClose }: {
  url: string;
  name: string;
  mime: string;
  onClose: () => void;
}) {
  const [source, setSource] = useState<LanguageCode>("en");
  const [target, setTarget] = useState<LanguageCode>("es");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<number | null>(null);
  const [original, setOriginal] = useState("");
  const [translated, setTranslated] = useState("");
  const [method, setMethod] = useState<"local" | "external" | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pdf = mime.includes("pdf") || /\.pdf$/i.test(name);

  useEffect(() => {
    setOriginal("");
    setTranslated("");
    setPages(null);
    setPage(1);
    setError("");
    setStatus("");
  }, [url]);

  const read = async () => {
    setBusy(true);
    setError("");
    setOriginal("");
    setTranslated("");
    try {
      const result = await readImageText({ url, name, mime, language: source, page, status: setStatus });
      setPages(result.pages);
      setOriginal(result.text);
      setStatus(result.text ? "Texto leído. Pulsa Traducir." : "No encontré texto legible en esta imagen.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pude leer el texto.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const translate = async () => {
    if (!original) return;
    setBusy(true);
    setError("");
    setTranslated("");
    try {
      const result = await translateText(original, source, target, setStatus);
      setTranslated(result.text);
      setMethod(result.method);
      setStatus("Traducción lista.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pude traducir el texto.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const selectClass = "h-10 w-full rounded-control border border-border bg-bg px-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <aside className="mesa-scroll absolute inset-y-12 right-0 z-20 w-full max-w-[24rem] overflow-auto border-l border-border bg-bg-elevated p-4 shadow-[-10px_0_30px_rgba(0,0,0,.3)]">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Traducir texto de la imagen</h3>
        <Button size="icon" variant="ghost" aria-label="Cerrar traducción" onClick={onClose}><X className="size-4" /></Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">Idioma original
          <select className={selectClass} value={source} disabled={busy} onChange={(event) => { setSource(event.target.value as LanguageCode); setOriginal(""); setTranslated(""); }}>
            {LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">Traducir a
          <select className={selectClass} value={target} disabled={busy} onChange={(event) => { setTarget(event.target.value as LanguageCode); setTranslated(""); }}>
            {LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </label>
      </div>
      {pdf ? (
        <label className="mt-3 block text-xs text-muted">Página del PDF {pages ? `(de ${pages})` : ""}
          <input className={selectClass} type="number" min={1} max={pages ?? undefined} value={page} disabled={busy} onChange={(event) => { setPage(Math.max(1, Number(event.target.value) || 1)); setOriginal(""); setTranslated(""); }} />
        </label>
      ) : null}
      <Button className="mt-4 w-full" variant="primary" disabled={busy} onClick={() => void read()}>{busy ? "Procesando…" : "1. Leer texto"}</Button>
      {original ? (
        <>
          <p className="mt-4 text-xs text-muted">Texto detectado (puedes corregirlo antes de traducir):</p>
          <textarea className="mt-1 min-h-32 w-full rounded-control border border-border bg-bg p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent" value={original} onChange={(event) => { setOriginal(event.target.value); setTranslated(""); }} />
          <Button className="mt-2 w-full" variant="quiet" disabled={busy || !original.trim()} onClick={() => void translate()}>{busy ? "Traduciendo…" : "2. Traducir texto"}</Button>
        </>
      ) : null}
      {translated ? (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-accent">Traducción {method === "local" ? "local" : "en línea"}</p>
            <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(translated)}><Copy className="size-4" /> Copiar</Button>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{translated}</p>
        </div>
      ) : null}
      {status ? <p className="mt-3 text-xs text-muted" role="status">{status}</p> : null}
      {error ? <p className="mt-3 text-xs text-danger" role="alert">{error}</p> : null}
      <p className="mt-5 text-xs leading-relaxed text-subtle">La lectura de imagen se hace en tu navegador. Chrome de escritorio puede traducir localmente; si no está disponible, al pulsar «Traducir texto» se envía solo el texto reconocido a MyMemory. La imagen no se envía.</p>
    </aside>
  );
}
