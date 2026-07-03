/**
 * CONFIGURACIÓN GLOBAL
 */
const ID_CARPETA_RAIZ_PACIENTES = '10ARFltBUIgGUAJJ-vex2lXPrQ2yj1AWU';
const ID_PLANILLA = '1aG_jW0LRZpWBYvue-81pAiU7oLFIEPM-gFhbnaeWHto'; 
const ID_LOGIN_PLANILLA = '1NaHNrLrGWE1IKaRtPM58825mcBzUTA4vG8QRNqF4grs'; 

const NOMBRE_HOJA_DATOS = 'Datos';
const NOMBRE_HOJA_CONFIG = 'Carpetas_Terapeutas';
const NOMBRE_HOJA_HC = 'HISTORIA_CLINICA';
const NOMBRE_HOJA_FACTURAS = 'Facturas'; 
const NOMBRE_HOJA_NOTIFICACIONES = 'Notificaciones';

// Correos Administradores
const ADMIN_EMAILS = [
  'coordinacionatentamente@gmail.com',
  'facturacion.atte@gmail.com',
  'direccion.atte@gmail.com',
  'haceclick.ai@gmail.com',
  'matias.bote@gmail.com',
  'fvgatto@gmail.com'
]; 

// Correos Secretaría (sólo acceso a Informes en modo administrador)
const SECRETARIA_EMAILS = [
  'secretaria.atte@gmail.com'
]; 

function doGet(e) {
  const emailIngreso = (e && e.parameter && e.parameter.uid) ? e.parameter.uid : '';
  const template = HtmlService.createTemplateFromFile('index');
  template.emailInyectado = emailIngreso || ""; 
  return template.evaluate().setTitle('Atentamente').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);  
}

function getColIndex(headers, possibleNames) {
  if (!headers || !Array.isArray(headers)) return -1;
  const regexSpace = new RegExp('\\s', 'g');
  const normalizedHeaders = headers.map(h => String(h).toLowerCase().replace(regexSpace, '').trim());
  for (let name of possibleNames) {
    const idx = normalizedHeaders.indexOf(name.toLowerCase().replace(regexSpace, '').trim());
    if (idx > -1) return idx;
  }
  return -1;
}

// --- 1. TRADUCTOR DE FECHAS (Formato MM/DD/YYYY) ---
function parseDateServer(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  
  let str = String(dateStr).trim();
  let d = null;
  
  if (str.includes('/')) {
    const parts = str.split('/');
    // Lee formato Estadounidense: parts[0]=Mes, parts[1]=Día, parts[2]=Año
    if (parts.length === 3) d = new Date(parts[2], parts[0] - 1, parts[1]);
  } else if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) d = new Date(parts[0], parts[1] - 1, parts[2]);
  }
  
  if (d && !isNaN(d.getTime())) return d;
  return null;
}

// --- 2. TRADUCTOR DE MONEDA (Transforma "166.036,00" a 166036.00) ---
function parseMoneyServer(valor) {
    if (!valor) return 0;
    if (typeof valor === 'number') return valor;
    
    let str = String(valor).trim();
    str = str.replace(/\./g, ''); // Quita puntos de miles
    str = str.replace(/,/g, '.'); // Cambia coma decimal por punto
    str = str.replace(/[^\d.-]/g, ''); // Quita cualquier signo de $ extra o letras
    
    let num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}

