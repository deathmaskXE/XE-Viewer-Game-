import type { BoardPoint } from "./types.ts";

/** Reconnect unordered boundary edges without replacing concave shapes by a box. */
export function largestClosedContour(points: BoardPoint[]): BoardPoint[] {
  const key = (p: BoardPoint) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  const edges: [BoardPoint, BoardPoint][] = [];
  const adjacent = new Map<string, number[]>();
  for (let i = 0; i + 1 < points.length; i += 2) {
    const a = points[i], b = points[i + 1];
    if (key(a) === key(b)) continue;
    const id = edges.length;
    edges.push([a, b]);
    for (const p of [a, b]) adjacent.set(key(p), [...(adjacent.get(key(p)) ?? []), id]);
  }
  const used = new Set<number>();
  let best: BoardPoint[] = [], bestArea = 0;
  edges.forEach(([start, next], id) => {
    if (used.has(id)) return;
    used.add(id);
    const path = [start, next];
    while (key(path[path.length - 1]) !== key(start)) {
      const last = path[path.length - 1];
      const edgeId = adjacent.get(key(last))?.find((candidate) => !used.has(candidate));
      if (edgeId === undefined) break;
      used.add(edgeId);
      const [a, b] = edges[edgeId];
      path.push(key(a) === key(last) ? b : a);
    }
    if (path.length < 4 || key(path[path.length - 1]) !== key(start)) return;
    path.pop();
    const area = Math.abs(path.reduce((sum, a, i) => { const b = path[(i + 1) % path.length]; return sum + a.x * b.y - b.x * a.y; }, 0));
    if (area > bestArea) { bestArea = area; best = path; }
  });
  return best;
}
