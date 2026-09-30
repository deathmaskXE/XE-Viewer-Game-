import { MIL_PER_MM, type Board, type BoardNail, type BoardPart, type BoardPin, type Side } from "./types.ts";
import { parseKicad } from "./kicad.ts";
import { largestClosedContour } from "./contour.ts";
import { looksLikeXzz, parseXzz } from "./xzz.ts";

export class BoardParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardParseError";
  }
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);
const BOARD_EXT = new Set([
  "kicad_pcb",
  "bin",
  "brd",
  "bvr",
  "bdv",
  "fz",
  "cad",
  "asc",
  "pcb",
  "gencad",
  "gcd",
  "csv",
  "txt",
  "json",
]);

export type FileRole = "board" | "overlay" | "diagram";

export function brdCipherByte(x: number): number {
  if (x === 0 || x === 10 || x === 13) return x;
  const c = (x << 24) >> 24;
  return (~(((c >> 6) & 3) | (c << 2))) & 0xff;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function sniff(data: Uint8Array): "image" | "pdf" | "svg" | "text" | "fz" | "gzip" | "unknown" {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image";
  if (data.length >= 6 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "image";
  if (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "image";
  }
  if (data.length >= 2 && data[0] === 0x42 && data[1] === 0x4d) return "image";
  if (data.length >= 5 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) {
    return "pdf";
  }
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) return "gzip";
  if (data.length >= 4 && data[0] === 0x23 && data[1] === 0xe2 && data[2] === 0x63 && data[3] === 0x28) {
    return "text";
  }
  const head = new TextDecoder("latin1").decode(data.subarray(0, Math.min(data.length, 400))).trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "svg";
  if (data.length >= 2 && data[0] === 0x78 && (data[1] === 0x01 || data[1] === 0x9c || data[1] === 0xda || data[1] === 0x5e)) {
    return "fz";
  }
  let printable = 0;
  const sample = Math.min(data.length, 200);
  for (let i = 0; i < sample; i++) {
    const c = data[i];
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable++;
  }
  if (sample > 0 && printable / sample > 0.85) return "text";
  return "unknown";
}

export function classifyFile(name: string, mime: string, data: ArrayBuffer): FileRole | null {
  const ext = extOf(name);
  const bytes = new Uint8Array(data);
  const kind = sniff(bytes);
  if (kind === "pdf" || ext === "pdf" || mime === "application/pdf") return "diagram";
  if (kind === "svg" || ext === "svg" || mime === "image/svg+xml") return "diagram";
  if (kind === "image" || IMAGE_EXT.has(ext) || (mime.startsWith("image/") && ext !== "svg")) return "overlay";
  if (BOARD_EXT.has(ext) || kind === "text" || kind === "fz" || kind === "gzip") return "board";
  return null;
}

function decodeText(bytes: Uint8Array): string {
  const encoded =
    bytes.length >= 4 && bytes[0] === 0x23 && bytes[1] === 0xe2 && bytes[2] === 0x63 && bytes[3] === 0x28;
  const copy = encoded ? bytes.map((b) => brdCipherByte(b)) : bytes;
  const utf = new TextDecoder("utf-8", { fatal: false }).decode(copy);
  if (utf.includes("\uFFFD")) {
    const latin = new TextDecoder("latin1").decode(copy);
    if (scoreMarkers(latin) > scoreMarkers(utf)) return latin.replace(/\uFEFF/g, "").replace(/\0/g, "\n");
  }
  return utf.replace(/\uFEFF/g, "").replace(/\0/g, "\n");
}

function scoreMarkers(text: string): number {
  let n = 0;
  if (text.includes("str_length:")) n += 2;
  if (text.includes("var_data:")) n += 2;
  if (text.includes("BRDOUT:")) n += 2;
  if (text.includes("BVRAW_FORMAT_1")) n += 2;
  if (text.includes("GENCAD") || text.includes("$COMPONENTS")) n += 2;
  return n;
}

class Cursor {
  i = 0;
  s: string;
  constructor(s: string) {
    this.s = s;
  }
  get done(): boolean {
    return this.i >= this.s.length;
  }
  skipWs() {
    const s = this.s;
    while (this.i < s.length && s.charCodeAt(this.i) <= 32) this.i++;
  }
  readInt(): number {
    this.skipWs();
    const s = this.s;
    const start = this.i;
    if (s[this.i] === "+" || s[this.i] === "-") this.i++;
    const num = this.i;
    while (this.i < s.length && s.charCodeAt(this.i) >= 48 && s.charCodeAt(this.i) <= 57) this.i++;
    if (this.i === num) {
      this.i = start;
      return 0;
    }
    return Number.parseInt(s.slice(start, this.i), 10);
  }
  readFloat(): number {
    this.skipWs();
    const s = this.s;
    if (s[this.i] === ",") this.i++;
    this.skipWs();
    const start = this.i;
    if (s[this.i] === "+" || s[this.i] === "-") this.i++;
    let saw = false;
    const digit = () => {
      while (this.i < s.length && s.charCodeAt(this.i) >= 48 && s.charCodeAt(this.i) <= 57) {
        saw = true;
        this.i++;
      }
    };
    digit();
    if (s[this.i] === ".") {
      this.i++;
      digit();
    }
    if (s[this.i] === "e" || s[this.i] === "E") {
      const mark = this.i;
      this.i++;
      if (s[this.i] === "+" || s[this.i] === "-") this.i++;
      const exp = this.i;
      digit();
      if (this.i === exp) this.i = mark;
    }
    if (!saw) return 0;
    const n = Number.parseFloat(s.slice(start, this.i));
    return Number.isFinite(n) ? n : 0;
  }
  readStr(): string {
    this.skipWs();
    const s = this.s;
    if (s[this.i] === '"') {
      this.i++;
      const start = this.i;
      while (this.i < s.length && s[this.i] !== '"') this.i++;
      const out = s.slice(start, this.i);
      if (s[this.i] === '"') this.i++;
      return out;
    }
    const start = this.i;
    while (this.i < s.length && s.charCodeAt(this.i) > 32) this.i++;
    return s.slice(start, this.i);
  }
}

function blank(name: string, format: string, unitsPerMm: number): Board {
  return {
    name,
    format,
    unitsPerMm,
    outline: [],
    segments: [],
    parts: [],
    pins: [],
    nails: [],
  };
}

function stem(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  return base.replace(/\.[^.]+$/, "") || base;
}

function sideOf(value: string): Side {
  const v = value.trim().toLowerCase();
  if (v === "top" || v === "t" || v === "(t)" || v === "superior" || v === "1") return "top";
  if (v === "bottom" || v === "bot" || v === "b" || v === "(b)" || v === "inferior" || v === "2") return "bottom";
  return "both";
}

function assertUseful(board: Board) {
  if (board.parts.length === 0 && board.pins.length === 0 && board.outline.length === 0 && board.segments.length === 0) {
    throw new BoardParseError("El archivo no trae piezas, pines ni contorno.");
  }
}

function linesOf(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}

function parseBrd(name: string, text: string): Board {
  const board = blank(stem(name), "BRD", MIL_PER_MM);
  let block = 0;
  const nailNets = new Map<number, string>();
  for (const line of linesOf(text)) {
    const lower = line.toLowerCase();
    if (lower === "str_length:" || lower.startsWith("str_length:")) {
      block = 1;
      continue;
    }
    if (lower === "var_data:" || lower.startsWith("var_data:")) {
      block = 2;
      const rest = line.slice(line.toLowerCase().indexOf("var_data:") + "var_data:".length).trim();
      if (!rest) continue;
      const c = new Cursor(rest);
      c.readInt();
      c.readInt();
      c.readInt();
      c.readInt();
      continue;
    }
    if (lower === "format:" || lower === "format") {
      block = 3;
      continue;
    }
    if (lower === "parts:" || lower === "pins1:") {
      block = 4;
      continue;
    }
    if (lower === "pins:" || lower === "pins2:") {
      block = 5;
      continue;
    }
    if (lower === "nails:") {
      block = 6;
      continue;
    }
    const c = new Cursor(line);
    if (block === 3) {
      board.outline.push({ x: c.readInt(), y: c.readInt() });
    } else if (block === 4) {
      const partName = c.readStr();
      if (!partName) continue;
      const tmp = c.readInt();
      let side: Side = "both";
      if (tmp === 1 || (tmp >= 4 && tmp < 8)) side = "top";
      if (tmp === 2 || tmp >= 8) side = "bottom";
      c.readInt();
      board.parts.push({
        name: partName,
        side,
        kind: tmp & 0xc ? "smd" : "th",
      });
    } else if (block === 5) {
      const pin: BoardPin = {
        x: c.readInt(),
        y: c.readInt(),
        net: "",
        part: -1,
        side: "both",
        name: "",
      };
      const probe = c.readInt();
      const partNo = c.readInt();
      pin.part = partNo > 0 ? partNo - 1 : -1;
      pin.net = c.readStr();
      pin.name = String(probe);
      if (!pin.net && nailNets.has(probe)) pin.net = nailNets.get(probe) ?? "";
      board.pins.push(pin);
    } else if (block === 6) {
      const probe = c.readInt();
      const nail: BoardNail = {
        probe,
        x: c.readInt(),
        y: c.readInt(),
        side: c.readInt() === 1 ? "top" : "bottom",
        net: c.readStr(),
      };
      if (nail.net) nailNets.set(probe, nail.net);
      board.nails.push(nail);
    }
  }
  for (const pin of board.pins) {
    const part = board.parts[pin.part];
    if (!part) {
      pin.part = -1;
      continue;
    }
    pin.side = part.side;
    if (!pin.net) {
      const probe = Number(pin.name);
      if (nailNets.has(probe)) pin.net = nailNets.get(probe) ?? "";
    }
  }
  if (block === 0) throw new BoardParseError("No parece un BRD (faltan las secciones Parts y Pins).");
  assertUseful(board);
  return board;
}

function parseBrd2(name: string, text: string): Board {
  const board = blank(stem(name), "BRD2", MIL_PER_MM);
  const nets = new Map<number, string>();
  let block = 0;
  let maxX = 0;
  let maxY = 0;
  const partMeta: { end: number }[] = [];
  for (const line of linesOf(text)) {
    const c = new Cursor(line);
    const head = line.slice(0, 8).toUpperCase();
    if (head.startsWith("BRDOUT:")) {
      block = 1;
      c.readStr();
      c.readInt();
      maxX = c.readInt();
      maxY = c.readInt();
      continue;
    }
    if (head.startsWith("NETS:")) {
      block = 2;
      continue;
    }
    if (head.startsWith("PARTS:")) {
      block = 3;
      continue;
    }
    if (head.startsWith("PINS:")) {
      block = 4;
      continue;
    }
    if (head.startsWith("NAILS:")) {
      block = 5;
      continue;
    }
    if (block === 1) {
      board.outline.push({ x: c.readInt(), y: c.readInt() });
    } else if (block === 2) {
      const id = c.readInt();
      nets.set(id, c.readStr());
    } else if (block === 3) {
      const part: BoardPart = {
        name: c.readStr() || `P${board.parts.length + 1}`,
        side: "both",
        kind: "smd",
      };
      const x1 = c.readInt();
      const y1 = c.readInt();
      const x2 = c.readInt();
      const y2 = c.readInt();
      const begin = c.readInt();
      const side = c.readInt();
      part.side = side === 1 ? "top" : side === 2 ? "bottom" : "both";
      part.center = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
      part.w = Math.abs(x2 - x1);
      part.h = Math.abs(y2 - y1);
      partMeta.push({ end: begin });
      board.parts.push(part);
    } else if (block === 4) {
      const pin: BoardPin = {
        x: c.readInt(),
        y: c.readInt(),
        net: nets.get(c.readInt()) ?? "",
        part: -1,
        side: "both",
        name: "",
      };
      const side = c.readInt();
      pin.side = side === 1 ? "top" : side === 2 ? "bottom" : "both";
      board.pins.push(pin);
    } else if (block === 5) {
      const nail: BoardNail = {
        probe: c.readInt(),
        x: c.readInt(),
        y: c.readInt(),
        net: nets.get(c.readInt()) ?? "",
        side: c.readInt() === 1 ? "top" : "bottom",
      };
      if (nail.side === "bottom") nail.y = maxY - nail.y;
      board.nails.push(nail);
    }
  }
  let cursor = 0;
  for (let i = 0; i < board.parts.length; i++) {
    const part = board.parts[i];
    if (part.side === "bottom" && part.center) {
      part.center = { x: part.center.x, y: maxY - part.center.y };
    }
    const end = i === board.parts.length - 1 ? board.pins.length : (partMeta[i + 1]?.end ?? board.pins.length);
    while (cursor < end && cursor < board.pins.length) {
      const pin = board.pins[cursor];
      pin.part = i;
      if (pin.side !== "top") pin.y = maxY - pin.y;
      cursor++;
    }
    const owned = board.pins.filter((pin) => pin.part === i);
    const dip =
      owned.length > 0 &&
      owned.every(
        (pin) =>
          !((pin.side === "top" && part.side === "top") || (pin.side === "bottom" && part.side === "bottom")),
      );
    if (dip) {
      part.kind = "th";
      part.side = "both";
    }
  }
  assertUseful(board);
  return board;
}

function parseBvr(name: string, text: string): Board {
  const board = blank(stem(name), "BVR", MIL_PER_MM);
  let block: "none" | "layout" | "pin" | "nail" = "none";
  let skipLoose = false;
  const byName = new Map<string, number>();
  for (const raw of linesOf(text)) {
    if (raw.includes("<<Layout>>")) {
      block = "layout";
      continue;
    }
    if (raw.includes("<<Pin>>")) {
      block = "pin";
      continue;
    }
    if (raw.includes("<<Nail>>")) {
      block = "nail";
      skipLoose = true;
      continue;
    }
    if (skipLoose) {
      skipLoose = false;
      if (!/\d/.test(raw)) continue;
    }
    const c = new Cursor(raw);
    if (block === "layout") {
      const x = Math.trunc(c.readFloat() * 1000);
      const y = Math.trunc(c.readFloat() * 1000);
      board.outline.push({ x, y });
    } else if (block === "pin") {
      const partName = c.readStr();
      if (!partName || partName.startsWith("<<")) continue;
      const loc = c.readStr();
      const side = sideOf(loc);
      c.readInt();
      const pinName = c.readStr();
      const x = Math.trunc(c.readFloat() * 1000);
      const y = Math.trunc(c.readFloat() * 1000);
      c.readInt();
      const net = c.readStr();
      let index = byName.get(partName);
      if (index === undefined) {
        index = board.parts.length;
        byName.set(partName, index);
        board.parts.push({ name: partName, side, kind: "smd" });
      }
      board.pins.push({ x, y, net, part: index, side, name: pinName });
    } else if (block === "nail") {
      const x = Math.trunc(c.readFloat() * 1000);
      const y = Math.trunc(c.readFloat() * 1000);
      const rest: string[] = [];
      while (!c.done) {
        const token = c.readStr();
        if (token) rest.push(token);
      }
      const sideToken = rest.find((token) => /^\(?[tb]\)?$/i.test(token) || /top|bottom/i.test(token));
      const net = rest.length ? rest[rest.length - 1] : "";
      board.nails.push({
        x,
        y,
        probe: board.nails.length + 1,
        side: sideToken ? sideOf(sideToken) : "both",
        net: net === sideToken ? "" : net,
      });
    }
  }
  assertUseful(board);
  return board;
}

function rotatePad(x: number, y: number, deg: number, bottom: boolean): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let px = x * cos - y * sin;
  const py = x * sin + y * cos;
  if (bottom) px = -px;
  return { x: px, y: py };
}

