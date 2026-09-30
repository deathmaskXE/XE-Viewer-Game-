import { readTree, arcPoints } from "./kicad.ts";
type Node=(string|Node)[];
const kids=(n:Node,k:string)=>n.filter((v):v is Node=>Array.isArray(v)&&v[0]===k);
const one=(n:Node,k:string)=>kids(n,k)[0]??[];
const s=(n:Node,i:number)=>typeof n[i]==="string"?n[i] as string:"";
const num=(n:Node,i:number)=>Number(n[i])||0;
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function schematicSvg(text:string):string {
 const root=readTree(text);if(root[0]!=="kicad_sch")throw new Error("No es un esquema KiCad.");
 const paper=s(one(root,"paper"),1);const sizes:Record<string,[number,number]>={A0:[1189,841],A1:[841,594],A2:[594,420],A3:[420,297],A4:[297,210],A5:[210,148]};const [w,h]=sizes[paper]??[Math.max(297,num(one(root,"paper"),2)),Math.max(210,num(one(root,"paper"),3))];
 const out:string[]=[];
 const txt=(value:string,x:number,y:number,size=1.27)=>`<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" fill="#183048">${esc(value)}</text>`;
 const points=(n:Node,invert=false)=>kids(one(n,"pts"),"xy").map(p=>`${num(p,1)},${num(p,2)*(invert?-1:1)}`).join(" ");
 for(const wire of [...kids(root,"wire"),...kids(root,"bus")])out.push(`<polyline points="${points(wire)}" fill="none" stroke="#137c45" stroke-width="0.22"/>`);
 for(const junction of kids(root,"junction")){const at=one(junction,"at");out.push(`<circle cx="${num(at,1)}" cy="${num(at,2)}" r="0.45" fill="#137c45"/>`);}
 for(const item of [...kids(root,"label"),...kids(root,"global_label"),...kids(root,"hierarchical_label"),...kids(root,"text")]){const at=one(item,"at");out.push(txt(s(item,1),num(at,1),num(at,2)));}
 const library=new Map(kids(one(root,"lib_symbols"),"symbol").map(n=>[s(n,1),n]));
 for(const symbol of kids(root,"symbol")){
  const lib=library.get(s(one(symbol,"lib_id"),1));if(!lib)continue;
  const at=one(symbol,"at"),unit=num(one(symbol,"unit"),1)||1,angle=num(at,3);const mirror=s(one(symbol,"mirror"),1);
  out.push(`<g transform="translate(${num(at,1)} ${num(at,2)}) rotate(${-angle}) scale(${mirror==='y'?-1:1} ${mirror==='x'?-1:1})" fill="none" stroke="#713b18" stroke-width="0.2">`);
  for(const section of kids(lib,"symbol")){
   const match=s(section,1).match(/_(\d+)_(\d+)$/);if(match&&Number(match[1])!==0&&Number(match[1])!==unit)continue;if(match&&Number(match[2])>1)continue;
   for(const shape of section){if(!Array.isArray(shape))continue;
    if(shape[0]==="polyline")out.push(`<polyline points="${points(shape,true)}"/>`);
    else if(shape[0]==="rectangle"){const a=one(shape,"start"),b=one(shape,"end");out.push(`<rect x="${Math.min(num(a,1),num(b,1))}" y="${Math.min(-num(a,2),-num(b,2))}" width="${Math.abs(num(a,1)-num(b,1))}" height="${Math.abs(num(a,2)-num(b,2))}"/>`);}
    else if(shape[0]==="circle"){const c=one(shape,"center");out.push(`<circle cx="${num(c,1)}" cy="${-num(c,2)}" r="${num(one(shape,"radius"),1)}"/>`);}
    else if(shape[0]==="arc"){const a=one(shape,"start"),m=one(shape,"mid"),b=one(shape,"end");const path=arcPoints({x:num(a,1),y:num(a,2)},{x:num(m,1),y:num(m,2)},{x:num(b,1),y:num(b,2)});out.push(`<polyline points="${path.map(p=>`${p.x},${-p.y}`).join(" ")}"/>`);}
    else if(shape[0]==="pin"&& !shape.some(v=>v==="hide")){const p=one(shape,"at"),len=num(one(shape,"length"),1),r=num(p,3)*Math.PI/180,x=num(p,1),y=-num(p,2),ex=x+len*Math.cos(r),ey=y-len*Math.sin(r);out.push(`<line x1="${x}" y1="${y}" x2="${ex}" y2="${ey}"/>`);out.push(txt(s(one(shape,"number"),1),x+0.3,y-0.4,0.8));const label=s(one(shape,"name"),1);if(label&&label!=="~")out.push(txt(label,ex+0.3,ey-0.3,0.9));}
   }
  }
  out.push('</g>');
  for(const prop of kids(symbol,"property")){if(!['Reference','Value'].includes(s(prop,1)))continue;const effects=one(prop,"effects");if(s(one(effects,"hide"),1)==="yes"||effects.includes("hide"))continue;const pos=one(prop,"at");out.push(txt(s(prop,2),num(pos,1),num(pos,2),num(one(one(effects,"font"),"size"),1)||1.27));}
 }
 for(const sheet of kids(root,"sheet")){const at=one(sheet,"at"),size=one(sheet,"size");out.push(`<rect x="${num(at,1)}" y="${num(at,2)}" width="${num(size,1)}" height="${num(size,2)}" fill="none" stroke="#183048" stroke-width="0.3"/>`);for(const prop of kids(sheet,"property"))out.push(txt(s(prop,2),num(at,1),num(at,2)-1));}
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w*8}" height="${h*8}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="white"/>${out.join('')}</svg>`;
}