function getAppData(tokenDelFrontend) {
  try {
    let userEmail = '';
    if (tokenDelFrontend && String(tokenDelFrontend).trim() !== "") {
        userEmail = obtenerEmailPorToken(tokenDelFrontend);
        if (!userEmail) throw new Error("Acceso denegado: El código de seguridad es inválido.");
    } else {
        const rawSessionEmail = Session.getActiveUser().getEmail();
        userEmail = rawSessionEmail ? String(rawSessionEmail).trim().toLowerCase() : '';
        if (!userEmail) throw new Error("Acceso denegado: Contactá al administrador del sitio.");
    }
    
    const isSecretaria = SECRETARIA_EMAILS.some(e => e.trim().toLowerCase() === userEmail);
    const isAdmin = ADMIN_EMAILS.some(e => e.trim().toLowerCase() === userEmail) || isSecretaria;
    let isFlavia = (userEmail === 'fvgatto@gmail.com');
    let userDisplayName = userEmail; 
    let currentUserInfo = { nombre: '', titulo: '', matricula: '' };
    const ss = SpreadsheetApp.openById(ID_PLANILLA);
    
    // --- 1. DATOS PACIENTES Y PROFESIONALES ---
    const sheetDatos = ss.getSheetByName(NOMBRE_HOJA_DATOS);
    if (!sheetDatos) throw new Error(`No se encontró la hoja "${NOMBRE_HOJA_DATOS}"`);
    
    const lastRowDatos = sheetDatos.getLastRow();
    let dataDatos = [];
    if (lastRowDatos > 0) dataDatos = sheetDatos.getRange(1, 1, lastRowDatos, sheetDatos.getLastColumn()).getDisplayValues();
    const headersDatos = dataDatos.length > 0 ? dataDatos[0] : [];
    
    const idxEmail = getColIndex(headersDatos, ['E-MAIL', 'EMAIL']);
    const idxPrestador = getColIndex(headersDatos, ['PRESTADOR']);
    const idxTituloPrestador = getColIndex(headersDatos, ['Prestadores.TITULO', 'TITULO', 'CARGO']);
    const idxPaciente = getColIndex(headersDatos, ['PACIENTE_OS', 'PACIENTE']);
    const idxAprobado = getColIndex(headersDatos, ['APROBADO OS?', 'APROBADO']);
    const idxVtoRNP = getColIndex(headersDatos, ['VENCIMIENTO R.N.P', 'RNP']);
    const idxVtoSeguro = getColIndex(headersDatos, ['VENCIMIENTO SEGURO', 'SEGURO']);
    const idxIdDrive = getColIndex(headersDatos, ['ID DRIVE', 'ID_DRIVE']);
    const idxDni = getColIndex(headersDatos, ['DNI', 'DOCUMENTO']);
    const idxAfiliado = getColIndex(headersDatos, ['N° AFILIADO PACIENTE', 'NRO AFILIADO', 'AFILIADO']);
    const idxDx = getColIndex(headersDatos, ['DX GENERAL', 'DIAGNOSTICO', 'DX']);
    const idxCelular = getColIndex(headersDatos, ['CEL CONTACTO', 'CELULAR TUTOR', 'TELEFONO', 'CELULAR']);
    const idxMatricula = getColIndex(headersDatos, ['MATRICULA']); 

    if (idxPrestador > -1 && idxEmail > -1) {
         const flaviaRow = dataDatos.slice(1).find(r => {
             const p = r[idxPrestador] ? String(r[idxPrestador]).toUpperCase() : '';
             return p.includes('FLAVIA') && p.includes('GATTO');
         });
         if (flaviaRow && flaviaRow[idxEmail] && String(flaviaRow[idxEmail]).trim().toLowerCase() === userEmail) isFlavia = true;
    }

    const userRow = dataDatos.slice(1).find(function(row) {
      return (idxEmail > -1 && row[idxEmail]) ? String(row[idxEmail]).trim().toLowerCase() === userEmail : false;
    });

    if (userRow && idxPrestador > -1 && userRow[idxPrestador]) {
        currentUserInfo.nombre = userRow[idxPrestador];
        userDisplayName = userRow[idxPrestador];
        if (idxTituloPrestador > -1 && userRow[idxTituloPrestador]) currentUserInfo.titulo = userRow[idxTituloPrestador];
        if (idxMatricula > -1 && userRow[idxMatricula]) currentUserInfo.matricula = userRow[idxMatricula];
    } else if (isAdmin) {
        currentUserInfo.nombre = isSecretaria ? 'Secretaría' : 'Administrador';
        userDisplayName = isSecretaria ? 'Secretaría' : 'Administrador';
        currentUserInfo.titulo = isSecretaria ? 'Gestión de Informes' : 'Acceso Total';
    } else {
        currentUserInfo.nombre = 'Profesional';
    }

    let esp = "General";
    const tLower = (currentUserInfo.titulo || "").toLowerCase();
    if(tLower.includes("psicopedagog")) esp = "Psicopedagogía";
    else if(tLower.includes("ocupacional") || tLower.includes("terapista")) esp = "Terapia Ocupacional";
    else if(tLower.includes("fonoaudiolog")) esp = "Fonoaudiología";
    else if(tLower.includes("psicolog")) esp = "Psicología";
    else if(tLower.includes("musicoterap")) esp = "Musicoterapia";
    currentUserInfo.especialidad = esp;

    const isCoordinacion = userEmail === 'coordinacionatentamente@gmail.com';

    const pacientesFiltrados = dataDatos.slice(1).filter(row => {
      if (!row[0]) return false;
      if (isAdmin) return true; // Administradores ven la base completa para auditar
      const rowEmail = (idxEmail > -1 && row[idxEmail]) ? String(row[idxEmail]).trim().toLowerCase() : '';
      return rowEmail === userEmail.toLowerCase();
    }).map(row => ({
        paciente: (idxPaciente > -1) ? row[idxPaciente] : 'Sin Nombre',
        aprobado: (idxAprobado > -1) ? row[idxAprobado] : '-',
        prestador: (idxPrestador > -1) ? row[idxPrestador] : '',
        prestadorTitulo: (idxTituloPrestador > -1) ? row[idxTituloPrestador] : '', 
        vtoRNP: (idxVtoRNP > -1) ? row[idxVtoRNP] : '',
        vtoSeguro: (idxVtoSeguro > -1) ? row[idxVtoSeguro] : '',
        idDrive: (idxIdDrive > -1) ? row[idxIdDrive] : '',
        dni: (idxDni > -1) ? row[idxDni] : '-',
        afiliado: (idxAfiliado > -1) ? row[idxAfiliado] : '-',
        dx: (idxDx > -1) ? row[idxDx] : '-',
        telefono: (idxCelular > -1) ? row[idxCelular] : '' 
    }));

    // --- 2. CONFIGURACIÓN CARPETAS Y FIRMAS ---
    const sheetConfig = ss.getSheetByName(NOMBRE_HOJA_CONFIG);
    let carpetas = { horarios: '', documentacion: '', instructivos: '' };
    let firmaUrl = '';
    let emailToFirma = {};

    if (sheetConfig) {
        const lastRowConfig = sheetConfig.getLastRow();
        if(lastRowConfig > 0) {
            const dataConfig = sheetConfig.getRange(1, 1, lastRowConfig, sheetConfig.getLastColumn()).getDisplayValues();
            const richTextConfig = sheetConfig.getRange(1, 1, lastRowConfig, sheetConfig.getLastColumn()).getRichTextValues();
            const hConfig = dataConfig[0];
            const idxConfEmail = getColIndex(hConfig, ['E-MAIL', 'EMAIL']);
            const idxHorarios = getColIndex(hConfig, ['ID GOOGLE DRIVE_HORARIOS', 'HORARIOS']);
            const idxPrestadorConf = getColIndex(hConfig, ['ID GOOGLE DRIVE_PRESTADOR', 'ID_PRESTADOR']);
            const idxInstructivos = getColIndex(hConfig, ['ID GOOGLE DRIVE_INSTRUCTIVOS', 'INSTRUCTIVOS']);
            const idxFirma = getColIndex(hConfig, ['FIRMA', 'FIRMA URL']);
            const idxNombreTerapeuta = getColIndex(hConfig, ['TERAPEUTA', 'PROFESIONAL', 'PRESTADOR']);
            
            this.nombreToFirma = {}; // Fallback map
            
            for(let i=1; i<dataConfig.length; i++) {
                let fUrl = idxFirma > -1 ? dataConfig[i][idxFirma] : '';
                if (idxFirma > -1 && richTextConfig[i] && richTextConfig[i][idxFirma] && richTextConfig[i][idxFirma].getLinkUrl()) {
                    fUrl = richTextConfig[i][idxFirma].getLinkUrl();
                }
                if (idxConfEmail > -1 && dataConfig[i][idxConfEmail]) {
                    emailToFirma[String(dataConfig[i][idxConfEmail]).toLowerCase().trim()] = fUrl;
                }
                if (idxNombreTerapeuta > -1 && dataConfig[i][idxNombreTerapeuta]) {
                    this.nombreToFirma[String(dataConfig[i][idxNombreTerapeuta]).toLowerCase().trim()] = fUrl;
                }
            }

            let rowConfIndex = dataConfig.findIndex(r => r[idxConfEmail] && String(r[idxConfEmail]).trim().toLowerCase() === userEmail);
            if (rowConfIndex === -1 && idxNombreTerapeuta > -1 && userDisplayName) {
                 rowConfIndex = dataConfig.findIndex(r => r[idxNombreTerapeuta] && String(r[idxNombreTerapeuta]).trim().toLowerCase() === userDisplayName.toLowerCase().trim());
            }

            let rowConf = rowConfIndex > -1 ? dataConfig[rowConfIndex] : undefined;
            if (!rowConf && isAdmin && dataConfig.length > 1) {
                let rowFallback = dataConfig[1];
                carpetas.horarios = idxHorarios > -1 ? rowFallback[idxHorarios] : '';
                carpetas.documentacion = idxPrestadorConf > -1 ? rowFallback[idxPrestadorConf] : '';
                carpetas.instructivos = idxInstructivos > -1 ? rowFallback[idxInstructivos] : '';
            }
            if (rowConf) {
                carpetas.horarios = idxHorarios > -1 ? rowConf[idxHorarios] : '';
                carpetas.documentacion = idxPrestadorConf > -1 ? rowConf[idxPrestadorConf] : '';
                carpetas.instructivos = idxInstructivos > -1 ? rowConf[idxInstructivos] : '';
                firmaUrl = idxFirma > -1 ? rowConf[idxFirma] : '';
                if (idxFirma > -1 && richTextConfig[rowConfIndex] && richTextConfig[rowConfIndex][idxFirma] && richTextConfig[rowConfIndex][idxFirma].getLinkUrl()) {
                    firmaUrl = richTextConfig[rowConfIndex][idxFirma].getLinkUrl();
                }
            }
        }
    }

    let prestadoresInfo = {};
    if (isAdmin) {
        for(let i=1; i<dataDatos.length; i++) {
            const pres = (idxPrestador > -1) ? dataDatos[i][idxPrestador] : '';
            const em = (idxEmail > -1) ? String(dataDatos[i][idxEmail]).toLowerCase().trim() : '';
            if (pres && !prestadoresInfo[pres]) {
                let fUrl = '';
                if (em && emailToFirma[em]) fUrl = emailToFirma[em];
                else if (this.nombreToFirma && this.nombreToFirma[String(pres).toLowerCase().trim()]) fUrl = this.nombreToFirma[String(pres).toLowerCase().trim()];

                prestadoresInfo[pres] = {
                    nombre: pres,
                    titulo: (idxTituloPrestador > -1) ? dataDatos[i][idxTituloPrestador] : '',
                    matricula: (idxMatricula > -1) ? dataDatos[i][idxMatricula] : '',
                    firmaUrl: fUrl
                };
            }
        }
    }

    // --- LECTURA DE DOCUMENTOS CLÍNICOS PARA LA TABLA DE CONTROL ---
    let docClinicos = [];
    const sheetDocs = ss.getSheetByName('Documentos_Clinicos');
    if (sheetDocs) {
        const dDocs = sheetDocs.getDataRange().getDisplayValues();
        if (dDocs.length > 1) {
            docClinicos = dDocs.slice(1).map(r => ({ fecha: r[1], tipo: r[2], especialidad: r[3], paciente: r[4], prestador: r[5], url: r[6], html: r[7] || "" }));
        }
    }

    // --- 3. FACTURAS Y ESTADÍSTICAS ---
    let facturasList = [];
    let financialStats = { estimatedIncome: 0, monthlyBilling: [0, 0, 0], breakdown: {}, avgDelays: {} };

    const sheetFacturas = ss.getSheetByName(NOMBRE_HOJA_FACTURAS);
    if (sheetFacturas) {
      const lastRowF = sheetFacturas.getLastRow();
      if (lastRowF > 1) {
          const dataF = sheetFacturas.getRange(1, 1, lastRowF, sheetFacturas.getLastColumn()).getDisplayValues();
          const hF = dataF[0];
          const idxF_Email = getColIndex(hF, ['E-MAIL', 'EMAIL']);
          const idxF_Terapeuta = getColIndex(hF, ['TERAPEUTA', 'PROFESIONAL', 'PRESTADOR']);
          const idxF_Paciente = getColIndex(hF, ['PACIENTE']);
          const idxF_OS = getColIndex(hF, ['RAZON SOCIAL', 'OBRA SOCIAL']);
          const idxF_Mes = getColIndex(hF, ['MES']);
          const idxF_Monto = getColIndex(hF, ['FACTURACION', 'IMPORTE']);
          const idxF_Fecha = getColIndex(hF, ['FECHA DE FACTURA', 'FECHA FACTURA']);
          const idxF_Num = getColIndex(hF, ['N° FACTURA', 'NUMERO', 'FACTURA']);
          const idxF_Cobro = getColIndex(hF, ['FECHA DE COBRO', 'FECHA COBRO']);
          const idxF_Estado = getColIndex(hF, ['APROBACIÓN', 'ESTADO']);

          const now = new Date();
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();
          let allRelevantInvoices = [];
          
          for(let i=1; i<dataF.length; i++) {
          const row = dataF[i];
          if(row.join('').trim() === '') continue;

          const rowTerapeuta = (idxF_Terapeuta > -1 && row[idxF_Terapeuta]) ? String(row[idxF_Terapeuta]).trim() : 'Sin Nombre';
          const rowEmail = (idxF_Email > -1 && row[idxF_Email]) ? String(row[idxF_Email]).trim().toLowerCase() : '';
          const myEmail = userEmail.toLowerCase();
          const myName = String(currentUserInfo.nombre).trim().toLowerCase();

          // Filtramos para las estadísticas: solo lo que coincida con el mail o nombre del usuario
          const esPropio = (rowEmail === myEmail || rowTerapeuta.toLowerCase() === myName);
          
          if (!esPropio && (!isAdmin || rowEmail !== myEmail)) {
              if (!isAdmin) continue; 
          }

              const fechaFacturaStr = (idxF_Fecha > -1) ? row[idxF_Fecha] : '';
              const fechaCobroStr = (idxF_Cobro > -1) ? row[idxF_Cobro] : '';
              allRelevantInvoices.push({
                  rawRow: row,
                  fechaFactura: parseDateServer(fechaFacturaStr),
                  fechaCobro: parseDateServer(fechaCobroStr),
                  monto: (idxF_Monto > -1) ? parseMoneyServer(row[idxF_Monto]) : 0,
                  razonSocial: (idxF_OS > -1) ? row[idxF_OS] : 'PARTICULAR',
                  prestador: rowTerapeuta, 
                  fechaFacturaStr,
                  fechaCobroStr,
                  mes: (idxF_Mes > -1) ? row[idxF_Mes] : '',
                  nFactura: (idxF_Num > -1) ? row[idxF_Num] : '',
                  paciente: (idxF_Paciente > -1) ? row[idxF_Paciente] : '',
                  aprobacion: (idxF_Estado > -1) ? row[idxF_Estado] : ''
              });
          }

          const delaysByOS = {};
          const delaysByPrestadorOS = {};
          allRelevantInvoices.forEach(inv => {
              if (inv.fechaCobro && inv.fechaFactura) {
                   const diffTime = inv.fechaCobro.getTime() - inv.fechaFactura.getTime();
                   const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                   if (diffDays >= 0 && diffDays < 365) {
                       if (!delaysByOS[inv.razonSocial]) delaysByOS[inv.razonSocial] = { total: 0, count: 0 };
                       delaysByOS[inv.razonSocial].total += diffDays;
                       delaysByOS[inv.razonSocial].count += 1;
                       const keyPrestador = inv.razonSocial + '|' + inv.prestador;
                       if (!delaysByPrestadorOS[keyPrestador]) delaysByPrestadorOS[keyPrestador] = { total: 0, count: 0 };
                       delaysByPrestadorOS[keyPrestador].total += diffDays;
                       delaysByPrestadorOS[keyPrestador].count += 1;
                   }
              }
          });

          const avgDelays = {};
          for (const os in delaysByOS) avgDelays[os] = Math.round(delaysByOS[os].total / delaysByOS[os].count);
          const avgDelaysPrestador = {};
          for (const key in delaysByPrestadorOS) avgDelaysPrestador[key] = Math.round(delaysByPrestadorOS[key].total / delaysByPrestadorOS[key].count);
          financialStats.avgDelays = avgDelays;

          const mesesNombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
          const parseMesAnio = (str) => {
              str = String(str).toLowerCase().trim();
              let mIndex = -1;
              for (let i = 0; i < mesesNombres.length; i++) {
                 if (str.includes(mesesNombres[i]) || (mesesNombres[i] === 'septiembre' && str.includes('setiembre'))) { mIndex = i; break; }
              }
              const anioMatch = str.match(/\d{4}/);
              if (mIndex > -1 && anioMatch) return new Date(parseInt(anioMatch[0]), mIndex, 1);
              return null;
          };

          let uniqueMonthsMap = {};
          allRelevantInvoices.forEach(inv => {
             const d = parseMesAnio(inv.mes);
             if (d) {
                 const key = d.getTime(); 
                 if(!uniqueMonthsMap[key]) uniqueMonthsMap[key] = { mes: mesesNombres[d.getMonth()], anio: String(d.getFullYear()), timestamp: key };
             }
          });

          let sortedMonths = Object.values(uniqueMonthsMap).sort((a, b) => b.timestamp - a.timestamp);
          const targets = sortedMonths.slice(0, 3); 

          allRelevantInvoices.forEach(inv => {
              // 1. Identificamos si la factura es del usuario conectado
              const invEmail = (idxF_Email > -1 && inv.rawRow[idxF_Email]) ? String(inv.rawRow[idxF_Email]).trim().toLowerCase() : '';
              const myEmail = userEmail.toLowerCase();
              const myName = String(currentUserInfo.nombre).trim().toLowerCase();
              const isMyInvoice = (invEmail === myEmail || inv.prestador.toLowerCase() === myName);

              // 2. Solo sumamos plata e inflamos gráficos si la factura ME pertenece
              if (isMyInvoice) {
                  // Lógica del gráfico de barras mensual
                  const mesStr = String(inv.mes).trim().toLowerCase();
                  const coincide = (texto, target) => {
                      const tieneMes = (target.mes === 'septiembre') ? (texto.includes('septiembre') || texto.includes('setiembre')) : texto.includes(target.mes);
                      return tieneMes && texto.includes(target.anio);
                  };

                  if (targets.length > 0 && coincide(mesStr, targets[0])) financialStats.monthlyBilling[0] += inv.monto;
                  else if (targets.length > 1 && coincide(mesStr, targets[1])) financialStats.monthlyBilling[1] += inv.monto;
                  else if (targets.length > 2 && coincide(mesStr, targets[2])) financialStats.monthlyBilling[2] += inv.monto;

                  // Lógica de Ingresos Estimados (Mes actual)
                  let estimatedDate = null;
                  let addToCurrentMonth = false;

                  if (inv.fechaCobro) {
                      estimatedDate = inv.fechaCobro;
                      if (estimatedDate.getMonth() === currentMonth && estimatedDate.getFullYear() === currentYear) addToCurrentMonth = true;
                  } else if (inv.fechaFactura) {
                      const keyPrestador = inv.razonSocial + '|' + inv.prestador;
                      let demoraReal = undefined;
                      if (avgDelaysPrestador[keyPrestador] !== undefined) demoraReal = avgDelaysPrestador[keyPrestador];
                      else if (avgDelays[inv.razonSocial] !== undefined) demoraReal = avgDelays[inv.razonSocial];

                      if (demoraReal !== undefined) {
                          estimatedDate = new Date(inv.fechaFactura);
                          estimatedDate.setDate(estimatedDate.getDate() + demoraReal + 5); 
                          const endOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0); 
                          if (estimatedDate <= endOfCurrentMonth) addToCurrentMonth = true;
                      }
                  }
                  
                  if (addToCurrentMonth) {
                       financialStats.estimatedIncome += inv.monto;
                       
                       // Desglose de ingresos (Solo mostramos la OS, ya que todas son mías)
                       const breakdownKey = inv.razonSocial;
                       if(!financialStats.breakdown[breakdownKey]) financialStats.breakdown[breakdownKey] = 0;
                       financialStats.breakdown[breakdownKey] += inv.monto;
                  }
              }
          });

          allRelevantInvoices.sort((a, b) => {
              if(!a.fechaFactura) return 1; if(!b.fechaFactura) return -1;
              return b.fechaFactura - a.fechaFactura;
          });

          facturasList = allRelevantInvoices.slice(0, 500).map(inv => ({
             paciente: inv.paciente, razonSocial: inv.razonSocial, mes: inv.mes, facturacion: inv.monto, fechaFactura: inv.fechaFacturaStr, nFactura: inv.nFactura, fechaCobro: inv.fechaCobroStr, aprobacion: inv.aprobacion
          }));
      }
    }
    
    // --- 4. NOTIFICACIONES ---
    let notificaciones = [];
    const sheetNotif = ss.getSheetByName(NOMBRE_HOJA_NOTIFICACIONES);
    if (sheetNotif) {
       const lastRowN = sheetNotif.getLastRow();
       if(lastRowN > 1) {
           const dataN = sheetNotif.getRange(1, 1, lastRowN, sheetNotif.getLastColumn()).getDisplayValues();
           notificaciones = dataN.slice(1).map(row => ({ id: row[0], fecha: row[1], titulo: row[2], mensaje: row[3], autor: row[4] })).reverse();
       }
    }

    // --- LECTURA DE CONFIG_OS (SI, NO, PROPIO) ---
    let osConfig = {};
    const sheetOS = ss.getSheetByName('Config_OS');
    if (sheetOS) {
        const dataOS = sheetOS.getDataRange().getDisplayValues();
        if (dataOS.length > 1) {
            for(let i=1; i<dataOS.length; i++) {
                let osName = String(dataOS[i][0]).trim().toUpperCase();
                let osStat = String(dataOS[i][1]).trim().toUpperCase();
                if(osName) osConfig[osName] = osStat;
            }
        }
    }

    return {
      user: userEmail,
      userDisplayName: userDisplayName,
      isAdmin: isAdmin,
      isSecretaria: isSecretaria,
      role: isSecretaria ? 'Secretaría' : (isAdmin ? 'Administrador' : 'Equipo Terapéutico'),
      pacientes: pacientesFiltrados,
      facturas: facturasList,
      financialStats: financialStats,
      notificaciones: notificaciones,
      carpetas: carpetas,
      firmaUrl: firmaUrl,
      currentUserInfo: currentUserInfo,
      prestadoresInfo: prestadoresInfo,
      documentosClinicos: docClinicos,
      osConfig: osConfig
    };
  } catch (e) {
    console.error("Error en getAppData:", e);
    throw new Error(e.message);
  }
}

