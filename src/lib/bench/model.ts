import type { Board } from "@/lib/board/types";

export type OverlayRecord = {
  id: string;
  name: string;
  opacity: number;
  visible: boolean;
  above: boolean;
  cx: number;
  cy: number;
  width: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
};

export type DiagramRecord = {
  id: string;
  name: string;
  mime: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  created: number;
  updated: number;
  sample: boolean;
  folder?: boolean;
  board: Board | null;
  sourceName: string | null;
  unitsPerMm: number;
  overlays: OverlayRecord[];
  diagrams: DiagramRecord[];
};

export type Tool = "navigate" | "overlay" | "measure";
export type ViewSide = "top" | "bottom" | "both";
