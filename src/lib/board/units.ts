import { MIL_PER_MM } from "@/lib/board/types";

export const UNIT_PRESETS = [
  { id: "mil", label: "mil — 1 unidad = 1 mil", unitsPerMm: MIL_PER_MM },
  { id: "um", label: "µm — 1 unidad = 0,001 mm", unitsPerMm: 1000 },
  { id: "mm", label: "mm — 1 unidad = 1 mm", unitsPerMm: 1 },
  { id: "in", label: "pulgada — 1 unidad = 1 in", unitsPerMm: 1 / 25.4 },
] as const;

export function formatMm(units: number, unitsPerMm: number, digits = 2): string {
  const mm = units / unitsPerMm;
  return mm.toLocaleString("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function formatSpan(distanceUnits: number, unitsPerMm: number): string {
  const mm = distanceUnits / unitsPerMm;
  const mil = mm * MIL_PER_MM;
  const mmDigits = Math.abs(mm) >= 10 ? 2 : 3;
  const milDigits = Math.abs(mil) >= 10 ? 1 : 2;
  return `${formatMm(distanceUnits, unitsPerMm, mmDigits)} mm · ${mil.toLocaleString("es-ES", {
    maximumFractionDigits: milDigits,
  })} mil`;
}