function guardarNotificacion(titulo, mensaje, autor) {
  const ss = SpreadsheetApp.openById(ID_PLANILLA);
  let sheet = ss.getSheetByName(NOMBRE_HOJA_NOTIFICACIONES);
  if (!sheet) { sheet = ss.insertSheet(NOMBRE_HOJA_NOTIFICACIONES); sheet.appendRow(['ID', 'FECHA', 'TITULO', 'MENSAJE', 'AUTOR']); }
  const id = Utilities.getUuid(); const fecha = new Date().toLocaleDateString('es-AR');
  sheet.appendRow([id, fecha, titulo, mensaje, autor]);
  return { success: true, notificacion: { id, fecha, titulo, mensaje, autor } };
}

function getPatientHistory(patientName) {
  const ss = SpreadsheetApp.openById(ID_PLANILLA);
  let sheet = ss.getSheetByName(NOMBRE_HOJA_HC);
  if (!sheet) return []; 
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getDisplayValues();
  return data.slice(1).filter(row => row[1] === patientName).map(row => ({ id: row[0], paciente: row[1], fecha: row[2], texto: row[3], profesional: row[4] })).reverse(); 
}

function savePatientHistory(dataObj) {
  const ss = SpreadsheetApp.openById(ID_PLANILLA);
  let sheet = ss.getSheetByName(NOMBRE_HOJA_HC);
  if (!sheet) { sheet = ss.insertSheet(NOMBRE_HOJA_HC); sheet.appendRow(['ID_NOTA', 'PACIENTE', 'FECHA', 'TEXTO', 'PROFESIONAL']); }
  const newId = Utilities.getUuid();
  const fechaStr = new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'});
  sheet.appendRow([newId, dataObj.paciente, fechaStr, dataObj.texto, dataObj.profesional]);
  return { success: true, fecha: fechaStr }; 
}

