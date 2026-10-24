# Documentación Técnica y Arquitectura del Sistema - AtentaMente

Este documento describe la arquitectura técnica, el flujo de comunicación, la gestión de roles/permisos y los flujos de despliegue de la plataforma web de gestión **AtentaMente**.

---

## 1. Arquitectura Híbrida del Sistema

El sistema utiliza una arquitectura desacoplada que combina el alojamiento estático de alto rendimiento con servicios serverless en Google Cloud (Apps Script):

* **Frontend (`index.html`)**: Alojado de forma estática mediante **GitHub Pages** en el repositorio oficial y servido a través de **Cloudflare** para enrutamiento, DNS y optimización de caché.
* **Backend (`code.gs`)**: Alojado en **Google Apps Script (GAS)** publicado como una Aplicación Web pública (`/exec`). Interactúa directamente con Google Drive (carpetas de pacientes y plantillas) y Google Sheets (base de datos relacional en la planilla `Datos`, `Carpetas_Terapeutas`, etc.).

### Comunicación Frontend <-> Backend
La comunicación se realiza mediante una arquitectura desacoplada de alto rendimiento y tolerancia a fallos a través de la función central `llamarBackend(accion, parametros, funcionExito, funcionError)`:
1. **Peticiones de lectura livianas (< 2000 caracteres)**: Se procesan mediante inyección dinámica de etiquetas `<script>` (**JSONP** con callback aleatorio único). Este mecanismo es 100% inmune a bloqueos de CORS y sigue de forma transparente las redirecciones HTTP 302 originadas por los servidores de Google Apps Script.
2. **Peticiones pesadas (subida de PDFs en base64, HTMLs extensos)**: Se transmiten mediante **HTTP POST (`fetch`)** con cabecera `Content-Type: text/plain;charset=utf-8` para evitar peticiones preflight (`OPTIONS`) que Google Apps Script no soporta.
3. **Soporte nativo (`google.script.run`)**: Si la interfaz se visualiza embebida dentro del entorno nativo de Google Apps Script (HTMLService), la función conmuta de forma automática a `google.script.run`.

---

## 2. Flujo y Protocolo de Despliegue

Dado que el código reside en dos entornos distintos, el procedimiento para reflejar cambios en producción depende de qué archivo se haya modificado:

### A. Si se modifica únicamente el Frontend (`index.html`)
1. Realizar *commit* y *push* a la rama `main` de GitHub.
2. **GitHub Pages** ejecutará un *workflow* automático (`pages-build-deployment`) que actualiza la página en unos minutos.
3. *Nota sobre caché*: Si Cloudflare o el navegador retienen la versión antigua, purgar la caché desde el panel de Cloudflare o refrescar con `Ctrl + Shift + R`.

### B. Si se modifica el Backend (`code.gs`)
1. Subir el código a GitHub como respaldo de control de versiones.
2. Copiar y pegar el código actualizado en el editor de Google Apps Script.
3. **Paso Obligatorio en GAS**:
   - Hacer clic en **Implementar (Deploy) -> Gestionar implementaciones (Manage deployments)**.
   - Editar la implementación activa (icono del lápiz ✏️).
   - En **Versión**, cambiar de la versión actual a **"Nueva versión" (New version)**.
   - Guardar/Implementar. Si no se genera una nueva versión en GAS, el endpoint `/exec` seguirá ejecutando el código antiguo indefinidamente.

---

## 3. Gestión de Roles y Permisos

El acceso a la plataforma está regulado por listas de control en `code.gs` y validaciones en la interfaz web:

| Rol | Identificadores / Correos | Nivel de Acceso y Comportamiento |
| :--- | :--- | :--- |
| **Administración General** | `coordinacionatentamente@gmail.com`, `facturacion.atte@gmail.com`, `direccion.atte@gmail.com`, `haceclick.ai@gmail.com`, `fvgatto@gmail.com`, etc. | Acceso irrestricto al 100% de la plataforma (Panel de Control, Pacientes, Facturación, Derivaciones, Informes). Pueden auditar y operar en nombre de cualquier profesional. |
| **Secretaría** | `secretaria.atte@gmail.com` | **Acceso Administrativo Especializado**: Tienen permisos de administrador (`isAdmin: true`) **exclusivamente dentro de la sección de Informes**. Se les ocultan todas las demás opciones de navegación del menú lateral y se bloquea el enrutamiento a otras pantallas. En Informes pueden auditar y gestionar reportes de cualquier terapeuta de la clínica. |
| **Prestador / Terapeuta** | Cualquier otro email registrado en la hoja `Datos` | Acceso estándar filtrado por su email. Solo pueden visualizar y gestionar los pacientes que tienen asignados y subir reportes propios. |

---

## 4. Módulo de Control de Informes (`doc-vista-control`)

La tabla de **Estado de Entregas** dentro de la sección de Informes cuenta con las siguientes características avanzadas de control y auditoría:

1. **Columna "Periodo Aprob."**:
   - Extrae en tiempo real el valor de la columna `APROBADO OS?` de la planilla `Datos`.
