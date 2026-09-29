/** Photoshop PSD/PSB: flattened preview plus a layer stack for the viewer. */

const MAX_EDGE = 4096;
const VIEW_EDGE = 1800;

export function looksLikePhotoshop(bytes: Uint8Array): boolean {
  return bytes.length > 26 && bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53;
}

class Reader {
  i = 0;
  bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }
  u16(): number {
    const v = ((this.bytes[this.i] ?? 0) << 8) | (this.bytes[this.i + 1] ?? 0);
    this.i += 2;
    return v;
  }
  u32(): number {
    const v =
      ((this.bytes[this.i] ?? 0) * 0x1000000 +
        ((this.bytes[this.i + 1] ?? 0) << 16) +
        ((this.bytes[this.i + 2] ?? 0) << 8) +
        (this.bytes[this.i + 3] ?? 0)) >>>
      0;
    this.i += 4;
    return v;
  }
  u64(): number {
    const hi = this.u32();
    const lo = this.u32();
    return hi * 0x100000000 + lo;
  }
  skip(n: number) {
    this.i += n;
  }
  slice(n: number): Uint8Array {
    const out = this.bytes.subarray(this.i, this.i + n);
    this.i += n;
    return out;
  }
}

function unpackRow(src: Uint8Array, offset: number, expected: number): { row: Uint8Array; next: number } {
  const row = new Uint8Array(expected);
  let written = 0;
  let cursor = offset;
  while (written < expected && cursor < src.length) {
    const n = src[cursor]!;
    cursor++;
    if (n === 128) continue;
    if (n < 128) {
      const count = n + 1;
      row.set(src.subarray(cursor, cursor + count), written);
      cursor += count;
      written += count;
    } else {
      const count = 257 - n;
      const value = src[cursor] ?? 0;
      cursor++;
      row.fill(value, written, written + count);
      written += count;
    }
  }
  return { row, next: cursor };
}

function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  return [
    255 - Math.min(255, c * (1 - k / 255) + k),
    255 - Math.min(255, m * (1 - k / 255) + k),
    255 - Math.min(255, y * (1 - k / 255) + k),
  ];
}

type Flat = { width: number; height: number; rgba: Uint8ClampedArray };

function planesToRgba(
  width: number,
  height: number,
  depth: number,
  mode: number,
  channels: number,
  planes: Uint8Array[],
): Uint8ClampedArray {
  const take = (plane: Uint8Array | undefined, index: number) =>
    depth === 16 ? (plane?.[index * 2] ?? 0) : (plane?.[index] ?? 0);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 255;
    if (mode === 1) {
      r = g = b = take(planes[0], index);
    } else if (mode === 3) {
      r = take(planes[0], index);
      g = take(planes[1], index);
      b = take(planes[2], index);
      if (channels > 3) a = take(planes[3], index);
    } else {
      const converted = cmykToRgb(take(planes[0], index), take(planes[1], index), take(planes[2], index), take(planes[3], index));
      r = converted[0];
      g = converted[1];
      b = converted[2];
    }
    const pixel = index * 4;
    rgba[pixel] = r;
    rgba[pixel + 1] = g;
    rgba[pixel + 2] = b;
    rgba[pixel + 3] = a;
  }
  return rgba;
}

function decodeComposite(bytes: Uint8Array): Flat {
  const reader = new Reader(bytes);
  reader.i = 4;
  const version = reader.u16();
  if (version !== 1 && version !== 2) throw new Error("Esa versión de Photoshop no se abre.");
  reader.skip(6);
  const channels = reader.u16();
  const height = reader.u32();
  const width = reader.u32();
  const depth = reader.u16();
  const mode = reader.u16();
  if (!width || !height || channels < 1) throw new Error("El Photoshop no trae imagen.");
  if (depth !== 8 && depth !== 16) {
    throw new Error("Solo abro Photoshop de 8 o 16 bits. Exporta un PNG si es de 32 bits.");
  }
  if (mode !== 1 && mode !== 3 && mode !== 4) {
    throw new Error("Ese modo de color no se abre. En Photoshop pasa la imagen a RGB y vuelve a guardar.");
  }
  reader.skip(reader.u32());
  reader.skip(reader.u32());
  const layerLen = version === 1 ? reader.u32() : reader.u64();
  reader.skip(layerLen);
  if (reader.i + 2 > bytes.length) {
    throw new Error("Este PSD no trae la imagen combinada. En Photoshop, guarda con compatibilidad maximizada.");
  }
  const compression = reader.u16();
  const sampleBytes = depth === 16 ? 2 : 1;
  const planeBytes = width * height * sampleBytes;
  const planes: Uint8Array[] = [];
  if (compression === 0) {
    for (let channel = 0; channel < channels; channel++) planes.push(reader.slice(planeBytes));
  } else if (compression === 1) {
    const countBytes = version === 1 ? 2 : 4;
    const counts: number[] = [];
    for (let n = 0; n < channels * height; n++) counts.push(countBytes === 2 ? reader.u16() : reader.u32());
    const packed = bytes.subarray(reader.i);
    let packCursor = 0;
    for (let channel = 0; channel < channels; channel++) {
      const plane = new Uint8Array(planeBytes);
      for (let row = 0; row < height; row++) {
        const size = counts[channel * height + row] ?? 0;
        const unpacked = unpackRow(packed.subarray(packCursor, packCursor + size), 0, width * sampleBytes);
        plane.set(unpacked.row, row * width * sampleBytes);
        packCursor += size;
      }
      planes.push(plane);
    }
  } else {
    throw new Error("Este PSD va comprimido con ZIP. En Photoshop, guarda una copia RGB de 8 bits o expórtalo a PNG.");
  }
  return downscale({ width, height, rgba: planesToRgba(width, height, depth, mode, channels, planes) });
}