function updatePatientHistory(dataObj) {
  const ss = SpreadsheetApp.openById(ID_PLANILLA); const sheet = ss.getSheetByName(NOMBRE_HOJA_HC); const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) { if (String(data[i][0]) === String(dataObj.id)) { sheet.getRange(i + 1, 4).setValue(dataObj.texto); return { success: true }; } }
  return { error: 'No se encontró la nota.' };
}

function deletePatientHistory(id) {
  const ss = SpreadsheetApp.openById(ID_PLANILLA); const sheet = ss.getSheetByName(NOMBRE_HOJA_HC); const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) { if (String(data[i][0]) === String(id)) { sheet.deleteRow(i + 1); return { success: true }; } }
  return { error: 'Nota no encontrada.' };
}

function sincronizarCarpetasDrive() {
  const ss = SpreadsheetApp.openById(ID_PLANILLA); const sheet = ss.getSheetByName(NOMBRE_HOJA_DATOS); const lastRow = sheet.getLastRow();
  if(lastRow < 2) return { message: 'Sin datos para sincronizar' };
  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues(); const headers = data[0];
  const idxPaciente = getColIndex(headers, ['PACIENTE_OS', 'PACIENTE']);
  let idxIdDrive = getColIndex(headers, ['ID DRIVE']);
  if (idxIdDrive === -1) { idxIdDrive = headers.length; sheet.getRange(1, idxIdDrive + 1).setValue('ID DRIVE'); }
  const rootFolder = DriveApp.getFolderById(ID_CARPETA_RAIZ_PACIENTES);
  let updates = 0;
  for (let i = 1; i < data.length; i++) {
    const paciente = data[i][idxPaciente]; const actualId = (idxIdDrive < data[i].length) ? data[i][idxIdDrive] : '';
    if (paciente && !actualId) {
      try { const folders = rootFolder.getFoldersByName(paciente); if (folders.hasNext()) { sheet.getRange(i + 1, idxIdDrive + 1).setValue(folders.next().getId()); updates++; } } catch (e) { }
    }
  }
  return { message: `Actualizado: ${updates} vinculados.` };
}

