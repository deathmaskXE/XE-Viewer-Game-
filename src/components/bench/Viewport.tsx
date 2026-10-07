import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { acceptsSide, pickAt, pickTrace, prepare, type Bounds } from "@/lib/board/geometry";
import type { Board } from "@/lib/board/types";
import { formatMm, formatSpan } from "@/lib/board/units";
import type { OverlayRecord, Tool, ViewSide } from "@/lib/bench/model";
import { useBench } from "@/lib/bench/store";

export type ViewportHandle = {
  fit: () => void;
  rotateBy: (degrees: number) => void;
  zoomBy: (factor: number) => void;
  panBy: (dx: number, dy: number) => void;
};

type Props = {
  board: Board | null;
  projectId: string | null;
  overlays: OverlayRecord[];
  urls: Record<string, string>;
  unitsPerMm: number;
  ref?: Ref<ViewportHandle>;
  viewSide?: ViewSide;
  viewMirror?: boolean;
  marker?: { x: number; y: number } | null;
  onCursor?: (point: { x: number; y: number }) => void;
};

const PAL = {
  bg: "#edf5f8",
  fill: "#e2edf2",
  outline: "#4a788c",
  partTop: "#244e65",
  partBot: "#26788c",
  pin: "#335d70",
  pinBot: "#258096",
  nail: "#008a9e",
  hot: "#39ff14",
  net: "#008b9f",
  trace: "#39ff14",
  text: "#193b4c",
  dim: "rgba(176,216,229,0.28)",
};

type Cam = { x: number; y: number; zoom: number };

