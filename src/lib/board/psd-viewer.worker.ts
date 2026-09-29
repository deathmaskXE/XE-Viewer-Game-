import { readPsdDocument, type PsdDocument } from "./psd";

let doc: PsdDocument | null = null;

self.onmessage = async (event: MessageEvent<{ kind: "open"; buffer: ArrayBuffer } | { kind: "render"; shown: boolean[] }>) => {
  try {
    if (event.data.kind === "open") {
      doc = readPsdDocument(new Uint8Array(event.data.buffer));
      self.postMessage({ kind: "layers", layers: doc.layers.map(({ name, visible }) => ({ name, visible })) });
    } else if (event.data.kind === "render" && doc) {
      const shown = event.data.shown;
      const canvas = new OffscreenCanvas(Math.max(1, doc.width), Math.max(1, doc.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo dibujar el Photoshop.");
      doc.layers.forEach((layer, index) => {
        if (!shown[index] || !layer.rgba || layer.width < 1 || layer.height < 1) return;
        const tile = new OffscreenCanvas(layer.width, layer.height);
        tile.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(layer.rgba), layer.width, layer.height), 0, 0);
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(tile, layer.left, layer.top);
      });
      const blob = await canvas.convertToBlob({ type: "image/png" });
      self.postMessage({ kind: "preview", blob });
    }
  } catch (error) {
    self.postMessage({ kind: "error", error: error instanceof Error ? error.message : String(error) });
  }
};