function getFolderContents(folderId) {
  if (!folderId) return { error: 'ID vacío.' };
  let cleanId = String(folderId).trim();
  if(cleanId.includes('drive.google.com')) { const match = cleanId.match(/[-\w]{25,}/); if(match) cleanId = match[0]; }
  try {
    const folder = DriveApp.getFolderById(cleanId); const list = [];
    const subfolders = folder.getFolders();
    while (subfolders.hasNext()) { const f = subfolders.next(); list.push({ id: f.getId(), name: f.getName(), url: f.getUrl(), mime: 'application/vnd.google-apps.folder', date: f.getLastUpdated().toLocaleDateString(), size: '-' }); }
    const files = folder.getFiles();
    while (files.hasNext()) { const f = files.next(); list.push({ id: f.getId(), name: f.getName(), url: f.getUrl(), mime: f.getMimeType(), date: f.getLastUpdated().toLocaleDateString(), size: (f.getSize()/1024).toFixed(0)+' KB' }); }
    return { id: folder.getId(), name: folder.getName(), files: list };
  } catch (e) { return { error: e.message }; }
}

function getSubfolderContents(parentId, subfolderPath) {
  if (!parentId) return { error: 'ID de carpeta no proporcionado.' };
  try {
    let currentFolder = DriveApp.getFolderById(parentId);
    // Dividimos la ruta y limpiamos espacios extra
    const parts = subfolderPath.split('/').map(p => p.trim()).filter(p => p !== "");
    
    for (let part of parts) {
      // Intento 1: Buscar con el nombre exacto enviado (ej: con guiones bajos)
      let folders = currentFolder.getFoldersByName(part);
      
      // Intento 2: Si no encuentra, reintentar cambiando guiones bajos por espacios
      if (!folders.hasNext()) {
         folders = currentFolder.getFoldersByName(part.replace(/_/g, ' '));
      }
      
      if (folders.hasNext()) {
        currentFolder = folders.next();
      } else {
        // En lugar de devolver la raíz, devolvemos el error exacto para diagnosticar
        return { error: 'No se encontró la carpeta "' + part + '" dentro de "' + currentFolder.getName() + '". Verifica el nombre en Google Drive.' };
      }
    }
    // Si la encontró, devolvemos el contenido de esa subcarpeta final
    const resultado = getFolderContents(currentFolder.getId());
    resultado.id = currentFolder.getId(); // Aseguramos que el ID sea el de la subcarpeta
    return resultado;
  } catch (e) { return { error: e.message }; }
}

