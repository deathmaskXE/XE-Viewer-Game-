import { prepare } from "@/lib/board/geometry";
import { MIL_PER_MM, type Board, type BoardPart, type BoardPin, type Side } from "@/lib/board/types";

function twoPin(
  parts: BoardPart[],
  pins: BoardPin[],
  name: string,
  x: number,
  y: number,
  pitch: number,
  along: "h" | "v",
  netA: string,
  netB: string,
  device: string,
  side: Side = "top",
) {
  const part = parts.length;
  const dx = along === "h" ? pitch / 2 : 0;
  const dy = along === "v" ? pitch / 2 : 0;
  parts.push({ name, side, kind: "smd", device });
  pins.push(
    { x: x - dx, y: y - dy, net: netA, part, side, name: "1" },
    { x: x + dx, y: y + dy, net: netB, part, side, name: "2" },
  );
}

export function createDemoBoard(): Board {
  const parts: BoardPart[] = [];
  const pins: BoardPin[] = [];

  const header = (
    name: string,
    x: number,
    y: number,
    nets: string[],
    pitch: number,
    along: "h" | "v",
    side: Side,
    kind: BoardPart["kind"],
  ) => {
    const part = parts.length;
    parts.push({ name, side, kind, device: kind === "th" ? "header" : "fpc" });
    nets.forEach((net, index) => {
      pins.push({
        x: x + (along === "h" ? index * pitch : 0),
        y: y + (along === "v" ? index * pitch : 0),
        net,
        part,
        side,
        name: String(index + 1),
      });
    });
  };

  header("J_BAT", 180, 760, ["VBAT", "GND", "NTC", "ID"], 80, "v", "top", "th");
  twoPin(parts, pins, "F1", 380, 980, 70, "h", "VBAT", "V_FUSED", "fuse");
  twoPin(parts, pins, "C_IN1", 520, 820, 36, "v", "V_FUSED", "GND", "0805");
  twoPin(parts, pins, "C_IN2", 640, 820, 36, "v", "V_FUSED", "GND", "0805");
  twoPin(parts, pins, "C_IN3", 760, 820, 36, "h", "V_FUSED", "GND", "0402");

  const can = parts.length;
  parts.push({ name: "CAN1", side: "top", kind: "smd", device: "shield" });
  for (const [index, point] of [
    [760, 520],
    [1480, 520],
    [1480, 1180],
    [760, 1180],
  ].entries()) {
    pins.push({
      x: point[0] ?? 0,
      y: point[1] ?? 0,
      net: "GND",
      part: can,
      side: "top",
      name: `C${index + 1}`,
    });
  }

  const pmic = parts.length;
  parts.push({ name: "U_PMIC", side: "top", kind: "smd", device: "QFN-24" });
  const cx = 1100;
  const cy = 860;
  const perSide = 6;
  const pitch = 25;
  const half = ((perSide - 1) * pitch) / 2;
  const pad = half + 28;
  const left = ["VBAT", "V_FUSED", "GND", "GND", "NTC", "EN"];
  const bottom = ["SCL", "SDA", "GPIO1", "ID", "GND", "GND"];
  const right = ["VPH_PWR", "VPH_PWR", "VPH_PWR", "GND", "VREG_1V8", "VREG_1V8"];
  const top = ["GND", "GND", "SW", "SW", "BOOT", "GND"];
  const sides = [left, bottom, right, top];
  sides.forEach((nets, sideIndex) => {
    nets.forEach((net, index) => {
      const along = half - index * pitch;
      const x = sideIndex === 0 ? cx - pad : sideIndex === 2 ? cx + pad : cx - half + index * pitch;
      const y =
        sideIndex === 3 ? cy + pad : sideIndex === 1 ? cy - pad : sideIndex === 0 ? cy + along : cy - along;
      const resolvedX = sideIndex === 0 || sideIndex === 2 ? x : cx - half + index * pitch;
      pins.push({
        x: resolvedX,
        y,
        net,
        part: pmic,
        side: "top",
        name: String(sideIndex * perSide + index + 1),
      });
    });
  });

  twoPin(parts, pins, "L1", 1680, 980, 90, "h", "SW", "VPH_PWR", "inductor");
  twoPin(parts, pins, "C_BOOT", 1540, 1120, 28, "h", "BOOT", "SW", "0402");
  twoPin(parts, pins, "C_OUT1", 1860, 1040, 40, "v", "VPH_PWR", "GND", "0805");
  twoPin(parts, pins, "C_OUT2", 1980, 1040, 40, "v", "VPH_PWR", "GND", "0805");
  twoPin(parts, pins, "C_OUT3", 1860, 900, 28, "h", "VPH_PWR", "GND", "0402");
  twoPin(parts, pins, "R_EN", 900, 1240, 36, "h", "EN", "V_FUSED", "0402");

  const ldo = parts.length;
  parts.push({ name: "U_LDO", side: "top", kind: "smd", device: "SOT-23-5" });
  const ldoPins = [
    { x: -40, y: 28, net: "VPH_PWR", name: "IN" },
    { x: -40, y: 0, net: "GND", name: "GND" },
    { x: -40, y: -28, net: "EN", name: "EN" },
    { x: 40, y: -16, net: "FB", name: "FB" },
    { x: 40, y: 16, net: "VREG_1V8", name: "OUT" },
  ];
  for (const pin of ldoPins) {
    pins.push({
      x: 2060 + pin.x,
      y: 720 + pin.y,
      net: pin.net,
      part: ldo,
      side: "top",
      name: pin.name,
    });
  }
  twoPin(parts, pins, "C_LDO", 2220, 760, 28, "v", "VREG_1V8", "GND", "0402");
  twoPin(parts, pins, "R_FB1", 2220, 620, 32, "v", "VREG_1V8", "FB", "0402");
  twoPin(parts, pins, "R_FB2", 2320, 560, 32, "v", "FB", "GND", "0402");
  header("J_IO", 2280, 980, ["VREG_1V8", "GND", "SCL", "SDA", "GPIO1", "ID"], 50, "v", "top", "smd");

  twoPin(parts, pins, "R_B1", 980, 300, 36, "h", "NTC", "GND", "0402", "bottom");
  twoPin(parts, pins, "C_B1", 1200, 280, 36, "h", "VBAT", "GND", "0402", "bottom");
  twoPin(parts, pins, "C_B2", 1360, 280, 36, "h", "VPH_PWR", "GND", "0402", "bottom");
  twoPin(parts, pins, "R_PU", 1600, 340, 36, "h", "SCL", "VREG_1V8", "0402", "bottom");

  return {
    name: "Sección de potencia",
    format: "Ejemplo",
    unitsPerMm: MIL_PER_MM,
    outline: [
      { x: 80, y: 160 },
      { x: 2360, y: 160 },
      { x: 2480, y: 280 },
      { x: 2480, y: 1420 },
      { x: 2360, y: 1540 },
      { x: 200, y: 1540 },
      { x: 80, y: 1420 },
      { x: 80, y: 1080 },
      { x: 180, y: 1000 },
      { x: 180, y: 680 },
      { x: 80, y: 600 },
      { x: 80, y: 280 },
    ],
    segments: [],
    parts,
    pins,
    nails: [
      { x: 460, y: 1120, net: "VBAT", side: "top", probe: 1 },
      { x: 1760, y: 1160, net: "VPH_PWR", side: "top", probe: 2 },
      { x: 2140, y: 860, net: "VREG_1V8", side: "top", probe: 3 },
      { x: 1240, y: 430, net: "GND", side: "both", probe: 4 },
    ],
  };
}

