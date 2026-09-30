import assert from "node:assert/strict";
import test from "node:test";
import { largestClosedContour } from "./contour.ts";
import { brdCipherByte, parseBoard } from "./parse.ts";

const PLAIN = `str_length:
0
var_data:
4 2 3 1
Format:
0 0
1000 0
1000 800
0 800
Parts:
U1 5 2
C1 5 3
Pins:
100 200 1 1 VCC
300 200 -1 1 GND
150 400 3 2 GND
Nails:
9 500 400 1 GND
`;

function encodeBrd(text: string): Uint8Array {
  const inverse = new Map<number, number>();
  for (let i = 0; i < 256; i++) {
    const y = brdCipherByte(i);
    if (!inverse.has(y)) inverse.set(y, i);
  }
  const plain = new TextEncoder().encode(text);
  return Uint8Array.from(plain, (byte) => {
    const encoded = inverse.get(byte);
    assert.ok(encoded !== undefined, `sin inverso para ${byte}`);
    return encoded;
  });
}

test("plain BRD keeps parts, pins and outline", async () => {
  const board = await parseBoard("demo.brd", new TextEncoder().encode(PLAIN));
  assert.equal(board.format, "BRD");
  assert.equal(board.parts.length, 2);
  assert.equal(board.parts[0]?.name, "U1");
  assert.equal(board.parts[0]?.side, "top");
  assert.equal(board.parts[0]?.kind, "smd");
  assert.equal(board.pins.length, 3);
  assert.equal(board.pins[0]?.part, 0);
  assert.equal(board.pins[0]?.net, "VCC");
  assert.equal(board.pins[2]?.part, 1);
  assert.equal(board.pins[2]?.net, "GND");
  assert.equal(board.outline.length, 4);
  assert.equal(board.nails[0]?.net, "GND");
});

test("encoded BRD round-trips through the OpenBoardView cipher", async () => {
  const encoded = encodeBrd(PLAIN);
  assert.deepEqual([...encoded.slice(0, 4)], [0x23, 0xe2, 0x63, 0x28]);
  const board = await parseBoard("cipher.brd", encoded);
  assert.equal(board.parts[1]?.name, "C1");
  assert.equal(board.pins[1]?.net, "GND");
});

test("BRD2 assigns pins and flips the bottom side", async () => {
  const text = `BRDOUT: 4 1000 800
0 0
1000 0
1000 800
0 800
NETS: 2
1 GND
2 VCC
PARTS: 2
U1 100 100 200 180 0 1
R1 100 100 160 140 1 2
PINS: 2
150 140 2 1
130 120 1 2
NAILS: 0
`;
  const board = await parseBoard("board.brd", new TextEncoder().encode(text));
  assert.equal(board.format, "BRD2");
  assert.equal(board.pins[0]?.part, 0);
  assert.equal(board.pins[0]?.net, "VCC");
  assert.equal(board.pins[1]?.part, 1);
  assert.equal(board.pins[1]?.y, 800 - 120);
  assert.equal(board.parts[1]?.side, "bottom");
});

test("CSV groups pins by reference", async () => {
  const text = "ref,x,y,side,net,pin\nC10,10,20,top,GND,1\nC10,30,20,top,VCC,2\n";
  const board = await parseBoard("parts.csv", new TextEncoder().encode(text));
  assert.equal(board.parts.length, 1);
  assert.equal(board.parts[0]?.name, "C10");
  assert.equal(board.pins[1]?.net, "VCC");
});


test("BIN detects compatible content and rejects unknown binary data", async () => {
  const board = await parseBoard("control.bin", encodeBrd(PLAIN));
  assert.equal(board.pins.length, 3);
  await assert.rejects(parseBoard("firmware.bin", Uint8Array.of(0, 255, 2, 1)), /no contiene un boardview reconocido/);
});

test("boundary stitching preserves a concave silhouette from unordered edges", () => {
  const shape = [{x:0,y:0},{x:4,y:0},{x:4,y:2},{x:2,y:2},{x:2,y:4},{x:0,y:4}];
  const edges = shape.map((a, i) => [a, shape[(i + 1) % shape.length]]);
  const contour = largestClosedContour([edges[3], edges[0], edges[5], edges[2], edges[1], edges[4]].flat());
  assert.equal(contour.length, 6);
  assert.ok(contour.some(p => p.x === 2 && p.y === 2));
  assert.equal(largestClosedContour([{x:0,y:0},{x:1,y:0}]).length, 0);
});