function downscale(image: Flat): Flat {
  const edge = Math.max(image.width, image.height);
  if (edge <= MAX_EDGE) return image;
  const factor = Math.ceil(edge / MAX_EDGE);
  const width = Math.max(1, Math.floor(image.width / factor));
  const height = Math.max(1, Math.floor(image.height / factor));
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * factor * image.width + x * factor) * 4;
      const to = (y * width + x) * 4;
      rgba[to] = image.rgba[from] ?? 0;
      rgba[to + 1] = image.rgba[from + 1] ?? 0;
      rgba[to + 2] = image.rgba[from + 2] ?? 0;
      rgba[to + 3] = image.rgba[from + 3] ?? 255;
    }
  }
  return { width, height, rgba };
}

async function rgbaToPng(image: Flat): Promise<Blob> {
  const pixels = new Uint8ClampedArray(image.rgba);
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No pude preparar la imagen de Photoshop.");
    ctx.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
    return canvas.convertToBlob({ type: "image/png" });
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No pude preparar la imagen de Photoshop.");
    ctx.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("No pude preparar la imagen de Photoshop.");
    return blob;
  }
  throw new Error("No pude preparar la imagen de Photoshop.");
}

function compositeDocument(doc: PsdDocument): Flat {
  const rgba = new Uint8ClampedArray(doc.width * doc.height * 4);
  for (const layer of doc.layers) {
    if (!layer.visible || !layer.rgba || layer.width < 1 || layer.height < 1) continue;
    for (let y = 0; y < layer.height; y++) {
      const dy = layer.top + y;
      if (dy < 0 || dy >= doc.height) continue;
      for (let x = 0; x < layer.width; x++) {
        const dx = layer.left + x;
        if (dx < 0 || dx >= doc.width) continue;
        const from = (y * layer.width + x) * 4;
        const to = (dy * doc.width + dx) * 4;
        const srcA = ((layer.rgba[from + 3] ?? 0) / 255) * layer.opacity;
        const dstA = (rgba[to + 3] ?? 0) / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA <= 0) continue;
        for (let channel = 0; channel < 3; channel++) {
          const src = layer.rgba[from + channel] ?? 0;
          const dst = rgba[to + channel] ?? 0;
          rgba[to + channel] = Math.round((src * srcA + dst * dstA * (1 - srcA)) / outA);
        }
        rgba[to + 3] = Math.round(outA * 255);
      }
    }
  }
  return { width: doc.width, height: doc.height, rgba };
}

export async function photoshopToPng(bytes: Uint8Array): Promise<Blob> {
  try {
    return await rgbaToPng(decodeComposite(bytes));
  } catch (error) {
    const doc = readPsdDocument(bytes);
    if (!doc.layers.some((layer) => layer.rgba)) {
      throw error instanceof Error ? error : new Error("No pude leer el Photoshop.");
    }
    return rgbaToPng(compositeDocument(doc));
  }
}

export function photoshopPixels(bytes: Uint8Array): Flat {
  return decodeComposite(bytes);
}

export type PsdLayer = {
  name: string;
  visible: boolean;
  opacity: number;
  left: number;
  top: number;
  width: number;
  height: number;
  rgba: Uint8ClampedArray | null;
};

export type PsdDocument = {
  width: number;
  height: number;
  layers: PsdLayer[];
};

function latin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}

function readTag(reader: Reader): string {
  return latin1(reader.slice(4));
}

function pascalName(reader: Reader): string {
  const start = reader.i;
  const len = reader.bytes[reader.i] ?? 0;
  reader.i += 1;
  const raw = reader.bytes.subarray(reader.i, reader.i + len);
  reader.i += len;
  const used = reader.i - start;
  reader.i += (4 - (used % 4)) % 4;
  return latin1(raw);
}

