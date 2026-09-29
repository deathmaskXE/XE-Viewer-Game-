import { desEcbDecrypt, XZZ_DES_KEY } from "./des.ts";
import { MIL_PER_MM, type Board, type BoardPart, type BoardPin, type BoardPoint, type BoardSegment } from "./types.ts";

const SCALE = 10000;
const DIODE_MARK = Uint8Array.of(
  0x76, 0x36, 0x76, 0x36, 0x35, 0x35, 0x35, 0x76, 0x36, 0x76, 0x36, 0x3d, 0x3d, 0x3d, 0xd7, 0xe8, 0xd6, 0xb5, 0x0a,
);

export function looksLikeXzz(bytes: Uint8Array): boolean {
  if (bytes.length < 0x44) return false;
  if (magicAt(bytes, 0)) return true;
  const key = bytes[0x10] ?? 0;
  if (!key) return false;
  return (
    (bytes[0]! ^ key) === 0x58 &&
    (bytes[1]! ^ key) === 0x5a &&
    (bytes[2]! ^ key) === 0x5a &&
    (bytes[3]! ^ key) === 0x50 &&
    (bytes[4]! ^ key) === 0x43 &&
    (bytes[5]! ^ key) === 0x42
  );
}

function magicAt(bytes: Uint8Array, offset: number): boolean {
  return (
    bytes[offset] === 0x58 &&
    bytes[offset + 1] === 0x5a &&
    bytes[offset + 2] === 0x5a &&
    bytes[offset + 3] === 0x50 &&
    bytes[offset + 4] === 0x43 &&
    bytes[offset + 5] === 0x42
  );
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  ) >>> 0;
}

function i32(bytes: Uint8Array, offset: number): number {
  return u32(bytes, offset) | 0;
}

function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function unxor(bytes: Uint8Array): Uint8Array {
  const key = bytes[0x10] ?? 0;
  if (!key) return bytes;
  const cut = findBytes(bytes, DIODE_MARK);
  const end = cut >= 0 ? cut : bytes.length;
  const out = new Uint8Array(bytes);
  for (let i = 0; i < end; i++) out[i] = (out[i] ?? 0) ^ key;
  return out;
}

function textOf(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i] ?? 0;
    if (c === 0) break;
    out += c >= 32 && c < 127 ? String.fromCharCode(c) : "";
  }
  return out;
}

function mils(value: number): number {
  return value / SCALE;
}

function arcSegments(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
  net?: string,
): BoardSegment[] {
  if (!(radius > 0)) return [];
  let sweep = endDeg - startDeg;
  if (sweep <= 0) sweep += 360;
  if (sweep > 360) sweep = 360;
  const steps = Math.max(2, Math.ceil(sweep / 12));
  const segments: BoardSegment[] = [];
  let prevX = cx + radius * Math.cos((startDeg * Math.PI) / 180);
  let prevY = cy + radius * Math.sin((startDeg * Math.PI) / 180);
  for (let step = 1; step <= steps; step++) {
    const angle = startDeg + (sweep * step) / steps;
    const x = cx + radius * Math.cos((angle * Math.PI) / 180);
    const y = cy + radius * Math.sin((angle * Math.PI) / 180);
    segments.push({ x1: prevX, y1: prevY, x2: x, y2: y, net });
    prevX = x;
    prevY = y;
  }
  return segments;
}

function lineOf(body: Uint8Array, net?: string): BoardSegment | null {
  if (body.length < 20) return null;
  return {
    x1: mils(i32(body, 4)),
    y1: mils(i32(body, 8)),
    x2: mils(i32(body, 12)),
    y2: mils(i32(body, 16)),
    net,
  };
}