function parseGencad(name: string, text: string): Board {
  let unitsPerMm = MIL_PER_MM;
  const shapes = new Map<string, { name: string; x: number; y: number }[]>();
  type Draft = {
    name: string;
    device: string;
    shape: string;
    x: number;
    y: number;
    rot: number;
    side: Side;
    placed: boolean;
    mirrorX: boolean;
    mirrorY: boolean;
  };
  const drafts: Draft[] = [];
  const board = blank(stem(name), "GenCAD", unitsPerMm);
  let section = "";
  let shapeName = "";
  let pendingPin = "";
  let current: Draft | null = null;
  let signal = "";
  const nodes: { part: string; pin: string; net: string }[] = [];

  const flushPin = (x: number, y: number) => {
    if (!shapeName || !pendingPin) return;
    const pads = shapes.get(shapeName) ?? [];
    pads.push({ name: pendingPin, x, y });
    shapes.set(shapeName, pads);
    pendingPin = "";
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("$")) {
      if (current) {
        drafts.push(current);
        current = null;
      }
      section = line.split(/\s+/)[0]?.toUpperCase() ?? "";
      pendingPin = "";
      continue;
    }
    const c = new Cursor(line);
    const key = c.readStr().toUpperCase();
    if (section === "$HEADER" && key === "UNITS") {
      const unit = c.readStr().toUpperCase();
      const n = c.readFloat();
      if (unit === "MM" || unit.startsWith("MILLIM")) unitsPerMm = 1;
      else if (unit === "INCH" || unit === "INCHES" || unit === "IN") unitsPerMm = 1 / 25.4;
      else if (unit === "MIL" || unit === "MILS" || unit === "THOU") unitsPerMm = MIL_PER_MM;
      else if ((unit === "CUST" || unit === "USER") && n > 0) unitsPerMm = n / 25.4;
    } else if (section === "$BOARD" && (key === "LINE" || key === "ARC")) {
      board.segments.push({
        x1: c.readFloat(),
        y1: c.readFloat(),
        x2: c.readFloat(),
        y2: c.readFloat(),
      });
    } else if (section === "$BOARD" && (key === "RECTANGLE" || key === "RECT")) {
      const x1 = c.readFloat();
      const y1 = c.readFloat();
      const x2 = c.readFloat();
      const y2 = c.readFloat();
      board.outline.push({ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 });
    } else if (section === "$SHAPES") {
      if (key === "SHAPE") {
        shapeName = c.readStr();
        if (!shapes.has(shapeName)) shapes.set(shapeName, []);
        pendingPin = "";
      } else if (key === "PAD" || key === "PIN") {
        const padName = c.readStr();
        // GenCAD PIN records include a padstack name before the coordinates.
        const nextToken = c.readStr();
        const numeric = nextToken !== "" && Number.isFinite(Number(nextToken));
        const maybeX = numeric ? Number(nextToken) : c.readFloat();
        const maybeY = c.readFloat();
        if (padName && line.split(/\s+/).length >= 4) {
          const pads = shapes.get(shapeName) ?? [];
          pads.push({ name: padName, x: maybeX, y: maybeY });
          shapes.set(shapeName, pads);
          pendingPin = "";
        } else {
          pendingPin = padName;
        }
      } else if (pendingPin && (key === "LOC" || key === "PLACE" || key === "XY")) {
        flushPin(c.readFloat(), c.readFloat());
      } else if (pendingPin && key === "X") {
        pendingPin = `${pendingPin}\0${c.readFloat()}`;
      } else if (key === "Y" && pendingPin.includes("\0")) {
        const [pinName, xs] = pendingPin.split("\0");
        pendingPin = pinName ?? "";
        flushPin(Number(xs), c.readFloat());
      }
    } else if (section === "$COMPONENTS") {
      if (key === "COMPONENT") {
        if (current) drafts.push(current);
        current = {
          name: c.readStr() || `U${drafts.length + 1}`,
          device: "",
          shape: "",
          x: 0,
          y: 0,
          rot: 0,
          side: "top",
          placed: false,
          mirrorX: false,
          mirrorY: false,
        };
      } else if (current && key === "DEVICE") current.device = c.readStr();
      else if (current && key === "SHAPE") {
        current.shape = c.readStr();
        const mirror = c.readStr().toUpperCase();
        current.mirrorX = mirror === "MIRRORX";
        current.mirrorY = mirror === "MIRRORY";
      }
      else if (current && (key === "PLACE" || key === "LOC")) {
        current.x = c.readFloat();
        current.y = c.readFloat();
        current.placed = true;
      } else if (current && key === "ROTATION") current.rot = c.readFloat();
      else if (current && (key === "LAYER" || key === "SIDE")) current.side = sideOf(c.readStr());
    } else if ((section === "$SIGNALS" || section === "$NETS") && signal !== undefined) {
      if (key === "SIGNAL" || key === "NET") signal = c.readStr();
      else if ((key === "NODE" || key === "PIN") && signal) {
        const part = c.readStr();
        const pin = c.readStr();
        if (!pin && part.includes(".")) {
          const [a, b] = part.split(".");
          nodes.push({ part: a ?? part, pin: b ?? "", net: signal });
        } else {
          nodes.push({ part, pin, net: signal });
        }
      }
    }
  }
  if (current) drafts.push(current);
  board.unitsPerMm = unitsPerMm;
  if (!board.outline.length) board.outline = largestClosedContour(board.segments.flatMap((edge) => [{ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }]));

  const indexByName = new Map<string, number>();
  for (const draft of drafts) {
    const index = board.parts.length;
    indexByName.set(draft.name, index);
    const pads = shapes.get(draft.shape) ?? [];
    const magnitude = Math.max(Math.abs(draft.x), Math.abs(draft.y), 1);
    const w = magnitude > 80 ? 70 : 0.08;
    const h = magnitude > 80 ? 40 : 0.05;
    board.parts.push({
      name: draft.name,
      side: draft.side,
      kind: "smd",
      device: draft.device || undefined,
      center: { x: draft.x, y: draft.y },
      rot: draft.rot,
      w,
      h,
    });
    if (pads.length === 0) {
      board.pins.push({
        x: draft.x,
        y: draft.y,
        net: "",
        part: index,
        side: draft.side,
        name: "1",
      });
      continue;
    }
    for (const pad of pads) {
      const local = rotatePad(draft.mirrorX ? -pad.x : pad.x, draft.mirrorY ? -pad.y : pad.y, draft.rot, false);
      board.pins.push({
        x: draft.x + local.x,
        y: draft.y + local.y,
        net: "",
        part: index,
        side: draft.side,
        name: pad.name,
      });
    }
  }

  for (const node of nodes) {
    const partIndex = indexByName.get(node.part);
    if (partIndex === undefined) continue;
    const found = board.pins.find((pin) => pin.part === partIndex && pin.name === node.pin);
    if (found) {
      found.net = node.net;
      continue;
    }
    const part = board.parts[partIndex];
    board.pins.push({
      x: part?.center?.x ?? 0,
      y: part?.center?.y ?? 0,
      net: node.net,
      part: partIndex,
      side: part?.side ?? "both",
      name: node.pin,
    });
  }
  assertUseful(board);
  return board;
}

