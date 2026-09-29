# XE Game Viewer

Visor de boardview, overlays y diagramas. Abre `.brd`, BRD2, `.bvr`, GenCAD, ASCII de Altium, CSV y JSON. Las fotos (PNG, JPG, WEBP) se alinean encima de la placa. Los diagramas son PDF o SVG.

Los archivos que abras se quedan en el navegador (IndexedDB). No se suben a ningún servidor.

## Arranque

```bash
npm install
npm run dev
```

La app queda en el puerto 8080.

## Scripts

- `npm run dev` — desarrollo
- `npm run build` — build de producción
- `npm run typecheck` — comprobación de tipos
