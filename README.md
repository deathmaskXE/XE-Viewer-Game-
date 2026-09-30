# XE Game Viewer

Visor de boardview, capas de Photoshop, fotos superpuestas y diagramas. Los archivos se almacenan en tu navegador (IndexedDB); no se envían a un servidor.

## Probar en computadora

Instala Node.js 22 o superior y ejecuta `npm ci` y `npm run dev`. Abre http://localhost:8080.

## Publicar desde GitHub

Sube **el contenido de esta carpeta** a la raíz del repositorio (`package.json`, `index.html`, `src/` y `.github/` deben verse en la raíz). En **Settings → Pages → Build and deployment**, elige **GitHub Actions**. El flujo **Publicar XE Game Viewer** compilará y publicará automáticamente cada cambio en `main` o `master`. La URL será `https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`.

Abrir el repositorio de código en GitHub por sí solo no ejecuta la aplicación.

## Compatibilidad

Admite BRD, BRD2, BVR, XinZhiZao PCB, GenCAD, ASCII de Altium, CSV, JSON, PNG/JPG/WEBP, PDF/SVG y PSD/PSB según el soporte del parser. Algunos `.pcb` de otros fabricantes y formatos cifrados pueden no ser compatibles.

## Carpetas

**Abrir carpeta** permite elegir una carpeta normal, sin comprimirla, en Chrome o Edge. También puedes arrastrarla desde el explorador de archivos a la página. El visor recorre las subcarpetas y muestra PNG, JPG, WEBP, GIF, BMP y PDF en una galería. Toca una miniatura para abrirla; al cerrar la vista regresas a la galería. Se guarda una copia local en este navegador. Al abrir un archivo suelto, el visor crea un proyecto nuevo y cierra la vista anterior para evitar que las imágenes se superpongan. Si seleccionas una placa y una foto juntas, la foto sí se usa como overlay de esa placa.

## Zoom

En la placa usa los botones +/− o la rueda del mouse; **Encuadrar** vuelve a mostrar la placa completa. En el panel de PSD, imágenes y PDF también hay controles +/− y **Encuadrar**. En PSD e imágenes puedes arrastrar la vista después de acercar.

## Traducción de texto en imágenes

Abre una imagen, PSD o PDF y pulsa **Traducir**. Elige el idioma original y el idioma de destino (español por defecto), pulsa **Leer texto** y revisa/corrige lo reconocido. Después pulsa **Traducir texto**. Se incluyen inglés, español, portugués, francés, alemán, italiano, japonés, coreano, chino simplificado y ruso. En los PDF puedes indicar la página; si es escaneada, se aplica OCR. También aparece el botón de traducción junto a cada overlay.

El OCR se ejecuta en el navegador con Tesseract.js y descarga los datos del idioma en el primer uso. Chrome de escritorio puede traducir con su modelo local; en otros navegadores o si el modelo no está disponible, el botón de traducción usa MyMemory. En ese caso se envía solo el texto detectado, nunca el archivo de imagen. El servicio externo requiere conexión y puede tener límites de uso.

### Giro y contornos
Los botones de giro cambian la orientación del boardview en pasos de 90°. El contorno corresponde a la placa y depende de las líneas incluidas en el archivo; no representa la carcasa completa del control o consola. Los PCB XZZ conservan sus bordes y curvas en vez de reemplazarlos por un rectángulo.

Los `.bin` se reconocen por su contenido si usan un formato ya compatible (XZZ, BRD, BVR, JSON, etc.). Los BIN de firmware o de formatos propietarios desconocidos requieren otro lector y muestran un aviso.
