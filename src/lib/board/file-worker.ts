import { parseBoard } from "./parse";
import { photoshopToPng } from "./psd";

self.onmessage = async (event: MessageEvent<{ name: string; kind: "board" | "psd"; buffer: ArrayBuffer }>) => {
  try {
    const { name, kind, buffer } = event.data;
    const result = kind === "board" ? await parseBoard(name, buffer) : await photoshopToPng(new Uint8Array(buffer));
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
