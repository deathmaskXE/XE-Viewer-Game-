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