test("GenCAD padstack coordinates, rotation and mirror preserve component geometry", async () => {
  const text = `$HEADER
GENCAD 1.4
UNITS USER 1000
$ENDHEADER
$BOARD
LINE 0 0 1000 0
LINE 1000 0 1000 800
LINE 1000 800 0 800
LINE 0 800 0 0
$ENDBOARD
$SHAPES
SHAPE QFN
PIN 1 PADSTACK_A -50 30 TOP 0 0
PIN 2 PADSTACK_A 50 -30 TOP 0 0
$ENDSHAPES
$COMPONENTS
COMPONENT U1
PLACE 500 400
LAYER TOP
ROTATION 90
SHAPE QFN 0 0
COMPONENT U2
PLACE 200 300
LAYER BOTTOM
ROTATION 90
SHAPE QFN MIRRORY FLIP
$ENDCOMPONENTS
$SIGNALS
SIGNAL VCC
NODE U1 1
$ENDSIGNALS`;
  const board = await parseBoard("camcad.cad", new TextEncoder().encode(text));
  assert.equal(board.outline.length, 4);
  assert.equal(board.pins.length, 4);
  assert.equal(board.pins[0].net, "VCC");
  assert.ok(Math.abs(board.pins[0].x - 470) < 0.001);
  assert.ok(Math.abs(board.pins[0].y - 350) < 0.001);
  assert.ok(Math.abs(board.pins[2].x - 230) < 0.001);
  assert.ok(Math.abs(board.pins[2].y - 250) < 0.001);
});

test("KiCad reads rotated footprints, nets, vias and Edge.Cuts in millimeters", async () => {
  const source = `(kicad_pcb (version 20240108)
    (net 1 "GND")
    (footprint "Package:QFN" (layer "F.Cu") (at 10 20 90)
      (property "Reference" "U1") (property "Value" "IC")
      (pad "1" smd rect (at 2 0) (size 1 1) (layers "F.Cu") (net 1 "GND"))
      (pad "2" thru_hole circle (at -2 0) (size 1 1) (layers "*.Cu") (net 1 "GND")))
    (via (at 5 5) (net 1))
    (segment (start 5 5) (end 10 18) (layer "F.Cu") (net 1))
    (gr_rect (start 0 0) (end 30 40) (layer "Edge.Cuts")))`;
  const board = await parseBoard("controller.kicad_pcb", new TextEncoder().encode(source));
  assert.equal(board.format, "KiCad");
  assert.equal(board.parts[0].name, "U1");
  assert.equal(board.pins.length, 3);
  assert.equal(board.pins[0].net, "GND");
  assert.equal(board.pins[1].side, "both");
  assert.ok(Math.abs(board.pins[0].x / board.unitsPerMm - 10) < 0.00001);
  assert.ok(Math.abs(board.pins[0].y / board.unitsPerMm + 18) < 0.00001);
  assert.equal(board.outline.length, 4);
  assert.ok(board.segments.some(s => s.net === "GND"));
});

test("KiCad supports old module references, quoted strings and curved boundaries", async () => {
  const source = `(kicad_pcb (version 20171130)
    (module "R" (layer "B.Cu") (at 0 0) (fp_text reference "R1")
      (pad 1 smd rect (at 0 0) (layers "B.Cu") (net 1 "a\\\"b")))
    (gr_arc (start 1 0) (mid 0 1) (end -1 0) (layer "Edge.Cuts"))
    (gr_line (start -1 0) (end 1 0) (layer "Edge.Cuts")))`;
  const board = await parseBoard("old.kicad_pcb", new TextEncoder().encode(source));
  assert.equal(board.parts[0].name, "R1");
  assert.equal(board.parts[0].side, "bottom");
  assert.equal(board.pins[0].net, 'a"b');
  assert.ok(board.outline.length > 10);
});

test("standalone KiCad footprint retains pads and body graphics", async () => {
  const source = `(footprint "USB_C" (layer "F.Cu")
    (fp_text reference "REF**")
    (fp_rect (start -5 -3) (end 5 3) (layer "F.SilkS"))
    (pad "A1" smd rect (at -2 1) (size 1 1) (layers "F.Cu"))
    (pad "A2" smd rect (at 2 1) (size 1 1) (layers "F.Cu")))`;
  const board = await parseBoard("USB_C.kicad_mod", new TextEncoder().encode(source));
  assert.equal(board.format, "KiCad huella");
  assert.equal(board.parts.length, 1);
  assert.equal(board.pins.length, 2);
  assert.equal(board.pins[0].name, "A1");
  assert.equal(board.segments.length, 4);
});
