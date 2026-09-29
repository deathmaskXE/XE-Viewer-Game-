export type Side = "top" | "bottom" | "both";
export type PartKind = "smd" | "th";

export type BoardPoint = { x: number; y: number };

export type BoardPart = {
  name: string;
  side: Side;
  kind: PartKind;
  device?: string;
  center?: BoardPoint;
  rot?: number;
  w?: number;
  h?: number;
};

export type BoardPin = {
  x: number;
  y: number;
  net: string;
  /** Index into `parts`, or -1 if the pin is loose. */
  part: number;
  side: Side;
  name: string;
};

export type BoardNail = {
  x: number;
  y: number;
  net: string;
  side: Side;
  probe: number;
};

export type BoardSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Net this copper belongs to, when the file says so. */
  net?: string;
};

export type Board = {
  name: string;
  format: string;
  /** How many file units make one millimeter. */
  unitsPerMm: number;
  outline: BoardPoint[];
  segments: BoardSegment[];
  parts: BoardPart[];
  pins: BoardPin[];
  nails: BoardNail[];
};

export const MIL_PER_MM = 39.37007874015748;