export function demoOverlay(board: Board): { svg: string; cx: number; cy: number; width: number } {
  const prep = prepare(board);
  const b = prep.bounds;
  const pad = 0;
  const width = b.maxX - b.minX;
  const height = b.maxY - b.minY;
  const sx = (x: number) => x - b.minX + pad;
  const sy = (y: number) => b.maxY - y + pad;
  const outline = board.outline
    .map((point, index) => `${index === 0 ? "M" : "L"}${sx(point.x).toFixed(1)} ${sy(point.y).toFixed(1)}`)
    .join(" ");
  const pads = board.pins
    .map((pin) => {
      const x = sx(pin.x);
      const y = sy(pin.y);
      return `<rect x="${(x - 7).toFixed(1)}" y="${(y - 7).toFixed(1)}" width="14" height="14" rx="1.5" fill="#8a7355"/>`;
    })
    .join("");
  const bodies = prep.parts
    .map((box, index) => {
      const part = board.parts[index];
      if (!part || part.side === "bottom") return "";
      const x = sx(box.minX);
      const y = sy(box.maxY);
      const w = box.maxX - box.minX;
      const h = box.maxY - box.minY;
      return `<rect x="${(x + w * 0.12).toFixed(1)}" y="${(y + h * 0.16).toFixed(1)}" width="${(w * 0.76).toFixed(1)}" height="${(h * 0.68).toFixed(1)}" rx="3" fill="#10241c" stroke="#d5ddd0" stroke-width="1.4"/>
      <text x="${sx(box.cx).toFixed(1)}" y="${(sy(box.cy) + 6).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(16, Math.min(34, w * 0.28)).toFixed(0)}" fill="#d5ddd0">${part.name}</text>`;
    })
    .join("");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${height.toFixed(0)}" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}">
  <path d="${outline} Z" fill="#14352c" stroke="#2f6a56" stroke-width="8"/>
  ${pads}
  ${bodies}
</svg>`;
  return {
    svg,
    cx: (b.minX + b.maxX) / 2,
    cy: (b.minY + b.maxY) / 2,
    width,
  };
}

export function demoDiagramSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="980" height="560" viewBox="0 0 980 560">
  <rect width="980" height="560" fill="#e7ebe4"/>
  <g fill="none" stroke="#1c201e" stroke-width="2" stroke-linecap="square">
    <path d="M70 180 H150"/>
    <path d="M210 180 H300"/>
    <path d="M300 140 V220"/>
    <path d="M300 220 H360"/>
    <path d="M360 190 V250"/>
    <path d="M430 180 H520"/>
    <path d="M620 180 H700"/>
    <path d="M780 180 H900"/>
    <path d="M520 120 V180"/>
    <path d="M700 120 V250"/>
    <path d="M150 250 H210"/>
    <path d="M210 220 V280"/>
  </g>
  <g fill="#1c201e" font-family="sans-serif" font-size="16">
    <text x="48" y="40" font-size="22" font-weight="600">Riel de potencia</text>
    <text x="48" y="68" fill="#3c433e">Diagrama de la placa de ejemplo. No está a escala con la foto.</text>
    <text x="70" y="168">VBAT</text>
    <text x="168" y="168">F1</text>
    <text x="250" y="250">C_IN</text>
    <text x="455" y="168">U_PMIC</text>
    <text x="640" y="168">L1</text>
    <text x="800" y="168">VPH_PWR</text>
    <text x="500" y="110">SW</text>
    <text x="690" y="110">C_OUT</text>
    <text x="70" y="360">U_LDO toma VPH_PWR y entrega VREG_1V8.</text>
    <text x="70" y="388">GND es común a J_BAT, los condensadores y el blindaje CAN1.</text>
    <text x="70" y="416">NTC e ID salen del conector de batería. SCL, SDA y GPIO1 salen por J_IO.</text>
  </g>
  <g fill="none" stroke="#1c201e" stroke-width="2">
    <rect x="150" y="156" width="60" height="48" rx="2"/>
    <rect x="360" y="120" width="160" height="120" rx="4"/>
    <rect x="700" y="156" width="70" height="48" rx="2"/>
    <circle cx="330" cy="220" r="10"/>
    <path d="M318 220 H342 M330 208 V232"/>
  </g>
</svg>`;
}
