import type { ProjectRecord } from "@/lib/bench/model";

const DB_NAME = "mesa-bench";
const DB_VERSION = 1;

type BlobRecord = { id: string; blob: Blob };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir el archivo local."));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("No se pudo guardar."));
    tx.onabort = () => reject(tx.error ?? new Error("Guardado cancelado."));
  });
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const db = await openDb();
  const tx = db.transaction("projects", "readonly");
  const request = tx.objectStore("projects").getAll();
  const rows = await new Promise<ProjectRecord[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as ProjectRecord[]);
    request.onerror = () => reject(request.error);
  });
  await done(tx);
  db.close();
  return rows.sort((a, b) => b.updated - a.updated);
}

export async function saveProject(project: ProjectRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("projects", "readwrite");
  tx.objectStore("projects").put(project);
  await done(tx);
  db.close();
}

export async function deleteProject(id: string, blobIds: string[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["projects", "blobs"], "readwrite");
  tx.objectStore("projects").delete(id);
  for (const blobId of blobIds) tx.objectStore("blobs").delete(blobId);
  await done(tx);
  db.close();
}

export async function deleteBlobs(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDb();
  const tx = db.transaction("blobs", "readwrite");
  for (const id of ids) tx.objectStore("blobs").delete(id);
  await done(tx);
  db.close();
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("blobs", "readwrite");
  tx.objectStore("blobs").put({ id, blob } satisfies BlobRecord);
  await done(tx);
  db.close();
}

export async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  const tx = db.transaction("blobs", "readonly");
  const request = tx.objectStore("blobs").get(id);
  const row = await new Promise<BlobRecord | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as BlobRecord | undefined);
    request.onerror = () => reject(request.error);
  });
  await done(tx);
  db.close();
  return row?.blob ?? null;
}