export function parseXzz(name: string, source: Uint8Array): Board {
  const bytes = unxor(source);
  if (!magicAt(bytes, 0)) throw new Error("No es un .pcb de XinZhiZao (XZZPCB).");
  const mainAt = 0x20 + u32(bytes, 0x20);
  const netAt = 0x20 + u32(bytes, 0x28);
  if (mainAt + 4 > bytes.length || netAt + 4 > bytes.length) {
    throw new Error("El .pcb está cortado.");
  }

  const nets = new Map<number, string>();
  const netEnd = Math.min(bytes.length, netAt + 4 + u32(bytes, netAt));
  let cursor = netAt + 4;
  while (cursor + 8 <= netEnd) {
    const size = u32(bytes, cursor);
    if (size < 8 || cursor + size > bytes.length) break;
    const index = u32(bytes, cursor + 4);
    const label = textOf(bytes.subarray(cursor + 8, cursor + size));
    if (label && label !== "NC" && label !== "UNCONNECTED") nets.set(index, label);
    cursor += size;
  }

  const parts: BoardPart[] = [];
  const pins: BoardPin[] = [];
  const segments: BoardSegment[] = [];
  const outlinePoints: BoardPoint[] = [];
  const mainEnd = Math.min(bytes.length, mainAt + 4 + u32(bytes, mainAt));
  cursor = mainAt + 4;
  while (cursor + 5 <= mainEnd) {
    const type = bytes[cursor] ?? 0;
    const size = u32(bytes, cursor + 1);
    cursor += 5;
    if (size > bytes.length || cursor + size > bytes.length) break;
    const body = bytes.subarray(cursor, cursor + size);
    cursor += size;
    if (type === 5) {
      const segment = lineOf(body, body.length >= 28 ? nets.get(u32(body, 24)) : undefined);
      if (!segment) continue;
      segments.push(segment);
      if (u32(body, 0) === 28) {
        outlinePoints.push({ x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 });
      }
      continue;
    }
    if (type === 1 && body.length >= 24) {
      segments.push(
        ...arcSegments(
          mils(i32(body, 4)),
          mils(i32(body, 8)),
          Math.abs(mils(i32(body, 12))),
          mils(i32(body, 16)),
          mils(i32(body, 20)),
          body.length >= 32 ? nets.get(u32(body, 28)) : undefined,
        ),
      );
      continue;
    }
    if (type !== 7 || size < 16 || size % 8 !== 0) continue;
    readPart(desEcbDecrypt(body, XZZ_DES_KEY), nets, parts, pins, segments);
  }

  if (parts.length === 0 && pins.length === 0) {
    throw new Error("El .pcb no trae piezas. Puede ser una versión de XZZ que todavía no leo.");
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of outlinePoints) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const outline =
    Number.isFinite(minX) && maxX > minX && maxY > minY
      ? [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ]
      : [];
  const base = name.split(/[/\\]/).pop() ?? name;
  return {
    name: base.replace(/\.[^.]+$/, "") || base,
    format: "XZZ",
    unitsPerMm: MIL_PER_MM,
    outline,
    segments,
    parts,
    pins,
    nails: [],
  };
}

function readPart(
  data: Uint8Array,
  nets: Map<number, string>,
  parts: BoardPart[],
  pins: BoardPin[],
  segments: BoardSegment[],
): void {
  if (data.length < 32) return;
  const limit = Math.min(data.length, 4 + u32(data, 0));
  let cursor = 22;
  const groupLen = u32(data, cursor);
  cursor += 4;
  if (groupLen > 200 || cursor + groupLen > data.length) return;
  const group = textOf(data.subarray(cursor, cursor + groupLen));
  cursor += groupLen;
  const partIndex = parts.length;
  let name = "";
  let centerX = 0;
  let centerY = 0;
  let named = false;
  let through = false;
  const partPins: BoardPin[] = [];
  while (cursor + 5 <= limit) {
    const sub = data[cursor] ?? 0;
    const size = u32(data, cursor + 1);
    if (size > data.length || cursor + 5 + size > data.length) break;
    const body = data.subarray(cursor + 5, cursor + 5 + size);
    cursor += 5 + size;
    if (sub === 5) {
      const segment = lineOf(body);
      if (segment) segments.push(segment);
      continue;
    }
    if (sub === 6 && body.length >= 30) {
      const textLen = u32(body, 26);
      if (textLen > 0 && textLen < 64 && 30 + textLen <= body.length && !named) {
        name = textOf(body.subarray(30, 30 + textLen));
        centerX = mils(i32(body, 4));
        centerY = mils(i32(body, 8));
        named = name.length > 0;
      }
      continue;
    }
    if (sub !== 9 || body.length < 28) continue;
    const pinLen = u32(body, 20);
    if (pinLen > 64 || 24 + pinLen + 32 > body.length) continue;
    const pinName = textOf(body.subarray(24, 24 + pinLen)) || String(partPins.length + 1);
    const netAt = 24 + pinLen + 32;
    const netIndex = netAt + 4 <= body.length ? u32(body, netAt) : 0;
    const drill = u32(body, 12);
    if (drill > 0) through = true;
    partPins.push({
      x: mils(i32(body, 4)),
      y: mils(i32(body, 8)),
      net: nets.get(netIndex) ?? "",
      part: partIndex,
      side: "top",
      name: pinName,
    });
  }
  if (!name) name = group || `P${partIndex + 1}`;
  parts.push({
    name,
    side: "top",
    kind: through ? "th" : "smd",
    device: group || undefined,
    center: named ? { x: centerX, y: centerY } : undefined,
  });
  pins.push(...partPins);
}
