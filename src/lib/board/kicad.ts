import { largestClosedContour } from "./contour.ts";
import { MIL_PER_MM, type Board, type BoardPoint, type Side } from "./types.ts";

type Node = (string | Node)[];
const children = (node: Node, key: string) => node.filter((item): item is Node => Array.isArray(item) && item[0] === key);
const child = (node: Node, key: string): Node => children(node, key)[0] ?? [];
const number = (node: Node, index: number) => Number(node[index]) || 0;
const str = (node: Node, index: number) => typeof node[index] === "string" ? node[index] as string : "";
const point = (node: Node): BoardPoint => ({ x: number(node, 1), y: number(node, 2) });

function readTree(text: string): Node {
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[()]|[^\s()]+/g) ?? [];
  const root: Node = [], stack = [root];
  for (const token of tokens) {
    if (token === "(") { const node: Node = []; stack[stack.length - 1].push(node); stack.push(node); }
    else if (token === ")") { if (stack.length === 1) throw new Error("KiCad: paréntesis inesperado."); stack.pop(); }
    else stack[stack.length - 1].push(token.startsWith('"') ? token.slice(1, -1).replace(/\\(["\\])/g, "$1") : token);
  }
  if (stack.length !== 1 || !Array.isArray(root[0])) throw new Error("El archivo KiCad está incompleto.");
  return root[0];
}

function arcPoints(start: BoardPoint, mid: BoardPoint, end: BoardPoint): BoardPoint[] {
  const d = 2 * (start.x * (mid.y - end.y) + mid.x * (end.y - start.y) + end.x * (start.y - mid.y));
  if (Math.abs(d) < 1e-10) return [start, end];
  const norm = (p: BoardPoint) => p.x * p.x + p.y * p.y;
  const cx = (norm(start) * (mid.y - end.y) + norm(mid) * (end.y - start.y) + norm(end) * (start.y - mid.y)) / d;
  const cy = (norm(start) * (end.x - mid.x) + norm(mid) * (start.x - end.x) + norm(end) * (mid.x - start.x)) / d;
  const angle = (p: BoardPoint) => Math.atan2(p.y - cy, p.x - cx);
  const wrap = (v: number) => (v + Math.PI * 2) % (Math.PI * 2);
  const a = angle(start), sweep = wrap(angle(mid) - a) <= wrap(angle(end) - a) ? wrap(angle(end) - a) : wrap(angle(end) - a) - Math.PI * 2;
  const radius = Math.hypot(start.x - cx, start.y - cy), count = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 36)));
  return Array.from({ length: count + 1 }, (_, i) => i === 0 ? start : i === count ? end : { x: cx + radius * Math.cos(a + sweep * i / count), y: cy + radius * Math.sin(a + sweep * i / count) });
}

