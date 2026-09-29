import assert from "node:assert/strict";
import test from "node:test";
import { chunksByBytes } from "./text-chunks.ts";

test("translation requests respect byte limits for Latin and CJK text", () => {
  for (const text of ["power rail ".repeat(200), "电源电路".repeat(130)]) {
    const chunks = chunksByBytes(text, 400);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => new TextEncoder().encode(chunk).length <= 400));
  }
});
