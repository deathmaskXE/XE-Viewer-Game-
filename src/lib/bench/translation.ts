import { processFile } from "@/lib/board/process-file";
import { chunksByBytes } from "./text-chunks";

export const LANGUAGES = [
  { code: "en", ocr: "eng", name: "Inglés" },
  { code: "es", ocr: "spa", name: "Español" },
  { code: "pt", ocr: "por", name: "Portugués" },
  { code: "fr", ocr: "fra", name: "Francés" },
  { code: "de", ocr: "deu", name: "Alemán" },
  { code: "it", ocr: "ita", name: "Italiano" },
  { code: "ja", ocr: "jpn", name: "Japonés" },
  { code: "ko", ocr: "kor", name: "Coreano" },
  { code: "zh", ocr: "chi_sim", name: "Chino simplificado" },
  { code: "ru", ocr: "rus", name: "Ruso" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export type TextRegion = { text: string; x: number; y: number; width: number; height: number; translated?: string };
export type ReadResult = { text: string; pages: number; regions: TextRegion[]; width: number; height: number };

async function recognizeImage(image: Blob | string, language: LanguageCode, status: (text: string) => void): Promise<Omit<ReadResult, "pages">> {
  const { createWorker } = await import("tesseract.js");
  const code = LANGUAGES.find((item) => item.code === language)?.ocr ?? "eng";
  status("Descargando el lector de texto… La primera vez puede tardar.");
  const worker = await createWorker(code, 1, {
    logger: (message) => {
      if (message.status === "recognizing text") status(`Leyendo texto… ${Math.round(message.progress * 100)}%`);
    },
  });
  try {
    const result = await worker.recognize(image);
    const data = result.data as typeof result.data & { blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }> }> }> };
    const regions = (data.blocks ?? []).flatMap((block) => (block.paragraphs ?? []).flatMap((paragraph) => paragraph.lines ?? []))
      .filter((line) => line.text.trim().length > 1)
      .map((line) => ({ text: line.text.trim(), x: line.bbox.x0, y: line.bbox.y0, width: line.bbox.x1 - line.bbox.x0, height: line.bbox.y1 - line.bbox.y0 }));
    const dimensions = await createImageBitmap(image instanceof Blob ? image : await fetch(image).then((response) => response.blob()));
    const width = dimensions.width, height = dimensions.height;
    dimensions.close();
    return { text: result.data.text.trim(), regions, width, height };
  } finally {
    await worker.terminate();
  }
}

export async function readImageText(options: {
  url: string;
  name: string;
  mime: string;
  language: LanguageCode;
  page: number;
  status: (text: string) => void;
}): Promise<ReadResult> {
  const { url, name, mime, language, page, status } = options;
  if (mime.includes("pdf") || /\.pdf$/i.test(name)) {
    status("Leyendo la página del PDF…");
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const response = await fetch(url);
    if (!response.ok) throw new Error("No pude abrir el PDF.");
    const task = pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()) });
    const document = await task.promise;
    try {
      if (page < 1 || page > document.numPages) throw new Error(`El PDF tiene ${document.numPages} páginas.`);
      const sheet = await document.getPage(page);
      const content = await sheet.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").trim();
      // Render every page for consistent OCR coordinates over the visible page.
      status("La página es una imagen; reconociendo letras…");
      const original = sheet.getViewport({ scale: 1 });
      const viewport = sheet.getViewport({ scale: Math.min(2.5, 2400 / Math.max(original.width, original.height)) });
      const canvas = documentCanvas(viewport.width, viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No pude preparar la página.");
      await sheet.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("No pude convertir la página en imagen.");
      return { ...await recognizeImage(blob, language, status), pages: document.numPages };
    } finally {
      await task.destroy();
    }
  }

  if (mime.includes("photoshop") || /\.ps[db]$/i.test(name)) {
    status("Preparando las capas de Photoshop…");
    const blob = await fetch(url).then((response) => response.blob());
    const png = await processFile(new File([blob], name, { type: "image/vnd.adobe.photoshop" }), "psd");
    return { ...await recognizeImage(png, language, status), pages: 1 };
  }
  return { ...await recognizeImage(url, language, status), pages: 1 };
}

function documentCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  return canvas;
}

type NativeTranslator = {
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<{
    translate(text: string): Promise<string>;
    destroy?(): void;
  }>;
};

export async function translateText(
  text: string,
  source: LanguageCode,
  target: LanguageCode,
  status: (text: string) => void,
): Promise<{ text: string; method: "local" | "external" }> {
  if (source === target) return { text, method: "local" };
  const native = (globalThis as typeof globalThis & { Translator?: NativeTranslator }).Translator;
  if (native) {
    try {
      // create() is invoked directly by the Translate button's user gesture.
      const translator = await native.create({ sourceLanguage: source, targetLanguage: target });
      try {
        const parts = chunksByBytes(text, 2500);
        const translated: string[] = [];
        for (let index = 0; index < parts.length; index++) {
          status(`Traduciendo en este navegador… ${index + 1}/${parts.length}`);
          translated.push(await translator.translate(parts[index]));
        }
        return { text: translated.join(" "), method: "local" };
      } finally {
        translator.destroy?.();
      }
    } catch {
      // The language pair or local model may be unavailable on this device.
    }
  }

  const parts = chunksByBytes(text);
  const translated: string[] = [];
  for (let index = 0; index < parts.length; index++) {
    status(`Traduciendo texto con MyMemory… ${index + 1}/${parts.length}`);
    const params = new URLSearchParams({ q: parts[index], langpair: `${source}|${target}` });
    let response: Response;
    try {
      response = await fetch(`https://api.mymemory.translated.net/get?${params}`);
    } catch {
      throw new Error("No se pudo conectar al traductor. Revisa tu conexión o intenta en Chrome de escritorio.");
    }
    if (!response.ok) throw new Error("El servicio de traducción no respondió.");
    const data = await response.json() as { responseStatus?: number; responseDetails?: string; responseData?: { translatedText?: string } };
    if (Number(data.responseStatus) !== 200 || !data.responseData?.translatedText) {
      throw new Error(data.responseDetails || "El servicio de traducción no pudo procesar el texto.");
    }
    const doc = new DOMParser().parseFromString(data.responseData.translatedText, "text/html");
    translated.push(doc.documentElement.textContent || data.responseData.translatedText);
  }
  return { text: translated.join(" "), method: "external" };
}