function u32be(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] ?? 0) * 0x1000000 +
      ((data[offset + 1] ?? 0) << 16) +
      ((data[offset + 2] ?? 0) << 8) +
      (data[offset + 3] ?? 0)) >>>
    0
  );
}

function utf16be(data: Uint8Array, offset: number, count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) {
    out += String.fromCharCode(((data[offset + i * 2] ?? 0) << 8) | (data[offset + i * 2 + 1] ?? 0));
  }
  return out;
}

function decodePlane(
  payload: Uint8Array,
  compression: number,
  width: number,
  height: number,
  depth: number,
  rowBytes: number,
): Uint8Array {
  const pixels = new Uint8Array(Math.max(0, width * height));
  if (width <= 0 || height <= 0) return pixels;
  const sample = depth === 16 ? 2 : 1;
  if (compression === 0) {
    for (let i = 0; i < pixels.length; i++) pixels[i] = payload[i * sample] ?? 0;
    return pixels;
  }
  if (compression !== 1) return pixels;
  const counts: number[] = [];
  let cursor = 0;
  for (let row = 0; row < height; row++) {
    if (rowBytes === 4) {
      counts.push(u32be(payload, cursor));
      cursor += 4;
    } else {
      counts.push(((payload[cursor] ?? 0) << 8) | (payload[cursor + 1] ?? 0));
      cursor += 2;
    }
  }
  for (let row = 0; row < height; row++) {
    const size = counts[row] ?? 0;
    const unpacked = unpackRow(payload, cursor, width * sample);
    for (let x = 0; x < width; x++) pixels[row * width + x] = unpacked.row[x * sample] ?? 0;
    cursor += size;
  }
  return pixels;
}

type LayerDraft = {
  top: number;
  left: number;
  bottom: number;
  right: number;
  channels: { id: number; length: number }[];
  opacity: number;
  visible: boolean;
  name: string;
};

function flatDocument(bytes: Uint8Array): PsdDocument {
  const flat = decodeComposite(bytes);
  return {
    width: flat.width,
    height: flat.height,
    layers: [
      {
        name: "Fondo",
        visible: true,
        opacity: 1,
        left: 0,
        top: 0,
        width: flat.width,
        height: flat.height,
        rgba: flat.rgba,
      },
    ],
  };
}

