# Documentación Técnica y Arquitectura del Sistema - AtentaMente

Este documento describe la arquitectura técnica, el flujo de comunicación, la gestión de roles/permisos y los flujos de despliegue de la plataforma web de gestión **AtentaMente**.

---

## 1. Arquitectura Híbrida del Sistema

El sistema utiliza una arquitectura desacoplada que combina el alojamiento estático de alto rendimiento con servicios serverless en Google Cloud (Apps Script):

* **Frontend (`index.html`)**: Alojado de forma estática mediante **GitHub Pages** en el repositorio oficial y servido a través de **Cloudflare** para enrutamiento, DNS y optimización de caché.
* **Backend (`code.gs`)**: Alojado en **Google Apps Script (GAS)** publicado como una Aplicación Web pública (`/exec`). Interactúa directamente con Google Drive (carpetas de pacientes y plantillas) y Google Sheets (base de datos relacional en la planilla `Datos`, `Carpetas_Terapeutas`, etc.).

### Comunicación Frontend <-> Backend
La comunicación no se realiza mediante recargas de página ni `google.script.run` nativo (ya que el frontend corre externamente en GitHub Pages). En su lugar, se utiliza un puente API REST basado en peticiones **HTTP POST (`fetch`)**:
1. Desde `index.html`, la función utilitaria `llamarBackend(accion, parametros, funcionExito, funcionError)` envía una petición POST al endpoint `GOOGLE_SCRIPT_URL`.
2. En `code.gs`, el manejador `doPost(e)` intercepta la petición, parsea el cuerpo JSON, ejecuta dinámicamente la función solicitada (`this[accion].apply(this, parametros)`) y retorna una respuesta JSON estandarizada (`{ estado: 'exito', respuesta: ... }`).

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