2. **Filtro Inteligente de Periodo (`#filter-control-aprobado`)**:
   - Menú desplegable en la cabecera de la tabla.
   - **Exclusión Automática por Defecto (`EXCLUIR_SR`)**: Al iniciar, excluye cualquier fila cuyo periodo contenga la palabra `SENT` o `RESERVA` (ej: `"SENT / SENT"`, `"RESERVA / RESERVA"`).
   - Permite alternar entre la vista por defecto, ver absolutamente `"Todos los Periodos"`, o filtrar específicamente por uno de los periodos dinámicos detectados en la base de pacientes.
3. **Indicador de Avance y Porcentaje Pendiente (`#badge-pendientes-informes`)**:
   - Etiqueta dinámica en la cabecera que calcula en tiempo real:
     $$\text{Porcentaje Pendiente} = \left( \frac{\text{Informes sin subir (columna Última Fecha vacía o '-')}}{\text{Total de informes requeridos del terapeuta}} \right) \times 100$$
   - Se muestra en **ámbar** si existen informes pendientes por realizar o en **verde** si el terapeuta está 100% al día.

---

## 5. Dualidad de Dominios y Rutas de Acceso

El sistema separa estrictamente la capa de presentación (Frontend estático en GitHub Pages) de la lógica de servicios (API REST en Google Apps Script). Es fundamental distinguir ambas direcciones para evitar confusiones operativas:

* **Dominio Oficial de Producción (Frontend Moderno)**: `https://atentamente.haceclick-ai.com` (o su equivalente `https://haceclick.github.io/AtentaMente`).
  - **Uso Obligatorio para Usuarios**: Todas las sesiones de profesionales, secretaría y administración deben ingresar a través de este dominio aportando su token de sesión en la URL (ej: `https://atentamente.haceclick-ai.com/?uid=TOKEN_USUARIO`).
  - Aquí es donde se reflejan en tiempo real los cambios de interfaz, tablas modernas, filtros de reportes y validaciones de cliente.
* **URL Nativa del Script (API Backend / Legacy)**: `https://script.google.com/macros/s/AKfycbz.../exec`
  - **Uso Exclusivo como Endpoint REST**: Esta dirección solo se utiliza en segundo plano para las peticiones `fetch()` HTTP POST desde `index.html`.
  - Si un usuario ingresa directamente a esta URL en su navegador (con o sin parámetro `?uid=`), visualizará la **versión heredada precompilada en Google Apps Script**, la cual no refleja los últimos commits ni componentes visuales desarrollados en GitHub.

---

## 6. Protocolo de Resolución de Incidencias en GitHub Pages

Debido a que el frontend se despliega automáticamente en la infraestructura de GitHub, pueden ocurrir atascos ocasionales en la cola de servidores o errores de tiempo de espera (`Timeout reached, aborting!`) durante la construcción del sitio.

### A. Migración al Motor Moderno (`GitHub Actions`)
Para evitar los fallos y demoras recurrentes del motor heredado de GitHub (*"Deploy from a branch"*), el repositorio incluye el archivo de flujo de trabajo `.github/workflows/static.yml`.

**Configuración en Repositorio**:
1. Ir a la pestaña **Settings** (Configuración) -> menú izquierdo **Pages**.
2. En **Build and deployment -> Source**, cambiar el desplegable a **"GitHub Actions"**.
3. Al guardar, GitHub ejecuta el flujo optimizado (`Deploy static content to Pages`), que sube los artefactos estáticos en pocos segundos sin pasar por la cola de construcción interna heredada.

### B. Procedimiento de Destrabe Rápido (*Toggle Reset*)
Si una ejecución queda colgada en estado `Queued` o arroja el error *"Falló al cancelar"* en la pestaña **Actions**:
1. Entrar a **Settings -> Pages**.
2. Alternar temporalmente la opción **Source** (ej: cambiar de *"Deploy from a branch"* a *"GitHub Actions"*, o viceversa).
3. Guardar el cambio, esperar 10 segundos y restaurar la opción deseada.
4. Este cambio destruye el bloqueo interno (*deadlock*) del entorno `github-pages` en los servidores de GitHub y fuerza un nuevo despliegue limpio e inmediato.

---

## 7. Arquitectura de Carga Asíncrona y Rendimiento (Lazy Loading & Background Processing)

Para maximizar la velocidad percibida y reducir drásticamente el tiempo de inicio de la plataforma (de ~8 segundos a menos de 2 segundos), el sistema implementa una estrategia de carga por capas desacoplada:

### A. Arranque Ultra Rápido (`getAppData`)
- Al procesar el acceso del usuario mediante su `uid`, la función `getAppData` **excluye por completo la lectura y análisis de la hoja `Facturas`**.
- Únicamente procesa las entidades esenciales para renderizar la pantalla inicial:
  1. Perfil del usuario autenticado y roles (`isAdmin`, `isSecretaria`).
  2. Base de pacientes asignados y vencimientos normativos (RNP y Seguro).
  3. Mapeo de carpetas de Drive y firmas de terapeutas.
  4. Cartelera de notificaciones activas.