export function Viewport({ board, projectId, overlays, urls, unitsPerMm, ref, viewSide, viewMirror, marker, onCursor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cam = useRef<Cam>({ x: 0, y: 0, zoom: 1 });
  const fitZoom = useRef(1);
  const rotation = useRef(0);
  const userMoved = useRef(false);
  const size = useRef({ w: 1, h: 1 });
  const [hud, setHud] = useState("100%");
  const [cursor, setCursor] = useState("");
  const [hover, setHover] = useState<{ sx: number; sy: number; label: string } | null>(null);
  const images = useRef(new Map<string, HTMLImageElement>());
  const frame = useRef(0);
  const space = useRef(false);
  const pointers = useRef(new Map<number, { sx: number; sy: number }>());

  const storedSide = useBench((state) => state.side);
  const side = viewSide ?? storedSide;
  const storedMirror = useBench((state) => state.mirror);
  const mirror = viewMirror ?? storedMirror;
  const markerRef = useRef(marker);
  markerRef.current = marker;
  const tool = useBench((state) => state.tool);
  const selectedPart = useBench((state) => state.selectedPart);
  const selectedNail = useBench((state) => state.selectedNail);
  const selectedNet = useBench((state) => state.selectedNet);
  const activeOverlayId = useBench((state) => state.activeOverlayId);
  const measureA = useBench((state) => state.measureA);
  const measureB = useBench((state) => state.measureB);
  const zoomRequest = useBench((state) => state.zoomRequest);
  const selectPart = useBench((state) => state.selectPart);
  const selectNail = useBench((state) => state.selectNail);
  const selectNet = useBench((state) => state.selectNet);
  const setMeasurePoint = useBench((state) => state.setMeasurePoint);
  const updateOverlay = useBench((state) => state.updateOverlay);
  const setActiveOverlay = useBench((state) => state.setActiveOverlay);
  const scaleOverlay = useBench((state) => state.scaleOverlay);

  const prep = useMemo(() => (board ? prepare(board) : null), [board]);
  const latest = useRef({
    board,
    prep,
    overlays,
    side,
    mirror,
    tool,
    selectedPart,
    selectedNail,
    selectedNet,
    activeOverlayId,
    measureA,
    measureB,
    unitsPerMm,
    selectPart,
    selectNail,
    selectNet,
    setMeasurePoint,
    updateOverlay,
    setActiveOverlay,
    scaleOverlay,
  });
  latest.current = {
    board,
    prep,
    overlays,
    side,
    mirror,
    tool,
    selectedPart,
    selectedNail,
    selectedNet,
    activeOverlayId,
    measureA,
    measureB,
    unitsPerMm,
    selectPart,
    selectNail,
    selectNet,
    setMeasurePoint,
    updateOverlay,
    setActiveOverlay,
    scaleOverlay,
  };

  const originX = prep ? (prep.bounds.minX + prep.bounds.maxX) / 2 : 0;

  const project = (x: number, y: number, mirrorOn = latest.current.mirror) => {
    const { w, h } = size.current;
    const wx = mirrorOn ? originX * 2 - x : x;
    return {
      x: (wx - cam.current.x) * cam.current.zoom + w / 2,
      y: (cam.current.y - y) * cam.current.zoom + h / 2,
    };
  };

  const unproject = (sx: number, sy: number) => {
    const { w, h } = size.current;
    const wx = (sx - w / 2) / cam.current.zoom + cam.current.x;
    const y = cam.current.y - (sy - h / 2) / cam.current.zoom;
    const x = latest.current.mirror ? originX * 2 - wx : wx;
    return { x, y };
  };

  const publishHud = () => {
    const pct = Math.round((cam.current.zoom / Math.max(fitZoom.current, 1e-9)) * 100);
    setHud(`${pct}% · ${rotation.current}°`);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const current = latest.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { w, h } = size.current;
    const nextW = Math.max(1, Math.floor(w * dpr));
    const nextH = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rotation.current * Math.PI / 180);
    ctx.translate(-w / 2, -h / 2);
    const drawOverlays = (above: boolean) => {
      for (const overlay of current.overlays) {
        if (!overlay.visible || overlay.above !== above) continue;
        const image = images.current.get(overlay.id);
        if (!image || image.width === 0) continue;
        const center = project(overlay.cx, overlay.cy);
        const dw = overlay.width * cam.current.zoom;
        const dh = dw * (image.height / image.width);
        ctx.save();
        ctx.translate(center.x, center.y);
        const rotation = (current.mirror ? -overlay.rotation : overlay.rotation) * (Math.PI / 180);
        ctx.rotate(rotation);
        ctx.scale(overlay.flipX !== current.mirror ? -1 : 1, overlay.flipY ? -1 : 1);
        ctx.globalAlpha = overlay.opacity;
        ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        if (current.tool === "overlay" && overlay.id === current.activeOverlayId) {
          ctx.save();
          ctx.translate(center.x, center.y);
          ctx.rotate(rotation);
          ctx.strokeStyle = PAL.nail;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(-dw / 2, -dh / 2, dw, dh);
          ctx.restore();
        }
      }
    };

    if (!current.board || !current.prep) {
      drawOverlays(false);
      drawOverlays(true);
    if (markerRef.current) {
      const p = project(markerRef.current.x, markerRef.current.y);
      ctx.save();
      ctx.strokeStyle = PAL.hot;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.moveTo(p.x - 18, p.y); ctx.lineTo(p.x + 18, p.y);
      ctx.moveTo(p.x, p.y - 18); ctx.lineTo(p.x, p.y + 18);
      ctx.stroke(); ctx.restore();
    }

      return;
    }
    const { board: live, prep: ready } = current;

    if (live.outline.length > 1) {
      ctx.beginPath();
      live.outline.forEach((point, index) => {
        const p = project(point.x, point.y);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = PAL.fill;
      ctx.fill();
    }

    drawOverlays(false);

    const underlay = current.overlays.some((overlay) => overlay.visible && !overlay.above);
    ctx.lineWidth = 1;
    live.parts.forEach((part, index) => {
      if (!acceptsSide(part.side, current.side)) return;
      const box = ready.parts[index];
      if (!box) return;
      const a = project(box.minX, box.maxY);
      const b = project(box.maxX, box.minY);
      const left = Math.min(a.x, b.x);
      const top = Math.min(a.y, b.y);
      const bw = Math.abs(b.x - a.x);
      const bh = Math.abs(b.y - a.y);
      const selected = index === current.selectedPart;
      ctx.lineWidth = selected ? 2.5 : 1;
      const componentColor = /^C\d/i.test(part.name) ? "#80502e" : /^R\d/i.test(part.name) ? "#101010" : /^(?:U|IC)\d/i.test(part.name) ? "#6b7280" : part.side === "bottom" ? PAL.partBot : PAL.partTop;
      ctx.strokeStyle = selected ? PAL.hot : componentColor;
      ctx.globalAlpha = selected || !current.selectedNet ? 0.95 : 0.35;
      ctx.setLineDash(part.side === "bottom" ? [3, 3] : []);
      ctx.strokeRect(left, top, bw, bh);
      ctx.setLineDash([]);
      if ((selected || (!underlay && bw > 36)) && bw > 18) {
        ctx.globalAlpha = selected ? 1 : 0.8;
        ctx.fillStyle = selected ? PAL.hot : PAL.text;
        ctx.font = `500 ${Math.max(10, Math.min(13, bw / 8))}px "IBM Plex Sans", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(part.name, left + bw / 2, top + bh / 2, Math.max(12, bw - 6));
      }
      ctx.globalAlpha = 1;
    });

    const netOn = Boolean(current.selectedNet);
    for (let index = 0; index < live.pins.length; index++) {
      const pin = live.pins[index];
      if (!pin || !acceptsSide(pin.side, current.side)) continue;
      const p = project(pin.x, pin.y);
      if (p.x < -8 || p.y < -8 || p.x > w + 8 || p.y > h + 8) continue;
      const hot = netOn && pin.net === current.selectedNet;
      const s = Math.max(1.4, Math.min(14, 8 * cam.current.zoom));
      ctx.globalAlpha = !netOn || hot ? 0.95 : 0.2;
      ctx.fillStyle = hot ? PAL.trace : pin.side === "bottom" ? PAL.pinBot : PAL.pin;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      if (live.format === "KiCad huella" && pin.name && cam.current.zoom * live.unitsPerMm > 12) {
        ctx.font = `500 11px "IBM Plex Mono", monospace`;
        ctx.textAlign = "left"; ctx.textBaseline = "bottom";
        ctx.fillText(pin.name, p.x + s / 2 + 3, p.y - s / 2 - 2);
      }
    }
    ctx.globalAlpha = 1;

    live.nails.forEach((nail, index) => {
      if (!acceptsSide(nail.side, current.side)) return;
      const p = project(nail.x, nail.y);
      const hot = index === current.selectedNail || (netOn && nail.net === current.selectedNet);
      const r = hot ? 6 : 4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r, p.y);
      ctx.lineTo(p.x, p.y + r);
      ctx.lineTo(p.x - r, p.y);
      ctx.closePath();
      ctx.fillStyle = hot ? PAL.hot : PAL.nail;
      ctx.fill();
    });

    if (live.outline.length > 1) {
      ctx.beginPath();
      live.outline.forEach((point, index) => {
        const p = project(point.x, point.y);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.strokeStyle = PAL.outline;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    const hotNet = current.selectedNet;
    if (live.segments.length) {
      ctx.beginPath();
      for (const segment of live.segments) {
        if (hotNet && segment.net === hotNet) continue;
        if (segment.side && !acceptsSide(segment.side, current.side)) continue;
        ctx.beginPath();
        const a = project(segment.x1, segment.y1);
        const b = project(segment.x2, segment.y2);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = segment.side === "top" ? "#ed2024" : segment.side === "bottom" ? "#00cfe8" : PAL.outline;
        ctx.globalAlpha = hotNet ? 0.4 : 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
        // Draw known copper faces distinctly; unknown layers stay neutral.

      if (hotNet) {
        ctx.beginPath();
        const dots: { x: number; y: number }[] = [];
        for (const segment of live.segments) {
          if (segment.net !== hotNet || (segment.side && !acceptsSide(segment.side, current.side))) continue;
          const a = project(segment.x1, segment.y1);
          const b = project(segment.x2, segment.y2);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          dots.push(a, b);
        }
        ctx.strokeStyle = PAL.trace;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = PAL.trace;
        const radius = Math.max(2.2, Math.min(5, 3.2));
        for (const dot of dots) {
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.lineWidth = 1;
      }
    }

    if (live.outlineSegments?.length) {
      ctx.beginPath();
      for (const edge of live.outlineSegments) {
        const a = project(edge.x1, edge.y1), b = project(edge.x2, edge.y2);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = PAL.nail;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    drawOverlays(true);
    if (markerRef.current) {
      const p = project(markerRef.current.x, markerRef.current.y);
      ctx.save();
      ctx.strokeStyle = PAL.hot;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.moveTo(p.x - 18, p.y); ctx.lineTo(p.x + 18, p.y);
      ctx.moveTo(p.x, p.y - 18); ctx.lineTo(p.x, p.y + 18);
      ctx.stroke(); ctx.restore();
    }


    if (current.measureA) {
      const a = project(current.measureA.x, current.measureA.y);
      ctx.fillStyle = PAL.hot;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (current.measureB) {
        const b = project(current.measureB.x, current.measureB.y);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = PAL.hot;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        const dx = current.measureB.x - current.measureA.x;
        const dy = current.measureB.y - current.measureA.y;
        const label = formatSpan(Math.hypot(dx, dy), current.unitsPerMm);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 - 10;
        ctx.font = `500 12px "IBM Plex Sans", sans-serif`;
        const width = ctx.measureText(label).width + 12;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(mx - width / 2, my - 14, width, 20);
        ctx.fillStyle = PAL.text;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, mx, my - 4);
      }
    }
  };

  const requestDraw = () => {
    if (frame.current) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = 0;
      draw();
    });
  };

  const fitBox = (box: Bounds, pad = 0.86, remember = false) => {
    const { w, h } = size.current;
    if (w < 8 || h < 8) return;
    const bw = Math.max(1e-6, box.maxX - box.minX);
    const bh = Math.max(1e-6, box.maxY - box.minY);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const swapped = Math.abs(rotation.current % 180) === 90;
    cam.current.zoom = Math.min(((swapped ? h : w) * pad) / bw, ((swapped ? w : h) * pad) / bh);
    const mx = latest.current.mirror ? originX * 2 - cx : cx;
    cam.current.x = mx;
    cam.current.y = cy;
    if (remember) fitZoom.current = cam.current.zoom;
    publishHud();
    requestDraw();
  };

  const fit = () => {
    userMoved.current = false;
    if (!latest.current.prep) return;
    fitBox(latest.current.prep.bounds, 0.9, true);
  };

  useImperativeHandle(ref, () => ({
    fit,
    rotateBy: (degrees) => {
      rotation.current = (rotation.current + degrees + 360) % 360;
      if (latest.current.prep) fitBox(latest.current.prep.bounds, 0.9, true);
      else { publishHud(); requestDraw(); }
    },
    zoomBy: (factor) => {
      userMoved.current = true;
      cam.current.zoom = Math.min(800, Math.max(0.0002, cam.current.zoom * factor));
      publishHud();
      requestDraw();
    },
    panBy: (dx, dy) => {
      const mirrorOn = latest.current.mirror;
      cam.current.x += (mirrorOn ? dx : -dx) / cam.current.zoom;
      cam.current.y += dy / cam.current.zoom;
      requestDraw();
    },
  }));

  const fitted = useRef<string | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const applySize = () => {
      const rect = wrap.getBoundingClientRect();
      if (Math.abs(rect.width - size.current.w) < 1 && Math.abs(rect.height - size.current.h) < 1 && size.current.w > 8) {
        return;
      }
      size.current = { w: rect.width, h: rect.height };
      const key = projectId ?? "";
      if (rect.width > 8 && rect.height > 8 && latest.current.prep && !userMoved.current) {
        fitted.current = key;
        fitBox(latest.current.prep.bounds, 0.9, true);
      } else requestDraw();
    };
    const observer = new ResizeObserver(applySize);
    observer.observe(wrap);
    applySize();
    return () => observer.disconnect();
  }, [projectId]);

  useEffect(() => {
    userMoved.current = false;
    rotation.current = 0;
    fitted.current = null;
    if (!prep || size.current.w < 8) return;
    fitted.current = projectId ?? "";
    fitBox(prep.bounds, 0.9, true);
  }, [projectId, prep]);

  useEffect(() => {
    images.current.clear();
    let cancel = false;
    for (const overlay of overlays) {
      const url = urls[overlay.id];
      if (!url) continue;
      const image = new Image();
      image.onload = () => {
        if (cancel) return;
        images.current.set(overlay.id, image);
        if (!latest.current.prep && image.width > 0) {
          const aspect = image.height / image.width;
          const halfW = overlay.width / 2;
          const halfH = (overlay.width * aspect) / 2;
          fitBox(
            {
              minX: overlay.cx - halfW,
              minY: overlay.cy - halfH,
              maxX: overlay.cx + halfW,
              maxY: overlay.cy + halfH,
            },
            0.9,
            true,
          );
        } else requestDraw();
      };
      image.src = url;
    }
    return () => {
      cancel = true;
    };
  }, [overlays, urls, projectId]);

  useEffect(() => {
    if (!prep || zoomRequest.token === 0) return;
    if (zoomRequest.target === "board") fit();
    else {
      const box = prep.parts[zoomRequest.target];
      if (box) fitBox(box, 0.72);
    }
  }, [zoomRequest.token]);

  useEffect(() => {
    requestDraw();
  }, [board, overlays, side, mirror, tool, selectedPart, selectedNail, selectedNet, activeOverlayId, measureA, measureB, urls, marker]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const point = screenPoint(event.clientX - rect.left, event.clientY - rect.top);
      const sx = point.sx;
      const sy = point.sy;
      const current = latest.current;
      if (current.tool === "overlay" && current.activeOverlayId && (event.altKey || event.shiftKey)) {
        current.scaleOverlay(Math.exp(-event.deltaY * 0.001));
        return;
      }
      const before = unproject(sx, sy);
      userMoved.current = true;
      const factor = Math.exp(-event.deltaY * 0.00115);
      cam.current.zoom = Math.min(800, Math.max(0.0002, cam.current.zoom * factor));
      const mirrored = current.mirror ? originX * 2 - before.x : before.x;
      cam.current.x = mirrored - (sx - size.current.w / 2) / cam.current.zoom;
      cam.current.y = before.y + (sy - size.current.h / 2) / cam.current.zoom;
      publishHud();
      requestDraw();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [originX]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space") space.current = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    void document.fonts.ready.then(() => requestDraw());
  }, [board]);

  const screenPoint = (sx: number, sy: number) => {
    const dx = sx - size.current.w / 2, dy = sy - size.current.h / 2;
    const angle = -rotation.current * Math.PI / 180;
    return { sx: dx * Math.cos(angle) - dy * Math.sin(angle) + size.current.w / 2, sy: dx * Math.sin(angle) + dy * Math.cos(angle) + size.current.h / 2 };
  };

  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return screenPoint(event.clientX - (rect?.left ?? 0), event.clientY - (rect?.top ?? 0));
  };

  const hitOverlay = (sx: number, sy: number) => {
    const current = latest.current;
    for (let index = current.overlays.length - 1; index >= 0; index--) {
      const overlay = current.overlays[index];
      if (!overlay?.visible) continue;
      const image = images.current.get(overlay.id);
      if (!image || image.width === 0) continue;
      const center = project(overlay.cx, overlay.cy);
      const dx = sx - center.x;
      const dy = sy - center.y;
      const rotation = (current.mirror ? -overlay.rotation : overlay.rotation) * (Math.PI / 180);
      const cos = Math.cos(-rotation);
      const sin = Math.sin(-rotation);
      let lx = dx * cos - dy * sin;
      let ly = dx * sin + dy * cos;
      if (overlay.flipX !== current.mirror) lx = -lx;
      if (overlay.flipY) ly = -ly;
      const dw = overlay.width * cam.current.zoom;
      const dh = dw * (image.height / image.width);
      if (Math.abs(lx) <= dw / 2 && Math.abs(ly) <= dh / 2) return overlay.id;
    }
    return null;
  };

  const drag = useRef<{
    pointer: number;
    sx: number;
    sy: number;
    moved: boolean;
    mode: "pan" | "overlay";
    overlayId: string | null;
    lastX: number;
    lastY: number;
  } | null>(null);

  return (
    <div ref={wrapRef} className="relative min-h-0 min-w-0 flex-1 bg-bg">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        role="application"
        aria-label="Vista de la placa"
        onPointerDown={(event) => {
          const point = localPoint(event);
          pointers.current.set(event.pointerId, point);
          const overlayId = latest.current.tool === "overlay" ? hitOverlay(point.sx, point.sy) : null;
          if (overlayId) latest.current.setActiveOverlay(overlayId);
          drag.current = {
            pointer: event.pointerId,
            sx: point.sx,
            sy: point.sy,
            moved: false,
            mode: space.current || event.button === 1 || !overlayId ? "pan" : "overlay",
            overlayId,
            lastX: point.sx,
            lastY: point.sy,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const point = localPoint(event);
          pointers.current.set(event.pointerId, point);
          const world = unproject(point.sx, point.sy);
          onCursor?.(world);
          setCursor(`${formatMm(world.x, unitsPerMm)} , ${formatMm(world.y, unitsPerMm)} mm`);
          if (latest.current.board && latest.current.prep && latest.current.tool !== "overlay") {
            const hit = pickAt(
              latest.current.board,
              latest.current.prep,
              world.x,
              world.y,
              latest.current.side as ViewSide,
              10 / cam.current.zoom,
            );
            const part = hit.part != null ? latest.current.board.parts[hit.part] : null;
            const pin = hit.pin != null ? latest.current.board.pins[hit.pin] : null;
            const trace =
              pin?.net ||
              pickTrace(latest.current.board, world.x, world.y, 14 / cam.current.zoom);
            const label = part ? part.name : trace || "";
            const rect = canvasRef.current?.getBoundingClientRect();
            setHover(label ? { sx: event.clientX - (rect?.left ?? 0), sy: event.clientY - (rect?.top ?? 0), label: trace && part ? `${label} · ${trace}` : label } : null);
          } else setHover(null);

          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            if (!a || !b || !drag.current) return;
            const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);
            const prev = drag.current.sx || dist;
            if (prev > 0 && dist > 0) {
              cam.current.zoom = Math.min(800, Math.max(0.0002, cam.current.zoom * (dist / prev)));
              publishHud();
              requestDraw();
            }
            drag.current.sx = dist;
            drag.current.moved = true;
            return;
          }

          const active = drag.current;
          if (!active || active.pointer !== event.pointerId) return;
          const dx = point.sx - active.sx;
          const dy = point.sy - active.sy;
          if (!active.moved && Math.hypot(dx, dy) > 4) {
            active.moved = true;
            userMoved.current = true;
          }
          if (!active.moved) return;
          if (active.mode === "overlay" && active.overlayId) {
            const overlay = latest.current.overlays.find((item) => item.id === active.overlayId);
            if (!overlay) return;
            const previous = unproject(active.lastX, active.lastY);
            const next = unproject(point.sx, point.sy);
            latest.current.updateOverlay(overlay.id, {
              cx: overlay.cx + next.x - previous.x,
              cy: overlay.cy + next.y - previous.y,
            });
          } else {
            const mirrorOn = latest.current.mirror;
            const movedX = point.sx - active.lastX;
            const movedY = point.sy - active.lastY;
            cam.current.x -= (mirrorOn ? -movedX : movedX) / cam.current.zoom;
            cam.current.y += movedY / cam.current.zoom;
            requestDraw();
          }
          active.lastX = point.sx;
          active.lastY = point.sy;
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          const active = drag.current;
          drag.current = null;
          if (!active || active.moved || event.button === 1) return;
          const point = localPoint(event);
          const world = unproject(point.sx, point.sy);
          const current = latest.current;
          if (current.tool === "measure" && current.board && current.prep) {
            const hit = pickAt(current.board, current.prep, world.x, world.y, current.side, 12 / cam.current.zoom);
            const pin = hit.pin != null ? current.board.pins[hit.pin] : null;
            const nail = hit.nail != null ? current.board.nails[hit.nail] : null;
            current.setMeasurePoint(pin ? { x: pin.x, y: pin.y } : nail ? { x: nail.x, y: nail.y } : world);
            return;
          }
          if (!current.board || !current.prep || current.tool === "overlay") return;
          const hit = pickAt(current.board, current.prep, world.x, world.y, current.side, 10 / cam.current.zoom);
          if (hit.pin != null) {
            const pin = current.board.pins[hit.pin];
            if (pin && pin.part >= 0) current.selectPart(pin.part);
            else current.selectPart(null);
            current.selectNet(pin?.net || null);
          } else if (hit.nail != null) {
            const nail = current.board.nails[hit.nail];
            current.selectNail(hit.nail);
            current.selectNet(nail?.net || null);
          } else {
            const trace = pickTrace(current.board, world.x, world.y, 14 / cam.current.zoom);
            if (trace) {
              current.selectPart(null);
              current.selectNail(null);
              current.selectNet(trace);
            } else if (hit.part != null) {
              current.selectPart(hit.part);
              current.selectNet(null);
            } else {
              current.selectPart(null);
              current.selectNail(null);
              current.selectNet(null);
            }
          }
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          drag.current = null;
        }}
        onDoubleClick={(event) => {
          const point = localPoint(event);
          const world = unproject(point.sx, point.sy);
          const current = latest.current;
          if (!current.board || !current.prep) return;
          const hit = pickAt(current.board, current.prep, world.x, world.y, current.side, 10 / cam.current.zoom);
          if (hit.part != null) {
            const box = current.prep.parts[hit.part];
            if (box) fitBox(box, 0.7);
          } else fit();
        }}
        onContextMenu={(event) => event.preventDefault()}
      />
      {hover ? (
        <div
          className="pointer-events-none absolute z-10 rounded-control border border-border bg-bg-elevated px-2 py-1 text-xs text-fg"
          style={{ left: Math.min(hover.sx + 14, size.current.w - 160), top: hover.sy + 14 }}
        >
          {hover.label}
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-2 left-3 font-mono text-xs text-muted">{hud}</div>
      <div className="pointer-events-none absolute right-3 bottom-2 font-mono text-xs text-muted">{cursor}</div>
    </div>
  );
}
