import assert from "node:assert/strict";
import test from "node:test";
import { readDirectoryHandle, readDroppedFiles } from "./folder.ts";

test("directory picker retains nested paths", async () => {
  const png = new File(["image"], "top.png", { type: "image/png" });
  const pdf = new File(["pdf"], "diagram.pdf", { type: "application/pdf" });
  const nested = { kind: "directory", name: "sub", async *values() { yield { kind: "file", name: pdf.name, async getFile() { return pdf; } }; } };
  const root = { kind: "directory", name: "Placa", async *values() { yield { kind: "file", name: png.name, async getFile() { return png; } }; yield nested; } };
  const files = await readDirectoryHandle(root as Parameters<typeof readDirectoryHandle>[0]);
  assert.deepEqual(files.map((file) => file.webkitRelativePath), ["Placa/top.png", "Placa/sub/diagram.pdf"]);
});

test("dragging a folder reads every directory batch", async () => {
  const entries = Array.from({ length: 120 }, (_, index) => ({
    isFile: true,
    isDirectory: false,
    name: `image-${index}.jpg`,
    file(resolve: (file: File) => void) { resolve(new File(["a"], `image-${index}.jpg`, { type: "image/jpeg" })); },
  }));
  let offset = 0;
  const directory = {
    isFile: false,
    isDirectory: true,
    name: "Fotos",
    createReader() {
      return { readEntries(resolve: (batch: typeof entries) => void) { resolve(entries.slice(offset, offset += 100)); } };
    },
  };
  const transfer = {
    items: [{ kind: "file", webkitGetAsEntry: () => directory }],
    files: [],
  } as unknown as DataTransfer;
  const result = await readDroppedFiles(transfer);
  assert.equal(result.folderFiles.length, 120);
  assert.equal(result.folderFiles[119]?.webkitRelativePath, "Fotos/image-119.jpg");
  assert.equal(result.looseFiles.length, 0);
});
