import type { TextRegion } from "@/lib/bench/translation";

export function TextOverlay({ regions, width, height }: { regions: TextRegion[]; width: number; height: number }) {
  if (!width || !height) return null;
  return <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-label="Texto traducido superpuesto">
    {regions.map((region, index) => <span key={index} title={region.text} className="absolute flex items-center overflow-hidden bg-[#f7f8f2] px-[1px] font-semibold leading-none text-[#102631] shadow-[0_0_2px_1px_#f7f8f2]" style={{ left: `${region.x / width * 100}%`, top: `${region.y / height * 100}%`, width: `${Math.max(region.width / width * 100, 1)}%`, minHeight: `${region.height / height * 100}%`, fontSize: `clamp(5px, ${region.height / height * 85}cqw, 24px)` }}>{region.translated || region.text}</span>)}
  </div>;
}