export function readPsdDocument(bytes: Uint8Array): PsdDocument {
  const reader = new Reader(bytes);
  reader.i = 4;
  const version = reader.u16();
  if (version !== 1 && version !== 2) throw new Error("Esa versión de Photoshop no se abre.");
  reader.skip(6);
  reader.u16();
  const height = reader.u32();
  const width = reader.u32();
  const depth = reader.u16();
  const mode = reader.u16();
  reader.skip(reader.u32());
  reader.skip(reader.u32());
  const sectionLen = version === 1 ? reader.u32() : reader.u64();
  if (sectionLen < 6) return flatDocument(bytes);
  const infoLen = version === 1 ? reader.u32() : reader.u64();
  const infoEnd = Math.min(bytes.length, reader.i + infoLen);
  const countRaw = reader.u16();
  const count = countRaw > 32767 ? 65536 - countRaw : countRaw;
  if (!count) return flatDocument(bytes);
  const drafts: LayerDraft[] = [];
  for (let index = 0; index < count; index++) {
    const top = reader.u32() | 0;
    const left = reader.u32() | 0;
    const bottom = reader.u32() | 0;
    const right = reader.u32() | 0;
    const channelCount = reader.u16();
    const channels: { id: number; length: number }[] = [];
    for (let channel = 0; channel < channelCount; channel++) {
      const id = (reader.u16() << 16) >> 16;
      const length = version === 1 ? reader.u32() : reader.u64();
      channels.push({ id, length });
    }
    reader.skip(8);
    const opacity = reader.bytes[reader.i] ?? 255;
    reader.i += 2;
    const flags = reader.bytes[reader.i] ?? 0;
    reader.i += 2;
    const extraLen = reader.u32();
    const extraEnd = Math.min(infoEnd, reader.i + extraLen);
    let name = `Capa ${index + 1}`;
    if (reader.i + 8 <= extraEnd) {
      const maskLen = reader.u32();
      reader.i += maskLen;
      if (reader.i + 4 <= extraEnd) {
        const blendLen = reader.u32();
        reader.i += blendLen;
      }
      if (reader.i < extraEnd) {
        const parsed = pascalName(reader);
        if (parsed) name = parsed;
      }
      while (reader.i + 12 <= extraEnd) {
        const signature = readTag(reader);
        const key = readTag(reader);
        if (signature !== "8BIM" && signature !== "8B64") break;
        const len = version === 2 && signature === "8B64" ? reader.u64() : reader.u32();
        if (reader.i + len > bytes.length) break;
        const data = reader.slice(len);
        if (len % 2) reader.i += 1;
        if (key === "luni" && data.length >= 4) {
          const unicode = utf16be(data, 4, u32be(data, 0)).replace(/\0/g, "");
          if (unicode) name = unicode;
        }
      }
    }
    reader.i = extraEnd;
    drafts.push({
      top,
      left,
      bottom,
      right,
      channels,
      opacity: opacity / 255,
      visible: (flags & 0x02) === 0,
      name,
    });
  }

  const rowBytes = version === 1 ? 2 : 4;
  const layers: PsdLayer[] = [];
  for (const draft of drafts) {
    const layerW = Math.max(0, draft.right - draft.left);
    const layerH = Math.max(0, draft.bottom - draft.top);
    const planes = new Map<number, Uint8Array>();
    for (const channel of draft.channels) {
      if (channel.length < 2 || reader.i + channel.length > bytes.length) {
        reader.skip(Math.max(0, channel.length));
        continue;
      }
      const compression = reader.u16();
      const payload = reader.slice(channel.length - 2);
      if (layerW > 0 && layerH > 0 && (depth === 8 || depth === 16)) {
        planes.set(channel.id, decodePlane(payload, compression, layerW, layerH, depth, rowBytes));
      }
    }
    let rgba: Uint8ClampedArray | null = null;
    if (layerW > 0 && layerH > 0 && planes.size > 0) {
      rgba = new Uint8ClampedArray(layerW * layerH * 4);
      const red = planes.get(0);
      const green = planes.get(1);
      const blue = planes.get(2);
      const alpha = planes.get(-1);
      for (let i = 0; i < layerW * layerH; i++) {
        let r = 0;
        let g = 0;
        let b = 0;
        if (mode === 1) r = g = b = red?.[i] ?? 0;
        else if (mode === 4) {
          const converted = cmykToRgb(red?.[i] ?? 0, green?.[i] ?? 0, blue?.[i] ?? 0, planes.get(3)?.[i] ?? 0);
          r = converted[0];
          g = converted[1];
          b = converted[2];
        } else {
          r = red?.[i] ?? 0;
          g = green?.[i] ?? 0;
          b = blue?.[i] ?? 0;
        }
        const pixel = i * 4;
        rgba[pixel] = r;
        rgba[pixel + 1] = g;
        rgba[pixel + 2] = b;
        rgba[pixel + 3] = alpha?.[i] ?? 255;
      }
    }
    layers.push({
      name: draft.name,
      visible: draft.visible,
      opacity: draft.opacity,
      left: draft.left,
      top: draft.top,
      width: layerW,
      height: layerH,
      rgba,
    });
  }
  if (!layers.some((layer) => layer.rgba)) return flatDocument(bytes);
  return fitDocument({ width, height, layers });
}

function fitDocument(doc: PsdDocument): PsdDocument {
  const edge = Math.max(doc.width, doc.height);
  if (edge <= VIEW_EDGE) return doc;
  const factor = edge / VIEW_EDGE;
  const width = Math.max(1, Math.round(doc.width / factor));
  const height = Math.max(1, Math.round(doc.height / factor));
  return {
    width,
    height,
    layers: doc.layers.map((layer) => scaleLayer(layer, factor)),
  };
}

function scaleLayer(layer: PsdLayer, factor: number): PsdLayer {
  const left = Math.round(layer.left / factor);
  const top = Math.round(layer.top / factor);
  if (!layer.rgba || layer.width < 1 || layer.height < 1) {
    return { ...layer, left, top, width: Math.max(0, Math.round(layer.width / factor)), height: Math.max(0, Math.round(layer.height / factor)), rgba: null };
  }
  const nextW = Math.max(1, Math.round(layer.width / factor));
  const nextH = Math.max(1, Math.round(layer.height / factor));
  const rgba = new Uint8ClampedArray(nextW * nextH * 4);
  for (let y = 0; y < nextH; y++) {
    const sy = Math.min(layer.height - 1, Math.floor((y + 0.5) * factor));
    for (let x = 0; x < nextW; x++) {
      const sx = Math.min(layer.width - 1, Math.floor((x + 0.5) * factor));
      const from = (sy * layer.width + sx) * 4;
      const to = (y * nextW + x) * 4;
      rgba[to] = layer.rgba[from] ?? 0;
      rgba[to + 1] = layer.rgba[from + 1] ?? 0;
      rgba[to + 2] = layer.rgba[from + 2] ?? 0;
      rgba[to + 3] = layer.rgba[from + 3] ?? 255;
    }
  }
  return { ...layer, left, top, width: nextW, height: nextH, rgba };
}
