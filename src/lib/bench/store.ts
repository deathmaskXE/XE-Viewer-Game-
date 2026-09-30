import { schematicSvg } from "@/lib/board/kicad-schematic";
import { create } from "zustand";
import { prepare } from "@/lib/board/geometry";
import { classifyFile } from "@/lib/board/parse";
import { looksLikePhotoshop } from "@/lib/board/psd";
import { processFile } from "@/lib/board/process-file";
import type { Board, BoardPoint } from "@/lib/board/types";
import { MIL_PER_MM } from "@/lib/board/types";
import { deleteBlobs, deleteProject, getBlob, listProjects, putBlob, saveProject } from "@/lib/bench/db";
import type { DiagramRecord, OverlayRecord, ProjectRecord, Tool, ViewSide } from "@/lib/bench/model";

type ZoomRequest = { token: number; target: "board" | number };

type BenchState = {
  ready: boolean;
  importing: boolean;
  projects: ProjectRecord[];
  activeId: string | null;
  urls: Record<string, string>;
  side: ViewSide;
  mirror: boolean;
  tool: Tool;
  selectedPart: number | null;
  selectedNail: number | null;
  selectedNet: string | null;
  query: string;
  notice: string | null;
  measureA: BoardPoint | null;
  measureB: BoardPoint | null;
  activeOverlayId: string | null;
  activeDiagramId: string | null;
  diagramOpen: boolean;
  filesOpen: boolean;
  partsOpen: boolean;
  hint: boolean;
  zoomRequest: ZoomRequest;
  boot: () => Promise<void>;
  setQuery: (query: string) => void;
  setSide: (side: ViewSide) => void;
  toggleMirror: () => void;
  setTool: (tool: Tool) => void;
  selectPart: (index: number | null, zoom?: boolean) => void;
  selectNail: (index: number | null) => void;
  selectNet: (name: string | null) => void;
  clearTransient: () => void;
  dismissNotice: () => void;
  dismissHint: () => void;
  setMeasurePoint: (point: BoardPoint) => void;
  openFiles: (open?: boolean) => void;
  openParts: (open?: boolean) => void;
  importFiles: (files: File[], compare?: boolean) => Promise<void>;
  importFolder: (files: File[]) => Promise<void>;
  activate: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  newEmpty: () => Promise<void>;
  setUnits: (unitsPerMm: number) => void;
  updateOverlay: (id: string, patch: Partial<OverlayRecord>) => void;
  removeOverlay: (id: string) => Promise<void>;
  removeDiagram: (id: string) => Promise<void>;
  promoteDiagram: (id: string) => Promise<void>;
  setActiveOverlay: (id: string | null) => void;
  setActiveDiagram: (id: string | null) => void;
  toggleDiagram: () => void;
  nudgeOverlay: (dx: number, dy: number) => void;
  scaleOverlay: (factor: number) => void;
  fitOverlay: (id: string) => void;
  requestZoom: (target: "board" | number) => void;
};

let booting: Promise<void> | null = null;
let saveTimer = 0;
let noticeGen = 0;
let activationToken = 0;

function revokeUrls(urls: Record<string, string>) {
  for (const url of Object.values(urls)) URL.revokeObjectURL(url);
}

function notify(set: (partial: Partial<BenchState>) => void, text: string | null, sticky = false) {
  const gen = ++noticeGen;
  set({ notice: text });
  if (text && !sticky) {
    window.setTimeout(() => {
      if (gen === noticeGen) set({ notice: null });
    }, 5200);
  }
}

function scheduleSave(project: ProjectRecord) {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void saveProject(project);
  }, 280);
}

async function urlsFor(project: ProjectRecord): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  const ids = [...project.overlays.map((item) => item.id), ...project.diagrams.map((item) => item.id)];
  for (let offset = 0; offset < ids.length; offset += 20) {
    await Promise.all(ids.slice(offset, offset + 20).map(async (id) => {
      const blob = await getBlob(id);
      if (blob) urls[id] = URL.createObjectURL(blob);
    }));
  }
  return urls;
}