function updateNotificacion(id, titulo, mensaje) {
  try {
    const ss = SpreadsheetApp.openById(ID_PLANILLA); const sheet = ss.getSheetByName(NOMBRE_HOJA_NOTIFICACIONES);
    if (!sheet) return { error: 'No se encontró la hoja de notificaciones' };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { sheet.getRange(i + 1, 3).setValue(titulo); sheet.getRange(i + 1, 4).setValue(mensaje); return { success: true }; }
    }
    return { error: 'No se encontró la notificación' };
  } catch (e) { return { error: e.message }; }
}

function eliminarNotificacion(id) {
  try {
    const ss = SpreadsheetApp.openById(ID_PLANILLA); const sheet = ss.getSheetByName(NOMBRE_HOJA_NOTIFICACIONES);
    if (!sheet) return { error: 'Hoja no encontrada' };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { sheet.deleteRow(i + 1); return { success: true }; }
    }
    return { error: 'No encontrada' };
  } catch (e) { return { error: e.message }; }
}

function getOnlyNotifications() {
  try {
    const ss = SpreadsheetApp.openById(ID_PLANILLA); const sheetNotif = ss.getSheetByName(NOMBRE_HOJA_NOTIFICACIONES); let notificaciones = [];
    if (sheetNotif) {
       const lastRowN = sheetNotif.getLastRow();
       if(lastRowN > 1) {
           const dataN = sheetNotif.getRange(1, 1, lastRowN, sheetNotif.getLastColumn()).getDisplayValues();
           notificaciones = dataN.slice(1).map(row => ({ id: row[0], fecha: row[1], titulo: row[2], mensaje: row[3], autor: row[4] })).reverse();
       }
    }
    return notificaciones;
  } catch (e) { return []; }
}

function obtenerEmailPorToken(token) {
  const cleanToken = String(token).trim();
  if (cleanToken.includes('@')) return cleanToken.toLowerCase();
  let ssLogin;
  try { ssLogin = SpreadsheetApp.openById(ID_LOGIN_PLANILLA); } catch(e) { throw new Error("FALLO DE PERMISOS: La App no puede leer la planilla de Login."); }
  const sheetUsuarios = ssLogin.getSheetByName('Usuarios');
  if (!sheetUsuarios) throw new Error("FALLO BD: No se encontró la pestaña 'Usuarios'.");
  const data = sheetUsuarios.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const dbEmail = String(data[i][0] || "").toLowerCase().trim(); const dbToken = String(data[i][5] || "").trim();               
    if (dbToken === cleanToken) {
      if (!dbEmail) throw new Error("FALLO BD: Celda Email vacía.");
      return dbEmail;
    }
  }
  throw new Error("TOKEN NO ENCONTRADO");
}

