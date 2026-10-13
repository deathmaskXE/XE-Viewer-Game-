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

### NexusBV web
La pestaña NexusBV carga https://web.nexusbv.net/ en una vista integrada. Depende de la disponibilidad y permisos de incrustación del sitio externo. Abrir aparte permite usarlo en otra pestaña si está bloqueado. Cada visor administra sus archivos de manera independiente; no se transfieren automáticamente archivos de XE a NexusBV. La pestaña conserva su sesión mientras alternas entre visores, hasta recargar la página.

### KiCad
Abre placas .kicad_pcb de formato S-expression, incluidas las variantes module y footprint. Importa referencias, posiciones, rotaciones, pads como puntos, redes, pistas, vías y bordes Edge.Cuts (líneas, rectángulos, polígonos, círculos y arcos). La vista es simplificada: no reproduce las formas exactas de todos los pads, zonas de cobre, capas gráficas completas ni modelos 3D. Los proyectos .kicad_pro solo contienen configuración; se aceptan junto con los archivos del proyecto, pero no generan una vista. El formato BRD antiguo de KiCad no está implementado.

### Comparar y esquemas
Con una placa abierta, pulsa Comparar diagrama y elige PSD, PDF, imagen o .kicad_sch. Se abre al lado con zoom independiente; en pantallas pequeñas se apilan las vistas. El lector de esquemas KiCad muestra símbolos incrustados, cables, etiquetas y referencias en una vista SVG ampliable. Es una representación simplificada: no sustituye al editor KiCad ni carga automáticamente las hojas externas de un esquema jerárquico. Los PDF tienen selector de páginas.


## Vista completa y sincronización
- Archivos de imagen/PDF/PSD se abren en el espacio completo del visor, con opción de vista dividida.
- Las dos caras se arrastran en la misma dirección visual con ratón y táctil.


## Ventanas independientes (octubre 2026)
- El primer documento (imagen, PSD/PSB, PDF, SVG) se abre en vista completa del área de trabajo.
- Al abrir un segundo documento desde Abrir o desde el botón de una ventana, se activa la vista dividida con el anterior a la izquierda y el nuevo a la derecha.
- Cada ventana dispone de Abrir archivo, Abrir carpeta y Elegir archivo. Cada una mantiene sus propios controles de zoom, arrastre, página PDF y capas PSD.
- Los documentos adicionales se guardan dentro del proyecto activo para poder seleccionarlos independientemente.
- La vista dividida también puede mostrar el BoardView a la izquierda y un documento a la derecha.
- No se ha ejecutado compilación de producción: faltan dependencias de npm en el entorno offline. Revisar con `npm ci && npm run typecheck && npm run build`.


## Capas de BoardView
En cada cara se incluye el menú CAPAS para mostrar u ocultar componentes, cobre frontal, cobre trasero, pads, vías/testpoints y contorno. El botón de barra superior alterna capas sincronizadas e independientes. Las redes GND con nombre identificable se dibujan negras con brillo azul marino. Las capas disponibles dependen de los metadatos que el archivo origen proporciona; pistas sin información de cara se ocultan al desactivar una de las capas de cobre.
