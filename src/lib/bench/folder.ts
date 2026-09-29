type DirectoryHandle = {
  kind: "directory";
  name: string;
  values(): AsyncIterable<DirectoryHandle | FileHandle>;
};

type FileHandle = { kind: "file"; name: string; getFile(): Promise<File> };

type LegacyEntry = {
  isDirectory: boolean;
  isFile: boolean;
  name: string;
  file?: (resolve: (file: File) => void, reject: (error: Error) => void) => void;
  createReader?: () => {
    readEntries(resolve: (entries: LegacyEntry[]) => void, reject: (error: Error) => void): void;
  };
};

function withPath(file: File, path: string): File {
  const copy = new File([file], file.name, { type: file.type, lastModified: file.lastModified });
  Object.defineProperty(copy, "webkitRelativePath", { value: path });
  return copy;
}

export async function readDirectoryHandle(handle: DirectoryHandle): Promise<File[]> {
  const files: File[] = [];
  async function visit(directory: DirectoryHandle, path: string) {
    for await (const entry of directory.values()) {
      if (entry.kind === "directory") await visit(entry, `${path}/${entry.name}`);
      else files.push(withPath(await entry.getFile(), `${path}/${entry.name}`));
    }
  }
  await visit(handle, handle.name);
  return files;
}

async function readLegacyEntry(entry: LegacyEntry, path: string): Promise<File[]> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
    return [withPath(file, `${path}/${file.name}`)];
  }
  if (!entry.isDirectory || !entry.createReader) return [];
  const reader = entry.createReader();
  const files: File[] = [];
  // Chromium returns directory entries in batches, often only 100 at a time.
  while (true) {
    const batch = await new Promise<LegacyEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    const nextPath = path ? `${path}/${entry.name}` : entry.name;
    for (const child of batch) files.push(...await readLegacyEntry(child, nextPath));
  }
  return files;
}

export async function readDroppedFiles(transfer: DataTransfer): Promise<{ folderFiles: File[]; looseFiles: File[] }> {
  // Snapshot entries during the drop event; DataTransfer can be cleared afterward.
  const entries = [...transfer.items]
    .filter((item) => item.kind === "file")
    .map((item) => (item as DataTransferItem & { webkitGetAsEntry?: () => LegacyEntry | null }).webkitGetAsEntry?.() ?? null);
  const fallback = [...transfer.files];
  const folders = entries.filter((entry) => entry?.isDirectory);
  if (!folders.length) return { folderFiles: [], looseFiles: fallback };
  const folderFiles: File[] = [];
  for (const folder of folders) {
    if (folder) folderFiles.push(...await readLegacyEntry(folder, ""));
  }
  return { folderFiles, looseFiles: [] };
}

export async function openFolderPicker(): Promise<File[] | null> {
  const picker = (window as Window & { showDirectoryPicker?: () => Promise<DirectoryHandle> }).showDirectoryPicker;
  if (!picker) return null;
  const handle = await picker.call(window);
  return readDirectoryHandle(handle);
}