function doPost(e) {
  try {
    var peticion = JSON.parse(e.postData.contents); var accion = peticion.accion; var parametros = peticion.parametros || []; var resultado;
    if (typeof this[accion] === 'function') { resultado = this[accion].apply(this, parametros); } else { throw new Error("Función no existe."); }
    return ContentService.createTextOutput(JSON.stringify({ estado: 'exito', respuesta: resultado })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) { return ContentService.createTextOutput(JSON.stringify({ estado: 'error', mensaje: error.message })).setMimeType(ContentService.MimeType.JSON); }
}

function guardarHCPdf(pacienteNombre, idDrivePaciente, htmlContent) {
  try {
    if (!idDrivePaciente) throw new Error("ID de Drive del paciente no proporcionado.");
    let cleanId = String(idDrivePaciente).trim();
    if(cleanId.includes('drive.google.com')) { const match = cleanId.match(/[-\w]{25,}/); if(match) cleanId = match[0]; }
    const patientFolder = DriveApp.getFolderById(cleanId);
    let hcFolders = patientFolder.getFoldersByName("Historia_Clinica");
    let hcFolder = hcFolders.hasNext() ? hcFolders.next() : patientFolder.createFolder("Historia_Clinica");
    
    try {
        const logoFile = DriveApp.getFileById('1FoZSCJcHv42_P8kw4IlHL_upJdIwZ_Yl');
        const logoB64 = "data:" + logoFile.getMimeType() + ";base64," + Utilities.base64Encode(logoFile.getBlob().getBytes());
        htmlContent = htmlContent.replace('LOGO_PLACEHOLDER', logoB64);
    } catch(err) {}
    
    const nombreArchivo = pacienteNombre.replace(/\s+/g, '_') + "_HC.pdf";
    const blob = Utilities.newBlob(htmlContent, MimeType.HTML).setName(nombreArchivo).getAs(MimeType.PDF);
    const existingFiles = hcFolder.getFilesByName(nombreArchivo);
    while (existingFiles.hasNext()) existingFiles.next().setTrashed(true);
    const newFile = hcFolder.createFile(blob);
    return { success: true, url: newFile.getUrl() };
  } catch(e) { throw new Error(e.message); }
}

function uploadFileToDrive(folderId, base64Data, fileName, mimeType) {
  try {
    if (!folderId) throw new Error("ID de carpeta no proporcionado.");
    let cleanId = String(folderId).trim();
    if(cleanId.includes('drive.google.com')) { const match = cleanId.match(/[-\w]{25,}/); if(match) cleanId = match[0]; }
    const folder = DriveApp.getFolderById(cleanId);
    const data = base64Data.split(',')[1]; 
    const blob = Utilities.newBlob(Utilities.base64Decode(data), mimeType, fileName);
    const newFile = folder.createFile(blob);
    return { success: true, id: newFile.getId(), url: newFile.getUrl(), name: newFile.getName() };
  } catch (e) { return { error: e.message }; }
}

function deleteFileFromDrive(fileId) {
  try {
    if (!fileId) throw new Error("ID de archivo no proporcionado.");
    const file = DriveApp.getFileById(fileId); file.setTrashed(true); 
    return { success: true };
  } catch (e) { return { error: e.message }; }
}

// =========================================================
// MÓDULO: DOCUMENTACIÓN CLÍNICA Y TEMPLATES
// =========================================================

function guardarTemplate(prestador, tipo, especialidad, html) {
  try {
    const ss = SpreadsheetApp.openById(ID_PLANILLA);
    let sheet = ss.getSheetByName('Templates_Documentos');
    const data = sheet.getDataRange().getValues();
    let actualizado = false;
    for(let i = 1; i < data.length; i++) {
      if(data[i][1] === prestador && data[i][2] === tipo && data[i][3] === especialidad) {
        sheet.getRange(i + 1, 5).setValue(html);
        sheet.getRange(i + 1, 6).setValue(new Date().toLocaleDateString('es-AR'));
        actualizado = true; break;
      }
    }
    if(!actualizado) sheet.appendRow([Utilities.getUuid(), prestador, tipo, especialidad, html, new Date().toLocaleDateString('es-AR')]);
    return { success: true };
  } catch(e) { return { error: e.message }; }
}

function getTemplates(prestador) {
  try {
    const ss = SpreadsheetApp.openById(ID_PLANILLA);
    const sheet = ss.getSheetByName('Templates_Documentos');
    if(!sheet) return [];
    const data = sheet.getDataRange().getValues();
    return data.slice(1).filter(r => r[1] === prestador).map(r => ({ tipo: r[2], especialidad: r[3], html: r[4] }));
  } catch(e) { return []; }
}

function guardarDocumentoClinico(payload) {
  try {
    let cleanId = String(payload.idDrive).trim();
    if(cleanId.includes('drive.google.com')) { const match = cleanId.match(/[-\w]{25,}/); if(match) cleanId = match[0]; }
    const patientFolder = DriveApp.getFolderById(cleanId);
    
    const anioActual = String(new Date().getFullYear());
    let yearFolder; const yfs = patientFolder.getFoldersByName(anioActual);
    if(yfs.hasNext()) yearFolder = yfs.next(); else yearFolder = patientFolder.createFolder(anioActual);
    
    const isPrimerSemestre = (new Date().getMonth() + 1) <= 6;
    const nombreSemestre = isPrimerSemestre ? "Informes_semestrales_Junio" : "Informes_semestrales_Diciembre";
    let semFolder; const sfs = yearFolder.getFoldersByName(nombreSemestre);
    if(sfs.hasNext()) semFolder = sfs.next(); else semFolder = yearFolder.createFolder(nombreSemestre);
    
    // Preparar Firma (TAMAÑO FIJO DE APROX 5x4 cm)
    let firmaHtml = '<br>';
    let hasFirma = false;
    if (payload.firmaUrl && payload.firmaUrl.includes('google.com')) {
        try {
            let cleanFirmaId = payload.firmaUrl;
            if(cleanFirmaId.includes('id=')) cleanFirmaId = cleanFirmaId.split('id=')[1].split('&')[0];
            else if(cleanFirmaId.includes('d/')) cleanFirmaId = cleanFirmaId.split('d/')[1].split('/')[0];
            const firmaBlob = DriveApp.getFileById(cleanFirmaId).getBlob();
            const firmaB64 = "data:" + firmaBlob.getContentType() + ";base64," + Utilities.base64Encode(firmaBlob.getBytes());
            // Tamaño de la firma forzado a 5cm ancho por maximo 4cm alto.
            firmaHtml = `<img src="${firmaB64}" style="width: 5cm; height: auto; max-height: 4cm; object-fit: contain; margin-bottom: 5px;"><br>`;
            hasFirma = true;
        } catch(e) {} 
    }

    const fechaDoc = payload.fechaDoc; // Toma la fecha seleccionada en pantalla
    const matriculaDoc = payload.matricula ? `${payload.matricula}` : '';

    let datosPrestadorHtml = '';
    if (!hasFirma) {
       datosPrestadorHtml = `<b>${payload.prestador}</b><br>
       <span style="font-size:10px;color:#666;">${payload.titulo}</span><br>
       <span style="font-size:10px;color:#666;">${matriculaDoc}</span>`;
    }

    let htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;font-size:12px;color:#333;margin:30px}h1{color:#008395;text-transform:uppercase;font-size:18px;border-bottom:2px solid #008395;padding-bottom:10px}.datos{background:#f8fafc;padding:15px;border-left:4px solid #008395;margin-bottom:20px;line-height:1.6;font-size:11px}</style></head><body>`;
    
    htmlContent += `<h1>${payload.tipo} Clínico</h1>
    <div class="datos">
      <b>FECHA DEL DOCUMENTO:</b> ${fechaDoc}<br>
      <b>PACIENTE:</b> ${payload.paciente}<br>
      <b>DNI:</b> ${payload.dni}<br>
      <b>PERÍODO EVALUADO:</b> ${payload.periodo}<br>
      <b>ESPECIALIDAD:</b> ${payload.especialidad}<br>
      <b>PRESTADOR:</b> ${payload.prestador}
    </div>
    <div style="line-height:1.6; text-align:justify;">${payload.html.replace(/\n/g, '<br>')}</div>
    <div style="margin-top:50px;text-align:center;border-top:1px solid #ccc;padding-top:10px;width:250px;margin-left:auto;margin-right:auto;">
       ${firmaHtml}
       ${datosPrestadorHtml}
    </div></body></html>`;
    
    // Quitamos acentos y respetamos los espacios originales (con trim() para limpiar bordes)
    const nombrePacienteLimpio = payload.paciente.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const nombreEspecialidadLimpia = payload.especialidad.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const nombreArchivo = `${payload.tipo}_${nombrePacienteLimpio}_${nombreEspecialidadLimpia}.pdf`;
    const blob = Utilities.newBlob(htmlContent, MimeType.HTML).setName(nombreArchivo).getAs(MimeType.PDF);
    
    // --- 1. BUSCAR Y REEMPLAZAR EN DRIVE ---
    const existingFiles = semFolder.getFilesByName(nombreArchivo);
    while (existingFiles.hasNext()) {
        existingFiles.next().setTrashed(true); // Manda el viejo a la papelera
    }
    const newFile = semFolder.createFile(blob);
    
    // --- 2. BUSCAR Y REEMPLAZAR EN LA PLANILLA ---
    const ss = SpreadsheetApp.openById(ID_PLANILLA);
    let sheetDocs = ss.getSheetByName('Documentos_Clinicos');
    const dataDocs = sheetDocs.getDataRange().getValues();
    
    let actualizado = false;
    for(let i = 1; i < dataDocs.length; i++) {
        // Si el paciente ya tiene este mismo tipo de informe en esa especialidad, actualizamos la fila
        if(dataDocs[i][2] === payload.tipo && dataDocs[i][4] === payload.paciente && dataDocs[i][3] === payload.especialidad) {
            sheetDocs.getRange(i + 1, 2).setValue(fechaDoc); // Actualiza Fecha
            sheetDocs.getRange(i + 1, 6).setValue(payload.prestador); // Actualiza Prestador
            sheetDocs.getRange(i + 1, 7).setValue(newFile.getUrl()); // Actualiza Link
            sheetDocs.getRange(i + 1, 8).setValue(payload.html); // <--- NUEVO: Actualiza el texto en la Columna H
            actualizado = true;
            break;
        }
    }
    
    // Si no existía, creamos una fila nueva incluyendo el HTML al final
    if(!actualizado) {
        sheetDocs.appendRow([Utilities.getUuid(), fechaDoc, payload.tipo, payload.especialidad, payload.paciente, payload.prestador, newFile.getUrl(), payload.html]);
    }
    
    const newDoc = { fecha: fechaDoc, tipo: payload.tipo, especialidad: payload.especialidad, paciente: payload.paciente, prestador: payload.prestador, url: newFile.getUrl() };
    
    return { success: true, url: newFile.getUrl(), doc: newDoc };
  } catch(e) { return { error: e.message }; }
}

function guardarConfigOS(osHabilitadas) {
  try {
    const ss = SpreadsheetApp.openById(ID_PLANILLA);
    let sheet = ss.getSheetByName('Config_OS');
    if (!sheet) sheet = ss.insertSheet('Config_OS');
    
    sheet.clear(); // Limpiamos la hoja
    sheet.appendRow(['OBRAS_SOCIALES_HABILITADAS']); // Cabecera
    
    // Guardamos la nueva lista
    osHabilitadas.forEach(os => sheet.appendRow([os]));
    return { success: true };
  } catch(e) { return { error: e.message }; }
}

function subirInformePropio(payload) {
  try {
    let cleanId = String(payload.idDrive).trim();
    if(cleanId.includes('drive.google.com')) { 
        const match = cleanId.match(/[-\w]{25,}/); 
        if(match) cleanId = match[0]; 
    }
    const patientFolder = DriveApp.getFolderById(cleanId);
    
    const anioActual = String(new Date().getFullYear());
    let yearFolder; 
    const yfs = patientFolder.getFoldersByName(anioActual);
    if(yfs.hasNext()) yearFolder = yfs.next(); 
    else yearFolder = patientFolder.createFolder(anioActual);
    
    const isPrimerSemestre = (new Date().getMonth() + 1) <= 6;
    const nombreSemestre = isPrimerSemestre ? "Informes_semestrales_Junio" : "Informes_semestrales_Diciembre";
    let semFolder; 
    const sfs = yearFolder.getFoldersByName(nombreSemestre);
    if(sfs.hasNext()) semFolder = sfs.next(); 
    else semFolder = yearFolder.createFolder(nombreSemestre);
    
    const data = payload.base64Data.split(',')[1]; 
    // CORRECCIÓN: Forzamos MimeType.PDF para evitar archivos corruptos
    const blob = Utilities.newBlob(Utilities.base64Decode(data), MimeType.PDF, payload.fileName);
    
    // Eliminamos versión vieja si el terapeuta se equivocó y lo resube (busca por el nombre exacto con la prestación)
    const existingFiles = semFolder.getFilesByName(payload.fileName);
    while (existingFiles.hasNext()) existingFiles.next().setTrashed(true);
    
    const newFile = semFolder.createFile(blob);
    const fechaDoc = new Date().toLocaleDateString('es-AR');
    
    // Actualizamos el control de entregas
    const ss = SpreadsheetApp.openById(ID_PLANILLA); 
    let sheetDocs = ss.getSheetByName('Documentos_Clinicos');
    const dataDocs = sheetDocs.getDataRange().getValues();
    
    let actualizado = false;
    for(let i = 1; i < dataDocs.length; i++) {
        // Busca coincidencias exactas de Paciente Y Especialidad
        if(dataDocs[i][2] === 'Informe' && dataDocs[i][4] === payload.paciente && dataDocs[i][3] === payload.especialidad) {
            sheetDocs.getRange(i + 1, 2).setValue(fechaDoc); // Fecha
            sheetDocs.getRange(i + 1, 6).setValue(payload.prestador); // Prestador
            sheetDocs.getRange(i + 1, 7).setValue(newFile.getUrl()); // Link Drive
            actualizado = true; 
            break;
        }
    }
    
    if(!actualizado) {
        // CORRECCIÓN: Agregamos un string vacío "" al final para la Columna H (Texto editable) así la fila queda prolija
        sheetDocs.appendRow([Utilities.getUuid(), fechaDoc, 'Informe', payload.especialidad, payload.paciente, payload.prestador, newFile.getUrl(), ""]);
    }
    
    return { success: true, doc: { fecha: fechaDoc, tipo: 'Informe', especialidad: payload.especialidad, paciente: payload.paciente, prestador: payload.prestador, url: newFile.getUrl() } };
  } catch(e) { 
    return { error: e.message }; 
  }
}

function getUltimoInforme(paciente, prestador, especialidad, tipo) {
  try {
    const ss = SpreadsheetApp.openById(ID_PLANILLA);
    const sheetDocs = ss.getSheetByName('Documentos_Clinicos');
    const dataDocs = sheetDocs.getDataRange().getValues();

    const isInforme = String(tipo).startsWith("Informe");

    for (let i = dataDocs.length - 1; i >= 1; i--) {
        const rowTipo = String(dataDocs[i][2] || "").trim();
        const rowEsp = String(dataDocs[i][3] || "").trim();
        const rowPac = String(dataDocs[i][4] || "").trim();
        const htmlGuardado = dataDocs[i][7];

        const tipoCoincide = isInforme ? rowTipo.startsWith("Informe") : (rowTipo === tipo);
        
        if (rowPac === paciente && tipoCoincide && (rowEsp === especialidad || !especialidad || especialidad === "General" || rowEsp === "General")) {
            if (htmlGuardado && String(htmlGuardado).trim() !== "") {
                return { success: true, html: htmlGuardado };
            }
        }
    }
    return { success: false, message: "No se encontró un informe anterior con texto editable en la planilla." };
  } catch (e) {
    return { error: e.message };
  }
}