const NAME_KEYS = ["name", "ref", "reference", "part", "designator", "componente", "referencia", "refdes"];
const X_KEYS = ["x", "posx", "xmil", "xpos"];
const Y_KEYS = ["y", "posy", "ymil", "ypos"];
const SIDE_KEYS = ["side", "layer", "lado", "cara", "mount"];
const NET_KEYS = ["net", "signal", "red", "nodo", "node"];
const PIN_KEYS = ["pin", "pad", "pinname", "padname"];

function colIndex(headers: string[], keys: string[]): number {
  return headers.findIndex((header) => keys.includes(header));
}

function parseCsv(name: string, text: string): Board {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"));
  if (rawLines.length < 2) throw new BoardParseError("El CSV está vacío.");
  const delimiter = rawLines[0].includes("\t") ? "\t" : rawLines[0].includes(";") ? ";" : ",";
  const split = (line: string) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
  const first = split(rawLines[0]).map((cell) => cell.toLowerCase());
  const hasHeader = first.some((cell) => NAME_KEYS.includes(cell) || X_KEYS.includes(cell));
  const headers = hasHeader ? first : ["name", "x", "y", "side", "net", "pin"];
  const rows = hasHeader ? rawLines.slice(1) : rawLines;
  const iName = Math.max(0, colIndex(headers, NAME_KEYS));
  const iX = colIndex(headers, X_KEYS);
  const iY = colIndex(headers, Y_KEYS);
  const iSide = colIndex(headers, SIDE_KEYS);
  const iNet = colIndex(headers, NET_KEYS);
  const iPin = colIndex(headers, PIN_KEYS);
  if (iX < 0 || iY < 0) {
    throw new BoardParseError("El CSV necesita columnas X e Y (o name,x,y).");
  }
  const board = blank(stem(name), "CSV", MIL_PER_MM);
  const byName = new Map<string, number>();
  for (const row of rows) {
    const cells = split(row);
    const partName = cells[iName] || `P${board.parts.length + 1}`;
    const x = Number.parseFloat(cells[iX] ?? "");
    const y = Number.parseFloat(cells[iY] ?? "");
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const side = iSide >= 0 ? sideOf(cells[iSide] ?? "") : "top";
    const net = iNet >= 0 ? (cells[iNet] ?? "") : "";
    const pinName = iPin >= 0 ? (cells[iPin] ?? "") : String(board.pins.length + 1);
    let index = byName.get(`${partName}\0${side}`);
    if (index === undefined) {
      index = board.parts.length;
      byName.set(`${partName}\0${side}`, index);
      board.parts.push({ name: partName, side, kind: "smd" });
    }
    board.pins.push({ x, y, net, part: index, side, name: pinName });
  }
  assertUseful(board);
  return board;
}

