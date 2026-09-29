# XE Game Viewer

Visor de boardview, capas de Photoshop, fotos superpuestas y diagramas. Los archivos se almacenan en tu navegador (IndexedDB); no se envían a un servidor.

## Probar en computadora

Instala Node.js 22 o superior y ejecuta `npm ci` y `npm run dev`. Abre http://localhost:8080.

## Publicar desde GitHub

Sube **el contenido de esta carpeta** a la raíz del repositorio (`package.json`, `index.html`, `src/` y `.github/` deben verse en la raíz). En **Settings → Pages → Build and deployment**, elige **GitHub Actions**. El flujo **Publicar XE Game Viewer** compilará y publicará automáticamente cada cambio en `main` o `master`. La URL será `https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`.

Abrir el repositorio de código en GitHub por sí solo no ejecuta la aplicación.

## Compatibilidad

Admite BRD, BRD2, BVR, XinZhiZao PCB, GenCAD, ASCII de Altium, CSV, JSON, PNG/JPG/WEBP, PDF/SVG y PSD/PSB según el soporte del parser. Algunos `.pcb` de otros fabricantes y formatos cifrados pueden no ser compatibles.