function placement(board: Board | null): Pick<OverlayRecord, "cx" | "cy" | "width" | "rotation"> {
  if (!board) return { cx: 0, cy: 0, width: 1000, rotation: 0 };
  const bounds = prepare(board).bounds;
  return {
    cx: (bounds.minX + bounds.maxX) / 2,
    cy: (bounds.minY + bounds.maxY) / 2,
    width: Math.max(1, bounds.maxX - bounds.minX),
    rotation: 0,
  };
}

function stem(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  return base.replace(/\.[^.]+$/, "") || base;
}

export const useBench = create<BenchState>((set, get) => ({
  ready: false,
  importing: false,
  projects: [],
  activeId: null,
  urls: {},
  side: "top",
  mirror: false,
  tool: "navigate",
  selectedPart: null,
  selectedNail: null,
  selectedNet: null,
  query: "",
  notice: null,
  measureA: null,
  measureB: null,
  activeOverlayId: null,
  activeDiagramId: null,
  diagramOpen: false,
  filesOpen: false,
  partsOpen: false,
  hint: true,
  zoomRequest: { token: 0, target: "board" },

  boot: () => {
    if (!booting) {
      booting = (async () => {
        let projects = await listProjects();
        // Keep any user files that were attached to the old sample project.
        const migrated: ProjectRecord[] = [];
        for (const project of projects) {
          if (!project.sample) {
            migrated.push(project);
            continue;
          }
          const demoOverlays = project.overlays.filter((item) => item.name === "Máscara de ejemplo");
          const demoDiagrams = project.diagrams.filter((item) => item.name === "Riel de potencia.svg");
          const overlays = project.overlays.filter((item) => !demoOverlays.includes(item));
          const diagrams = project.diagrams.filter((item) => !demoDiagrams.includes(item));
          if (!overlays.length && !diagrams.length) {
            await deleteProject(project.id, [...demoOverlays, ...demoDiagrams].map((item) => item.id));
            continue;
          }
          const next: ProjectRecord = {
            ...project,
            name: "Mis archivos",
            sample: false,
            board: null,
            sourceName: null,
            overlays,
            diagrams,
          };
          await saveProject(next);
          migrated.push(next);
        }
        projects = migrated;
        if (projects.length === 0) {
          const now = Date.now();
          const project: ProjectRecord = {
            id: crypto.randomUUID(),
            name: "Mi primera placa",
            created: now,
            updated: now,
            sample: false,
            board: null,
            sourceName: null,
            unitsPerMm: MIL_PER_MM,
            overlays: [],
            diagrams: [],
          };
          await saveProject(project);
          projects = [project];
        }
        const saved = window.localStorage.getItem("mesa-active");
        const hint = window.localStorage.getItem("mesa-hint") === "1";
        const active = projects.find((project) => project.id === saved) ?? projects[0];
        if (!active) {
          set({ ready: true, projects, hint: !hint });
          return;
        }
        const urls = await urlsFor(active);
        set({
          ready: true,
          projects,
          activeId: active.id,
          urls,
          hint: !hint,
          activeOverlayId: active.overlays[0]?.id ?? null,
          activeDiagramId: active.diagrams[0]?.id ?? null,
          side: "top",
          mirror: false,
        });
      })().catch((error: unknown) => {
        booting = null;
        set({
          ready: true,
          notice: error instanceof Error ? error.message : "No se pudo abrir la mesa.",
        });
      });
    }
    return booting;
  },

  setQuery: (query) => set({ query }),
  setSide: (side) =>
    set({
      side,
      mirror: side === "bottom" ? true : side === "top" ? false : get().mirror,
    }),
  toggleMirror: () => set({ mirror: !get().mirror }),
  setTool: (tool) => set({ tool }),
  selectPart: (index, zoom) =>
    set({
      selectedPart: index,
      selectedNail: null,
      zoomRequest: zoom && index != null ? { token: get().zoomRequest.token + 1, target: index } : get().zoomRequest,
    }),
  selectNail: (index) =>
    set({
      selectedNail: index,
      selectedPart: index == null ? get().selectedPart : null,
    }),
  selectNet: (name) => set({ selectedNet: name }),
  clearTransient: () =>
    set({
      selectedPart: null,
      selectedNail: null,
      selectedNet: null,
      measureA: null,
      measureB: null,
    }),
  dismissNotice: () => set({ notice: null }),
  dismissHint: () => {
    window.localStorage.setItem("mesa-hint", "1");
    set({ hint: false });
  },
  setMeasurePoint: (point) => {
    const { measureA, measureB } = get();
    if (!measureA || measureB) set({ measureA: point, measureB: null });
    else set({ measureB: point });
  },
  openFiles: (open) => set({ filesOpen: open ?? !get().filesOpen, partsOpen: false }),
  openParts: (open) => set({ partsOpen: open ?? !get().partsOpen, filesOpen: false }),

  activate: async (id) => {
    const project = get().projects.find((item) => item.id === id);
    if (!project) return;
    const token = ++activationToken;
    revokeUrls(get().urls);
    window.localStorage.setItem("mesa-active", id);
    set({
      activeId: id,
      urls: {},
      selectedPart: null,
      selectedNail: null,
      selectedNet: null,
      measureA: null,
      measureB: null,
      query: "",
      activeOverlayId: project.overlays[0]?.id ?? null,
      activeDiagramId: project.diagrams[0]?.id ?? null,
      diagramOpen: false,
      filesOpen: false,
    });
    const urls = await urlsFor(project);
    if (token !== activationToken) {
      revokeUrls(urls);
      return;
    }
    set({ urls });
  },

  rename: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const projects = get().projects.map((project) =>
      project.id === id ? { ...project, name: trimmed, updated: Date.now() } : project,
    );
    set({ projects });
    const project = projects.find((item) => item.id === id);
    if (project) await saveProject(project);
  },

  remove: async (id) => {
    const project = get().projects.find((item) => item.id === id);
    if (!project) return;
    const blobIds = [...project.overlays.map((item) => item.id), ...project.diagrams.map((item) => item.id)];
    await deleteProject(id, blobIds);
    if (get().activeId === id) revokeUrls(get().urls);
    const projects = get().projects.filter((item) => item.id !== id);
    set({ projects });
    if (projects[0]) await get().activate(projects[0].id);
    else set({ activeId: null, urls: {} });
  },

  newEmpty: async () => {
    const now = Date.now();
    const project: ProjectRecord = {
      id: crypto.randomUUID(),
      name: "Placa nueva",
      created: now,
      updated: now,
      sample: false,
      board: null,
      sourceName: null,
      unitsPerMm: MIL_PER_MM,
      overlays: [],
      diagrams: [],
    };
    await saveProject(project);
    set({ projects: [project, ...get().projects] });
    await get().activate(project.id);
  },

  setUnits: (unitsPerMm) => {
    const { activeId, projects } = get();
    const projectsNext = projects.map((project) =>
      project.id === activeId ? { ...project, unitsPerMm, updated: Date.now() } : project,
    );
    set({ projects: projectsNext });
    const project = projectsNext.find((item) => item.id === activeId);
    if (project) scheduleSave(project);
  },

  updateOverlay: (id, patch) => {
    const { activeId, projects } = get();
    const projectsNext = projects.map((project) => {
      if (project.id !== activeId) return project;
      return {
        ...project,
        updated: Date.now(),
        overlays: project.overlays.map((overlay) => (overlay.id === id ? { ...overlay, ...patch } : overlay)),
      };
    });
    set({ projects: projectsNext });
    const project = projectsNext.find((item) => item.id === activeId);
    if (project) scheduleSave(project);
  },

  removeOverlay: async (id) => {
    const project = get().projects.find((item) => item.id === get().activeId);
    if (!project) return;
    const next = {
      ...project,
      updated: Date.now(),
      overlays: project.overlays.filter((overlay) => overlay.id !== id),
    };
    await saveProject(next);
    const url = get().urls[id];
    if (url) URL.revokeObjectURL(url);
    const urls = { ...get().urls };
    delete urls[id];
    set({
      projects: get().projects.map((item) => (item.id === next.id ? next : item)),
      urls,
      activeOverlayId: get().activeOverlayId === id ? (next.overlays[0]?.id ?? null) : get().activeOverlayId,
    });
  },

  removeDiagram: async (id) => {
    const project = get().projects.find((item) => item.id === get().activeId);
    if (!project) return;
    const next = {
      ...project,
      updated: Date.now(),
      diagrams: project.diagrams.filter((diagram) => diagram.id !== id),
    };
    await saveProject(next);
    const url = get().urls[id];
    if (url) URL.revokeObjectURL(url);
    const urls = { ...get().urls };
    delete urls[id];
    set({
      projects: get().projects.map((item) => (item.id === next.id ? next : item)),
      urls,
      activeDiagramId: get().activeDiagramId === id ? (next.diagrams[0]?.id ?? null) : get().activeDiagramId,
      diagramOpen: next.diagrams.length === 0 ? false : get().diagramOpen,
    });
  },

  promoteDiagram: async (id) => {
    const project = get().projects.find((item) => item.id === get().activeId);
    const diagram = project?.diagrams.find((item) => item.id === id);
    const blob = await getBlob(id);
    if (!project || !diagram || !blob) return;
    const copyId = crypto.randomUUID();
    await putBlob(copyId, blob);
    const place = placement(project.board);
    const overlay: OverlayRecord = {
      id: copyId,
      name: diagram.name,
      opacity: 0.7,
      visible: true,
      above: false,
      ...place,
      flipX: false,
      flipY: false,
    };
    const next = { ...project, updated: Date.now(), overlays: [...project.overlays, overlay] };
    await saveProject(next);
    set({
      projects: get().projects.map((item) => (item.id === next.id ? next : item)),
      urls: { ...get().urls, [copyId]: URL.createObjectURL(blob) },
      activeOverlayId: copyId,
      tool: "overlay",
    });
  },

  setActiveOverlay: (id) => set({ activeOverlayId: id, tool: id ? "overlay" : get().tool }),
  setActiveDiagram: (id) => set({ activeDiagramId: id, diagramOpen: true }),
  toggleDiagram: () => set({ diagramOpen: !get().diagramOpen }),
  nudgeOverlay: (dx, dy) => {
    const id = get().activeOverlayId;
    const project = get().projects.find((item) => item.id === get().activeId);
    const overlay = project?.overlays.find((item) => item.id === id);
    if (!overlay) return;
    get().updateOverlay(overlay.id, { cx: overlay.cx + dx, cy: overlay.cy + dy });
  },
  scaleOverlay: (factor) => {
    const id = get().activeOverlayId;
    const project = get().projects.find((item) => item.id === get().activeId);
    const overlay = project?.overlays.find((item) => item.id === id);
    if (!overlay) return;
    get().updateOverlay(overlay.id, { width: Math.max(1, overlay.width * factor) });
  },
  fitOverlay: (id) => {
    const project = get().projects.find((item) => item.id === get().activeId);
    if (!project) return;
    get().updateOverlay(id, placement(project.board));
  },
  requestZoom: (target) => set({ zoomRequest: { token: get().zoomRequest.token + 1, target } }),

  importFiles: async (files, compare = false) => {
    if (get().importing) return;
    set({ importing: true });
    try {
      await importFilesImpl(files, set, get, compare);
    } catch (error) {
      notify(set, error instanceof Error ? error.message : "No pude guardar los archivos.", true);
    } finally {
      set({ importing: false });
    }
  },
  importFolder: async (files) => {
    if (get().importing) return;
    const supported = files.filter((file) => /\.(png|jpe?g|webp|gif|bmp|pdf)$/i.test(file.name));
    if (!supported.length) {
      notify(set, "La carpeta no contiene PNG, JPG o PDF compatibles.", true);
      return;
    }
    set({ importing: true, notice: `Guardando ${supported.length} archivos de la carpeta…` });
    const ids: string[] = [];
    let saved = false;
    try {
      const now = Date.now();
      const root = (supported[0].webkitRelativePath || supported[0].name).split("/")[0] || "Carpeta";
      const diagrams: DiagramRecord[] = [];
      for (const file of supported) {
        const id = crypto.randomUUID();
        const relative = file.webkitRelativePath?.split("/").slice(1).join("/") || file.name;
        const mime = /\.pdf$/i.test(file.name) ? "application/pdf" : file.type || "image/jpeg";
        await putBlob(id, file.slice(0, file.size, mime));
        ids.push(id);
        diagrams.push({ id, name: relative, mime });
      }
      const project: ProjectRecord = {
        id: crypto.randomUUID(),
        name: root,
        created: now,
        updated: now,
        sample: false,
        folder: true,
        board: null,
        sourceName: null,
        unitsPerMm: MIL_PER_MM,
        overlays: [],
        diagrams,
      };
      await saveProject(project);
      saved = true;
      set({ projects: [project, ...get().projects] });
      await get().activate(project.id);
      notify(set, `Carpeta ${root}: ${diagrams.length} archivos disponibles.`);
    } catch (error) {
      if (!saved) await deleteBlobs(ids).catch(() => {});
      notify(set, error instanceof Error ? error.message : "No pude guardar la carpeta.", true);
    } finally {
      set({ importing: false });
    }
  },
}));