function parseDimToken(raw: string): number | null {
  const m = /([+-]?(?:\d+\.?\d*|\.\d+))\s*(mil|mm|in|inch|th)?/i.exec(raw.trim());
  if (!m) return null;
  const n = Number.parseFloat(m[1] ?? "");
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? "mil").toLowerCase();
  if (unit === "mm") return n * MIL_PER_MM;
  if (unit === "in" || unit === "inch") return n * 1000;
  return n;
}

function parseAltium(name: string, text: string): Board {
  const board = blank(stem(name), "Altium ASCII", MIL_PER_MM);
  let partIndex = -1;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.includes("RECORD=")) continue;
    const fields = new Map<string, string>();
    for (const chunk of raw.split("|")) {
      const eq = chunk.indexOf("=");
      if (eq < 0) continue;
      fields.set(chunk.slice(0, eq).trim().toUpperCase(), chunk.slice(eq + 1).trim());
    }
    const record = (fields.get("RECORD") ?? "").toUpperCase();
    if (record === "COMPONENT") {
      const designator = fields.get("DESIGNATOR") || fields.get("NAME") || `P${board.parts.length + 1}`;
      const layer = fields.get("LAYER") ?? "TOP";
      const x = parseDimToken(fields.get("X") ?? "");
      const y = parseDimToken(fields.get("Y") ?? "");
      const side: Side = /BOT/i.test(layer) ? "bottom" : "top";
      partIndex = board.parts.length;
      board.parts.push({
        name: designator,
        side,
        kind: "smd",
        device: fields.get("PATTERN") || fields.get("FOOTPRINT") || undefined,
        center: x != null && y != null ? { x, y } : undefined,
      });
    } else if (record === "PAD" || record === "PIN") {
      const x = parseDimToken(fields.get("X") ?? "");
      const y = parseDimToken(fields.get("Y") ?? "");
      if (x == null || y == null) continue;
      const layer = fields.get("LAYER") ?? "";
      const side: Side = /BOT/i.test(layer) ? "bottom" : /TOP/i.test(layer) ? "top" : "both";
      const ownerName = fields.get("COMPONENT") || fields.get("OWNER") || "";
      let owner = partIndex;
      if (ownerName) {
        const found = board.parts.findIndex((part) => part.name === ownerName);
        if (found >= 0) owner = found;
      }
      board.pins.push({
        x,
        y,
        net: fields.get("NET") || fields.get("NETNAME") || "",
        part: owner,
        side,
        name: fields.get("NAME") || fields.get("PADNAME") || "",
      });
    }
  }
  board.parts.forEach((part, index) => {
    if (board.pins.some((pin) => pin.part === index) || !part.center) return;
    board.pins.push({
      x: part.center.x,
      y: part.center.y,
      net: "",
      part: index,
      side: part.side,
      name: "1",
    });
  });
  assertUseful(board);
  return board;
}