export function parseKicad(name: string, text: string): Board {
  let root = readTree(text);
  const standalone = root[0] === "footprint" || root[0] === "module";
  if (standalone) root = ["kicad_pcb", root];
  if (root[0] !== "kicad_pcb") throw new Error("Abre la placa .kicad_pcb. Los esquemas y proyectos KiCad necesitan otro lector.");
  const board: Board = { name: name.replace(/\.[^.]+$/, ""), format: standalone ? "KiCad huella" : "KiCad", unitsPerMm: MIL_PER_MM, parts: [], pins: [], nails: [], segments: [], outline: [], outlineSegments: [] };
  const nets = new Map(children(root, "net").map((node) => [str(node, 1), str(node, 2)]));
  const netName = (node: Node) => { const net = child(node, "net"); return str(net, 2) || nets.get(str(net, 1)) || (Number.isNaN(Number(str(net, 1))) ? str(net, 1) : ""); };
  const convert = (p: BoardPoint) => ({ x: p.x * MIL_PER_MM, y: -p.y * MIL_PER_MM });
  const edges = (points: BoardPoint[], transform: (p: BoardPoint) => BoardPoint, boundary: boolean, net?: string) => {
    for (let i = 1; i < points.length; i++) { const a = convert(transform(points[i - 1])), b = convert(transform(points[i])); const edge = { x1: a.x, y1: a.y, x2: b.x, y2: b.y, net }; board.segments.push(edge); if (boundary) board.outlineSegments!.push(edge); }
  };
  const graphic = (node: Node, transform: (p: BoardPoint) => BoardPoint, copper = false) => {
    const kind = str(node, 0), boundary = str(child(node, "layer"), 1) === "Edge.Cuts";
    if (!boundary && !copper && !standalone) return;
    const a = point(child(node, "start")), b = point(child(node, "end"));
    let points: BoardPoint[] = [];
    if (kind.endsWith("line") || kind === "segment") points = [a, b];
    else if (kind.endsWith("rect")) points = [a, {x:b.x,y:a.y}, b, {x:a.x,y:b.y}, a];
    else if (kind.endsWith("poly")) { points = children(child(node, "pts"), "xy").map(point); if (points.length) points.push(points[0]); }
    else if (kind.endsWith("circle")) { const center = point(child(node, "center")), r = Math.hypot(b.x-center.x,b.y-center.y); points = Array.from({length:73},(_,i)=>({x:center.x+r*Math.cos(i*Math.PI/36),y:center.y+r*Math.sin(i*Math.PI/36)})); }
    else if (kind.endsWith("arc")) {
      const mid = child(node, "mid");
      if (mid.length) points = arcPoints(a, point(mid), b);
      else { const sweep = number(child(node,"angle"),1)*Math.PI/180; const r=Math.hypot(b.x-a.x,b.y-a.y), start=Math.atan2(b.y-a.y,b.x-a.x); const count=Math.max(4,Math.ceil(Math.abs(sweep)/(Math.PI/36))); points=Array.from({length:count+1},(_,i)=>({x:a.x+r*Math.cos(start+sweep*i/count),y:a.y+r*Math.sin(start+sweep*i/count)})); }
    }
    edges(points, transform, boundary, copper ? netName(node) : undefined);
  };
  for (const footprint of [...children(root, "footprint"), ...children(root, "module")]) {
    const at = child(footprint, "at"), origin = point(at), angle = -number(at, 3)*Math.PI/180;
    const transform = (p: BoardPoint) => ({x:origin.x+p.x*Math.cos(angle)-p.y*Math.sin(angle),y:origin.y+p.x*Math.sin(angle)+p.y*Math.cos(angle)});
    const side: Side = str(child(footprint,"layer"),1).startsWith("B.") ? "bottom" : "top";
    const properties = children(footprint,"property"), texts=children(footprint,"fp_text");
    const ref = properties.find(p=>str(p,1)==="Reference"), reference=texts.find(p=>str(p,1)==="reference");
    const value = properties.find(p=>str(p,1)==="Value"), oldValue=texts.find(p=>str(p,1)==="value");
    const index=board.parts.length;
    board.parts.push({name:str(ref??[],2)||str(reference??[],2)||`U${index+1}`,side,kind:children(footprint,"pad").some(p=>str(p,2)==="thru_hole")?"th":"smd",device:str(value??[],2)||str(oldValue??[],2)||str(footprint,1),center:convert(origin),rot:number(at,3)});
    for(const pad of children(footprint,"pad")) { const position=convert(transform(point(child(pad,"at")))); const layers=child(pad,"layers"); const both=layers.some(p=>p==="*.Cu")||str(pad,2)==="thru_hole"; board.pins.push({...position,name:str(pad,1),part:index,net:netName(pad),side:both?"both":side}); }
    for(const item of footprint) if(Array.isArray(item)&&str(item,0).startsWith("fp_")) graphic(item,transform);
  }
  for(const item of root) if(Array.isArray(item)) { const kind=str(item,0); if(kind.startsWith("gr_")) graphic(item,p=>p); else if(kind==="segment"||kind==="arc") graphic(item,p=>p,true); else if(kind==="via") board.pins.push({...convert(point(child(item,"at"))),part:-1,name:"Vía",net:netName(item),side:"both"}); }
  board.outline=largestClosedContour(board.outlineSegments!.flatMap(e=>[{x:e.x1,y:e.y1},{x:e.x2,y:e.y2}]));
  if(!board.parts.length&&!board.pins.length&&!board.segments.length) throw new Error("La placa KiCad no contiene geometría visible.");
  return board;
}