- El spinner de carga de pantalla completa (`#loader`) se oculta inmediatamente, dejando la interfaz 100% interactiva en menos de 2 segundos.

### B. Cálculo Estadístico Financiero en Segundo Plano (`getFacturasData`)
- **Para Terapeutas / Prestadores**:
  - Al iniciar el Dashboard, los widgets de *Ingresos Estimados* y *Facturación Mensual* muestran un estado suave de carga (*"Calculando métricas en segundo plano..."*).
  - A los 300 ms de haberse pintado la aplicación, se dispara de manera asíncrona la petición `llamarBackend('getFacturasData', ...)`.
  - Esta función procesa la hoja `Facturas`, analiza las fechas de emisión y cobro, calcula los promedios de demora por Obra Social y genera las métricas.
  - Al responder el backend, una función reactiva (`renderDashboardFinanzas()`) rellena los valores y genera las barras del gráfico dinámicamente sin recargar la página ni congelar la interacción del terapeuta.
- **Para Administradores y Secretaría**:
  - Por especificación de diseño, los administradores no requieren el cálculo de KPIs estadísticos de demoras personales.
  - El servidor devuelve inmediatamente estructuras vacías, ahorrando el 100% del tiempo de cómputo en la nube de Google Cloud.

### C. Carga Bajo Demanda de Facturas (*Lazy Loading*)
- El listado histórico de facturas no se traslada a la memoria del cliente hasta que el usuario hace clic en la pestaña **"Mis Facturas"** (`nav('misfacturas')`).
- Si las facturas ya fueron procesadas por la tarea en segundo plano, se muestran al instante; de lo contrario, se renderiza un spinner puntual dentro de la tabla mientras finaliza la descarga.

### D. Carga Diferida de Plantillas de Informes (`misTemplates`)
- La función `asegurarTemplatesCargados()` pospone la sincronización de las plantillas maestras y personalizadas (`getTemplates`) para que se ejecute en segundo plano tras el arranque, o al momento exacto en que el terapeuta ingresa al módulo de **Documentación Clínica**.

---

## 8. Sistema de Auto-reparación y Validación de Carpetas Drive (Anti-Cruce de Pacientes)

Un problema recurrente en sistemas basados en hojas de cálculo compartidas es el corrimiento o desfasaje accidental de filas en la columna `ID DRIVE`, lo que históricamente provocaba que los informes médicos se almacenaran en la carpeta de un paciente equivocado.

Para erradicar este riesgo, el backend incorpora un algoritmo de **verificación y autorreparación (*self-healing*) de un solo paso**:

### A. Algoritmo de Doble Verificación en Guardado y Subida
Cada vez que se ejecuta `guardarDocumentoClinico` o `subirInformePropio`:
1. **Comprobación de ID Existente**: Se extrae el ID de Drive provisto y se consulta el nombre real de la carpeta en Google Drive (`folder.getName()`).
2. **Evaluación de Coincidencia (`coincideNombrePacienteConCarpeta`)**: Se normalizan los nombres (mayúsculas, remoción de acentos y sufijos de Obra Social) y se valida si el nombre del paciente coincide o está contenido en el nombre de la carpeta.

### B. Auto-resolución Lineal (*Self-Healing*)
Si el ID no coincide, está corrupto o apunta a otro paciente:
1. El backend busca de inmediato en la carpeta raíz oficial (`ID_CARPETA_RAIZ_PACIENTES`) por el nombre exacto del paciente o su raíz de afiliado.
2. Si encuentra la carpeta legítima:
   - Toma el ID real de Google Drive.
   - **Repara de forma automática la celda `ID DRIVE`** en la hoja `Datos` de la planilla para ese paciente.
   - Guarda el archivo PDF dentro de la carpeta corregida (`Año/Informes_semestrales_...`).
   - Retorna en la respuesta el parámetro `idDriveActualizado`, permitiendo que el frontend sincronice el ID en su memoria local (`CACHE_DATA.pacientes`) sin requerir reinicio de sesión.
   - Muestra una notificación informativa en verde: *"PDF guardado (Se corrigió y vinculó la carpeta de Drive automáticamente)"*.

### C. Garantía Matemática contra Bucles Infinitos (*Loop Protection*)
- Si la carpeta tampoco existe en la raíz de Google Drive, el backend **aborta de forma terminante la operación** con una alerta de seguridad explícita:
  `"ALERTA DE SEGURIDAD: La carpeta en Google Drive para el paciente '...' no coincide con el ID registrado y tampoco fue encontrada en la raíz. Se canceló el guardado para evitar cruce de informes."`
- Al ejecutarse como una secuencia estrictamente lineal de un solo paso dentro del backend (Validar ID -> Buscar por nombre -> Guardar o Abortar), no existen recursiones ni reintentos cruzados cliente-servidor que puedan generar bucles infinitos.