function asSide(value: unknown): Side {
  return value === "bottom" || value === "both" || value === "top" ? value : "top";
}

function parseJson(name: string, text: string): Board {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BoardParseError("El JSON no se pudo leer.");
  }
  const root =
    data && typeof data === "object" && "board" in data ? (data as { board: unknown }).board : data;
  if (!root || typeof root !== "object") throw new BoardParseError("El JSON no es una placa de Mesa.");
  const source = root as Partial<Board>;
  if (!Array.isArray(source.parts) && !Array.isArray(source.pins)) {
    throw new BoardParseError("El JSON no trae piezas ni pines.");
  }
  const board = blank(typeof source.name === "string" ? source.name : stem(name), source.format || "Mesa JSON", source.unitsPerMm || MIL_PER_MM);
  board.outline = Array.isArray(source.outline)
    ? source.outline
        .filter((point) => point && typeof point === "object")
        .map((point) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }))
    : [];
  board.segments = Array.isArray(source.segments)
    ? source.segments
        .filter((segment) => segment && typeof segment === "object")
        .map((segment) => ({
          x1: Number(segment.x1) || 0,
          y1: Number(segment.y1) || 0,
          x2: Number(segment.x2) || 0,
          y2: Number(segment.y2) || 0,
        }))
    : [];
  board.parts = (source.parts ?? []).map((part, index) => ({
    name: String(part?.name ?? `P${index + 1}`),
    side: asSide(part?.side),
    kind: part?.kind === "th" ? "th" : "smd",
    device: part?.device ? String(part.device) : undefined,
    center:
      part?.center && typeof part.center === "object"
        ? { x: Number(part.center.x) || 0, y: Number(part.center.y) || 0 }
        : undefined,
    rot: part?.rot,
    w: part?.w,
    h: part?.h,
  }));
  board.pins = (source.pins ?? []).map((pin) => ({
    x: Number(pin?.x) || 0,
    y: Number(pin?.y) || 0,
    net: String(pin?.net ?? ""),
    part: Number.isFinite(pin?.part) ? Number(pin?.part) : -1,
    side: asSide(pin?.side),
    name: String(pin?.name ?? ""),
  }));
  board.nails = (source.nails ?? []).map((nail, index) => ({
    x: Number(nail?.x) || 0,
    y: Number(nail?.y) || 0,
    net: String(nail?.net ?? ""),
    side: asSide(nail?.side),
    probe: Number.isFinite(nail?.probe) ? Number(nail?.probe) : index + 1,
  }));
  assertUseful(board);
  return board;
}

