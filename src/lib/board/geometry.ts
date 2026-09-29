import type { Board, Side } from "@/lib/board/types";

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type PartBox = Bounds & { cx: number; cy: number };

export type Prepared = {
  parts: PartBox[];
  bounds: Bounds;
  nets: Map<string, { pins: number[]; nails: number[] }>;
};

export type PickHit = {
  pin: number | null;
  part: number | null;
  nail: number | null;
};

export function acceptsSide(side: Side, view: Side | "both"): boolean {
  return view === "both" || side === "both" || side === view;
}

function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function add(b: Bounds, x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  b.minX = Math.min(b.minX, x);
  b.minY = Math.min(b.minY, y);
  b.maxX = Math.max(b.maxX, x);
  b.maxY = Math.max(b.maxY, y);
}

function finite(b: Bounds): boolean {
  return Number.isFinite(b.minX) && Number.isFinite(b.maxX);
}

export function prepare(board: Board): Prepared {
  const pinsByPart: number[][] = board.parts.map(() => []);
  const nets = new Map<string, { pins: number[]; nails: number[] }>();

  const touchNet = (name: string) => {
    const key = name.trim();
    if (!key) return null;
    let bucket = nets.get(key);
    if (!bucket) {
      bucket = { pins: [], nails: [] };
      nets.set(key, bucket);
    }
    return bucket;
  };

  board.pins.forEach((pin, index) => {
    if (pin.part >= 0 && pin.part < pinsByPart.length) pinsByPart[pin.part].push(index);
    touchNet(pin.net)?.pins.push(index);
  });
  board.nails.forEach((nail, index) => {
    touchNet(nail.net)?.nails.push(index);
  });

  const parts: PartBox[] = board.parts.map((part, index) => {
    const box = emptyBounds();
    for (const pinIndex of pinsByPart[index]) {
      const pin = board.pins[pinIndex];
      add(box, pin.x, pin.y);
    }
    if (!finite(box) && part.center) {
      const w = part.w ?? 40;
      const h = part.h ?? 24;
      add(box, part.center.x - w / 2, part.center.y - h / 2);
      add(box, part.center.x + w / 2, part.center.y + h / 2);
    }
    if (!finite(box)) {
      add(box, 0, 0);
      add(box, 20, 20);
    }
    const spanX = box.maxX - box.minX;
    const spanY = box.maxY - box.minY;
    const pad =
      pinsByPart[index].length <= 1
        ? Math.max(12, Math.min(spanX, spanY) * 0.2 + 8)
        : Math.max(6, Math.min(spanX, spanY) * 0.12 + 4);
    box.minX -= pad;
    box.minY -= pad;
    box.maxX += pad;
    box.maxY += pad;
    return {
      ...box,
      cx: (box.minX + box.maxX) / 2,
      cy: (box.minY + box.maxY) / 2,
    };
  });

  const bounds = emptyBounds();
  for (const point of board.outline) add(bounds, point.x, point.y);
  for (const segment of board.segments) {
    add(bounds, segment.x1, segment.y1);
    add(bounds, segment.x2, segment.y2);
  }
  for (const box of parts) {
    add(bounds, box.minX, box.minY);
    add(bounds, box.maxX, box.maxY);
  }
  for (const pin of board.pins) add(bounds, pin.x, pin.y);
  for (const nail of board.nails) add(bounds, nail.x, nail.y);
  if (!finite(bounds)) {
    bounds.minX = 0;
    bounds.minY = 0;
    bounds.maxX = 100;
    bounds.maxY = 100;
  }
  const margin = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.03;
  bounds.minX -= margin;
  bounds.minY -= margin;
  bounds.maxX += margin;
  bounds.maxY += margin;

  return { parts, bounds, nets };
}

export function pickAt(
  board: Board,
  prep: Prepared,
  x: number,
  y: number,
  view: Side,
  radius: number,
): PickHit {
  let pin: number | null = null;
  let bestPin = radius * radius;
  board.pins.forEach((item, index) => {
    if (!acceptsSide(item.side, view)) return;
    const dx = item.x - x;
    const dy = item.y - y;
    const d = dx * dx + dy * dy;
    if (d <= bestPin) {
      bestPin = d;
      pin = index;
    }
  });
  if (pin != null) {
    const owner = board.pins[pin].part;
    return { pin, part: owner >= 0 ? owner : null, nail: null };
  }

  let nail: number | null = null;
  let bestNail = radius * radius;
  board.nails.forEach((item, index) => {
    if (!acceptsSide(item.side, view)) return;
    const dx = item.x - x;
    const dy = item.y - y;
    const d = dx * dx + dy * dy;
    if (d <= bestNail) {
      bestNail = d;
      nail = index;
    }
  });
  if (nail != null) return { pin: null, part: null, nail };

  let part: number | null = null;
  let bestArea = Infinity;
  prep.parts.forEach((box, index) => {
    const item = board.parts[index];
    if (!item || !acceptsSide(item.side, view)) return;
    if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) return;
    const area = (box.maxX - box.minX) * (box.maxY - box.minY);
    if (area < bestArea) {
      bestArea = area;
      part = index;
    }
  });
  return { pin: null, part, nail: null };
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Nearest copper segment that belongs to a net. */
export function pickTrace(board: Board, x: number, y: number, radius: number): string | null {
  let best = radius;
  let net: string | null = null;
  for (const segment of board.segments) {
    if (!segment.net) continue;
    const distance = distToSegment(x, y, segment.x1, segment.y1, segment.x2, segment.y2);
    if (distance <= best) {
      best = distance;
      net = segment.net;
    }
  }
  return net;
}