async function importFilesImpl(
  files: File[],
  set: (partial: Partial<BenchState>) => void,
  get: () => BenchState,
  compare = false,
): Promise<void> {
    const errors: string[] = [];
    const boards: { fileName: string; board: Board }[] = [];
    const extras: { file: File; role: "overlay" | "diagram" }[] = [];
    for (const file of files) {
      let buffer: ArrayBuffer;
      try {
        buffer = await file.arrayBuffer();
      } catch {
        errors.push(`No pude leer ${file.name}.`);
        continue;
      }
      if (/\.kicad_pro$/i.test(file.name)) {
        try { JSON.parse(new TextDecoder().decode(buffer)); } catch { errors.push(`${file.name}: proyecto KiCad inválido.`); }
        continue;
      }
      if (/\.kicad_sch$/i.test(file.name)) {
        try { const svg = schematicSvg(new TextDecoder().decode(buffer)); extras.push({ file: new File([svg], `${file.name}.svg`, { type: "image/svg+xml" }), role: "diagram" }); }
        catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message : "no pude leer el esquema"}`); }
        continue;
      }
      const bytes = new Uint8Array(buffer);
      const role = classifyFile(file.name, file.type, buffer);
      if (looksLikePhotoshop(bytes) || /\.(psd|psb)$/i.test(file.name)) {
        try {
          const png = await processFile(file, "psd");
          const original = new File([file], file.name, { type: "image/vnd.adobe.photoshop" });
          extras.push({ file: new File([png], `${file.name}.png`, { type: "image/png" }), role: "overlay" });
          extras.push({ file: original, role: "diagram" });
        } catch (error) {
          errors.push(`${file.name}: ${error instanceof Error ? error.message : "no pude leer el Photoshop"}`);
        }
        continue;
      }
      if (role === "overlay" || role === "diagram") {
        extras.push({ file, role });
        continue;
      }
      if (role !== "board") {
        errors.push(`${file.name} no es un boardview, una imagen ni un diagrama.`);
        continue;
      }
      try {
        boards.push({ fileName: file.name, board: await processFile(file, "board") });
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : "no se pudo interpretar"}`);
      }
    }
    if (boards.length === 0 && extras.length === 0) {
      notify(set, errors.join(" ") || "No reconocí ningún archivo.", true);
      return;
    }

    const attach = async (project: ProjectRecord, items: { file: File; role: "overlay" | "diagram" }[]) => {
      const overlays = [...project.overlays];
      const diagrams = [...project.diagrams];
      const made: { id: string; blob: Blob }[] = [];
      for (const item of items) {
        const id = crypto.randomUUID();
        const mime =
          item.file.type ||
          (item.role === "diagram" && item.file.name.toLowerCase().endsWith(".pdf")
            ? "application/pdf"
            : "application/octet-stream");
        const blob = item.file.slice(0, item.file.size, mime);
        await putBlob(id, blob);
        made.push({ id, blob });
        if (item.role === "overlay") {
          overlays.push({
            id,
            name: item.file.name,
            opacity: 0.72,
            visible: true,
            above: false,
            ...placement(project.board),
            flipX: false,
            flipY: false,
          });
        } else {
          diagrams.push({ id, name: item.file.name, mime });
        }
      }
      return { overlays, diagrams, made };
    };

    let targetId = get().activeId;
    const active = get().projects.find((project) => project.id === get().activeId) ?? null;
    const activeEmpty = Boolean(active && !active.board && active.overlays.length === 0 && active.diagrams.length === 0);

    if (boards.length > 0) {
      for (let index = 0; index < boards.length; index++) {
        const entry = boards[index];
        if (!entry) continue;
        const items = index === 0 ? extras : [];
        const now = Date.now();
        if (index === 0 && activeEmpty && active) {
          const attached = await attach({ ...active, board: entry.board }, items);
          const next: ProjectRecord = {
            ...active,
            name: stem(entry.fileName),
            updated: now,
            sample: false,
            board: entry.board,
            sourceName: entry.fileName,
            unitsPerMm: entry.board.unitsPerMm,
            overlays: attached.overlays,
            diagrams: attached.diagrams,
          };
          await saveProject(next);
          targetId = next.id;
          set({ projects: get().projects.map((project) => (project.id === next.id ? next : project)) });
          for (const item of attached.made) {
            set({ urls: { ...get().urls, [item.id]: URL.createObjectURL(item.blob) } });
          }
        } else {
          const id = crypto.randomUUID();
          const shell: ProjectRecord = {
            id,
            name: stem(entry.fileName),
            created: now,
            updated: now,
            sample: false,
            board: entry.board,
            sourceName: entry.fileName,
            unitsPerMm: entry.board.unitsPerMm,
            overlays: [],
            diagrams: [],
          };
          const attached = await attach(shell, items);
          const next = { ...shell, overlays: attached.overlays, diagrams: attached.diagrams };
          await saveProject(next);
          set({ projects: [next, ...get().projects.filter((project) => project.id !== next.id)] });
          targetId = next.id;
        }
      }
    } else if (compare && active?.board) {
      const items = extras.filter(item => !(item.role === "overlay" && /\.ps[db]\.png$/i.test(item.file.name))).map(item => ({ ...item, role: "diagram" as const }));
      const attached = await attach({ ...active, diagrams: [] }, items);
      const next = { ...active, diagrams: attached.diagrams, updated: Date.now() };
      await saveProject(next);
      set({ projects: get().projects.map(project => project.id === next.id ? next : project) });
      targetId = next.id;
    } else {
      // A separately opened image or PDF is a new document, not an overlay
      // on the previous board. A PSD uses its original layer file as the view.
      const standalone = extras
        .filter((item) => !(item.role === "overlay" && /\.ps[db]\.png$/i.test(item.file.name)))
        .map((item) => ({ ...item, role: "diagram" as const }));
      const now = Date.now();
      const shell: ProjectRecord = {
        id: crypto.randomUUID(),
        name: stem(files[0]?.name || "Archivo"),
        created: now,
        updated: now,
        sample: false,
        board: null,
        sourceName: null,
        unitsPerMm: MIL_PER_MM,
        overlays: [],
        diagrams: [],
      };
      const attached = await attach(shell, standalone);
      const next = { ...shell, diagrams: attached.diagrams };
      await saveProject(next);
      set({ projects: [next, ...get().projects] });
      targetId = next.id;
    }

    if (targetId) await get().activate(targetId);
    if (boards.length === 0 || extras.some((item) => item.role === "diagram")) {
      set({ diagramOpen: true });
    }
    const summary = [
      boards.length ? `${boards.length} boardview` : "",
      extras.length ? `${extras.length} archivo${extras.length === 1 ? "" : "s"}` : "",
    ]
      .filter(Boolean)
      .join(" y ");
    notify(set, errors.length ? `${summary ? `${summary}. ` : ""}${errors.join(" ")}` : `Abierto: ${summary}.`, errors.length > 0);
}

export function useActiveProject(): ProjectRecord | null {
  return useBench((state) => state.projects.find((project) => project.id === state.activeId) ?? null);
}

export type { DiagramRecord };