function parseText(name: string, text: string): Board {
  const sample = text.slice(0, 8000);
  if (/^\s*\(kicad_pcb\b/.test(sample)) return parseKicad(name, text);
  if (sample.trimStart().startsWith("{")) return parseJson(name, text);
  if (sample.includes("BVRAW_FORMAT_1") || sample.includes("<<Pin>>")) return parseBvr(name, text);
  if (sample.includes("BRDOUT:") && sample.includes("NETS:")) return parseBrd2(name, text);
  if (sample.includes("str_length:") && (sample.includes("var_data:") || sample.includes("Parts:"))) {
    return parseBrd(name, text);
  }
  if (/\$HEADER|\$COMPONENTS|GENCAD/i.test(sample)) return parseGencad(name, text);
  if (sample.includes("RECORD=")) return parseAltium(name, text);
  if (sample.includes("<<format.asc>>") || sample.includes("dd:1.3")) {
    throw new BoardParseError("Los .bdv codificados no se abren aquí. Exporta un .brd desde OpenBoardView.");
  }
  if (sample.includes("###Panel Added") && sample.includes("C_PIN")) {
    throw new BoardParseError("Este CAD de fixture no está soportado. Usa .brd, BRD2, .bvr, GenCAD o ASCII de Altium.");
  }
  if (sample.includes(",") || sample.includes("\t") || sample.includes(";")) return parseCsv(name, text);
  throw new BoardParseError(
    "No reconocí el boardview. Sirven .brd, BRD2, .bvr, .pcb de XinZhiZao, GenCAD, ASCII de Altium, CSV y JSON de Mesa.",
  );
}

async function inflate(bytes: Uint8Array, format: "deflate" | "gzip"): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream(format));
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export async function parseBoard(name: string, data: ArrayBuffer | Uint8Array): Promise<Board> {
  const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data);
  if (looksLikeXzz(bytes)) return parseXzz(name, bytes);
  const kind = sniff(bytes);
  const ext = extOf(name);
  if (kind === "gzip" || ext === "gz") {
    const inflated = await inflate(bytes, "gzip");
    if (!inflated) throw new BoardParseError("No pude descomprimir el gzip.");
    return parseText(name, decodeText(inflated));
  }
  if (ext === "fz" || kind === "fz") {
    const zlib = kind === "fz" ? bytes : bytes;
    const inflated = kind === "fz" ? await inflate(zlib, "deflate") : null;
    if (!inflated) {
      throw new BoardParseError(
        "Este .fz parece cifrado (FlexBV). Ábrelo en OpenBoardView y exporta un .brd sin cifrar.",
      );
    }
    const text = decodeText(inflated);
    try {
      return parseText(name, text);
    } catch {
      throw new BoardParseError("Descomprimí el .fz, pero el contenido no es un boardview de texto que reconozca.");
    }
  }
  try {
    return parseText(name, decodeText(bytes));
  } catch (reason) {
    if (ext === "bin") throw new BoardParseError("Este .BIN no contiene un boardview reconocido. Puede ser firmware o un formato propietario. Comparte este archivo para identificar su formato.");
    throw reason;
  }
}
