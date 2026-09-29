import type { Board } from "./types";

export function processFile(file: File, kind: "board"): Promise<Board>;
export function processFile(file: File, kind: "psd"): Promise<Blob>;
export async function processFile(file: File, kind: "board" | "psd"): Promise<Board | Blob> {
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./file-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: Board | Blob; error?: string }>) => {
      worker.terminate();
      if (event.data.ok && event.data.result) resolve(event.data.result);
      else reject(new Error(event.data.error || "No se pudo procesar el archivo."));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("No se pudo iniciar el lector de archivos."));
    };
    worker.postMessage({ name: file.name, kind, buffer }, [buffer]);
  });
}
