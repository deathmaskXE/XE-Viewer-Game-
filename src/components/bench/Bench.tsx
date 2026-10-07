import { useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FolderOpen,
  FolderPlus,
  ImagePlus,
  Languages,
  LocateFixed,
  Move,
  Plus,
  Ruler,
  RotateCcw,
  RotateCw,
  Search,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NexusViewer } from "@/components/bench/NexusViewer";
import { DiagramPane } from "@/components/bench/DiagramPane";
import { FolderGallery } from "@/components/bench/FolderGallery";
import { TranslationPanel } from "@/components/bench/TranslationPanel";
import { Viewport, type ViewportHandle } from "@/components/bench/Viewport";
import { prepare } from "@/lib/board/geometry";
import { UNIT_PRESETS } from "@/lib/board/units";
import type { Side } from "@/lib/board/types";
import { cn } from "@/lib/cn";
import { useActiveProject, useBench } from "@/lib/bench/store";
import { openFolderPicker, readDroppedFiles } from "@/lib/bench/folder";

function sideLabel(side: Side): string {
  if (side === "top") return "Sup";
  if (side === "bottom") return "Inf";
  return "TH";
}

export function Bench() {
  const [syncedZoom, setSyncedZoom] = useState<{ zoom: number; x: number; y: number; token: number } | null>(null);
  const syncZoom = (zoom: number, point: { x: number; y: number }) => setSyncedZoom(previous => ({ zoom, ...point, token: (previous?.token ?? 0) + 1 }));
  const [boardCursor, setBoardCursor] = useState<{ x: number; y: number } | null>(null);

  const boot = useBench((state) => state.boot);
  const ready = useBench((state) => state.ready);
  const importing = useBench((state) => state.importing);
  const projects = useBench((state) => state.projects);
  const project = useActiveProject();
  useEffect(() => { setBoardCursor(null); setSyncedZoom(null); }, [project?.id]);
  const urls = useBench((state) => state.urls);
  const side = useBench((state) => state.side);
  const rearOpen = side === "both";
  const mirror = useBench((state) => state.mirror);
  const tool = useBench((state) => state.tool);
  const query = useBench((state) => state.query);
  const notice = useBench((state) => state.notice);
  const hint = useBench((state) => state.hint);
  const filesOpen = useBench((state) => state.filesOpen);
  const partsOpen = useBench((state) => state.partsOpen);
  const diagramOpen = useBench((state) => state.diagramOpen);
  const selectedPart = useBench((state) => state.selectedPart);
  const selectedNail = useBench((state) => state.selectedNail);
  const selectedNet = useBench((state) => state.selectedNet);
  const activeOverlayId = useBench((state) => state.activeOverlayId);
  const activeDiagramId = useBench((state) => state.activeDiagramId);
  const setQuery = useBench((state) => state.setQuery);
  const setSide = useBench((state) => state.setSide);
  const toggleMirror = useBench((state) => state.toggleMirror);
  const setTool = useBench((state) => state.setTool);
  const selectPart = useBench((state) => state.selectPart);
  const selectNail = useBench((state) => state.selectNail);
  const selectNet = useBench((state) => state.selectNet);
  const clearTransient = useBench((state) => state.clearTransient);
  const dismissNotice = useBench((state) => state.dismissNotice);
  const dismissHint = useBench((state) => state.dismissHint);
  const openFiles = useBench((state) => state.openFiles);
  const openParts = useBench((state) => state.openParts);
  const importFiles = useBench((state) => state.importFiles);
  const importFolder = useBench((state) => state.importFolder);
  const activate = useBench((state) => state.activate);
  const rename = useBench((state) => state.rename);
  const remove = useBench((state) => state.remove);
  const newEmpty = useBench((state) => state.newEmpty);
  const setUnits = useBench((state) => state.setUnits);
  const updateOverlay = useBench((state) => state.updateOverlay);
  const removeOverlay = useBench((state) => state.removeOverlay);
  const removeDiagram = useBench((state) => state.removeDiagram);
  const promoteDiagram = useBench((state) => state.promoteDiagram);
  const setActiveOverlay = useBench((state) => state.setActiveOverlay);
  const setActiveDiagram = useBench((state) => state.setActiveDiagram);
  const toggleDiagram = useBench((state) => state.toggleDiagram);
  const nudgeOverlay = useBench((state) => state.nudgeOverlay);
  const fitOverlay = useBench((state) => state.fitOverlay);

  const compareRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<ViewportHandle>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [viewer, setViewer] = useState<"xe" | "nexus">("xe");
  const [nexusOpened, setNexusOpened] = useState(false);
  const [readingFolder, setReadingFolder] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [translationOverlayId, setTranslationOverlayId] = useState<string | null>(null);

  useEffect(() => {
    void boot();
  }, [boot]);

  const chooseFolder = () => {
    if (!("showDirectoryPicker" in window)) {
      folderRef.current?.click();
      return;
    }
    setReadingFolder(true);
    void openFolderPicker()
      .then(async (files) => {
        if (files?.length) await importFolder(files);
        else if (files) useBench.setState({ notice: "La carpeta no contiene archivos." });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        useBench.setState({ notice: "No pude abrir la carpeta. Prueba con el selector de archivos de Chrome o Edge." });
      })
      .finally(() => setReadingFolder(false));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT"),
      );
      if (event.key === "Escape") {
        if (typing && query) {
          setQuery("");
          return;
        }
        if (typing) {
          target?.blur();
          return;
        }
        clearTransient();
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/") {
        event.preventDefault();
        openParts(true);
        window.requestAnimationFrame(() => document.getElementById("mesa-search")?.focus());
      } else if (event.key === "f" || event.key === "F") viewRef.current?.fit();
      else if (event.key === "1") setSide("top");
      else if (event.key === "2") setSide("bottom");
      else if (event.key === "3") setSide("both");
      else if (event.key === "m" || event.key === "M") toggleMirror();
      else if (event.key === "n" || event.key === "N") setTool("navigate");
      else if (event.key === "v" || event.key === "V") setTool("overlay");
      else if (event.key === "c" || event.key === "C") setTool("measure");
      else if (event.key === "+" || event.key === "=") viewRef.current?.zoomBy(1.15);
      else if (event.key === "-" || event.key === "_") viewRef.current?.zoomBy(1 / 1.15);
      else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const world = event.shiftKey ? 20 : 2;
        if (tool === "overlay" && activeOverlayId) {
          nudgeOverlay(
            event.key === "ArrowLeft" ? -world : event.key === "ArrowRight" ? world : 0,
            event.key === "ArrowUp" ? world : event.key === "ArrowDown" ? -world : 0,
          );
        } else {
          const step = event.shiftKey ? 72 : 28;
          viewRef.current?.panBy(
            event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
            event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
          );
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activeOverlayId,
    clearTransient,
    nudgeOverlay,
    openParts,
    query,
    setQuery,
    setSide,
    setTool,
    toggleMirror,
    tool,
  ]);

  const board = project?.board ?? null;
  const boardTools = Boolean(board || project?.overlays.length);
  const prep = board ? prepare(board) : null;
  const q = query.trim().toLowerCase();
  const partRows =
    board?.parts
      .map((part, index) => ({ part, index }))
      .filter(
        ({ part }) =>
          !q || part.name.toLowerCase().includes(q) || (part.device ?? "").toLowerCase().includes(q),
      )
      .slice(0, 150) ?? [];
  const netRows =
    q && prep
      ? [...prep.nets.keys()].filter((name) => name.toLowerCase().includes(q)).slice(0, 40)
      : [];
  const activeOverlay = project?.overlays.find((overlay) => overlay.id === activeOverlayId) ?? null;
  const translationOverlay = project?.overlays.find((overlay) => overlay.id === translationOverlayId) ?? null;
  const activeDiagram = project?.diagrams.find((diagram) => diagram.id === activeDiagramId) ?? null;
  const diagramUrl = activeDiagram ? urls[activeDiagram.id] : undefined;
  const selected = selectedPart != null ? board?.parts[selectedPart] : null;
  const selectedPins = board && selectedPart != null ? board.pins.filter((pin) => pin.part === selectedPart) : [];
  const nail = selectedNail != null ? board?.nails[selectedNail] : null;
  const boardWidth = prep ? Math.max(1, prep.bounds.maxX - prep.bounds.minX) : 1;
  const unitId = UNIT_PRESETS.find((preset) => Math.abs(preset.unitsPerMm - (project?.unitsPerMm ?? 0)) < 1e-4)?.id ?? "mil";

  const sheetClass = (open: boolean) =>
    cn(
      "min-h-0 flex-col bg-bg-elevated",
      "max-lg:absolute max-lg:inset-0 max-lg:z-20",
      open ? "flex" : "hidden",
      "lg:flex lg:static",
    );

  return (
    <div
      className="xe-shell flex h-dvh flex-col overflow-hidden bg-bg text-fg"
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        setReadingFolder(true);
        void readDroppedFiles(event.dataTransfer)
          .then(async ({ folderFiles, looseFiles }) => {
            if (folderFiles.length) await importFolder(folderFiles);
            else if (looseFiles.length) await importFiles(looseFiles);
            else useBench.setState({ notice: "No pude leer la carpeta arrastrada. Usa Abrir carpeta." });
          })
          .catch((error: unknown) => useBench.setState({ notice: error instanceof Error ? error.message : "No pude leer la carpeta." }))
          .finally(() => setReadingFolder(false));
      }}
    >
      <input ref={compareRef} type="file" className="sr-only" aria-label="Elegir diagrama para comparar" accept=".psd,.psb,.pdf,.png,.jpg,.jpeg,.webp,.svg,.kicad_sch" onChange={(event) => { const files = event.target.files; if(files?.length) void importFiles([...files], true); event.target.value = ""; }} />
      <input
        ref={fileRef}
        type="file"
        multiple
        className="sr-only"
        aria-label="Abrir archivos"
        accept=".sqlite3,.kicad_sch,.kicad_pro,.kicad_mod,.kicad_pcb,.bin,.brd,.bvr,.bdv,.fz,.cad,.asc,.pcb,.gencad,.gcd,.csv,.txt,.json,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.pdf,.psd,.psb,image/*,application/pdf"
        onChange={(event) => {
          const list = event.target.files;
          if (list?.length) void importFiles([...list]);
          event.target.value = "";
        }}
      />
      <input
        ref={(element) => {
          folderRef.current = element;
          element?.setAttribute("webkitdirectory", "");
          element?.setAttribute("directory", "");
        }}
        type="file"
        multiple
        className="sr-only"
        aria-label="Abrir carpeta"
        onChange={(event) => {
          const list = event.target.files;
          if (list?.length) void importFolder([...list]);
          event.target.value = "";
        }}
      />
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-bg-elevated px-3 py-2" role="tablist" aria-label="Elegir visor">
        <Button className="xe-viewer-tab" role="tab" aria-selected={viewer === "xe"} variant={viewer === "xe" ? "primary" : "ghost"} onClick={() => setViewer("xe")}>Visor XE</Button>
        <Button className="xe-viewer-tab" role="tab" aria-selected={viewer === "nexus"} variant={viewer === "nexus" ? "primary" : "ghost"} onClick={() => { setNexusOpened(true); setViewer("nexus"); }}>NexusBV web</Button>


      </div>
      {nexusOpened ? <div className={viewer === "nexus" ? "flex min-h-0 flex-1 flex-col" : "hidden"}><NexusViewer /></div> : null}
      <div className={viewer === "xe" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
      <header className="xe-header flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="mr-2 flex min-w-0 items-center gap-2.5">
          <span className="xe-mark" aria-hidden="true">XE</span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-fg">Game Viewer</h1>
            <p className="text-xs text-muted">Boardview · overlays · diagramas</p>
          </div>
        </div>
        <Button variant="primary" disabled={importing || readingFolder} onClick={() => fileRef.current?.click()}>
          <FolderOpen className="size-4" />
          {importing ? "Procesando…" : "Abrir"}
        </Button>
        <Button variant="quiet" disabled={importing || readingFolder} onClick={chooseFolder}>
          <FolderPlus className="size-4" />
          {readingFolder ? "Leyendo carpeta…" : "Abrir carpeta"}
        </Button>
        <Button variant="quiet" onClick={() => {
          const width = Math.min(480, window.screen.availWidth);
          const height = Math.min(720, window.screen.availHeight);
          const left = Math.max(0, window.screenX + window.outerWidth - width - 24);
          const top = Math.max(0, window.screenY + 60);
          window.open("https://chatgpt.com/", "_blank", `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,noopener,noreferrer`);
        }}>Consultar ChatGPT</Button>
        {boardTools ? <>
        <Button variant="quiet" disabled={importing} onClick={() => compareRef.current?.click()}>Comparar diagrama</Button>
        <Button variant={rearOpen ? "primary" : "quiet"} aria-pressed={rearOpen} onClick={() => setSide(rearOpen ? "top" : "both")}>Dos caras</Button>
        <div className="flex rounded-panel border border-border p-1">
          {(
            [
              ["top", "Sup", "Superior"],
              ["bottom", "Inf", "Inferior"],
              ["both", "Ambas", "Ambas"],
            ] as const
          ).map(([value, short, long]) => (
            <Button
              key={value}
              size="sm"
              variant={side === value ? "primary" : "ghost"}
              aria-pressed={side === value}
              onClick={() => setSide(value)}
            >
              <span className="lg:hidden">{short}</span>
              <span className="hidden lg:inline">{long}</span>
            </Button>
          ))}
        </div>
        <Button
          size="icon"
          variant={mirror ? "primary" : "quiet"}
          aria-pressed={mirror}
          aria-label="Espejo"
          title="Espejo (M)"
          onClick={toggleMirror}
        >
          <FlipHorizontal2 className="size-4" />
        </Button>
        <Button size="icon" variant="quiet" aria-label="Girar placa a la izquierda" title="Girar 90° a la izquierda" onClick={() => viewRef.current?.rotateBy(-90)}><RotateCcw className="size-4" /></Button>
        <Button size="icon" variant="quiet" aria-label="Girar placa a la derecha" title="Girar 90° a la derecha" onClick={() => viewRef.current?.rotateBy(90)}><RotateCw className="size-4" /></Button>
        <div className="ml-auto flex gap-1">
          <Button size="icon" variant={tool === "navigate" ? "primary" : "quiet"} aria-label="Navegar" title="Navegar (N)" onClick={() => setTool("navigate")}>
            <Crosshair className="size-4" />
          </Button>
          <Button size="icon" variant={tool === "overlay" ? "primary" : "quiet"} aria-label="Mover overlay" title="Mover overlay (V)" onClick={() => setTool("overlay")}>
            <Move className="size-4" />
          </Button>
          <Button size="icon" variant={tool === "measure" ? "primary" : "quiet"} aria-label="Medir" title="Medir (C)" onClick={() => setTool("measure")}>
            <Ruler className="size-4" />
          </Button>
          <Button size="icon" variant="quiet" aria-label="Encuadrar" title="Encuadrar (F)" onClick={() => viewRef.current?.fit()}>
            <LocateFixed className="size-4" />
          </Button>
          <Button size="icon" variant="quiet" aria-label="Alejar placa" title="Alejar" onClick={() => viewRef.current?.zoomBy(1 / 1.25)}>
            <ZoomOut className="size-4" />
          </Button>
          <Button size="icon" variant="quiet" aria-label="Acercar placa" title="Acercar" onClick={() => viewRef.current?.zoomBy(1.25)}>
            <ZoomIn className="size-4" />
          </Button>
        </div>
        </> : null}
      </header>

      <div className="relative flex min-h-0 flex-1">
        <aside className={cn(sheetClass(filesOpen), "xe-sidebar lg:w-60 lg:border-r lg:border-border")}>
        <details className="mx-3 my-3 shrink-0">
          <summary className="xe-support-callout cursor-pointer rounded-control border border-border px-3 py-2 text-sm font-semibold text-fg">♡ Apoya el proyecto</summary>
          <div className="mt-3 w-full rounded-panel border border-border xe-support-frame max-h-[75dvh] overflow-y-auto bg-bg-elevated p-3 shadow-xl">
            <div className="mb-3 flex items-center gap-3">
              <svg width="58" height="58" viewBox="0 0 58 58" role="img" aria-label="XE: proyectos para la comunidad">
                <defs><linearGradient id="xe-support-gradient" x2="1" y2="1"><stop stopColor="#f5f7fa"/><stop offset="1" stopColor="#00dcea"/></linearGradient></defs>
                <rect x="1" y="1" width="56" height="56" rx="15" fill="url(#xe-support-gradient)" stroke="#00b7ca"/>
                <text x="29" y="35" textAnchor="middle" fontSize="23" fontWeight="700" fill="#153c48">XE</text>
              </svg>
              <h2 className="text-base font-semibold text-fg">¿Te gusta XE Game Viewer?</h2>
            </div>
            <p className="text-sm text-muted">Tu apoyo me ayuda a seguir mejorando el visor y creando proyectos para la comunidad. No es obligatorio: cualquier aportación suma.</p>
            <details className="mt-4">
              <summary className="cursor-pointer rounded-control border border-border px-4 py-3 text-center text-sm font-semibold text-fg">Ver formas de apoyar</summary>
            <a href="https://paypal.me/XboxElEscondite" target="_blank" rel="noopener noreferrer" className="mt-4 flex min-h-11 items-center justify-center rounded-control border border-border bg-accent px-4 py-3 font-semibold text-black">Apoyar con PayPal ↗</a>
            <div className="mt-4 space-y-3 border-t border-border pt-3">
              <h3 className="text-sm font-semibold text-fg">Transferencia bancaria</h3>
              {[
                { bank: "Mercado Pago", clabe: "722969020089368829", name: "Irving Daniel Sánchez Nava" },
                { bank: "Banorte", clabe: "072580010893628522", name: "Irving Daniel Sánchez" },
              ].map(account => <div key={account.bank} className="text-sm">
                <p className="font-semibold text-fg">{account.bank}</p>
                <p className="text-xs text-muted">{account.name}</p>
                <p className="mt-1 break-all font-mono text-fg">{account.clabe}</p>
                <Button className="mt-1" size="sm" variant="quiet" onClick={async (event) => {
                  const button = event.currentTarget;
                  try { await navigator.clipboard.writeText(account.clabe); button.textContent = "CLABE copiada ✓"; }
                  catch { button.textContent = "Selecciona la CLABE para copiar"; }
                }}>Copiar CLABE</Button>
              </div>)}
            </div>
            </details>
            <p className="mt-3 text-xs text-muted">El importe lo eliges tú. Puedes usar PayPal o transferencia. Verifica el beneficiario antes de confirmar. ¡Gracias por apoyar mi trabajo!</p>
          </div>
        </details>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <h2 className="flex-1 text-sm font-medium">Placas</h2>
            <Button size="icon" variant="quiet" aria-label="Nueva placa" onClick={() => void newEmpty()}>
              <Plus className="size-4" />
            </Button>
            <Button className="lg:hidden" size="icon" variant="ghost" aria-label="Cerrar placas" onClick={() => openFiles(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="mesa-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-2">
            {projects.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-panel border px-2 py-1",
                  item.id === project?.id ? "border-border bg-bg-subtle" : "border-transparent",
                )}
              >
                {editing === item.id ? (
                  <input
                    className="h-9 w-full rounded-control border border-border bg-bg px-2 text-sm"
                    value={draftName}
                    autoFocus
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={() => {
                      void rename(item.id, draftName);
                      setEditing(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void rename(item.id, draftName);
                        setEditing(null);
                      }
                      if (event.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <button
                    className="flex h-11 w-full items-center gap-2 text-left"
                    onClick={() => void activate(item.id)}
                    onDoubleClick={() => {
                      setEditing(item.id);
                      setDraftName(item.name);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                    {item.folder ? <span className="text-xs text-accent">Carpeta</span> : null}
                  </button>
                )}
                {item.id === project?.id ? (
                  <div className="flex justify-end pb-1">
                    {confirmId === item.id ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setConfirmId(null);
                          void remove(item.id);
                        }}
                      >
                        Confirmar
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(item.id)}>
                        Borrar
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
            <details className="mt-2 rounded-panel border border-border px-3 py-2 text-sm">
              <summary className="text-sm font-medium">Formatos y atajos</summary>
              <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted">
                <p>Placa: KiCad (.kicad_pcb y .kicad_mod), .bin con contenido compatible, .brd (con o sin cifra de OpenBoardView), BRD2, .bvr, .pcb de XinZhiZao, GenCAD, ASCII de Altium, CSV y JSON.</p>
                <p>Una imagen abierta sola se muestra como documento. Si eliges una placa y una imagen juntas, la imagen se alinea como overlay. También abre PDF, SVG y Photoshop (.psd, .psb).</p>
                <p>Abrir carpeta muestra sus imágenes y PDF como una galería, incluso dentro de subcarpetas. No requiere ZIP.</p>
                <p>Toca una pista o un pin: toda esa red se marca en blanco con borde azul neón. En un Photoshop, abre el panel de la derecha para ver y ocultar capas.</p>
                <p>Rueda zoom. Arrastrar mueve. F encuadra. 1 2 3 cambian de cara. M espejo. N navegar, V mover overlay, C medir. / buscar.</p>
              </div>
            </details>
          </div>
        </aside>

        <div className="relative flex min-w-0 flex-1">
          <div className={cn("grid min-h-0 min-w-0 flex-1", diagramOpen && diagramUrl && activeDiagram && "xe-compare")}>
            <div className={cn("relative flex min-h-0 min-w-0", diagramOpen && diagramUrl && "min-h-0")}>
              {ready && project?.folder ? (
                <FolderGallery
                  name={project.name}
                  items={project.diagrams}
                  urls={urls}
                  activeId={diagramOpen ? activeDiagramId : null}
                  onOpen={setActiveDiagram}
                />
              ) : ready ? (
                <section className="flex min-w-0 flex-1 flex-col">
                {board && rearOpen ? <h2 className="border-b border-border px-3 py-2 text-sm font-medium">Frontal · rojo</h2> : null}
                <Viewport
                  ref={viewRef}
                  syncedZoom={rearOpen ? syncedZoom : null}
                  onZoomSync={rearOpen ? syncZoom : undefined}
                  viewSide={rearOpen && board ? "top" : undefined}
                  viewMirror={rearOpen && board ? false : undefined}
                  marker={rearOpen ? boardCursor : null}
                  onCursor={setBoardCursor}
                  board={board}
                  projectId={project?.id ?? null}
                  overlays={project?.overlays ?? []}
                  urls={urls}
                  unitsPerMm={project?.unitsPerMm ?? 39.37}
                />
                </section>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted">Abriendo la mesa…</div>
              )}
              {rearOpen && board ? <section className="flex min-w-0 flex-1 flex-col border-l border-border bg-bg-elevated">
                <h2 className="border-b border-border px-3 py-2 text-sm font-medium">Inferior · cyan</h2>
                {board.parts.some(part => part.side === "top") && board.parts.some(part => part.side === "bottom") ? <Viewport syncedZoom={syncedZoom} onZoomSync={syncZoom} strictFace board={board} projectId={project?.id ?? null} overlays={[]} urls={urls} unitsPerMm={project?.unitsPerMm ?? 39.37} viewSide="bottom" viewMirror={true} marker={boardCursor} onCursor={setBoardCursor} /> : <p className="overflow-auto p-3 text-xs text-muted">Este lector no recuperó los datos de la cara inferior. La vista frontal no se duplica aquí.</p>}
              </section> : null}
              {!board && ready && !project?.folder && (project?.overlays.length ?? 0) === 0 && (project?.diagrams.length ?? 0) === 0 ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
                  <p className="max-w-sm text-sm text-muted">
                    Abre un archivo o una carpeta con PNG, JPG y PDF.
                  </p>
                </div>
              ) : null}
              {hint && project?.sample ? (
                <div className="absolute inset-x-3 bottom-8 z-10 flex items-start gap-3 rounded-sheet border border-border bg-bg-elevated p-3 shadow-none">
                  <p className="flex-1 text-sm text-muted">
                    Placa de ejemplo. Abre tus .brd, fotos y PDF: se guardan solo en este navegador.
                  </p>
                  <Button size="sm" variant="quiet" onClick={dismissHint}>
                    Entendido
                  </Button>
                </div>
              ) : null}
            </div>
            {diagramOpen && activeDiagram && diagramUrl ? (
              <DiagramPane key={activeDiagram.id} diagram={activeDiagram} url={diagramUrl} onClose={toggleDiagram} />
            ) : null}
          </div>
          {notice ? (
            <div className="absolute top-3 left-1/2 z-30 flex w-[min(36rem,calc(100%-1.5rem))] -translate-x-1/2 items-start gap-2 rounded-panel border border-border bg-bg-elevated px-3 py-2 text-sm">
              <p className="flex-1 text-pretty">{notice}</p>
              <Button size="icon" variant="ghost" aria-label="Cerrar aviso" onClick={dismissNotice}>
                <X className="size-4" />
              </Button>
            </div>
          ) : null}
          {translationOverlay && urls[translationOverlay.id] ? (
            <TranslationPanel
              key={translationOverlay.id}
              url={urls[translationOverlay.id]}
              name={translationOverlay.name}
              mime="image/png"
              onClose={() => setTranslationOverlayId(null)}
            />
          ) : null}
          {dragging ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/80">
              <p className="text-lg font-medium">Soltar archivos</p>
            </div>
          ) : null}
        </div>

        <aside className={cn(sheetClass(partsOpen), "xe-inspector lg:w-80 lg:border-l lg:border-border")}>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <h2 className="flex-1 text-sm font-medium">
              {board ? `${board.parts.length} piezas · ${board.format}` : "Piezas"}
            </h2>
            <Button className="lg:hidden" size="icon" variant="ghost" aria-label="Cerrar panel" onClick={() => openParts(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="mesa-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
              <input
                id="mesa-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar pieza o red"
                className="h-11 w-full rounded-control border border-border bg-bg pr-3 pl-9 text-sm outline-none placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-accent"
              />
            </label>

            {selected ? (
              <div className="rounded-panel border border-border p-3">
                <p className="font-medium">{selected.name}</p>
                <p className="text-xs text-muted">
                  {selected.device ? `${selected.device} · ` : ""}
                  {sideLabel(selected.side)} · {selected.kind === "th" ? "through-hole" : "SMD"} · {selectedPins.length} pines
                </p>
                <div className="mesa-scroll mt-2 max-h-40 overflow-auto">
                  {selectedPins.map((pin, index) => (
                    <button
                      key={`${pin.name}-${index}`}
                      className="flex h-9 w-full items-center justify-between gap-2 rounded-control px-1 text-left text-sm hover:bg-bg-subtle"
                      onClick={() => selectNet(selectedNet === pin.net ? null : pin.net || null)}
                    >
                      <span className="font-mono text-xs text-muted">{pin.name || index + 1}</span>
                      <span className="truncate">{pin.net || "sin red"}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : nail ? (
              <div className="rounded-panel border border-border p-3">
                <p className="font-medium">Punto de prueba {nail.probe}</p>
                <button className="mt-1 text-sm text-accent" onClick={() => selectNet(selectedNet === nail.net ? null : nail.net || null)}>
                  {nail.net || "sin red"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted">Pulsa una pieza en la placa o en la lista.</p>
            )}

            {selectedNet ? (
              <p className="text-sm">
                Red <span className="font-medium">{selectedNet}</span>
                {prep?.nets.get(selectedNet) ? ` · ${prep.nets.get(selectedNet)?.pins.length ?? 0} pines` : ""}
              </p>
            ) : null}

            <div className="flex flex-col">
              {partRows.map(({ part, index }) => (
                <button
                  key={`${part.name}-${index}`}
                  className={cn(
                    "flex h-11 items-center justify-between gap-2 rounded-control px-2 text-left text-sm",
                    index === selectedPart ? "bg-bg-subtle" : "hover:bg-bg-subtle",
                  )}
                  onClick={() => {
                    selectPart(index, true);
                    selectNet(null);
                  }}
                >
                  <span className="truncate font-medium">{part.name}</span>
                  <span className="font-mono text-xs text-muted">{sideLabel(part.side)}</span>
                </button>
              ))}
              {board && partRows.length === 0 ? <p className="px-2 text-sm text-muted">Sin coincidencias.</p> : null}
              {netRows.map((name) => (
                <button
                  key={name}
                  className={cn(
                    "flex h-11 items-center justify-between rounded-control px-2 text-left text-sm",
                    name === selectedNet ? "bg-bg-subtle" : "hover:bg-bg-subtle",
                  )}
                  onClick={() => selectNet(selectedNet === name ? null : name)}
                >
                  <span className="truncate">{name}</span>
                  <span className="font-mono text-xs text-muted">{prep?.nets.get(name)?.pins.length ?? 0}</span>
                </button>
              ))}
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Overlays</h3>
              </div>
              {project?.overlays.length ? (
                project.overlays.map((overlay) => (
                  <div key={overlay.id} className={cn("rounded-panel border p-2", overlay.id === activeOverlayId ? "border-border bg-bg-subtle" : "border-transparent")}>
                    <div className="flex items-center gap-1">
                      <button className="h-9 min-w-0 flex-1 truncate text-left text-sm" onClick={() => setActiveOverlay(overlay.id)}>
                        {overlay.name}
                      </button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={overlay.visible ? "Ocultar overlay" : "Mostrar overlay"}
                        onClick={() => updateOverlay(overlay.id, { visible: !overlay.visible })}
                      >
                        {overlay.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Traducir ${overlay.name}`} title="Traducir texto" onClick={() => setTranslationOverlayId(overlay.id)}>
                        <Languages className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Quitar overlay" onClick={() => void removeOverlay(overlay.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {overlay.id === activeOverlayId ? (
                      <div className="mt-1 space-y-2 px-1 pb-1">
                        <label className="flex items-center gap-2 text-xs text-muted">
                          Opacidad
                          <input
                            type="range"
                            min={0.05}
                            max={1}
                            step={0.01}
                            value={overlay.opacity}
                            onChange={(event) => updateOverlay(overlay.id, { opacity: Number(event.target.value) })}
                            className="w-full"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-xs text-muted">
                          Tamaño
                          <input
                            type="range"
                            min={0.05}
                            max={2.5}
                            step={0.01}
                            value={overlay.width / boardWidth}
                            onChange={(event) => updateOverlay(overlay.id, { width: Number(event.target.value) * boardWidth })}
                            className="w-full"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-xs text-muted">
                          Giro
                          <input
                            type="range"
                            min={-180}
                            max={180}
                            step={1}
                            value={overlay.rotation}
                            onChange={(event) => updateOverlay(overlay.id, { rotation: Number(event.target.value) })}
                            className="w-full"
                          />
                        </label>
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="quiet" onClick={() => updateOverlay(overlay.id, { flipX: !overlay.flipX })}>
                            Voltear H
                          </Button>
                          <Button size="sm" variant="quiet" onClick={() => updateOverlay(overlay.id, { flipY: !overlay.flipY })}>
                            Voltear V
                          </Button>
                          <Button size="sm" variant="quiet" onClick={() => updateOverlay(overlay.id, { above: !overlay.above })}>
                            {overlay.above ? "Encima" : "Debajo"}
                          </Button>
                          <Button size="sm" variant="quiet" onClick={() => fitOverlay(overlay.id)}>
                            Alinear
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted">Todavía no hay foto de la placa.</p>
              )}
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <h3 className="text-sm font-medium">Diagramas</h3>
              {project?.diagrams.length ? (
                project.diagrams.map((diagram) => (
                  <div key={diagram.id} className="flex items-center gap-1">
                    <button
                      className={cn(
                        "h-11 min-w-0 flex-1 truncate rounded-control px-2 text-left text-sm",
                        diagram.id === activeDiagramId && diagramOpen ? "bg-bg-subtle" : "hover:bg-bg-subtle",
                      )}
                      onClick={() => setActiveDiagram(diagram.id)}
                    >
                      {diagram.name}
                    </button>
                    <Button size="icon" variant="ghost" aria-label="Usar como overlay" title="Usar como overlay" onClick={() => void promoteDiagram(diagram.id)}>
                      <ImagePlus className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Quitar diagrama" onClick={() => void removeDiagram(diagram.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted">PDF o SVG del esquema.</p>
              )}
              {project?.diagrams.length ? (
                <Button size="sm" variant={diagramOpen ? "primary" : "quiet"} onClick={toggleDiagram}>
                  {diagramOpen ? "Ocultar diagrama" : "Ver diagrama"}
                </Button>
              ) : null}
            </div>

            <label className="space-y-1 border-t border-border pt-3 text-sm">
              <span className="text-xs text-muted">Escala del archivo</span>
              <select
                className="h-11 w-full rounded-control border border-border bg-bg px-2 text-sm"
                value={unitId}
                onChange={(event) => {
                  const preset = UNIT_PRESETS.find((item) => item.id === event.target.value);
                  if (preset) setUnits(preset.unitsPerMm);
                }}
              >
                {UNIT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-muted">Si una medida no cuadra, cambia la escala.</span>
            </label>
          </div>
        </aside>
      </div>

      {boardTools ? <div className="grid shrink-0 grid-cols-3 gap-2 border-t border-border bg-bg-elevated px-3 py-2 lg:hidden" aria-label="Elegir cara de la placa">
        <Button variant={side === "top" ? "primary" : "quiet"} aria-pressed={side === "top"} onClick={() => setSide("top")}>Sup</Button>
        <Button variant={side === "bottom" ? "primary" : "quiet"} aria-pressed={side === "bottom"} onClick={() => setSide("bottom")}>Inf</Button>
        <Button variant={side === "both" ? "primary" : "quiet"} aria-pressed={side === "both"} onClick={() => setSide(side === "both" ? "top" : "both")}>Dos caras</Button>
      </div> : null}
      {boardTools ? <div className="grid shrink-0 grid-cols-3 gap-2 border-t border-border bg-bg-elevated px-3 py-2 lg:hidden" aria-label="Controles táctiles de la placa">
        <Button variant="quiet" aria-label="Alejar placa en celular" onClick={() => viewRef.current?.zoomBy(1 / 1.25)}><ZoomOut className="size-4" />Alejar</Button>
        <Button variant="quiet" aria-label="Centrar placa en celular" onClick={() => viewRef.current?.fit()}><LocateFixed className="size-4" />Centrar</Button>
        <Button variant="primary" aria-label="Acercar placa en celular" onClick={() => viewRef.current?.zoomBy(1.25)}><ZoomIn className="size-4" />Acercar</Button>
      </div> : null}
      <nav className="grid shrink-0 grid-cols-3 border-t border-border lg:hidden">
        <Button variant={filesOpen ? "primary" : "ghost"} onClick={() => openFiles()}>
          Placas
        </Button>
        <Button variant={!filesOpen && !partsOpen ? "primary" : "ghost"} onClick={() => { openFiles(false); openParts(false); }}>
          Vista
        </Button>
        <Button variant={partsOpen ? "primary" : "ghost"} onClick={() => openParts()}>
          Piezas
        </Button>
      </nav>
      </div>
    </div>
  );
}
