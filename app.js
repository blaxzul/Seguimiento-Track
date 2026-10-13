/* ==================== CONSTANTES ==================== */
const KEY_SEG   = 'seguimiento_v10';
const KEY_DISP  = 'disponibilidad_v10';
const KEY_EQ    = 'equipos_v10';
const KEY_COORD = 'zaaz_coordinaciones';

const ESTADOS = { nuevo:'Nuevo', contactado:'Contactado', seguimiento:'En seguimiento', cerrado:'Cerrado' };
const RESULTADOS      = { conforme:'Conforme', no_contesta:'No contesta', no_probo:'No probó', manual:'Observación manual' };
const RESULTADOS_DISP = { disponible:'Disponible', no_contesta:'No contesta', manual:'Observación manual' };

const FILTROS_SEG_DEF = {
  buscar:'', soloNuevas:false,
  estados:[], estadosOrigen:[], empresas:[], contratistas:[], trabajos:[], progs:[], cuadrillas:[],
  departamentos:[], provincias:[], distritos:[]
};
const FILTROS_DISP_DEF = {
  buscar:'', soloNuevas:false,
  estadosOrigen:[], empresas:[], contratistas:[], trabajos:[], progs:[], cuadrillas:[],
  departamentos:[], provincias:[], distritos:[]
};
const FILTROS_EQ_DEF = {
  buscar:'',
  tipoOrden:[], estadoOs:[], detalle:[], tecnicos:[],
  departamentos:[], provincias:[], distritos:[], deteccion:[]
};
const FILTROS_CARGA_DEF = {
  buscar:'', fecha:'',
  empresas:[], contratistas:[], trabajos:[], cuadrillas:[],
  departamentos:[], provincias:[], distritos:[]
};
const FILTROS_KPI_DEF = {
  empresas:[], contratistas:[], cuadrillas:[], trabajos:[],
  departamentos:[], provincias:[], distritos:[]
};
const FILTROS_ADIC_DEF = {
  buscar:'', coordinacion:'pendientes',
  empresas:[], contratistas:[], cuadrillas:[], trabajos:[], estadosOrigen:[], distritos:[]
};
const HORAS_CARGA = ['08:00','10:00','12:00','14:00','16:00','18:00','20:00'];   // franjas oficiales; si llega otra hora (ej. 07:00) se agrega sola

/* ==================== ESTADO GLOBAL ==================== */
let stateSeg  = { casos: [], historial: [], filtros: JSON.parse(JSON.stringify(FILTROS_SEG_DEF)) };
let stateDisp = { casos: [], historial: [], filtros: JSON.parse(JSON.stringify(FILTROS_DISP_DEF)) };
let stateEq   = { casos: [], historial: [], filtros: JSON.parse(JSON.stringify(FILTROS_EQ_DEF)) };
let cargaFiltros = JSON.parse(JSON.stringify(FILTROS_CARGA_DEF));
let kpiFiltros   = JSON.parse(JSON.stringify(FILTROS_KPI_DEF));
let adicFiltros  = JSON.parse(JSON.stringify(FILTROS_ADIC_DEF));
let confOpts = { modo:'pendientes', desde:'', hasta:'', buscar:'' };
let dispOpts = { modo:'pendientes', desde:'', hasta:'', buscar:'' };

let mapaCoordinacion = JSON.parse(localStorage.getItem(KEY_COORD) || '{}');
let autoTimerId = null;
let segsRestantes = 300;

/* ==================== UTILS ==================== */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2,10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayStr    = () => new Date().toISOString().slice(0,10);
const tomorrowStr = () => new Date(Date.now() + 86400000).toISOString().slice(0,10);
const nowISO      = () => new Date().toISOString();
const norm        = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
const cleanText   = v => String(v ?? '').replace(/\s+/g,' ').trim();
// Lugares con una sola escritura (Huaral, HUARAL y huaral pasan a "Huaral")
const MINUSCULAS_LUGAR = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']);
const canonLugar = v => {
  const s = cleanText(v); if (!s) return s;
  return s.toLowerCase().split(' ').map((w, i) => (i && MINUSCULAS_LUGAR.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};
// Entre varias escrituras de lo mismo, elige la que no esté toda en mayúsculas ni toda en minúsculas
function etiquetaCanon(opciones){
  let mejor = opciones[0];
  opciones.forEach(o => {
    const malo = x => x === x.toUpperCase() || x === x.toLowerCase();
    if (malo(mejor) && !malo(o)) mejor = o;
  });
  return mejor;
}
function normalizarLugares(){
  let n = 0;
  stateSeg.casos.forEach(c => ['distrito', 'provincia', 'departamento'].forEach(k => { const v = canonLugar(c[k]); if (v !== c[k]){ c[k] = v; n++; } }));
  if (n) saveSeg();
}

function uniqNormalizado(arr){
  const map = new Map();
  arr.filter(Boolean).forEach(v => {
    const k = norm(v);
    if (!map.has(k)) map.set(k, { opciones: new Set() });
    map.get(k).opciones.add(v);
  });
  return [...map.values()].map(e => {
    const opciones = [...e.opciones];
    let mejor = opciones[0];
    for (const o of opciones){
      const esTodoMayus = o === o.toUpperCase();
      const esTodoMinus = o === o.toLowerCase();
      const mejorMayus = mejor === mejor.toUpperCase();
      const mejorMinus = mejor === mejor.toLowerCase();
      if ((mejorMayus || mejorMinus) && !esTodoMayus && !esTodoMinus) mejor = o;
    }
    return mejor;
  }).sort();
}

function safeSave(key, data){
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch(e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      if (data.historial && data.historial.length > 2) {
        data.historial = data.historial.slice(0, 2);
        try { localStorage.setItem(key, JSON.stringify(data)); return; } catch(err){}
      }
      toast('⚠️ Memoria local llena. Borra datos antiguos.');
    }
  }
}
function saveSeg(){ safeSave(KEY_SEG, stateSeg); }
function saveDisp(){ safeSave(KEY_DISP, stateDisp); }
function saveEq(){ safeSave(KEY_EQ, stateEq); }

function loadAll(){
  try{
    const s = localStorage.getItem(KEY_SEG);
    if (s){ const p = JSON.parse(s); stateSeg = { casos:p.casos||[], historial:p.historial||[], filtros: Object.assign({}, FILTROS_SEG_DEF, p.filtros||{}) }; }
  }catch(e){}
  try{
    const s = localStorage.getItem(KEY_DISP);
    if (s){ const p = JSON.parse(s); stateDisp = { casos:p.casos||[], historial:p.historial||[], filtros: Object.assign({}, FILTROS_DISP_DEF, p.filtros||{}) }; }
  }catch(e){}
  try{
    const s = localStorage.getItem(KEY_EQ);
    if (s){ const p = JSON.parse(s); stateEq = { casos:p.casos||[], historial:p.historial||[], filtros: Object.assign({}, FILTROS_EQ_DEF, p.filtros||{}) }; }
  }catch(e){}
  try{
    mapaCoordinacion = JSON.parse(localStorage.getItem(KEY_COORD) || '{}');
  }catch(e){ mapaCoordinacion = {}; }
}

function toast(msg, ms=2400){
  const t = $('#toast'); if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function copyText(val, label='Dato'){
  if (!val) return;
  navigator.clipboard.writeText(String(val).trim()).then(() => {
    toast(`📋 ${label} copiado`);
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = String(val).trim();
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    toast(`📋 ${label} copiado`);
  });
}

/* Tema oscuro */
function applyTheme(){
  const dark = localStorage.getItem('theme') === 'dark';
  document.body.classList.toggle('dark', dark);
  const btn = $('#themeToggle');
  if (btn) btn.textContent = dark ? '☀️' : '🌙';
}
function toggleTheme(){
  const dark = !document.body.classList.contains('dark');
  localStorage.setItem('theme', dark ? 'dark' : 'light');
  applyTheme();
}

/* ==================== PARSEO ==================== */
function pick(row, names){
  if (!row || typeof row !== 'object') return '';
  const keys = Object.keys(row);
  const map = {}; keys.forEach(k => map[norm(k)] = row[k]);
  for (const n of names){ const nn = norm(n); if (map[nn] !== undefined && map[nn] !== '') return map[nn]; }
  for (const n of names){ const nn = norm(n); for (const k of keys){ if (norm(k).includes(nn)) { const v = row[k]; if (v !== undefined && v !== '') return v; } } }
  return '';
}
function parseHora(v){
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return String(v.getHours()).padStart(2,'0')+':'+String(v.getMinutes()).padStart(2,'0');
  if (typeof v === 'number'){ const tm = Math.round(v*24*60); return String(Math.floor(tm/60)%24).padStart(2,'0')+':'+String(tm%60).padStart(2,'0'); }
  const s = String(v).trim();
  const m = s.match(/(\d{1,2})\s*[:.]\s*(\d{2})/);
  if (m) return m[1].padStart(2,'0')+':'+m[2];
  return s;
}
function parseFecha(v){
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return v.toISOString().slice(0,10);
  if (typeof v === 'number' && v > 20000 && v < 80000){
    const d = new Date((v - 25569) * 86400 * 1000);
    return d.toISOString().slice(0,10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return s;
}
function parseFechaHora(v){
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && v > 20000 && v < 80000){
    const d = new Date((v - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m1){
    const d = new Date(parseInt(m1[3]), parseInt(m1[2])-1, parseInt(m1[1]),
                       parseInt(m1[4]||0), parseInt(m1[5]||0), parseInt(m1[6]||0));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function parseHTMLTable(text){
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const table = doc.querySelector('table');
  if (!table) throw new Error('No se encontró <table> en el archivo');
  const headers = [...table.querySelectorAll('thead th')].map(th => cleanText(th.textContent));
  const tbody = table.querySelector('tbody') || table;
  const out = [];
  tbody.querySelectorAll('tr').forEach(tr => {
    const cells = [...tr.querySelectorAll('td')];
    if (!cells.length) return;
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ? cleanText(cells[i].textContent) : ''; });
    out.push(row);
  });
  return out;
}
function sheetToRows(ws){
  const matrix = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
  if (!matrix.length) return [];
  let headerIdx = 0;
  for (let i=0; i<Math.min(matrix.length, 15); i++){
    const row = matrix[i];
    if (!row || !Array.isArray(row)) continue;
    const nonEmpty = row.filter(c => String(c||'').trim() !== '').length;
    const text = norm(row.join(' '));
    if (nonEmpty >= 5 && (
      text.includes('item') || text.includes('tipo orden') || text.includes('nro os') ||
      text.includes('fecha') || text.includes('cliente') || text.includes('os') ||
      text.includes('telefono') || text.includes('tarifa')
    )) { headerIdx = i; break; }
  }
  const headers = (matrix[headerIdx] || []).map(h => cleanText(h));
  const out = [];
  for (let i=headerIdx+1; i<matrix.length; i++){
    const row = matrix[i];
    if (!row || row.every(c => String(c||'').trim() === '')) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] !== undefined ? row[idx] : ''; });
    out.push(obj);
  }
  return out;
}
/* ==================== MAPEO SEGUIMIENTO / DISPONIBILIDAD ==================== */
function mapRowSeg(r){
  const tel1   = cleanText(pick(r, ['TELEFONO','TELÉFONO','CELULAR','FONO','MOVIL']));
  const tel2   = cleanText(pick(r, ['TELEFONO 2','TELÉFONO 2']));
  const tel3   = cleanText(pick(r, ['TELEFONO 3','TELÉFONO 3']));
  const telRef = cleanText(pick(r, ['TELEFONO REFERENCIA','TELÉFONO REFERENCIA']));
  const dir    = cleanText(pick(r, ['DIRECCIÓN','DIRECCION','DIRECCION CLIENTE','DIR CLIENTE','DIRECCION DE SERVICIO','DOMICILIO']));
  const dist   = cleanText(pick(r, ['DISTRITO','DISTRITO CLIENTE','LOCALIDAD','JURISDICCION']));
  const plano  = cleanText(pick(r, ['CODIGO PLANO','CÓDIGO PLANO']));
  const emp    = cleanText(pick(r, ['EMPRESA']));

  let dirFinal = dir;
  if (!dirFinal && norm(emp).includes('pangea') && plano){
    dirFinal = `Ref. Plano: ${plano} (Sin dirección en base)`;
  }

  return {
    id_interno:   cleanText(pick(r, ['ID'])),
    os:           cleanText(pick(r, ['OS'])),
    osSig:        cleanText(pick(r, ['OS SIG'])),
    nroTac:       cleanText(pick(r, ['NRO TAC'])),
    codVenta:     cleanText(pick(r, ['COD VENTA'])),
    fecha:        parseFecha(pick(r, ['FECHA'])),
    hora:         parseHora(pick(r, ['HORARIO','HORA PROGRAMADA','HORA'])),
    empresa:      emp,
    contratista:  cleanText(pick(r, ['CONTRATISTA'])),
    cuadrilla:    cleanText(pick(r, ['CUADRILLA/TÉCNICO','CUADRILLA/TECNICO','CUADRILLA','TÉCNICO','TECNICO'])),
    tipoProg:     cleanText(pick(r, ['TIPO PROGRAMACIÓN','TIPO PROGRAMACION'])),
    tipoTrabajo:  cleanText(pick(r, ['TIPO TRABAJO'])),
    telefono:     tel1, telefono2: tel2, telefono3: tel3, telefonoRef: telRef,
    dni:          cleanText(pick(r, ['DNI'])),
    nombre:       cleanText(pick(r, ['CLIENTE','NOMBRE','TITULAR'])),
    direccion:    dirFinal,
    distrito:     canonLugar(dist),
    provincia:    canonLugar(pick(r, ['PROVINCIA','PROVINCIA CLIENTE'])),
    departamento: canonLugar(pick(r, ['DEPARTAMENTO','DPTO'])),
    zona:         cleanText(pick(r, ['ZONA'])),
    coords:       cleanText(pick(r, ['COORDENADAS DE CLIENTE','COORDENADAS'])),
    tipoVivienda: cleanText(pick(r, ['TIPO VIVIENDA'])),
    codigoPlano:  plano,
    vendedor:     cleanText(pick(r, ['VENDEDOR'])),
    gestor:       cleanText(pick(r, ['GESTOR'])),
    estadoOrigen: cleanText(pick(r, ['ESTADO'])),
    area:         cleanText(pick(r, ['AREA','ÁREA'])),
    esAdicional:  !!r._esAdicional
  };
}

function keySeg(c){
  const parts = [];
  if (c.id_interno) parts.push('ID:'+norm(c.id_interno));
  if (c.os) parts.push('OS:'+norm(c.os));
  if (parts.length) return parts.join('|');
  if (c.nroTac) return 'TAC:'+norm(c.nroTac);
  if (c.codVenta) return 'CV:'+norm(c.codVenta);
  return 'NM:'+norm(c.nombre)+'|'+norm(c.distrito)+'|'+c.fecha;
}

function registrarCambioEstadoSeg(c, nuevo){
  if (!nuevo || c.estadoOrigen === nuevo) return;
  c.historialEstado = c.historialEstado || [];
  c.historialEstado.push({ estado: nuevo, fecha: nowISO() });
  c.estadoOrigen = nuevo;
}

/* ==================== MAPEO EQUIPOS Y PLANES ==================== */
function mapRowEq(r){
  const tarifa = cleanText(pick(r, ['Tarifa Servicio','Tarifa Plan Inicial Contrato','Tarifa Pactado Contrato']));
  const detalleMat = cleanText(pick(r, ['DETALLE DE MATERIAL','Detalle Material']));
  const obs    = cleanText(pick(r, ['Observaciones']));
  const obsTec = cleanText(pick(r, ['Observaciones Tecnico','Observaciones Técnico']));
  const blob = norm([tarifa, detalleMat, obs, obsTec].join(' '));

  const tieneMil  = /(^|\D)1000\s*(mbps|mb|m\b)/i.test(tarifa) || /1000MBPS/i.test(tarifa);
  const tieneBono = /\bbono\b|por promocion|por promoción|bono de 1000|upgrade/i.test(obs);
  const wifi6Oblig = tieneMil && !tieneBono;
  const mencionaMesh = /mesh|repetidor|extensor|amplificador/i.test(blob);
  const meshSug = wifi6Oblig || mencionaMesh;
  const revisarTec = /wifi\s*6|wifi6|cambio de modem wifi|actualizacion wifi|actualización wifi/i.test(obs + obsTec);
  const equipoOk = /f6600|f680|wifi6|wifi 6 mesh|mesh compatible/i.test(detalleMat);

  let deteccion = 'estandar';
  if (wifi6Oblig) deteccion = 'wifi6_req';
  else if (meshSug) deteccion = 'mesh_req';
  else if (revisarTec) deteccion = 'revisar_tec';
  if (equipoOk && wifi6Oblig) deteccion = 'equipo_ok';

  return {
    id_servicio:    cleanText(pick(r, ['ID Servicio','ID_Servicio','Id Servicio'])),
    nro_os:         cleanText(pick(r, ['Nro OS','Nro. OS','NRO OS'])),
    abonado:        cleanText(pick(r, ['Abonado'])),
    idos:           cleanText(pick(r, ['IDOS'])),
    cliente:        cleanText(pick(r, ['Nombres/ Razón Social','Nombres / Razón Social','Cliente','Razon Social','Razón Social'])),
    dni:            cleanText(pick(r, ['DNI'])),
    filial:         cleanText(pick(r, ['Filial'])),
    tipoOrden:      cleanText(pick(r, ['Tipo Orden'])),
    motivo:         cleanText(pick(r, ['MOTIVO','Motivo'])),
    causa:          cleanText(pick(r, ['CAUSA','Causa'])),
    solucion:       cleanText(pick(r, ['SOLUCION','Solución'])),
    detalle:        cleanText(pick(r, ['Detalle'])),
    servicio:       cleanText(pick(r, ['Servicio'])),
    estadoServicio: cleanText(pick(r, ['Estado Servicio'])),
    tarifaServicio: tarifa,
    tarifaInicial:  cleanText(pick(r, ['Tarifa Plan Inicial Contrato'])),
    tarifaPactado:  cleanText(pick(r, ['Tarifa Pactado Contrato'])),
    estadoOs:       cleanText(pick(r, ['Estado Os','Estado OS'])),
    telefono:       cleanText(pick(r, ['Telefono','Teléfono'])),
    celulares:      cleanText(pick(r, ['Celulares','Celular'])),
    direccion:      cleanText(pick(r, ['Direccion','Dirección'])),
    distrito:       cleanText(pick(r, ['Distrito'])),
    provincia:      cleanText(pick(r, ['Provincia'])),
    departamento:   cleanText(pick(r, ['Departamento','DEPARTAMENTO'])),
    zona:           cleanText(pick(r, ['ZONA','Zona'])),
    tecnico:        cleanText(pick(r, ['Nombres Tecnico Ejecutor','Nombres Técnico Ejecutor','Tecnico Ejecutor'])),
    tecnicoResp:    cleanText(pick(r, ['Nombres Tecnico Responsable','Nombres Técnico Responsable'])),
    observaciones:  obs,
    obsTecnico:     obsTec,
    detalleMaterial: detalleMat,
    fechaIngreso:   parseFecha(pick(r, ['Fecha Ing.','F. Recep.'])),
    fechaEjecucion: parseFecha(pick(r, ['Fecha Ejecucion','Fecha Ejecución'])),
    tipoAsignacion: cleanText(pick(r, ['Tipo Asignacion','Tipo Asignación'])),
    segmento:       cleanText(pick(r, ['Segmento'])),
    canalAtencion:  cleanText(pick(r, ['CANAL DE ATENCIÓN','Canal de Atención'])),
    deteccion, wifi6Oblig, meshSug, revisarTec, equipoOk
  };
}

/* ==================== IMPORT SEGUIMIENTO ==================== */
function importRowsSeg(rows, filename='Directo'){
  const mapped = rows.map(mapRowSeg).filter(c => c.nombre || c.os || c.id_interno || c.telefono);
  if (!mapped.length) return toast('No se reconocieron filas válidas');

  stateSeg.casos.forEach(c => c.esNueva = false);
  const existentes = new Map(stateSeg.casos.map(c => [keySeg(c), c]));
  let nuevos = 0, actualizados = 0, adicionalesNuevos = 0;
  const listaAdicNuevos = [];

  mapped.forEach(nc => {
    const k = keySeg(nc);
    const prev = existentes.get(k);
    if (prev){
      Object.assign(prev, {
        id_interno: nc.id_interno || prev.id_interno,
        os: nc.os || prev.os, osSig: nc.osSig || prev.osSig, nroTac: nc.nroTac || prev.nroTac,
        codVenta: nc.codVenta || prev.codVenta,
        fecha: nc.fecha || prev.fecha, hora: nc.hora || prev.hora,
        empresa: nc.empresa || prev.empresa, contratista: nc.contratista || prev.contratista,
        cuadrilla: nc.cuadrilla || prev.cuadrilla,
        tipoProg: nc.tipoProg || prev.tipoProg, tipoTrabajo: nc.tipoTrabajo || prev.tipoTrabajo,
        telefono: nc.telefono || prev.telefono, telefono2: nc.telefono2 || prev.telefono2,
        telefono3: nc.telefono3 || prev.telefono3, telefonoRef: nc.telefonoRef || prev.telefonoRef,
        dni: nc.dni || prev.dni, nombre: nc.nombre || prev.nombre,
        direccion: nc.direccion || prev.direccion, distrito: nc.distrito || prev.distrito,
        provincia: nc.provincia || prev.provincia, departamento: nc.departamento || prev.departamento,
        zona: nc.zona || prev.zona, coords: nc.coords || prev.coords,
        tipoVivienda: nc.tipoVivienda || prev.tipoVivienda, codigoPlano: nc.codigoPlano || prev.codigoPlano,
        vendedor: nc.vendedor || prev.vendedor, gestor: nc.gestor || prev.gestor,
        area: nc.area || prev.area
      });
      if (nc.esAdicional) prev.esAdicional = true;
      if (nc.estadoOrigen && nc.estadoOrigen !== prev.estadoOrigen) registrarCambioEstadoSeg(prev, nc.estadoOrigen);
      actualizados++;
    } else {
      const nuevo = {
        _id: uid(), ...nc,
        estado: 'nuevo', esNueva: true,
        seguimiento: [], llamada: null,
        historialEstado: nc.estadoOrigen ? [{ estado: nc.estadoOrigen, fecha: nowISO() }] : [],
        creado: nowISO()
      };
      stateSeg.casos.push(nuevo);
      existentes.set(k, nuevo);
      nuevos++;
      if (nc.esAdicional){ adicionalesNuevos++; listaAdicNuevos.push(nuevo); }
    }
  });

  stateSeg.historial.unshift({ fecha: nowISO(), archivo: filename, total: mapped.length, nuevos, actualizados, adicionalesNuevos });
  stateSeg.historial = stateSeg.historial.slice(0, 6);
  saveSeg();
  limpiarFiltrosSeg();
  toast(`✓ ${nuevos} nuevas · ${actualizados} actualizadas${adicionalesNuevos ? ' · 📌 ' + adicionalesNuevos + ' adicionales' : ''}`);
  renderImportInfoSeg();
  renderFiltroBtnsSeg(); renderFiltroBtnsCarga(); renderFiltroBtnsKpi();
  renderCasos(); renderConf(); renderCarga(); renderKpis(); renderReporte(); renderAdicionales();
  // Avisar solo en la sincronización automática (no al subir un Excel a mano)
  if (listaAdicNuevos.length && /^Sincro/.test(filename || '')) notificarAdicionales(listaAdicNuevos);
  evaluarAlertasTiempo();
}

async function handleFileSeg(file){
  const name = (file.name||'').toLowerCase();
  try {
    if (name.endsWith('.html') || name.endsWith('.htm')){
      return importRowsSeg(parseHTMLTable(await file.text()), file.name);
    }
    const buf = await file.arrayBuffer();
    const head = new TextDecoder('utf-8',{fatal:false}).decode(buf.slice(0,800));
    if (/<table/i.test(head) || head.trim().startsWith('<')){
      return importRowsSeg(parseHTMLTable(new TextDecoder('utf-8',{fatal:false}).decode(buf)), file.name);
    }
    const wb = XLSX.read(buf, { type:'array', cellDates:true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:'' });
    if (!rows.length) return toast('El archivo no tiene filas');
    importRowsSeg(rows, file.name);
  } catch(err){
    console.error(err);
    toast('Error: ' + (err.message || err));
  }
}

/* ==================== IMPORT DISPONIBILIDAD ==================== */
function importRowsDisp(rows, filename='Directo'){
  const mapped = rows.map(mapRowSeg).filter(c => c.nombre || c.os || c.id_interno || c.telefono);
  if (!mapped.length) return toast('No se reconocieron filas válidas');

  stateDisp.casos = mapped.map(nc => ({
    _id: uid(), ...nc,
    estado: 'nuevo', esNueva: true,
    disponible: null,
    seguimiento: [],
    historialEstado: nc.estadoOrigen ? [{ estado: nc.estadoOrigen, fecha: nowISO() }] : [],
    creado: nowISO()
  }));

  stateDisp.historial.unshift({ fecha: nowISO(), archivo: filename, total: mapped.length });
  stateDisp.historial = stateDisp.historial.slice(0, 6);
  saveDisp();
  limpiarFiltrosDisp();
  toast(`✓ ${mapped.length} casos cargados en Disponibilidad`);
  renderImportInfoDisp(); renderFiltroBtnsDisp(); renderDisp(); renderDReporte();
}

async function handleFileDisp(file){
  const name = (file.name||'').toLowerCase();
  try {
    if (name.endsWith('.html') || name.endsWith('.htm')){
      return importRowsDisp(parseHTMLTable(await file.text()), file.name);
    }
    const buf = await file.arrayBuffer();
    const head = new TextDecoder('utf-8',{fatal:false}).decode(buf.slice(0,800));
    if (/<table/i.test(head) || head.trim().startsWith('<')){
      return importRowsDisp(parseHTMLTable(new TextDecoder('utf-8',{fatal:false}).decode(buf)), file.name);
    }
    const wb = XLSX.read(buf, { type:'array', cellDates:true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:'' });
    if (!rows.length) return toast('El archivo no tiene filas');
    importRowsDisp(rows, file.name);
  } catch(err){
    console.error(err);
    toast('Error: ' + (err.message || err));
  }
}

/* ==================== IMPORT EQUIPOS Y PLANES ==================== */
function importRowsEq(rows, filename='Directo'){
  const mapped = rows.map(mapRowEq).filter(c => c.id_servicio || c.nro_os || c.cliente);
  if (!mapped.length) return toast('No se reconocieron filas válidas');

  stateEq.casos = mapped.map(c => ({ _id: uid(), ...c, creado: nowISO() }));
  stateEq.historial.unshift({ fecha: nowISO(), archivo: filename, total: mapped.length });
  stateEq.historial = stateEq.historial.slice(0, 6);
  saveEq();
  limpiarFiltrosEq();

  const w6 = stateEq.casos.filter(c => c.deteccion === 'wifi6_req').length;
  const ms = stateEq.casos.filter(c => c.deteccion === 'mesh_req').length;
  toast(`✓ ${mapped.length} órdenes · ${w6} req Wifi6 · ${ms} req Mesh`);
  renderImportInfoEq(); renderFiltroBtnsEq(); renderEqAnalisis(); renderEqReporte();
}

async function handleFileEq(file){
  const name = (file.name||'').toLowerCase();
  try {
    if (name.endsWith('.html') || name.endsWith('.htm')){
      return importRowsEq(parseHTMLTable(await file.text()), file.name);
    }
    const buf = await file.arrayBuffer();
    const head = new TextDecoder('utf-8',{fatal:false}).decode(buf.slice(0,800));
    if (/<table/i.test(head) || head.trim().startsWith('<')){
      return importRowsEq(parseHTMLTable(new TextDecoder('utf-8',{fatal:false}).decode(buf)), file.name);
    }
    const wb = XLSX.read(buf, { type:'array', cellDates:true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = sheetToRows(ws);
    if (!rows.length) return toast('El archivo no tiene filas');
    importRowsEq(rows, file.name);
  } catch(err){
    console.error(err);
    toast('Error: ' + (err.message || err));
  }
}

/* ==================== AVISOS DE ADICIONALES ==================== */
const KEY_NOTIF = 'zaaz_notif_adicionales';
let notifOn = false;
try { notifOn = localStorage.getItem(KEY_NOTIF) === '1'; } catch(e){}
let _tituloOriginal = document.title, _parpadeoId = null, _audioCtx = null;

/* Filtros de avisos: solo avisa de adicionales que coincidan (sin filtros = avisa de todos) */
const KEY_NOTIF_FILTROS = 'zaaz_notif_filtros';
const FILTROS_NOTIF_DEF = { cuadrillas:[], contratistas:[], empresas:[], distritos:[] };
const CAMPO_NOTIF = { cuadrillas:'cuadrilla', contratistas:'contratista', empresas:'empresa', distritos:'distrito' };
let notifFiltros = JSON.parse(JSON.stringify(FILTROS_NOTIF_DEF));
try {
  const g = JSON.parse(localStorage.getItem(KEY_NOTIF_FILTROS) || 'null');
  if (g) Object.keys(FILTROS_NOTIF_DEF).forEach(k => { if (Array.isArray(g[k])) notifFiltros[k] = g[k]; });
} catch(e){}
function saveNotifFiltros(){ try { localStorage.setItem(KEY_NOTIF_FILTROS, JSON.stringify(notifFiltros)); } catch(e){} }
function renderFiltroBtnsNotif(){ renderFilterBtnsGroup('notif', notifFiltros, (k,v) => v); }
function getOptionsNotif(key){
  const campo = CAMPO_NOTIF[key];
  const deDatos = uniqNormalizado(stateSeg.casos.map(c => c[campo]));
  // Los ya elegidos siempre aparecen, aunque ahora no haya casos con ese valor
  return [...new Set([...deDatos, ...(notifFiltros[key] || [])])].sort((x, y) => x.localeCompare(y));
}
function adicionalPasaFiltroNotif(c){
  return Object.keys(CAMPO_NOTIF).every(k => {
    const vals = notifFiltros[k] || [];
    return !vals.length || vals.some(v => norm(v) === norm(c[CAMPO_NOTIF[k]]));
  });
}

function pintarBtnNotif(){
  const b = $('#btnNotif'); if (!b) return;
  b.textContent = notifOn ? '🔔 Avisos activos' : '🔕 Avisos';
  b.classList.toggle('primary', notifOn);
}

async function toggleNotifAdicionales(){
  if (notifOn){
    notifOn = false;
    try { localStorage.setItem(KEY_NOTIF, '0'); } catch(e){}
    pintarBtnNotif(); return toast('Avisos desactivados');
  }
  notifOn = true;
  try { localStorage.setItem(KEY_NOTIF, '1'); } catch(e){}
  // El permiso y el audio solo se pueden activar con un clic del usuario
  try { _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)(); _audioCtx.resume(); } catch(e){}
  if ('Notification' in window && Notification.permission === 'default'){
    try { await Notification.requestPermission(); } catch(e){}
  }
  pintarBtnNotif();
  sonidoAviso();
  if (!('Notification' in window) || Notification.permission !== 'granted')
    toast('Avisos activos con sonido y título. Para notificaciones del sistema, permítelas en el navegador.');
  else toast('🔔 Avisos activados');
}

function sonidoAviso(grave){
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    _audioCtx.resume();
    [0, 0.2].forEach((t, i) => {
      const o = _audioCtx.createOscillator(), g = _audioCtx.createGain();
      o.frequency.value = grave ? (i ? 330 : 440) : (i ? 1000 : 780); o.connect(g); g.connect(_audioCtx.destination);
      const t0 = _audioCtx.currentTime + t;
      g.gain.setValueAtTime(0.25, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
      o.start(t0); o.stop(t0 + 0.2);
    });
  } catch(e){}
}

function parpadearTitulo(texto){
  if (_parpadeoId) clearInterval(_parpadeoId);
  let on = false;
  _parpadeoId = setInterval(() => { on = !on; document.title = on ? texto : _tituloOriginal; }, 1000);
  const parar = () => {
    if (document.visibilityState !== 'visible') return;
    clearInterval(_parpadeoId); _parpadeoId = null; document.title = _tituloOriginal;
    document.removeEventListener('visibilitychange', parar);
  };
  document.addEventListener('visibilitychange', parar);
}

function notificarAdicionales(lista){
  if (!notifOn || !lista || !lista.length) return;
  lista = lista.filter(adicionalPasaFiltroNotif);
  if (!lista.length) return;
  sonidoAviso();
  if (document.visibilityState !== 'visible') parpadearTitulo(`📌 (${lista.length}) Adicional nuevo`);
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const abrir = () => { window.focus(); const b = document.querySelector('[data-section="seguimiento"]'); if (b) b.click(); };
  const mostrar = (titulo, cuerpo, tag) => {
    try { const n = new Notification(titulo, { body: cuerpo, tag, requireInteraction: true }); n.onclick = () => { abrir(); n.close(); }; } catch(e){}
  };
  if (lista.length > 3){
    mostrar(`📌 ${lista.length} adicionales nuevos`, 'Abre Seguimiento > Adicionales para revisarlos.', 'adic-resumen');
  } else {
    lista.forEach(c => mostrar('📌 Adicional nuevo',
      [c.nombre, c.distrito, idCaso(c) && ('ID ' + idCaso(c))].filter(Boolean).join(' · '), 'adic-' + (c._id || idCaso(c) || Math.random())));
  }
}

/* ==================== ALERTAS DE TIEMPO (en camino / en proceso) ==================== */
// Minutos en el estado. "consultar" = preguntar a la cuadrilla; "presionar" = exigir avance.
const UMBRALES_TIEMPO = {
  en_camino:  { consultar: 45, presionar: 60 },
  en_proceso: { consultar: 60, presionar: 90 }
};
const ETQ_ESTADO_T = { en_camino: 'En camino', en_proceso: 'En proceso' };
const COLOR_NIVEL = { presionar: '#dc2626', consultar: '#d97706', '': '#059669' };
const KEY_ALERTAS = 'zaaz_alertas_vistas';
let _alertasVistas = new Set();
try { _alertasVistas = new Set(JSON.parse(localStorage.getItem(KEY_ALERTAS) || '[]')); } catch(e){}

/* Gestiones: "ya consulté" / "ya presioné" por cada caso en alerta (se guardan en el navegador) */
const KEY_GESTIONES = 'zaaz_gestiones';
let gestiones = {};
try { gestiones = JSON.parse(localStorage.getItem(KEY_GESTIONES) || '{}') || {}; } catch(e){ gestiones = {}; }
const keyTramo = t => `${t.c._id}|${t.clave}|${t.ini}`;
function saveGestiones(){ try { localStorage.setItem(KEY_GESTIONES, JSON.stringify(gestiones)); } catch(e){} }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-gk]'); if (!b) return;
  const k = b.dataset.gk, tipo = b.dataset.gt;
  if (tipo.startsWith('undo-')){
    const t = tipo.slice(5);
    if (gestiones[k]){ delete gestiones[k][t]; if (!Object.keys(gestiones[k]).length) delete gestiones[k]; saveGestiones(); renderAlertas(); }
    return;
  }
  const nota = prompt(tipo === 'consulta' ? 'Nota de la consulta (opcional):' : 'Nota de la presión (opcional):', '');
  if (nota === null) return;
  (gestiones[k] = gestiones[k] || {})[tipo] = { ts: Date.now(), nota: nota.trim() };
  saveGestiones(); renderAlertas();
});

/* Filtros de la pestaña Alertas (solo distrito y contratista) */
const KEY_ALERT_FILTROS = 'zaaz_alert_filtros';
const CAMPO_ALERT = { distritos: 'distrito', contratistas: 'contratista' };
let alertFiltros = { distritos: [], contratistas: [] };
try {
  const g = JSON.parse(localStorage.getItem(KEY_ALERT_FILTROS) || 'null');
  if (g) Object.keys(CAMPO_ALERT).forEach(k => { if (Array.isArray(g[k])) alertFiltros[k] = g[k]; });
} catch(e){}
function saveAlertFiltros(){ try { localStorage.setItem(KEY_ALERT_FILTROS, JSON.stringify(alertFiltros)); } catch(e){} }
function renderFiltroBtnsAlert(){ renderFilterBtnsGroup('alert', alertFiltros, (k, v) => v); }
function getOptionsAlert(key){
  const deDatos = uniqNormalizado(stateSeg.casos.map(c => c[CAMPO_ALERT[key]]));
  return [...new Set([...deDatos, ...(alertFiltros[key] || [])])].sort((x, y) => x.localeCompare(y));
}
function pasaFiltroAlertas(c){
  return Object.keys(CAMPO_ALERT).every(k => {
    const vals = alertFiltros[k] || [];
    return !vals.length || vals.some(v => norm(v) === norm(c[CAMPO_ALERT[k]]));
  });
}

const idCaso = c => c.id_interno || c.os || '';   // ID; si no tiene, la OS (nunca la OS SIG)

function fmtMin(m){
  m = Math.round(m);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}
const fmtHoraMs = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function stampArchivo(){
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
function nivelTiempo(clave, min){
  const u = UMBRALES_TIEMPO[clave]; if (!u) return '';
  return min >= u.presionar ? 'presionar' : (min >= u.consultar ? 'consultar' : '');
}
// Tiempo que un caso pasó en cada estado vigilado (el último tramo sigue abierto)
function tramosTiempoCaso(c, ahora){
  const h = (c.historialEstado || []).filter(x => x && x.estado && x.fecha);
  const out = [];
  h.forEach((x, i) => {
    const clave = claveEstadoCarga(x.estado);
    if (!UMBRALES_TIEMPO[clave]) return;
    const ini = new Date(x.fecha).getTime();
    const sig = h[i + 1];
    const fin = sig ? new Date(sig.fecha).getTime() : ahora;
    if (isNaN(ini) || isNaN(fin) || fin < ini) return;
    const min = (fin - ini) / 60000;
    out.push({ c, clave, ini, fin, min, abierto: !sig, destino: sig ? sig.estado : '', nivel: nivelTiempo(clave, min) });
  });
  // El estado que se ve en Casos manda: si el caso ya no está en ese estado, el tramo se cierra
  const ult = out[out.length - 1];
  if (ult && ult.abierto && claveEstadoCarga(c.estadoOrigen) !== ult.clave){
    ult.abierto = false; ult.fin = ahora; ult.min = (ahora - ult.ini) / 60000;
    ult.destino = c.estadoOrigen || ''; ult.nivel = nivelTiempo(ult.clave, ult.min);
  }
  return out;
}
function datosAlertas(todos){
  const ahora = Date.now();
  const tramos = [];
  (todos ? stateSeg.casos : stateSeg.casos.filter(pasaFiltroAlertas)).forEach(c => tramos.push(...tramosTiempoCaso(c, ahora)));
  tramos.forEach(t => { t.g = gestiones[keyTramo(t)] || null; });
  const alertas = tramos.filter(t => t.abierto && t.nivel)
    .sort((a, b) => ((b.nivel === 'presionar') - (a.nivel === 'presionar')) || (b.min - a.min));

  const porCuad = new Map();
  tramos.forEach(t => {
    const k = t.c.cuadrilla || '(sin cuadrilla)';
    if (!porCuad.has(k)) porCuad.set(k, { cuadrilla: k, en_camino: [], en_proceso: [], consultar: 0, presionar: 0, consultas: 0, presiones: 0, resp: [] });
    const o = porCuad.get(k);
    o[t.clave].push(t.min);
    if (t.nivel === 'presionar') o.presionar++; else if (t.nivel === 'consultar') o.consultar++;
    if (t.g){
      if (t.g.consulta) o.consultas++;
      if (t.g.presion)  o.presiones++;
      const ts = Math.min(...[t.g.consulta && t.g.consulta.ts, t.g.presion && t.g.presion.ts].filter(Boolean));
      if (!t.abierto && isFinite(ts) && t.fin >= ts) o.resp.push((t.fin - ts) / 60000);   // cuánto tardó en avanzar tras la gestión
    }
  });
  const est = a => a.length ? { n: a.length, prom: a.reduce((x, y) => x + y, 0) / a.length, max: Math.max(...a) } : { n: 0, prom: 0, max: 0 };
  const cuadrillas = [...porCuad.values()].map(o => ({
    cuadrilla: o.cuadrilla, camino: est(o.en_camino), proceso: est(o.en_proceso), consultar: o.consultar, presionar: o.presionar,
    consultas: o.consultas, presiones: o.presiones, resp: est(o.resp)
  })).sort((a, b) => (b.presionar - a.presionar) || (b.consultar - a.consultar) ||
                     (Math.max(b.camino.prom, b.proceso.prom) - Math.max(a.camino.prom, a.proceso.prom)));

  const cuenta = (clave, nivel) => alertas.filter(t => t.clave === clave && t.nivel === nivel).length;
  const resumen = {
    camino_consultar: cuenta('en_camino', 'consultar'),  camino_presionar: cuenta('en_camino', 'presionar'),
    proceso_consultar: cuenta('en_proceso', 'consultar'), proceso_presionar: cuenta('en_proceso', 'presionar')
  };
  return { ahora, tramos, alertas, cuadrillas, resumen, sinMov: datosSinMovimiento(todos), zonas: datosZonas(todos) };
}

/* ---- Cuadrillas sin movimiento ---- */
const UMBRAL_SIN_MOV = 30;   // minutos
const ESTADOS_MOVIMIENTO = new Set(['en_camino', 'en_proceso', 'instalado', 'solucionado']);
function horaAMs(hora, diaISO){
  const m = String(hora || '').match(/(\d{1,2}):(\d{2})/);
  return m ? new Date(`${diaISO}T${m[1].padStart(2, '0')}:${m[2]}:00`).getTime() : null;
}
// Cuadrillas con casos programados cuya hora ya pasó, nadie en camino ni en proceso y sin cambios de estado recientes
function datosSinMovimiento(todos){
  const ahora = Date.now(), hoy = diaLocal(ahora), lim = ahora - UMBRAL_SIN_MOV * 60000;
  const casos = (todos ? stateSeg.casos : stateSeg.casos.filter(pasaFiltroAlertas)).filter(c => c.cuadrilla && (!c.fecha || c.fecha === hoy));
  const porCuad = new Map();
  casos.forEach(c => { if (!porCuad.has(c.cuadrilla)) porCuad.set(c.cuadrilla, []); porCuad.get(c.cuadrilla).push(c); });
  const out = [];
  porCuad.forEach((lista, cuadrilla) => {
    const claves = lista.map(c => claveEstadoCarga(c.estadoOrigen));
    if (claves.some(k => k === 'en_camino' || k === 'en_proceso')) return;          // está trabajando
    const vencidos = lista.filter((c, i) => { const t = horaAMs(c.hora, hoy); return claves[i] === 'programado' && !esAlMomento(c) && t !== null && t <= lim; });
    if (!vencidos.length) return;
    vencidos.sort((a, b) => horaAMs(a.hora, hoy) - horaAMs(b.hora, hoy));
    const primera = horaAMs(vencidos[0].hora, hoy);
    let ultima = 0;
    lista.forEach(c => (c.historialEstado || []).forEach(h => {
      if (!ESTADOS_MOVIMIENTO.has(claveEstadoCarga(h.estado))) return;
      const t = new Date(h.fecha).getTime(); if (t > ultima) ultima = t;
    }));
    const min = (ahora - Math.max(primera, ultima)) / 60000;
    if (min < UMBRAL_SIN_MOV) return;
    out.push({ cuadrilla, contratista: vencidos[0].contratista || '', vencidos, pendientes: vencidos.length, primera, ultima, min });
  });
  return out.sort((a, b) => b.min - a.min);
}
/* ---- Zonas calientes: distritos donde se acumulan problemas ---- */
const UMBRAL_ZONA = 4, UMBRAL_ZONA_CRIT = 8;
function datosZonas(todos){
  const ahora = Date.now(), hoy = diaLocal(ahora), lim = ahora - UMBRAL_SIN_MOV * 60000;
  const casos = (todos ? stateSeg.casos : stateSeg.casos.filter(pasaFiltroAlertas)).filter(c => c.distrito && (!c.fecha || c.fecha === hoy));
  const m = new Map();
  casos.forEach(c => {
    const k = claveEstadoCarga(c.estadoOrigen), t = horaAMs(c.hora, hoy);
    const vencido = k === 'programado' && !esAlMomento(c) && t !== null && t <= lim;
    const reprog = k === 'reprogramado', stand = k === 'stand_by';
    if (!vencido && !reprog && !stand) return;
    const kd = norm(c.distrito);
    if (!m.has(kd)) m.set(kd, { distrito: c.distrito, vencidos: 0, reprog: 0, standby: 0, casos: [] });
    const o = m.get(kd);
    if (vencido) o.vencidos++; if (reprog) o.reprog++; if (stand) o.standby++;
    o.casos.push(c);
  });
  return [...m.values()].map(o => Object.assign(o, { total: o.vencidos + o.reprog + o.standby }))
    .filter(o => o.total >= UMBRAL_ZONA)
    .map(o => Object.assign(o, { nivel: o.total >= UMBRAL_ZONA_CRIT ? 'presionar' : 'consultar' }))
    .sort((a, b) => b.total - a.total);
}
function notificarZonas(lista){
  if (!notifOn || !lista.length) return;
  sonidoAviso(true);
  if (document.visibilityState !== 'visible') parpadearTitulo(`🔥 (${lista.length}) Zonas calientes`);
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const mostrar = (titulo, cuerpo, tag) => {
    try {
      const n = new Notification(titulo, { body: cuerpo, tag });
      n.onclick = () => { window.focus(); const b = document.querySelector('[data-tab="alertas"]'); if (b) b.click(); n.close(); };
    } catch(e){}
  };
  if (lista.length > 3) mostrar(`🔥 ${lista.length} zonas calientes`, 'Abre la pestaña Alertas para ver los distritos.', 'zonas-resumen');
  else lista.forEach(z => mostrar(`🔥 Zona caliente · ${z.distrito}`,
    `${z.total} casos con problema (${z.vencidos} vencidos, ${z.reprog} reprogramados, ${z.standby} stand by)`, `zona-${z.distrito}-${z.nivel}`));
}

function notificarSinMovimiento(lista){
  if (!notifOn || !lista.length) return;
  sonidoAviso(true);
  if (document.visibilityState !== 'visible') parpadearTitulo(`🕒 (${lista.length}) Cuadrillas sin movimiento`);
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const mostrar = (titulo, cuerpo, tag) => {
    try {
      const n = new Notification(titulo, { body: cuerpo, tag });
      n.onclick = () => { window.focus(); const b = document.querySelector('[data-tab="alertas"]'); if (b) b.click(); n.close(); };
    } catch(e){}
  };
  if (lista.length > 3) mostrar(`🕒 ${lista.length} cuadrillas sin movimiento`, 'Abre la pestaña Alertas para ver cuáles.', 'sinmov-resumen');
  else lista.forEach(s => mostrar(`🕒 Sin movimiento · ${s.cuadrilla}`,
    `${s.pendientes} caso(s) programado(s) desde las ${fmtHoraMs(s.primera)}, sin movimiento hace ${fmtMin(s.min)}`, `sinmov-${s.cuadrilla}`));
}

function actualizarBadgeAlertas(d){
  const b = $('#alertasBadge'); if (!b) return;
  const n = d.alertas.length + d.sinMov.length + d.zonas.length;
  b.style.display = n ? '' : 'none';
  b.textContent = n;
  b.style.background = d.alertas.some(t => t.nivel === 'presionar') ? '#dc2626' : '#d97706';
}

function renderAlertas(){
  const d = datosAlertas();
  const u = UMBRALES_TIEMPO;
  actualizarBadgeAlertas(d);

  const info = $('#alertasUmbrales');
  if (info) info.innerHTML =
    `<b>En camino:</b> consultar desde ${u.en_camino.consultar} min · presionar desde ${u.en_camino.presionar} min &nbsp;|&nbsp; ` +
    `<b>En proceso:</b> consultar desde ${u.en_proceso.consultar} min · presionar desde ${u.en_proceso.presionar} min`;

  const tarjeta = (n, t, col) =>
    `<div style="flex:1;min-width:130px;border-radius:12px;padding:12px;background:${col}1f;border:1px solid ${col}66">
       <div style="font-size:26px;font-weight:800;color:${col}">${n}</div><div style="font-size:12px">${t}</div></div>`;
  const rs = $('#alertasResumen');
  if (rs) rs.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 4px">
    ${tarjeta(d.resumen.camino_presionar,  '🔴 En camino · presionar',  COLOR_NIVEL.presionar)}
    ${tarjeta(d.resumen.camino_consultar,  '🟡 En camino · consultar',  COLOR_NIVEL.consultar)}
    ${tarjeta(d.resumen.proceso_presionar, '🔴 En proceso · presionar', COLOR_NIVEL.presionar)}
    ${tarjeta(d.resumen.proceso_consultar, '🟡 En proceso · consultar', COLOR_NIVEL.consultar)}</div>`;

  const th = 'padding:6px 8px;text-align:left;border-bottom:1px solid var(--border,#ddd)';
  const td = 'padding:6px 8px;border-bottom:1px solid var(--border,#eee)';
  const gestionHTML = t => {
    const k = esc(keyTramo(t)), g = t.g || {};
    const parte = (tipo, rot, ico, btn) => g[tipo]
      ? `<span style="font-size:12px">${ico} ${rot} ${fmtHoraMs(g[tipo].ts)}${g[tipo].nota ? ' · ' + esc(g[tipo].nota) : ''}
           <button class="btn sm" type="button" data-gk="${k}" data-gt="undo-${tipo}" title="Deshacer" style="padding:0 6px">✕</button></span>`
      : `<button class="btn sm" type="button" data-gk="${k}" data-gt="${tipo}">${ico} ${btn}</button>`;
    return `<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">${parte('consulta', 'Consultado', '✅', 'Consulté')}${parte('presion', 'Presionado', '📣', 'Presioné')}</div>`;
  };
  const lista = $('#alertasLista');
  if (lista) lista.innerHTML = d.alertas.length
    ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr><th style="${th}">Acción</th><th style="${th}">Cuadrilla</th><th style="${th}">Estado</th><th style="${th}">Tiempo</th>
        <th style="${th}">Cliente</th><th style="${th}">ID</th><th style="${th}">Distrito</th><th style="${th}">Desde</th><th style="${th}">Gestión</th></tr></thead><tbody>
        ${d.alertas.map(t => `<tr>
          <td style="${td};font-weight:700;color:${COLOR_NIVEL[t.nivel]}">${t.nivel === 'presionar' ? '🔴 Presionar' : '🟡 Consultar'}</td>
          <td style="${td}">${esc(t.c.cuadrilla || '(sin cuadrilla)')}</td>
          <td style="${td}">${ETQ_ESTADO_T[t.clave]}</td>
          <td style="${td};font-weight:700;color:${COLOR_NIVEL[t.nivel]}">${fmtMin(t.min)}</td>
          <td style="${td}">${esc(t.c.nombre || '')}</td>
          <td style="${td}">${idCaso(t.c) ? `<span class="clip-btn" style="cursor:pointer;text-decoration:underline dotted" title="Clic para copiar" onclick="copyText('${esc(idCaso(t.c))}','ID')">${esc(idCaso(t.c))}</span>` : ''}</td>
          <td style="${td}">${esc(t.c.distrito || '')}</td>
          <td style="${td}">${fmtHoraMs(t.ini)}</td><td style="${td}">${gestionHTML(t)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">✅ Ningún caso supera los tiempos por ahora.</div>';

  const sm = $('#alertasSinMov');
  if (sm) sm.innerHTML = d.sinMov.length
    ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr><th style="${th}">Cuadrilla</th><th style="${th}">Contratista</th><th style="${th}">Casos vencidos</th><th style="${th}">Primera hora</th>
        <th style="${th}">Último movimiento</th><th style="${th}">Sin movimiento</th><th style="${th}">ID más antiguo</th></tr></thead><tbody>
        ${d.sinMov.map(s => `<tr>
          <td style="${td};font-weight:600">${esc(s.cuadrilla)}</td><td style="${td}">${esc(s.contratista)}</td>
          <td style="${td};text-align:center">${s.pendientes}</td><td style="${td}">${fmtHoraMs(s.primera)}</td>
          <td style="${td}">${s.ultima ? fmtHoraMs(s.ultima) : '—'}</td>
          <td style="${td};font-weight:700;color:${COLOR_NIVEL[s.min >= UMBRAL_SIN_MOV * 2 ? 'presionar' : 'consultar']}">${fmtMin(s.min)}</td>
          <td style="${td}">${idCaso(s.vencidos[0]) ? `<span class="clip-btn" style="cursor:pointer;text-decoration:underline dotted" title="Clic para copiar" onclick="copyText('${esc(idCaso(s.vencidos[0]))}','ID')">${esc(idCaso(s.vencidos[0]))}</span>` : ''}</td></tr>`).join('')}
        </tbody></table></div>`
    : '<div class="empty">✅ Todas las cuadrillas con casos vencidos están en movimiento.</div>';

  const zn = $('#alertasZonas');
  if (zn) zn.innerHTML = d.zonas.length
    ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr><th style="${th}">Distrito</th><th style="${th};text-align:center">Vencidos</th><th style="${th};text-align:center">Reprogramados</th>
        <th style="${th};text-align:center">Stand by</th><th style="${th};text-align:center">Total</th><th style="${th};text-align:center">Nivel</th></tr></thead><tbody>
        ${d.zonas.map(z => `<tr><td style="${td};font-weight:600">${esc(z.distrito)}</td><td style="${td};text-align:center">${z.vencidos}</td>
          <td style="${td};text-align:center">${z.reprog}</td><td style="${td};text-align:center">${z.standby}</td>
          <td style="${td};text-align:center;font-weight:700">${z.total}</td>
          <td style="${td};text-align:center;font-weight:700;color:${COLOR_NIVEL[z.nivel]}">${z.nivel === 'presionar' ? '🔴 Crítica' : '🟡 Caliente'}</td></tr>`).join('')}
        </tbody></table></div>`
    : '<div class="empty">✅ Ningún distrito acumula problemas.</div>';

  const cu = $('#alertasCuadrillas');
  const celda = (e, clave) => e.n
    ? `<td style="${td};text-align:center">${e.n}</td>
       <td style="${td};text-align:center;font-weight:700;color:${COLOR_NIVEL[nivelTiempo(clave, e.prom)]}">${fmtMin(e.prom)}</td>
       <td style="${td};text-align:center;color:${COLOR_NIVEL[nivelTiempo(clave, e.max)]}">${fmtMin(e.max)}</td>`
    : `<td style="${td};text-align:center;color:var(--muted)" colspan="3">—</td>`;
  if (cu) cu.innerHTML = d.cuadrillas.length
    ? `<div class="hint" style="margin-bottom:8px">Ordenadas de la que más excede los tiempos a la que menos. Incluye casos que siguen abiertos. "Tardó en avanzar" es el promedio desde que la consultaste o presionaste hasta que el caso cambió de estado.</div>
       <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr><th style="${th}" rowspan="2">Cuadrilla</th>
          <th style="${th};text-align:center" colspan="3">En camino</th><th style="${th};text-align:center" colspan="3">En proceso</th>
          <th style="${th};text-align:center" colspan="2">Veces excedido</th><th style="${th};text-align:center" colspan="3">Gestión</th></tr>
        <tr><th style="${th};text-align:center">Casos</th><th style="${th};text-align:center">Prom.</th><th style="${th};text-align:center">Máx.</th>
          <th style="${th};text-align:center">Casos</th><th style="${th};text-align:center">Prom.</th><th style="${th};text-align:center">Máx.</th>
          <th style="${th};text-align:center">🟡</th><th style="${th};text-align:center">🔴</th><th style="${th};text-align:center">Consultas</th><th style="${th};text-align:center">Presiones</th><th style="${th};text-align:center">Tardó en avanzar</th></tr></thead><tbody>
        ${d.cuadrillas.map(f => `<tr><td style="${td}">${esc(f.cuadrilla)}</td>
          ${celda(f.camino, 'en_camino')}${celda(f.proceso, 'en_proceso')}
          <td style="${td};text-align:center">${f.consultar}</td><td style="${td};text-align:center;font-weight:700">${f.presionar}</td><td style="${td};text-align:center">${f.consultas}</td><td style="${td};text-align:center">${f.presiones}</td><td style="${td};text-align:center">${f.resp.n ? fmtMin(f.resp.prom) : '—'}</td></tr>`).join('')}
        </tbody></table></div>`
    : '<div class="empty">Aún no hay casos que hayan pasado por "en camino" o "en proceso".</div>';
}

// Revisa si algún caso cruzó un umbral; avisa una sola vez por caso, estado y nivel
function evaluarAlertasTiempo(){
  const d = datosAlertas(true);   // los avisos miran todos los casos; la pantalla, los filtrados
  const nuevas = d.alertas.filter(t => {
    const k = `${t.c._id}|${t.clave}|${t.ini}|${t.nivel}`;
    if (_alertasVistas.has(k)) return false;
    _alertasVistas.add(k); return true;
  });
  if (nuevas.length){ try { localStorage.setItem(KEY_ALERTAS, JSON.stringify([..._alertasVistas])); } catch(e){} }
  actualizarBadgeAlertas(datosAlertas());
  const panel = $('#panel-alertas');
  if (panel && panel.classList.contains('active')) renderAlertas();
  [['cierre', renderCierre], ['calidad', renderCalidad]].forEach(([n, fn]) => { const p = $('#panel-' + n); if (p && p.classList.contains('active')) fn(); });
  const pm = $('#panel-mapa'); if (pm && pm.classList.contains('active')) renderMapa();
  const avisar = nuevas.filter(t => adicionalPasaFiltroNotif(t.c));   // respeta los filtros de avisos
  if (avisar.length) notificarTiempos(avisar);
  const nuevasSM = d.sinMov.filter(s => {
    const k = `sinmov|${s.cuadrilla}|${s.primera}`;
    if (_alertasVistas.has(k)) return false;
    _alertasVistas.add(k); return true;
  });
  if (nuevasSM.length){
    try { localStorage.setItem(KEY_ALERTAS, JSON.stringify([..._alertasVistas])); } catch(e){}
    const avisarSM = nuevasSM.filter(s => adicionalPasaFiltroNotif(s.vencidos[0]));
    if (avisarSM.length) notificarSinMovimiento(avisarSM);
  }
  const nuevasZ = d.zonas.filter(z => {
    const k = `zona|${z.distrito}|${z.nivel}`;
    if (_alertasVistas.has(k)) return false;
    _alertasVistas.add(k); return true;
  });
  if (nuevasZ.length){
    try { localStorage.setItem(KEY_ALERTAS, JSON.stringify([..._alertasVistas])); } catch(e){}
    const avisarZ = nuevasZ.filter(z => adicionalPasaFiltroNotif(z.casos[0]));
    if (avisarZ.length) notificarZonas(avisarZ);
  }
}
function notificarTiempos(lista){
  if (!notifOn || !lista.length) return;
  const grave = lista.some(t => t.nivel === 'presionar');
  sonidoAviso(grave);
  if (document.visibilityState !== 'visible') parpadearTitulo(`⏱️ (${lista.length}) Casos por ${grave ? 'presionar' : 'consultar'}`);
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const mostrar = (titulo, cuerpo, tag, req) => {
    try {
      const n = new Notification(titulo, { body: cuerpo, tag, requireInteraction: !!req });
      n.onclick = () => { window.focus(); const b = document.querySelector('[data-tab="alertas"]'); if (b) b.click(); n.close(); };
    } catch(e){}
  };
  if (lista.length > 3){
    mostrar(`⏱️ ${lista.length} casos con tiempo excedido`, 'Abre la pestaña Alertas para ver cuáles consultar o presionar.', 'tiempo-resumen', grave);
  } else {
    lista.forEach(t => mostrar(
      `${t.nivel === 'presionar' ? '🔴 Presionar' : '🟡 Consultar'} · ${t.c.cuadrilla || 'sin cuadrilla'}`,
      [t.c.nombre, idCaso(t.c) && ('ID ' + idCaso(t.c)), `${ETQ_ESTADO_T[t.clave]} hace ${fmtMin(t.min)}`].filter(Boolean).join(' · '),
      `tiempo-${t.c._id}-${t.nivel}`, t.nivel === 'presionar'));
  }
}

/* ---- Descargas del reporte ---- */
function exportarAlertasExcel(){
  if (typeof XLSX === 'undefined') return toast('No se cargó la librería de Excel (¿hay internet?)');
  const d = datosAlertas();
  if (!d.tramos.length) return toast('Aún no hay datos de tiempos para exportar');
  const u = UMBRALES_TIEMPO, r1 = x => Math.round(x * 10) / 10;
  const gx = t => [t.g && t.g.consulta ? fmtHoraMs(t.g.consulta.ts) : '', (t.g && t.g.consulta && t.g.consulta.nota) || '',
                   t.g && t.g.presion ? fmtHoraMs(t.g.presion.ts) : '', (t.g && t.g.presion && t.g.presion.nota) || ''];
  const minAvance = t => {
    if (!t.g || t.abierto) return '';
    const ts = Math.min(...[t.g.consulta && t.g.consulta.ts, t.g.presion && t.g.presion.ts].filter(Boolean));
    return isFinite(ts) && t.fin >= ts ? r1((t.fin - ts) / 60000) : '';
  };
  const wb = XLSX.utils.book_new();
  const hoja = (nombre, aoa, anchos) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = anchos.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  };
  hoja('Resumen', [
    ['Reporte de tiempos entre estados'], ['Generado', new Date().toLocaleString()], [],
    ['Umbrales (min)', 'Consultar', 'Presionar'],
    ['En camino', u.en_camino.consultar, u.en_camino.presionar],
    ['En proceso', u.en_proceso.consultar, u.en_proceso.presionar], [],
    ['Alertas actuales', 'Consultar', 'Presionar'],
    ['En camino', d.resumen.camino_consultar, d.resumen.camino_presionar],
    ['En proceso', d.resumen.proceso_consultar, d.resumen.proceso_presionar]
  ], [30, 14, 14]);
  hoja('Alertas actuales',
    [['Acción', 'Cuadrilla', 'Estado', 'Minutos', 'Tiempo', 'Cliente', 'ID', 'Distrito', 'Contratista', 'Empresa', 'Desde', 'Consultado', 'Nota consulta', 'Presionado', 'Nota presión']]
      .concat(d.alertas.map(t => [t.nivel === 'presionar' ? 'Presionar' : 'Consultar', t.c.cuadrilla || '', ETQ_ESTADO_T[t.clave],
        r1(t.min), fmtMin(t.min), t.c.nombre || '', idCaso(t.c), t.c.distrito || '',
        t.c.contratista || '', t.c.empresa || '', fmtHoraMs(t.ini), ...gx(t)])),
    [12, 18, 12, 9, 12, 28, 14, 16, 16, 16, 8, 11, 24, 11, 24]);
  hoja('Zonas calientes',
    [['Distrito', 'Casos vencidos', 'Reprogramados', 'Stand by', 'Total', 'Nivel']]
      .concat(d.zonas.map(z => [z.distrito, z.vencidos, z.reprog, z.standby, z.total, z.nivel === 'presionar' ? 'Crítica' : 'Caliente'])),
    [22, 16, 16, 12, 10, 12]);
  hoja('Sin movimiento',
    [['Cuadrilla', 'Contratista', 'Casos vencidos', 'Primera hora programada', 'Último movimiento', 'Minutos sin movimiento', 'ID más antiguo']]
      .concat(d.sinMov.map(s => [s.cuadrilla, s.contratista, s.pendientes, fmtHoraMs(s.primera), s.ultima ? fmtHoraMs(s.ultima) : '',
        r1(s.min), idCaso(s.vencidos[0])])),
    [20, 16, 14, 22, 18, 20, 14]);
  hoja('Por cuadrilla',
    [['Cuadrilla', 'En camino: casos', 'En camino: prom (min)', 'En camino: máx (min)', 'En proceso: casos', 'En proceso: prom (min)',
      'En proceso: máx (min)', 'Veces consultar', 'Veces presionar', 'Consultas hechas', 'Presiones hechas', 'Prom. min en avanzar tras gestión']]
      .concat(d.cuadrillas.map(f => [f.cuadrilla, f.camino.n, r1(f.camino.prom), r1(f.camino.max),
        f.proceso.n, r1(f.proceso.prom), r1(f.proceso.max), f.consultar, f.presionar,
        f.consultas, f.presiones, f.resp.n ? r1(f.resp.prom) : ''])),
    [22, 14, 20, 20, 14, 22, 22, 15, 15, 16, 16, 30]);
  hoja('Detalle tramos',
    [['Cuadrilla', 'Contratista', 'Empresa', 'Cliente', 'ID', 'Distrito', 'Estado', 'Pasó a', 'Desde', 'Hasta', 'Minutos', 'Situación', 'Nivel', 'Consultado', 'Nota consulta', 'Presionado', 'Nota presión', 'Min hasta avanzar tras gestión']]
      .concat(d.tramos.map(t => [t.c.cuadrilla || '', t.c.contratista || '', t.c.empresa || '', t.c.nombre || '', idCaso(t.c),
        t.c.distrito || '', ETQ_ESTADO_T[t.clave], t.destino || (t.abierto ? '(sigue en este estado)' : ''),
        new Date(t.ini).toLocaleString(), t.abierto ? '' : new Date(t.fin).toLocaleString(), r1(t.min),
        t.abierto ? 'Abierto' : 'Cerrado', t.nivel ? (t.nivel === 'presionar' ? 'Presionar' : 'Consultar') : 'OK', ...gx(t), minAvance(t)])),
    [18, 16, 16, 28, 14, 16, 12, 18, 20, 20, 9, 10, 11, 11, 24, 11, 24, 18]);
  XLSX.writeFile(wb, `Reporte_tiempos_${stampArchivo()}.xlsx`);
  toast('Excel descargado');
}

const _scriptsExt = {};
function cargarScriptExterno(src){
  if (!_scriptsExt[src]) _scriptsExt[src] = new Promise((ok, fallo) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => { delete _scriptsExt[src]; fallo(new Error('No se pudo cargar ' + src)); };
    document.head.appendChild(s);
  });
  return _scriptsExt[src];
}

async function exportarAlertasPDF(){
  const d = datosAlertas();
  if (!d.tramos.length) return toast('Aún no hay datos de tiempos para exportar');
  try {
    toast('Generando PDF...');
    await cargarScriptExterno('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    await cargarScriptExterno('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js');
  } catch(e){ return toast('No se pudo cargar la librería de PDF (¿hay internet?)'); }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 32;
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const suave = h => rgb(h).map(v => Math.round(v * 0.12 + 255 * 0.88));
  const u = UMBRALES_TIEMPO;

  // Cabecera
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 64, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('Reporte de tiempos entre estados', M, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text(`Generado: ${new Date().toLocaleString()}   |   En camino: consultar ${u.en_camino.consultar} min, presionar ${u.en_camino.presionar} min   |   ` +
           `En proceso: consultar ${u.en_proceso.consultar} min, presionar ${u.en_proceso.presionar} min`, M, 50);

  // Tarjetas resumen
  const tarjetas = [
    ['EN CAMINO · PRESIONAR',  d.resumen.camino_presionar,  COLOR_NIVEL.presionar],
    ['EN CAMINO · CONSULTAR',  d.resumen.camino_consultar,  COLOR_NIVEL.consultar],
    ['EN PROCESO · PRESIONAR', d.resumen.proceso_presionar, COLOR_NIVEL.presionar],
    ['EN PROCESO · CONSULTAR', d.resumen.proceso_consultar, COLOR_NIVEL.consultar]
  ];
  const gap = 12, cw = (W - 2 * M - 3 * gap) / 4;
  tarjetas.forEach(([t, n, c], i) => {
    const x = M + i * (cw + gap);
    doc.setFillColor(...suave(c)); doc.setDrawColor(...rgb(c)); doc.roundedRect(x, 80, cw, 62, 8, 8, 'FD');
    doc.setTextColor(...rgb(c)); doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.text(String(n), x + 14, 118);
    doc.setFontSize(9); doc.setTextColor(60, 60, 60); doc.text(t, x + 14, 134);
  });

  const gtxt = t => [t.g && t.g.consulta ? 'Consultado ' + fmtHoraMs(t.g.consulta.ts) + (t.g.consulta.nota ? ' (' + t.g.consulta.nota + ')' : '') : '',
                     t.g && t.g.presion ? 'Presionado ' + fmtHoraMs(t.g.presion.ts) + (t.g.presion.nota ? ' (' + t.g.presion.nota + ')' : '') : '']
                    .filter(Boolean).join('\n') || 'Sin gestionar';

  // Casos que requieren acción
  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Casos que requieren acción ahora', M, 166);
  if (d.alertas.length){
    doc.autoTable({
      startY: 174, margin: { left: M, right: M }, theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 4 }, headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      head: [['Acción', 'Cuadrilla', 'Estado', 'Tiempo', 'Cliente', 'ID', 'Distrito', 'Desde', 'Gestión']],
      body: d.alertas.map(t => [
        { content: t.nivel === 'presionar' ? 'PRESIONAR' : 'CONSULTAR',
          styles: { fillColor: rgb(COLOR_NIVEL[t.nivel]), textColor: 255, fontStyle: 'bold', halign: 'center' } },
        t.c.cuadrilla || '(sin cuadrilla)', ETQ_ESTADO_T[t.clave],
        { content: fmtMin(t.min), styles: { textColor: rgb(COLOR_NIVEL[t.nivel]), fontStyle: 'bold' } },
        t.c.nombre || '', idCaso(t.c), t.c.distrito || '', fmtHoraMs(t.ini), gtxt(t)])
    });
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(5, 150, 105);
    doc.text('Ningún caso supera los tiempos en este momento.', M, 186);
    doc.lastAutoTable = { finalY: 190 };
  }

  // Cuadrillas sin movimiento
  if (d.sinMov.length){
    let ys = doc.lastAutoTable.finalY + 26;
    if (ys > H - 120){ doc.addPage(); ys = M; }
    doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('Cuadrillas sin movimiento', M, ys);
    doc.autoTable({
      startY: ys + 8, margin: { left: M, right: M }, theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 4 }, headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      head: [['Cuadrilla', 'Contratista', 'Casos vencidos', 'Primera hora', 'Último movimiento', 'Sin movimiento', 'ID más antiguo']],
      body: d.sinMov.map(s => [s.cuadrilla, s.contratista, String(s.pendientes), fmtHoraMs(s.primera), s.ultima ? fmtHoraMs(s.ultima) : '-',
        { content: fmtMin(s.min), styles: { textColor: rgb(COLOR_NIVEL[s.min >= UMBRAL_SIN_MOV * 2 ? 'presionar' : 'consultar']), fontStyle: 'bold' } },
        idCaso(s.vencidos[0])])
    });
  }

  // Zonas calientes
  if (d.zonas.length){
    let yz = doc.lastAutoTable.finalY + 26;
    if (yz > H - 120){ doc.addPage(); yz = M; }
    doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('Zonas calientes', M, yz);
    doc.autoTable({
      startY: yz + 8, margin: { left: M, right: M }, theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 4, halign: 'center' }, headStyles: { fillColor: [30, 41, 59], textColor: 255 }, columnStyles: { 0: { halign: 'left' } },
      head: [['Distrito', 'Vencidos', 'Reprogramados', 'Stand by', 'Total', 'Nivel']],
      body: d.zonas.map(z => [z.distrito, String(z.vencidos), String(z.reprog), String(z.standby), String(z.total),
        { content: z.nivel === 'presionar' ? 'CRITICA' : 'CALIENTE', styles: { fillColor: rgb(COLOR_NIVEL[z.nivel]), textColor: 255, fontStyle: 'bold' } }])
    });
  }

  // Comparativa por cuadrilla
  let y = doc.lastAutoTable.finalY + 26;
  if (y > H - 140){ doc.addPage(); y = M; }
  doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Cuadrillas con más tiempo entre estados', M, y);
  const celda = (e, clave) => e.n
    ? [String(e.n),
       { content: fmtMin(e.prom), styles: { textColor: rgb(COLOR_NIVEL[nivelTiempo(clave, e.prom)]), fontStyle: 'bold' } },
       { content: fmtMin(e.max),  styles: { textColor: rgb(COLOR_NIVEL[nivelTiempo(clave, e.max)]) } }]
    : ['-', '-', '-'];
  doc.autoTable({
    startY: y + 8, margin: { left: M, right: M }, theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 4, halign: 'center' }, headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: { 0: { halign: 'left' } },
    head: [[{ content: 'Cuadrilla', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
            { content: 'En camino', colSpan: 3 }, { content: 'En proceso', colSpan: 3 }, { content: 'Veces excedido', colSpan: 2 }, { content: 'Gestión', colSpan: 3 }],
           ['Casos', 'Prom.', 'Máx.', 'Casos', 'Prom.', 'Máx.', 'Consultar', 'Presionar', 'Consultas', 'Presiones', 'Tardó en avanzar']],
    body: d.cuadrillas.map(f => [f.cuadrilla, ...celda(f.camino, 'en_camino'), ...celda(f.proceso, 'en_proceso'),
      String(f.consultar), { content: String(f.presionar), styles: { fontStyle: 'bold' } },
      String(f.consultas), String(f.presiones), f.resp.n ? fmtMin(f.resp.prom) : '-'])
  });

  // Gráficos de barras: promedio por cuadrilla, con las líneas de umbral
  const barras = (x, y0, w, titulo, filas, clave) => {
    const un = u[clave], altoFila = 16, etqW = 105, areaW = w - etqW - 52;
    const max = Math.max(un.presionar * 1.25, ...filas.map(f => f.val)) * 1.05;
    const esc = v => (v / max) * areaW;
    doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(titulo, x, y0);
    const top = y0 + 10, alto = filas.length * altoFila;
    [['consultar', un.consultar], ['presionar', un.presionar]].forEach(([n, v]) => {
      doc.setDrawColor(...rgb(COLOR_NIVEL[n])); doc.setLineWidth(0.8);
      doc.line(x + etqW + esc(v), top - 2, x + etqW + esc(v), top + alto);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...rgb(COLOR_NIVEL[n]));
      doc.text(`${v} min`, x + etqW + esc(v), top + alto + 9, { align: 'center' });
    });
    filas.forEach((f, i) => {
      const yy = top + i * altoFila;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(50, 50, 50);
      doc.text(f.etq.length > 20 ? f.etq.slice(0, 19) + '.' : f.etq, x, yy + 10);
      doc.setFillColor(...rgb(COLOR_NIVEL[nivelTiempo(clave, f.val)]));
      doc.rect(x + etqW, yy + 2, Math.max(1, esc(f.val)), altoFila - 5, 'F');
      doc.text(fmtMin(f.val), x + etqW + esc(f.val) + 4, yy + 10);
    });
    return top + alto + 14;
  };
  const top10 = clave => d.cuadrillas.filter(f => f[clave].n)
    .map(f => ({ etq: f.cuadrilla, val: f[clave].prom })).sort((a, b) => b.val - a.val).slice(0, 10);
  const izq = top10('camino'), der = top10('proceso');
  if (izq.length || der.length){
    y = doc.lastAutoTable.finalY + 28;
    const alto = Math.max(izq.length, der.length) * 16 + 50;
    if (y + alto > H - 36){ doc.addPage(); y = M + 6; }
    const colW = (W - 2 * M - 28) / 2;
    if (izq.length) barras(M, y, colW, 'Promedio en camino por cuadrilla', izq, 'en_camino');
    if (der.length) barras(M + colW + 28, y, colW, 'Promedio en proceso por cuadrilla', der, 'en_proceso');
  }

  // Pie de página
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++){
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130, 130, 130);
    doc.text(`Página ${i} de ${n}`, W - M, H - 14, { align: 'right' });
  }
  doc.save(`Reporte_tiempos_${stampArchivo()}.pdf`);
  toast('PDF descargado');
}

/* ==================== CIERRE DEL DÍA ==================== */
let cierreSinStandby = false;
try { cierreSinStandby = localStorage.getItem('zaaz_cierre_sin_standby') === '1'; } catch(e){}
const esStandBy = c => claveEstadoCarga(c.estadoOrigen) === 'stand_by';
function toggleStandbyCierre(){
  cierreSinStandby = !cierreSinStandby;
  try { localStorage.setItem('zaaz_cierre_sin_standby', cierreSinStandby ? '1' : '0'); } catch(e){}
  renderCierre();
}
let cierreContrata = '';                       // '' = todas las contratas
const INICIO_JORNADA_H = 8, FIN_JORNADA_H = 20;
function grupoCierre(c){
  const k = claveEstadoCarga(c.estadoOrigen);
  if (k === 'instalado' || k === 'solucionado') return 'cumplido';
  if (k === 'en_camino' || k === 'en_proceso')  return 'encurso';
  if (k === 'programado')                       return 'pendiente';
  if (k === 'reprogramado')                     return 'reprog';
  return 'standby';                             // stand by y estados no reconocidos
}
const ETQ_GRUPO_CIERRE = { cumplido: 'Instalado / Solucionado', encurso: 'En curso', pendiente: 'Sin atender', reprog: 'Reprogramado', standby: 'Stand by / otros' };
const pctCierre = (a, b) => b ? Math.round(a * 100 / b) : 0;
const colorPct = p => p >= 80 ? '#059669' : (p >= 60 ? '#d97706' : '#dc2626');
const slugArchivo = s => String(s || 'todas').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');

function datosCierre(){
  const ahora = Date.now(), hoy = diaLocal(ahora);
  let casos = stateSeg.casos.filter(c => !c.fecha || c.fecha === hoy);
  if (cierreContrata) casos = casos.filter(c => norm(c.contratista) === norm(cierreContrata));
  // Las órdenes en stand by no se realizarán: se pueden contar o excluir (se muestran ambas lecturas)
  const todosC = casos, nStand = todosC.filter(esStandBy).length;
  const cumC = todosC.filter(c => grupoCierre(c) === 'cumplido').length, repC = todosC.filter(c => grupoCierre(c) === 'reprog').length;
  const alt = { standby: nStand, cumplido: cumC,
    conCumpl: pctCierre(cumC, todosC.length), sinCumpl: pctCierre(cumC, todosC.length - nStand),
    conPend: todosC.length - cumC - repC, sinPend: todosC.length - nStand - cumC - repC };
  if (cierreSinStandby) casos = casos.filter(c => !esStandBy(c));
  const vacio = () => ({ total: 0, cumplido: 0, encurso: 0, pendiente: 0, reprog: 0, standby: 0 });
  const calc = o => Object.assign(o, { cumpl: pctCierre(o.cumplido, o.total), efect: pctCierre(o.cumplido, o.total - o.reprog) });
  const agrupa = campo => {
    const m = new Map();
    casos.forEach(c => {
      const raw = c[campo] || '(sin asignar)', k = norm(raw);
      if (!m.has(k)) m.set(k, Object.assign({ nombre: raw, contratista: '' }, vacio()));
      const o = m.get(k); o.total++; o[grupoCierre(c)]++;
      if (campo === 'cuadrilla' && c.contratista && !o.contratista) o.contratista = c.contratista;
    });
    return [...m.values()].map(calc).sort((a, b) => (a.cumpl - b.cumpl) || (b.total - a.total));
  };
  const tot = vacio(); casos.forEach(c => { tot.total++; tot[grupoCierre(c)]++; }); calc(tot);
  tot.abiertos = tot.total - tot.cumplido - tot.reprog;
  const abiertos = casos.filter(c => ['encurso', 'pendiente', 'standby'].includes(grupoCierre(c)))
    .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));

  // Por tipo de trabajo (cumplimiento y tiempos promedio)
  const tipos = new Map();
  casos.forEach(c => {
    const raw = c.tipoTrabajo || '(sin tipo)', k = norm(raw);
    if (!tipos.has(k)) tipos.set(k, Object.assign({ nombre: raw, camino: [], proceso: [] }, vacio()));
    const o = tipos.get(k); o.total++; o[grupoCierre(c)]++;
    tramosTiempoCaso(c, ahora).forEach(t => o[t.clave === 'en_camino' ? 'camino' : 'proceso'].push(t.min));
  });
  const prom = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const porTipo = [...tipos.values()].map(o => { calc(o); o.pCamino = prom(o.camino); o.pProceso = prom(o.proceso); return o; })
    .sort((a, b) => b.total - a.total);

  // Pronóstico de cierre con el ritmo de lo que va del día
  const hh = h => new Date(`${hoy}T${String(h).padStart(2, '0')}:00:00`).getTime();
  const ini = hh(INICIO_JORNADA_H), fin = hh(FIN_JORNADA_H);
  let pron = null;
  if (ahora > ini && tot.total){
    const hTrans = Math.max(1, (Math.min(ahora, fin) - ini) / 3600000);
    const ritmo = tot.cumplido / hTrans;
    const hRest = Math.max(0, (fin - ahora) / 3600000);
    const hechos = Math.round(Math.min(tot.abiertos, ritmo * hRest));
    pron = { ritmo, hRest, cerrado: hRest === 0, queda: Math.max(0, tot.abiertos - hechos),
             cumplProy: pctCierre(tot.cumplido + hechos, tot.total), necesario: hRest > 0 ? tot.abiertos / hRest : null };
  }
  return { ahora, hoy, casos, tot, porCuadrilla: agrupa('cuadrilla'), porContratista: agrupa('contratista'), porTipo, abiertos, pron, alt, sinStandby: cierreSinStandby };
}
const fmtFechaCierre = d => `${d.hoy.split('-').reverse().join('/')} · corte ${fmtHoraMs(d.ahora)}`;
const textoPronostico = d => !d.pron ? '' : (d.pron.cerrado
  ? `La jornada ya terminó (${FIN_JORNADA_H}:00): quedaron ${d.tot.abiertos} casos sin cerrar.`
  : `Ritmo actual ${d.pron.ritmo.toFixed(1)} casos/h, quedan ${d.pron.hRest.toFixed(1)} h hasta las ${FIN_JORNADA_H}:00. ` +
    `Se estima que queden ${d.pron.queda} sin atender y un cumplimiento final de ${d.pron.cumplProy}%. ` +
    `Para cerrar todo harían falta ${d.pron.necesario.toFixed(1)} casos/h.`);
const ultimaNota = c => { const s = c.seguimiento || []; return s.length ? String(s[s.length - 1].nota || '').trim() : ''; };

function cambiarContrataCierre(v){ cierreContrata = v || ''; renderCierre(); }
function llenarSelectContratas(sel, actual){
  if (!sel) return;
  const hoy = diaLocal(Date.now());
  const lista = uniqNormalizado(stateSeg.casos.filter(c => !c.fecha || c.fecha === hoy).map(c => c.contratista)).sort((a, b) => a.localeCompare(b));
  if (actual && !lista.some(x => norm(x) === norm(actual))) lista.push(actual);
  sel.innerHTML = '<option value="">Todas las contratas</option>' + lista.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  sel.value = actual || '';
}

function renderCierre(){
  const d = datosCierre(), t = d.tot;
  llenarSelectContratas($('#cierreContrata'), cierreContrata);
  const f = $('#cierreFecha');
  if (f) f.innerHTML = `Día <b>${fmtFechaCierre(d)}</b>${cierreContrata ? ` · contrata <b>${esc(cierreContrata)}</b>` : ''} · cumplimiento = instalados + solucionados sobre lo programado. Sin contar reprogramados: <b>${t.efect}%</b>.`;
  const tarjeta = (n, txt, col) =>
    `<div style="flex:1;min-width:120px;border-radius:12px;padding:12px;background:${col}1f;border:1px solid ${col}66">
       <div style="font-size:26px;font-weight:800;color:${col}">${n}</div><div style="font-size:12px">${txt}</div></div>`;
  const rs = $('#cierreResumen');
  if (rs) rs.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 4px">
    ${tarjeta(t.total, 'Programados', '#334155')}${tarjeta(t.cumplido, '✅ Cumplidos', '#059669')}
    ${tarjeta(t.reprog, '🔁 Reprogramados', '#f97316')}${tarjeta(t.abiertos, '⏳ Pendientes', '#d97706')}
    ${tarjeta(t.cumpl + '%', 'Cumplimiento', colorPct(t.cumpl))}</div>`;
  const sb = $('#cierreStandby');
  if (sb) sb.innerHTML = `⏸️ <b>Stand by:</b> ${d.alt.standby} orden(es) que no se realizarán. ` +
    `<b>Con stand by:</b> ${d.alt.conCumpl}% cumplimiento, ${d.alt.conPend} pendientes · <b>Sin stand by:</b> ${d.alt.sinCumpl}% cumplimiento, ${d.alt.sinPend} pendientes. ` +
    `Estás viendo <b>${cierreSinStandby ? 'sin stand by' : 'con stand by'}</b>.`;
  const bs = $('#btnStandby');
  if (bs){ bs.textContent = cierreSinStandby ? '⏸ Sin stand by' : '⏸ Con stand by'; bs.classList.toggle('primary', cierreSinStandby); }
  const pr = $('#cierrePronostico');
  if (pr) pr.innerHTML = d.pron ? `<div style="margin-top:8px;padding:10px 12px;border-radius:10px;background:#7c3aed14;border:1px solid #7c3aed44;font-size:13px">🔮 <b>Pronóstico de cierre:</b> ${esc(textoPronostico(d))}</div>` : '';

  const th = 'padding:6px 8px;text-align:center;border-bottom:1px solid var(--border,#ddd)';
  const td = 'padding:6px 8px;text-align:center;border-bottom:1px solid var(--border,#eee)';
  const chip = p => `<span style="display:inline-block;min-width:48px;padding:2px 8px;border-radius:999px;color:#fff;font-weight:700;background:${colorPct(p)}">${p}%</span>`;
  const tabla = (filas, titulo, conContr) => filas.length
    ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr><th style="${th};text-align:left">${titulo}</th>${conContr ? `<th style="${th};text-align:left">Contratista</th>` : ''}
        <th style="${th}">Programados</th><th style="${th}">Cumplidos</th><th style="${th}">En curso</th><th style="${th}">Sin atender</th>
        <th style="${th}">Reprog.</th><th style="${th}">Stand by</th><th style="${th}">Cumplimiento</th></tr></thead><tbody>
        ${filas.map(o => `<tr><td style="${td};text-align:left;font-weight:600">${esc(o.nombre)}</td>${conContr ? `<td style="${td};text-align:left">${esc(o.contratista)}</td>` : ''}
          <td style="${td}">${o.total}</td><td style="${td}">${o.cumplido}</td><td style="${td}">${o.encurso}</td><td style="${td}">${o.pendiente}</td>
          <td style="${td}">${o.reprog}</td><td style="${td}">${o.standby}</td><td style="${td}">${chip(o.cumpl)}</td></tr>`).join('')}
        </tbody></table></div>`
    : '<div class="empty">Sin datos del día.</div>';
  const c1 = $('#cierreContratistas'); if (c1) c1.innerHTML = tabla(d.porContratista, 'Contratista', false);
  const c2 = $('#cierreCuadrillas');   if (c2) c2.innerHTML = tabla(d.porCuadrilla, 'Cuadrilla', true);

  const ct = $('#cierreTipos');
  if (ct) ct.innerHTML = d.porTipo.length
    ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr><th style="${th};text-align:left">Tipo de trabajo</th><th style="${th}">Programados</th><th style="${th}">Cumplidos</th>
        <th style="${th}">Cumplimiento</th><th style="${th}">Prom. en camino</th><th style="${th}">Prom. en proceso</th></tr></thead><tbody>
        ${d.porTipo.map(o => `<tr><td style="${td};text-align:left;font-weight:600">${esc(o.nombre)}</td><td style="${td}">${o.total}</td><td style="${td}">${o.cumplido}</td>
          <td style="${td}">${chip(o.cumpl)}</td><td style="${td}">${o.pCamino === null ? '—' : fmtMin(o.pCamino)}</td><td style="${td}">${o.pProceso === null ? '—' : fmtMin(o.pProceso)}</td></tr>`).join('')}
        </tbody></table></div>`
    : '<div class="empty">Sin datos del día.</div>';

  const pd = $('#cierrePendientes');
  if (pd) pd.innerHTML = d.abiertos.length
    ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr><th style="${th};text-align:left">Hora</th><th style="${th};text-align:left">Cuadrilla</th><th style="${th};text-align:left">Estado</th>
        <th style="${th};text-align:left">ID</th><th style="${th};text-align:left">Cliente</th><th style="${th};text-align:left">Distrito</th>
        <th style="${th};text-align:left">Trabajo</th><th style="${th};text-align:left">Nota</th></tr></thead><tbody>
        ${d.abiertos.map(c => `<tr><td style="${td};text-align:left">${esc(c.hora || '—')}</td><td style="${td};text-align:left">${esc(c.cuadrilla || '(sin cuadrilla)')}</td>
          <td style="${td};text-align:left">${esc(c.estadoOrigen || '')}</td>
          <td style="${td};text-align:left">${idCaso(c) ? `<span class="clip-btn" style="cursor:pointer;text-decoration:underline dotted" title="Clic para copiar" onclick="copyText('${esc(idCaso(c))}','ID')">${esc(idCaso(c))}</span>` : ''}</td>
          <td style="${td};text-align:left">${esc(c.nombre || '')}</td><td style="${td};text-align:left">${esc(c.distrito || '')}</td>
          <td style="${td};text-align:left">${esc(c.tipoTrabajo || '')}</td><td style="${td};text-align:left">${esc(ultimaNota(c))}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">✅ No queda nada pendiente.</div>';
}

// Mensaje listo para pegar en WhatsApp (de la contrata elegida o de todas)
function mensajeCierre(){
  const d = datosCierre(), t = d.tot, L = [];
  L.push(`*Cierre ${cierreContrata || 'todas las contratas'}* — ${fmtFechaCierre(d)}`);
  L.push(`Programados: ${t.total} | Cumplidos: ${t.cumplido} (${t.cumpl}%) | Reprogramados: ${t.reprog} | Pendientes: ${t.abiertos}`);
  L.push(`Stand by: ${d.alt.standby} (${cierreSinStandby ? 'excluidos' : 'incluidos'}) | Con stand by: ${d.alt.conCumpl}% | Sin stand by: ${d.alt.sinCumpl}%`);
  if (d.pron && !d.pron.cerrado) L.push(`Pronóstico ${FIN_JORNADA_H}:00: quedarían ${d.pron.queda} sin atender (${d.pron.cumplProy}% de cumplimiento)`);
  L.push('', '*Por cuadrilla:*');
  d.porCuadrilla.slice().sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach(o => L.push(`• ${o.nombre}: ${o.cumplido}/${o.total} (${o.cumpl}%)${o.reprog ? ` · ${o.reprog} reprog.` : ''}`));
  if (d.abiertos.length){
    L.push('', '*Pendientes:*');
    d.abiertos.forEach(c => L.push(`• ${c.hora || '--'} ${c.cuadrilla || '(sin cuadrilla)'} — ${c.estadoOrigen || ''} — ID ${idCaso(c) || '-'}` +
      `${c.distrito ? ' — ' + c.distrito : ''}${ultimaNota(c) ? ' — Nota: ' + ultimaNota(c) : ''}`));
  }
  return L.join('\n');
}
function copiarMensajeCierre(){
  if (!datosCierre().casos.length) return toast('No hay casos del día para el cierre');
  copyText(mensajeCierre(), 'Mensaje');
}

function exportarCierreExcel(){
  if (typeof XLSX === 'undefined') return toast('No se cargó la librería de Excel (¿hay internet?)');
  const d = datosCierre(), t = d.tot;
  if (!d.casos.length) return toast('No hay casos del día para el cierre');
  const wb = XLSX.utils.book_new();
  const hoja = (nombre, aoa, anchos) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = anchos.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, nombre); };
  const r1 = x => x === null ? '' : Math.round(x * 10) / 10;
  const cab = ['Programados', 'Cumplidos', 'En curso', 'Sin atender', 'Reprogramados', 'Stand by / otros', 'Cumplimiento %', 'Cumplimiento sin reprog. %'];
  const nums = o => [o.total, o.cumplido, o.encurso, o.pendiente, o.reprog, o.standby, o.cumpl, o.efect];
  hoja('Resumen', [['Cierre del día'], ['Día', d.hoy], ['Corte', fmtHoraMs(d.ahora)], ['Contrata', cierreContrata || 'Todas'], ['Stand by', cierreSinStandby ? 'Excluidos' : 'Incluidos'], [], cab, nums(t), [],
    ['Con stand by', 'Cumplimiento %', d.alt.conCumpl, 'Pendientes', d.alt.conPend], ['Sin stand by', 'Cumplimiento %', d.alt.sinCumpl, 'Pendientes', d.alt.sinPend],
    ['Órdenes en stand by', d.alt.standby], [], ['Pronóstico', textoPronostico(d)]],
    [26, 14, 12, 12, 15, 17, 16, 24]);
  hoja('Por contratista', [['Contratista', ...cab]].concat(d.porContratista.map(o => [o.nombre, ...nums(o)])), [22, 13, 11, 10, 12, 14, 16, 15, 24]);
  hoja('Por cuadrilla', [['Cuadrilla', 'Contratista', ...cab]].concat(d.porCuadrilla.map(o => [o.nombre, o.contratista, ...nums(o)])), [22, 18, 13, 11, 10, 12, 14, 16, 15, 24]);
  hoja('Por tipo de trabajo', [['Tipo de trabajo', ...cab, 'Prom. en camino (min)', 'Prom. en proceso (min)']]
    .concat(d.porTipo.map(o => [o.nombre, ...nums(o), r1(o.pCamino), r1(o.pProceso)])), [24, 13, 11, 10, 12, 14, 16, 15, 24, 20, 22]);
  const fila = c => [c.hora || '', c.cuadrilla || '', c.contratista || '', c.empresa || '', idCaso(c), c.nombre || '', c.distrito || '', c.tipoTrabajo || '', c.estadoOrigen || '', ultimaNota(c)];
  const cabCaso = ['Hora', 'Cuadrilla', 'Contratista', 'Empresa', 'ID', 'Cliente', 'Distrito', 'Tipo de trabajo', 'Estado', 'Nota'];
  hoja('Pendientes', [cabCaso].concat(d.abiertos.map(fila)), [8, 18, 16, 16, 14, 28, 16, 20, 16, 34]);
  hoja('Detalle del día', [cabCaso.concat('Grupo')].concat(d.casos.slice().sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')))
    .map(c => fila(c).concat(ETQ_GRUPO_CIERRE[grupoCierre(c)]))), [8, 18, 16, 16, 14, 28, 16, 20, 16, 34, 22]);
  XLSX.writeFile(wb, `Cierre_${slugArchivo(cierreContrata)}_${stampArchivo()}.xlsx`);
  toast('Excel descargado');
}

async function exportarCierrePDF(){
  const d = datosCierre(), t = d.tot;
  if (!d.casos.length) return toast('No hay casos del día para el cierre');
  try {
    toast('Generando PDF...');
    await cargarScriptExterno('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    await cargarScriptExterno('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js');
  } catch(e){ return toast('No se pudo cargar la librería de PDF (¿hay internet?)'); }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 32;
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const suave = h => rgb(h).map(v => Math.round(v * 0.12 + 255 * 0.88));
  const titulo = (txt, y) => { doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(txt, M, y); };
  const estiloTabla = { margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 4, halign: 'center' }, headStyles: { fillColor: [30, 41, 59], textColor: 255 } };
  const nuevaPaginaSi = (y, alto) => { if (y + alto > H - 36){ doc.addPage(); return M; } return y; };

  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 64, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(`Cierre del día${cierreContrata ? ' - ' + cierreContrata : ''}`, M, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`${fmtFechaCierre(d)}   |   Cumplimiento = instalados + solucionados sobre lo programado. Sin contar reprogramados: ${t.efect}%`, M, 46);
  doc.setFontSize(9);
  doc.text(`Stand by ${cierreSinStandby ? 'EXCLUIDOS' : 'INCLUIDOS'} (${d.alt.standby} ordenes)   |   Con stand by: ${d.alt.conCumpl}% cumplimiento, ${d.alt.conPend} pendientes   |   Sin stand by: ${d.alt.sinCumpl}% cumplimiento, ${d.alt.sinPend} pendientes`, M, 58);

  const tarjetas = [['PROGRAMADOS', t.total, '#334155'], ['CUMPLIDOS', t.cumplido, '#059669'], ['REPROGRAMADOS', t.reprog, '#f97316'],
                    ['PENDIENTES', t.abiertos, '#d97706'], ['CUMPLIMIENTO', t.cumpl + '%', colorPct(t.cumpl)]];
  const gap = 12, cw = (W - 2 * M - 4 * gap) / 5;
  tarjetas.forEach(([txt, n, c], i) => {
    const x = M + i * (cw + gap);
    doc.setFillColor(...suave(c)); doc.setDrawColor(...rgb(c)); doc.roundedRect(x, 80, cw, 62, 8, 8, 'FD');
    doc.setTextColor(...rgb(c)); doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.text(String(n), x + 14, 118);
    doc.setFontSize(9); doc.setTextColor(60, 60, 60); doc.text(txt, x + 14, 134);
  });

  let y = 160;
  if (d.pron){
    const lineas = doc.splitTextToSize('Pronóstico de cierre: ' + textoPronostico(d), W - 2 * M - 20);
    const alto = lineas.length * 11 + 12;
    doc.setFillColor(243, 238, 253); doc.setDrawColor(196, 181, 253); doc.roundedRect(M, y - 10, W - 2 * M, alto, 6, 6, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(76, 29, 149); doc.text(lineas, M + 10, y + 3);
    y += alto + 12;
  } else y += 6;

  const filaPDF = (o, conContr) => [o.nombre, ...(conContr ? [o.contratista] : []), String(o.total), String(o.cumplido), String(o.encurso),
    String(o.pendiente), String(o.reprog), String(o.standby),
    { content: o.cumpl + '%', styles: { fillColor: rgb(colorPct(o.cumpl)), textColor: 255, fontStyle: 'bold' } }];
  const cabPDF = (primera, conContr) => [[primera, ...(conContr ? ['Contratista'] : []), 'Programados', 'Cumplidos', 'En curso', 'Sin atender', 'Reprog.', 'Stand by', 'Cumplimiento']];

  y = nuevaPaginaSi(y, 90); titulo('Por contratista', y);
  doc.autoTable({ ...estiloTabla, startY: y + 8, columnStyles: { 0: { halign: 'left' } }, head: cabPDF('Contratista', false), body: d.porContratista.map(o => filaPDF(o, false)) });

  y = nuevaPaginaSi(doc.lastAutoTable.finalY + 26, 90); titulo('Por cuadrilla', y);
  doc.autoTable({ ...estiloTabla, startY: y + 8, columnStyles: { 0: { halign: 'left' }, 1: { halign: 'left' } }, head: cabPDF('Cuadrilla', true), body: d.porCuadrilla.map(o => filaPDF(o, true)) });

  // Gráfico: cumplimiento por cuadrilla (de menor a mayor)
  const filas = d.porCuadrilla.slice(0, 18);
  y = nuevaPaginaSi(doc.lastAutoTable.finalY + 28, filas.length * 16 + 40);
  titulo('Cumplimiento por cuadrilla (de menor a mayor)', y);
  const etqW = 130, areaW = W - 2 * M - etqW - 110, top = y + 12;
  filas.forEach((o, i) => {
    const yy = top + i * 16;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(50, 50, 50);
    doc.text(o.nombre.length > 24 ? o.nombre.slice(0, 23) + '.' : o.nombre, M, yy + 10);
    doc.setFillColor(235, 238, 242); doc.rect(M + etqW, yy + 2, areaW, 11, 'F');
    doc.setFillColor(...rgb(colorPct(o.cumpl))); doc.rect(M + etqW, yy + 2, Math.max(1, areaW * o.cumpl / 100), 11, 'F');
    doc.text(`${o.cumpl}%  (${o.cumplido} de ${o.total})`, M + etqW + areaW + 6, yy + 10);
  });

  // Por tipo de trabajo
  y = nuevaPaginaSi(top + filas.length * 16 + 26, 90); titulo('Por tipo de trabajo', y);
  doc.autoTable({ ...estiloTabla, startY: y + 8, columnStyles: { 0: { halign: 'left' } },
    head: [['Tipo de trabajo', 'Programados', 'Cumplidos', 'Cumplimiento', 'Prom. en camino', 'Prom. en proceso']],
    body: d.porTipo.map(o => [o.nombre, String(o.total), String(o.cumplido),
      { content: o.cumpl + '%', styles: { fillColor: rgb(colorPct(o.cumpl)), textColor: 255, fontStyle: 'bold' } },
      o.pCamino === null ? '-' : fmtMin(o.pCamino), o.pProceso === null ? '-' : fmtMin(o.pProceso)]) });

  // Pendientes
  y = doc.lastAutoTable.finalY + 26;
  if (d.abiertos.length){
    y = nuevaPaginaSi(y, 100); titulo('Casos pendientes', y);
    doc.autoTable({ ...estiloTabla, startY: y + 8, styles: { fontSize: 8.5, cellPadding: 4, halign: 'left' },
      head: [['Hora', 'Cuadrilla', 'Estado', 'ID', 'Cliente', 'Distrito', 'Trabajo', 'Nota']],
      body: d.abiertos.map(c => [c.hora || '-', c.cuadrilla || '(sin cuadrilla)', c.estadoOrigen || '', idCaso(c), c.nombre || '', c.distrito || '', c.tipoTrabajo || '', ultimaNota(c)]) });
  } else {
    y = nuevaPaginaSi(y, 30);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(5, 150, 105);
    doc.text('No queda ningún caso pendiente.', M, y);
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++){
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130, 130, 130);
    doc.text(`Página ${i} de ${n}`, W - M, H - 14, { align: 'right' });
  }
  doc.save(`Cierre_${slugArchivo(cierreContrata)}_${stampArchivo()}.pdf`);
  toast('PDF descargado');
}

/* ==================== EXTRAS: NOTAS, MAPA Y CALIDAD DE DATOS ==================== */
const esAlMomento = c => /al momento/.test(norm(c.tipoProg));

// Nota rápida desde la tarjeta del caso (se guarda junto a las notas del caso)
function notaRapida(id){
  const c = stateSeg.casos.find(x => x._id === id); if (!c) return;
  const v = prompt('Nota para este caso:', '');
  if (v === null || !v.trim()) return;
  c.seguimiento = c.seguimiento || [];
  c.seguimiento.push({ nota: v.trim(), fecha: nowISO() });
  saveSeg();
  renderCasos(); renderConf(); renderCierre();
  toast('📝 Nota agregada');
}

// Sección de Carga para las instalaciones al momento (no tienen franja de horario)
function seccionAlMomentoHTML(lista){
  if (!lista.length) return '';
  const filas = lista.map(c => {
    const k = claveEstadoCarga(c.estadoOrigen);
    return `<div class="linea"><i class="st-dot st-${k}"></i> <b>${esc(c.cuadrilla || '(sin cuadrilla)')}</b> · ${esc(c.estadoOrigen || '')} · ${esc(c.nombre || '')}` +
      `${c.distrito ? ' · ' + esc(c.distrito) : ''}` +
      `${idCaso(c) ? ` · <span class="clip-btn" style="cursor:pointer;text-decoration:underline dotted" title="Clic para copiar" onclick="copyText('${esc(idCaso(c))}','ID')">${esc(idCaso(c))}</span>` : ''}</div>`;
  }).join('');
  return `<div class="card" style="margin-bottom:10px"><h3 style="margin:0 0 6px">⚡ Instalación al momento · ${lista.length}</h3>
    <div class="hint" style="margin-bottom:6px">No tienen franja de horario, por eso no aparecen en las horas de cada cuadrilla.</div>${filas}</div>`;
}

/* ---- Cargar recursos externos solo cuando hacen falta ---- */
const _cssExt = {};
function cargarCSSExterno(href){
  if (!_cssExt[href]) _cssExt[href] = new Promise((ok, fallo) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.onload = ok;
    l.onerror = () => { delete _cssExt[href]; fallo(new Error('No se pudo cargar ' + href)); };
    document.head.appendChild(l);
  });
  return _cssExt[href];
}

/* ---- Mapa del día ---- */
let _mapa = null, _capaMapa = null, mapaContrata = '', _mapaAjustar = true;
const COLOR_MAPA = { programado: '#64748b', reprogramado: '#f97316', en_camino: '#fbbf24', en_proceso: '#7c3aed',
                     instalado: '#16a34a', solucionado: '#16a34a', stand_by: '#dc2626', otro: '#9ca3af' };
function parseCoords(s){
  const m = String(s || '').match(/(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!m) return null;
  let a = parseFloat(m[1]), b = parseFloat(m[2]);
  if (isNaN(a) || isNaN(b)) return null;
  if (Math.abs(a) > 90 && Math.abs(b) <= 90) [a, b] = [b, a];          // venía como longitud, latitud
  if (Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0)) return null;
  return [a, b];
}
function distKm(a, b){
  const rad = x => x * Math.PI / 180, dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
let mapaCuadrilla = '', mapaFranja = '', _mapaDistritos = [];
function cambiarContrataMapa(v){ mapaContrata = v || ''; mapaCuadrilla = ''; _mapaAjustar = true; renderMapa(); }
function cambiarCuadrillaMapa(v){ mapaCuadrilla = v || ''; _mapaAjustar = true; renderMapa(); }
function cambiarFranjaMapa(v){ mapaFranja = v || ''; _mapaAjustar = true; renderMapa(); }
const franjaCaso = c => esAlMomento(c) ? 'al momento' : String(c.hora || '').slice(0, 5);
function llenarSelectCuadrillas(sel, actual, contrata){
  if (!sel) return;
  const hoy = diaLocal(Date.now());
  const lista = uniqNormalizado(stateSeg.casos.filter(c => (!c.fecha || c.fecha === hoy) && (!contrata || norm(c.contratista) === norm(contrata))).map(c => c.cuadrilla))
    .sort((a, b) => a.localeCompare(b));
  if (actual && !lista.some(x => norm(x) === norm(actual))) lista.push(actual);
  sel.innerHTML = '<option value="">Todas las cuadrillas</option>' + lista.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  sel.value = actual || '';
}
function zoomDistritoMapa(i){
  const o = _mapaDistritos[i]; if (!o || !_mapa) return;
  if (!o.pts.length) return toast('Ese distrito no tiene casos con coordenadas');
  _mapa.fitBounds(o.pts, { padding: [40, 40], maxZoom: 16 });
}

async function renderMapa(){
  const div = $('#mapaDia'); if (!div) return;
  llenarSelectContratas($('#mapaContrata'), mapaContrata);
  llenarSelectCuadrillas($('#mapaCuadrilla'), mapaCuadrilla, mapaContrata);

  const hoy = diaLocal(Date.now());
  const baseContrata = stateSeg.casos.filter(c => (!c.fecha || c.fecha === hoy) && (!mapaContrata || norm(c.contratista) === norm(mapaContrata)));
  const delDia = baseContrata.filter(c => !mapaCuadrilla || norm(c.cuadrilla) === norm(mapaCuadrilla));
  // Cupo horario: franjas oficiales + las que aparezcan, con la cantidad de casos
  const franjas = [...new Set([...HORAS_CARGA, ...delDia.map(franjaCaso).filter(Boolean)])]
    .sort((a, b) => a === 'al momento' ? 1 : (b === 'al momento' ? -1 : a.localeCompare(b)));
  if (mapaFranja && !franjas.includes(mapaFranja)) mapaFranja = '';
  const sf = $('#mapaFranja');
  if (sf){
    sf.innerHTML = '<option value="">Todos los cupos horarios</option>' + franjas.map(f =>
      `<option value="${esc(f)}">${f === 'al momento' ? 'Al momento (sin hora)' : f} · ${delDia.filter(c => franjaCaso(c) === f).length}</option>`).join('');
    sf.value = mapaFranja;
  }
  const casos = mapaFranja ? delDia.filter(c => franjaCaso(c) === mapaFranja) : delDia;
  const conPunto = [], pts = [];
  let sinCoord = 0;
  casos.forEach(c => { const p = parseCoords(c.coords); if (p) conPunto.push({ c, p }); else sinCoord++; });

  // Leyenda: distritos con más carga, de mayor a menor
  const porDist = new Map();
  casos.forEach(c => {
    const raw = c.distrito || '(sin distrito)', k = norm(raw);
    if (!porDist.has(k)) porDist.set(k, { distrito: raw, vars: new Set(), total: 0, pend: 0, pts: [] });
    const o = porDist.get(k); o.vars.add(raw); o.total++;
    const g = grupoCierre(c); if (g !== 'cumplido' && g !== 'reprog') o.pend++;
    const p = parseCoords(c.coords); if (p) o.pts.push(p);
  });
  _mapaDistritos = [...porDist.values()].map(o => Object.assign(o, { distrito: etiquetaCanon([...o.vars]) })).sort((a, b) => (b.total - a.total) || (b.pend - a.pend) || a.distrito.localeCompare(b.distrito));
  const maxD = Math.max(1, ..._mapaDistritos.map(o => o.total));
  const lg = $('#mapaCarga');
  if (lg) lg.innerHTML = _mapaDistritos.length
    ? `<div style="font-weight:700;font-size:13px;margin-bottom:6px">Distritos por carga</div>` + _mapaDistritos.map((o, i) => `
        <div onclick="zoomDistritoMapa(${i})" title="Clic para verlo en el mapa" style="cursor:pointer;padding:5px 6px;border-radius:8px;margin-bottom:3px">
          <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px"><span>${i + 1}. ${esc(o.distrito)}</span><b>${o.total}</b></div>
          <div style="height:6px;border-radius:4px;background:#e5e7eb;margin-top:3px;overflow:hidden"><div style="height:100%;width:${(o.total / maxD * 100).toFixed(0)}%;background:#f59e0b"></div></div>
          <div style="font-size:11px;color:var(--muted)">${o.pend} pendiente(s)</div></div>`).join('')
    : '<div class="empty">Sin casos con estos filtros.</div>';
  const inf = $('#mapaInfo');
  if (inf) inf.textContent = `${conPunto.length} casos en el mapa${sinCoord ? ` · ${sinCoord} sin coordenadas` : ''}. El borde negro grueso marca los adicionales.`;

  try {
    await cargarCSSExterno('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css');
    await cargarScriptExterno('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js');
  } catch(e){ div.innerHTML = '<div class="empty">No se pudo cargar el mapa (¿hay internet?).</div>'; _mapa = null; return; }
  if (!_mapa){
    div.innerHTML = '';
    _mapa = L.map(div).setView([-12.06, -77.04], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(_mapa);
    _capaMapa = L.layerGroup().addTo(_mapa);
    _mapaAjustar = true;
  }
  _mapa.invalidateSize();
  _capaMapa.clearLayers();

  // Candidatas para atender un adicional: cuadrillas de la contrata que todavía tienen trabajo abierto
  const activas = baseContrata.map(c => ({ c, p: parseCoords(c.coords) }))
    .filter(x => x.p && x.c.cuadrilla && grupoCierre(x.c) !== 'cumplido' && grupoCierre(x.c) !== 'reprog');
  conPunto.forEach(({ c, p }) => {
    const k = claveEstadoCarga(c.estadoOrigen);
    let cerca = '';
    if (c.esAdicional){
      let mejor = null;
      activas.forEach(o => { if (o.c === c || (o.c.cuadrilla === c.cuadrilla && c.cuadrilla)) return; const dk = distKm(p, o.p); if (!mejor || dk < mejor.dk) mejor = { dk, o }; });
      if (mejor) cerca = `<br>🚩 Cuadrilla más cercana: <b>${esc(mejor.o.c.cuadrilla)}</b> (${mejor.dk.toFixed(1)} km)`;
    }
    L.circleMarker(p, { radius: c.esAdicional ? 10 : 7, color: c.esAdicional ? '#111827' : '#ffffff', weight: c.esAdicional ? 3 : 1.5,
        fillColor: COLOR_MAPA[k] || COLOR_MAPA.otro, fillOpacity: 0.92 })
      .bindPopup(`<b>${esc(c.nombre || '(sin nombre)')}</b><br>ID ${esc(idCaso(c) || '-')}<br>${esc(c.cuadrilla || '(sin cuadrilla)')} · ${esc(c.hora || '')}<br>` +
        `${esc(c.estadoOrigen || '')}<br>${esc(c.distrito || '')}${c.esAdicional ? '<br>📌 Adicional' : ''}${cerca}`)
      .addTo(_capaMapa);
    pts.push(p);
  });
  if (pts.length && _mapaAjustar){ _mapa.fitBounds(pts, { padding: [30, 30], maxZoom: 15 }); _mapaAjustar = false; }
}

/* ---- Revisión de calidad de datos ---- */
let calidadFiltro = '', calidadContrata = '', calidadCuadrilla = '';
function cambiarContrataCalidad(v){ calidadContrata = v || ''; calidadCuadrilla = ''; renderCalidad(); }
function cambiarCuadrillaCalidad(v){ calidadCuadrilla = v || ''; renderCalidad(); }
function datosCalidad(){
  const hoy = diaLocal(Date.now());
  const casos = stateSeg.casos.filter(c => !c.fecha || c.fecha === hoy);
  const issues = [];
  const add = (tipo, c, detalle) => issues.push({ tipo, c, detalle: detalle || '' });
  const dup = c => c.dni || c.telefono || '';
  const repetidos = new Map();
  casos.forEach(c => { const k = dup(c); if (k) repetidos.set(k, (repetidos.get(k) || 0) + 1); });
  casos.forEach(c => {
    const abierto = grupoCierre(c) !== 'cumplido';
    if (!c.cuadrilla) add('Sin cuadrilla', c);
    if (!esAlMomento(c)){
      if (!c.hora) add('Sin hora', c);
      else if (!HORAS_CARGA.includes(String(c.hora).slice(0, 5))) add('Hora fuera de franja', c, c.hora);
    }
    if (abierto && !c.telefono) add('Sin teléfono', c);
    if (!c.id_interno) add('Sin ID', c, c.os ? 'Usa la OS ' + c.os : 'Tampoco tiene OS');
    if (!c.distrito) add('Sin distrito', c);
    if (abierto && !parseCoords(c.coords)) add('Sin coordenadas', c, c.coords || '');
    const k = dup(c);
    if (k && repetidos.get(k) > 1) add('Cliente repetido', c, `${repetidos.get(k)} casos con el mismo ${c.dni ? 'DNI' : 'teléfono'}`);
  });
  return issues.filter(i => (!calidadContrata || norm(i.c.contratista) === norm(calidadContrata)) &&
                            (!calidadCuadrilla || norm(i.c.cuadrilla) === norm(calidadCuadrilla)));
}
function filtrarCalidad(tipo){ calidadFiltro = (calidadFiltro === tipo) ? '' : (tipo || ''); renderCalidad(); }
function renderCalidad(){
  llenarSelectContratas($('#calidadContrata'), calidadContrata);
  llenarSelectCuadrillas($('#calidadCuadrilla'), calidadCuadrilla, calidadContrata);
  const todas = datosCalidad();
  const tipos = [...new Set(todas.map(i => i.tipo))];
  const resumen = $('#calidadResumen');
  if (resumen) resumen.innerHTML = todas.length
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">${tipos.map(t => {
        const n = todas.filter(i => i.tipo === t).length, act = calidadFiltro === t;
        return `<button type="button" class="btn sm ${act ? 'primary' : ''}" onclick="filtrarCalidad('${esc(t)}')">${esc(t)} · ${n}</button>`;
      }).join('')}</div>`
    : '<div class="empty">✅ No se encontraron problemas en los datos del día.</div>';
  const lista = calidadFiltro ? todas.filter(i => i.tipo === calidadFiltro) : todas;
  const th = 'padding:6px 8px;text-align:left;border-bottom:1px solid var(--border,#ddd)';
  const td = 'padding:6px 8px;border-bottom:1px solid var(--border,#eee)';
  const tb = $('#calidadLista');
  if (tb) tb.innerHTML = lista.length
    ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr><th style="${th}">Problema</th><th style="${th}">ID</th><th style="${th}">Cliente</th><th style="${th}">Cuadrilla</th>
        <th style="${th}">Hora</th><th style="${th}">Estado</th><th style="${th}">Detalle</th></tr></thead><tbody>
        ${lista.map(i => `<tr><td style="${td};font-weight:600">${esc(i.tipo)}</td>
          <td style="${td}">${idCaso(i.c) ? `<span class="clip-btn" style="cursor:pointer;text-decoration:underline dotted" title="Clic para copiar" onclick="copyText('${esc(idCaso(i.c))}','ID')">${esc(idCaso(i.c))}</span>` : '—'}</td>
          <td style="${td}">${esc(i.c.nombre || '')}</td><td style="${td}">${esc(i.c.cuadrilla || '')}</td><td style="${td}">${esc(i.c.hora || '')}</td>
          <td style="${td}">${esc(i.c.estadoOrigen || '')}</td><td style="${td}">${esc(i.detalle)}</td></tr>`).join('')}</tbody></table></div>`
    : '';
}
function exportarCalidadExcel(){
  if (typeof XLSX === 'undefined') return toast('No se cargó la librería de Excel (¿hay internet?)');
  const todas = datosCalidad();
  if (!todas.length) return toast('No hay problemas de datos para exportar');
  const ws = XLSX.utils.aoa_to_sheet([['Problema', 'ID', 'Cliente', 'Cuadrilla', 'Contratista', 'Hora', 'Estado', 'Distrito', 'Detalle']]
    .concat(todas.map(i => [i.tipo, idCaso(i.c), i.c.nombre || '', i.c.cuadrilla || '', i.c.contratista || '', i.c.hora || '', i.c.estadoOrigen || '', i.c.distrito || '', i.detalle])));
  ws['!cols'] = [22, 14, 28, 18, 16, 8, 16, 16, 34].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Calidad de datos');
  XLSX.writeFile(wb, `Calidad_de_datos_${stampArchivo()}.xlsx`);
  toast('Excel descargado');
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-nota]'); if (b) notaRapida(b.dataset.nota);
});

/* ==================== REPORTES CONSOLIDADOS (todas las vistas de Seguimiento) ==================== */
const KEY_CONS = 'zaaz_cons_secciones';
const SECCIONES_CONS = [
  ['casos', '📋 Casos'], ['adicionales', '📌 Adicionales'], ['carga', '🧑‍🔧 Carga'], ['kpis', '📊 KPIs'], ['alertas', '⏱️ Alertas'],
  ['cierre', '🏁 Cierre del día'], ['mapa', '🗺️ Distritos por carga'], ['datos', '🧹 Datos'], ['conformidad', '📞 Conformidad']
];
let consContrata = '';
let consSel = {};
SECCIONES_CONS.forEach(([k]) => { consSel[k] = true; });
try { const g = JSON.parse(localStorage.getItem(KEY_CONS) || 'null'); if (g) Object.keys(consSel).forEach(k => { if (typeof g[k] === 'boolean') consSel[k] = g[k]; }); } catch(e){}

function cambiarContrataCons(v){ consContrata = v || ''; renderConsolidado(); }
function toggleSeccionCons(k){
  consSel[k] = !consSel[k];
  try { localStorage.setItem(KEY_CONS, JSON.stringify(consSel)); } catch(e){}
  renderConsolidado();
}
// Ejecuta una lectura de las otras vistas con la contrata elegida aquí, sin alterar sus filtros
function conContexto(contrata, fn){
  const g = [cierreContrata, alertFiltros, calidadContrata, calidadCuadrilla, mapaContrata, mapaCuadrilla, mapaFranja];
  try {
    cierreContrata = contrata; alertFiltros = { distritos: [], contratistas: contrata ? [contrata] : [] };
    calidadContrata = contrata; calidadCuadrilla = ''; mapaContrata = contrata; mapaCuadrilla = ''; mapaFranja = '';
    return fn();
  } finally { [cierreContrata, alertFiltros, calidadContrata, calidadCuadrilla, mapaContrata, mapaCuadrilla, mapaFranja] = g; }
}
const filaCasoCons = c => [c.hora || '', c.cuadrilla || '', c.contratista || '', c.empresa || '', idCaso(c), c.nombre || '', c.distrito || '',
  c.tipoTrabajo || '', c.estadoOrigen || '', c.esAdicional ? 'Sí' : '', (typeof ultimaNota === 'function' && ultimaNota(c)) || ''];
const CAB_CASO_CONS = ['Hora', 'Cuadrilla', 'Contratista', 'Empresa', 'ID', 'Cliente', 'Distrito', 'Tipo de trabajo', 'Estado', 'Adicional', 'Nota'];

function datosConsolidado(){
  const hoy = diaLocal(Date.now());
  const casos = stateSeg.casos.filter(c => (!c.fecha || c.fecha === hoy) && (!consContrata || norm(c.contratista) === norm(consContrata)))
    .sort((a, b) => String(a.hora || '99:99').localeCompare(String(b.hora || '99:99')));
  return conContexto(consContrata, () => {
    const cierre = datosCierre(), al = datosAlertas(), zonas = datosZonas(false), calidad = datosCalidad();
    // Adicionales y su coordinación
    const adicionales = casos.filter(c => c.esAdicional).map(c => {
      const co = mapaCoordinacion[c.id_interno || c.os];
      return { c, coordinado: !!co, contrata: co ? co.contrata : '' };
    });
    // Carga: casos por cuadrilla y franja
    const franjas = [...new Set([...HORAS_CARGA, ...casos.map(franjaCaso).filter(Boolean)])]
      .sort((a, b) => a === 'al momento' ? 1 : (b === 'al momento' ? -1 : a.localeCompare(b)));
    const pc = new Map();
    casos.forEach(c => {
      const k = norm(c.cuadrilla || '(sin cuadrilla)');
      if (!pc.has(k)) pc.set(k, { cuadrilla: c.cuadrilla || '(sin cuadrilla)', contratista: c.contratista || '', total: 0, por: {} });
      const o = pc.get(k); o.total++;
      const f = franjaCaso(c) || 'sin hora'; o.por[f] = (o.por[f] || 0) + 1;
    });
    const carga = [...pc.values()].sort((a, b) => a.cuadrilla.localeCompare(b.cuadrilla));
    // KPIs
    const kpi = { buckets: calcularTiemposKpi(casos), epf: calcularEnProcesoAFinal(casos),
      dist: [['Contratista', contadorPor(casos, 'contratista')], ['Empresa', contadorPor(casos, 'empresa')], ['Cuadrilla', contadorPor(casos, 'cuadrilla')],
             ['Distrito', contadorPor(casos, 'distrito')], ['Tipo de trabajo', contadorPor(casos, 'tipoTrabajo')], ['Estado', contadorPor(casos, 'estadoOrigen')]] };
    // Distritos por carga (misma lógica del mapa, sin distinguir mayúsculas)
    const pd = new Map(); let sinCoord = 0;
    casos.forEach(c => {
      const raw = c.distrito || '(sin distrito)', k = norm(raw);
      if (!pd.has(k)) pd.set(k, { vars: new Set(), total: 0, pend: 0, conCoord: 0 });
      const o = pd.get(k); o.vars.add(raw); o.total++;
      const g = grupoCierre(c); if (g !== 'cumplido' && g !== 'reprog') o.pend++;
      if (parseCoords(c.coords)) o.conCoord++; else sinCoord++;
    });
    const distritos = [...pd.values()].map(o => ({ distrito: etiquetaCanon([...o.vars]), total: o.total, pend: o.pend, conCoord: o.conCoord }))
      .sort((a, b) => (b.total - a.total) || (b.pend - a.pend) || a.distrito.localeCompare(b.distrito));
    // Conformidad
    const resCon = {}; casos.forEach(c => { const r = c.llamada ? c.llamada.resultado : 'sin_llamar'; resCon[r] = (resCon[r] || 0) + 1; });
    const llamadas = casos.filter(c => c.llamada);
    return { hoy, ahora: Date.now(), casos, cierre, al, zonas, calidad, adicionales, franjas, carga, kpi, distritos, sinCoord, resCon, llamadas };
  });
}
const ETQ_LLAMADA = { conforme: 'Conforme', no_contesta: 'No contesta', no_probo: 'No probó', manual: 'Observación manual', sin_llamar: 'Sin llamar' };

function renderConsolidado(){
  llenarSelectContratas($('#consContrata'), consContrata);
  const chips = $('#consSecciones');
  if (chips) chips.innerHTML = SECCIONES_CONS.map(([k, t]) =>
    `<button type="button" class="btn sm ${consSel[k] ? 'primary' : ''}" onclick="toggleSeccionCons('${k}')">${consSel[k] ? '✔ ' : ''}${t}</button>`).join('');
  const d = datosConsolidado(), t = d.cierre.tot;
  const tarjeta = (n, txt, col) => `<div style="flex:1;min-width:120px;border-radius:12px;padding:12px;background:${col}1f;border:1px solid ${col}66">
    <div style="font-size:24px;font-weight:800;color:${col}">${n}</div><div style="font-size:12px">${txt}</div></div>`;
  const nAl = d.al.alertas.length, nLlam = d.llamadas.length;
  const vista = $('#consVista');
  if (vista) vista.innerHTML = `<div class="hint" style="margin-bottom:6px">Día <b>${fmtFechaCierre(d.cierre)}</b>${consContrata ? ` · contrata <b>${esc(consContrata)}</b>` : ' · todas las contratas'}.
      Stand by ${cierreSinStandby ? '<b>excluidos</b>' : '<b>incluidos</b>'} en el cierre (se cambia en la pestaña Cierre).</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${tarjeta(d.casos.length, '📋 Casos', '#334155')}${tarjeta(d.adicionales.length, '📌 Adicionales', '#7c3aed')}
      ${tarjeta(t.cumpl + '%', '🏁 Cumplimiento', colorPct(t.cumpl))}${tarjeta(nAl + d.al.sinMov.length + d.zonas.length, '⏱️ Alertas', '#dc2626')}
      ${tarjeta(d.distritos.length, '🗺️ Distritos', '#f59e0b')}${tarjeta(d.calidad.length, '🧹 Problemas de datos', '#d97706')}
      ${tarjeta(nLlam + ' / ' + d.casos.length, '📞 Llamadas hechas', '#059669')}</div>`;
}

function exportarConsolidadoExcel(){
  if (typeof XLSX === 'undefined') return toast('No se cargó la librería de Excel (¿hay internet?)');
  const d = datosConsolidado(), t = d.cierre.tot;
  if (!d.casos.length) return toast('No hay casos del día para el reporte');
  const wb = XLSX.utils.book_new(), r1 = x => x === null || x === undefined ? '' : Math.round(x * 10) / 10;
  const hoja = (nombre, aoa, anchos) => { const ws = XLSX.utils.aoa_to_sheet(aoa); if (anchos) ws['!cols'] = anchos.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31)); };
  hoja('Resumen', [
    ['Reporte consolidado de Seguimiento'], ['Día', d.hoy], ['Corte', fmtHoraMs(d.ahora)], ['Contrata', consContrata || 'Todas'],
    ['Stand by en el cierre', cierreSinStandby ? 'Excluidos' : 'Incluidos'], [],
    ['Casos del día', d.casos.length], ['Adicionales', d.adicionales.length], ['Programados (cierre)', t.total], ['Cumplidos', t.cumplido],
    ['Reprogramados', t.reprog], ['Pendientes', t.abiertos], ['Cumplimiento %', t.cumpl],
    ['Cumplimiento con stand by %', d.cierre.alt.conCumpl], ['Cumplimiento sin stand by %', d.cierre.alt.sinCumpl],
    ['Alertas de tiempo', d.al.alertas.length], ['Cuadrillas sin movimiento', d.al.sinMov.length], ['Zonas calientes', d.zonas.length],
    ['Problemas de datos', d.calidad.length], ['Llamadas de conformidad hechas', d.llamadas.length]], [34, 20]);
  if (consSel.casos) hoja('Casos', [CAB_CASO_CONS].concat(d.casos.map(filaCasoCons)), [8, 18, 14, 14, 14, 28, 16, 20, 16, 10, 30]);
  if (consSel.adicionales) hoja('Adicionales', [['Hora', 'Cuadrilla', 'ID', 'Cliente', 'Distrito', 'Estado', 'Coordinación', 'Asignado a']]
    .concat(d.adicionales.map(a => [a.c.hora || '', a.c.cuadrilla || '', idCaso(a.c), a.c.nombre || '', a.c.distrito || '', a.c.estadoOrigen || '',
      a.coordinado ? 'Coordinado' : 'Sin asignar', a.contrata])), [8, 18, 14, 28, 16, 16, 14, 20]);
  if (consSel.carga) hoja('Carga', [['Cuadrilla', 'Contratista', 'Total', ...d.franjas]]
    .concat(d.carga.map(o => [o.cuadrilla, o.contratista, o.total, ...d.franjas.map(f => o.por[f] || 0)])), [20, 16, 8, ...d.franjas.map(() => 10)]);
  if (consSel.kpis){
    const b = d.kpi.buckets, pm = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : '';
    hoja('KPIs tiempos', [['Categoría', 'Casos', 'Promedio (min)'], ['Excelente (hasta 30 min)', b.excelente.length, pm(b.excelente)], ['Bueno (hasta 50 min)', b.bueno.length, pm(b.bueno)],
      ['Normal (hasta 60 min)', b.normal.length, pm(b.normal)], ['Irregular (más de 60 min)', b.irregular.length, pm(b.irregular)]], [28, 10, 16]);
    hoja('KPIs en proceso a resuelto', [['Cuadrilla', 'Casos', 'Promedio (min)', 'Mín (min)', 'Máx (min)', '% hasta 60 min']]
      .concat(d.kpi.epf.map(f => [f.cuadrilla, f.n, Math.round(f.prom), Math.round(f.min), Math.round(f.max), f.ok60])), [22, 8, 15, 10, 10, 14]);
    const dist = [['Dimensión', 'Valor', 'Casos']]; d.kpi.dist.forEach(([dim, datos]) => datos.forEach(([k, v]) => dist.push([dim, k, v])));
    hoja('KPIs distribución', dist, [18, 30, 8]);
  }
  if (consSel.alertas){
    hoja('Alertas de tiempo', [['Acción', 'Cuadrilla', 'Estado', 'Minutos', 'Tiempo', 'Cliente', 'ID', 'Distrito', 'Contratista', 'Desde']]
      .concat(d.al.alertas.map(a => [a.nivel === 'presionar' ? 'Presionar' : 'Consultar', a.c.cuadrilla || '', ETQ_ESTADO_T[a.clave], r1(a.min), fmtMin(a.min),
        a.c.nombre || '', idCaso(a.c), a.c.distrito || '', a.c.contratista || '', fmtHoraMs(a.ini)])), [12, 18, 12, 9, 12, 28, 14, 16, 16, 8]);
    hoja('Sin movimiento', [['Cuadrilla', 'Contratista', 'Casos vencidos', 'Primera hora', 'Último movimiento', 'Minutos sin movimiento', 'ID más antiguo']]
      .concat(d.al.sinMov.map(s => [s.cuadrilla, s.contratista, s.pendientes, fmtHoraMs(s.primera), s.ultima ? fmtHoraMs(s.ultima) : '', r1(s.min), idCaso(s.vencidos[0])])), [20, 16, 14, 12, 18, 22, 14]);
    hoja('Zonas calientes', [['Distrito', 'Vencidos', 'Reprogramados', 'Stand by', 'Total', 'Nivel']]
      .concat(d.zonas.map(z => [z.distrito, z.vencidos, z.reprog, z.standby, z.total, z.nivel === 'presionar' ? 'Crítica' : 'Atención'])), [20, 10, 14, 10, 8, 10]);
    hoja('Tiempos por cuadrilla', [['Cuadrilla', 'En camino: casos', 'En camino: prom (min)', 'En camino: máx (min)', 'En proceso: casos', 'En proceso: prom (min)', 'En proceso: máx (min)', 'Veces consultar', 'Veces presionar']]
      .concat(d.al.cuadrillas.map(f => [f.cuadrilla, f.camino.n, r1(f.camino.prom), r1(f.camino.max), f.proceso.n, r1(f.proceso.prom), r1(f.proceso.max), f.consultar, f.presionar])), [22, 14, 20, 20, 14, 22, 22, 15, 15]);
  }
  if (consSel.cierre){
    const cab = ['Programados', 'Cumplidos', 'En curso', 'Sin atender', 'Reprogramados', 'Stand by / otros', 'Cumplimiento %'];
    const nums = o => [o.total, o.cumplido, o.encurso, o.pendiente, o.reprog, o.standby, o.cumpl];
    hoja('Cierre por contratista', [['Contratista', ...cab]].concat(d.cierre.porContratista.map(o => [o.nombre, ...nums(o)])), [22, 13, 11, 10, 12, 14, 16, 15]);
    hoja('Cierre por cuadrilla', [['Cuadrilla', 'Contratista', ...cab]].concat(d.cierre.porCuadrilla.map(o => [o.nombre, o.contratista, ...nums(o)])), [22, 18, 13, 11, 10, 12, 14, 16, 15]);
    hoja('Cierre por tipo de trabajo', [['Tipo de trabajo', ...cab, 'Prom. en camino (min)', 'Prom. en proceso (min)']]
      .concat(d.cierre.porTipo.map(o => [o.nombre, ...nums(o), r1(o.pCamino), r1(o.pProceso)])), [22, 13, 11, 10, 12, 14, 16, 15, 20, 21]);
    hoja('Cierre pendientes', [CAB_CASO_CONS].concat(d.cierre.abiertos.map(filaCasoCons)), [8, 18, 14, 14, 14, 28, 16, 20, 16, 10, 30]);
  }
  if (consSel.mapa) hoja('Distritos por carga', [['#', 'Distrito', 'Casos', 'Pendientes', 'Con coordenadas']].concat(d.distritos.map((o, i) => [i + 1, o.distrito, o.total, o.pend, o.conCoord])), [5, 26, 8, 12, 16]);
  if (consSel.datos) hoja('Datos', [['Problema', 'ID', 'Cliente', 'Cuadrilla', 'Contratista', 'Hora', 'Estado', 'Distrito', 'Detalle']]
    .concat(d.calidad.map(i => [i.tipo, idCaso(i.c), i.c.nombre || '', i.c.cuadrilla || '', i.c.contratista || '', i.c.hora || '', i.c.estadoOrigen || '', i.c.distrito || '', i.detalle])), [22, 14, 28, 18, 16, 8, 16, 16, 34]);
  if (consSel.conformidad){
    hoja('Conformidad resumen', [['Resultado', 'Casos']].concat(Object.keys(d.resCon).map(k => [ETQ_LLAMADA[k] || k, d.resCon[k]])), [24, 10]);
    hoja('Conformidad llamadas', [['Hora', 'Cuadrilla', 'ID', 'Cliente', 'Resultado', 'Observación', 'Fecha de la llamada']]
      .concat(d.llamadas.map(c => [c.hora || '', c.cuadrilla || '', idCaso(c), c.nombre || '', ETQ_LLAMADA[c.llamada.resultado] || c.llamada.resultado, c.llamada.observacion || '', c.llamada.fecha || ''])), [8, 18, 14, 28, 18, 36, 22]);
  }
  XLSX.writeFile(wb, `Consolidado_${consContrata ? consContrata.replace(/\W+/g, '_') + '_' : ''}${stampArchivo()}.xlsx`);
  toast('Excel consolidado descargado');
}

async function exportarConsolidadoPDF(){
  const d = datosConsolidado(), t = d.cierre.tot;
  if (!d.casos.length) return toast('No hay casos del día para el reporte');
  try {
    toast('Generando PDF...');
    await cargarScriptExterno('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    await cargarScriptExterno('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js');
  } catch(e){ return toast('No se pudo cargar la librería de PDF (¿hay internet?)'); }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 32;
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const suave = h => rgb(h).map(v => Math.round(v * 0.12 + 255 * 0.88));
  const estilo = { margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 4, halign: 'center' }, headStyles: { fillColor: [30, 41, 59], textColor: 255 }, columnStyles: { 0: { halign: 'left' } } };
  const colNivel = n => COLOR_NIVEL[n] || '#059669';
  let y = 0;
  const seccion = (txt, col, alto) => {
    if (y + (alto || 90) > H - 36){ doc.addPage(); y = M; }
    doc.setFillColor(...rgb(col)); doc.rect(M, y - 11, 4, 15, 'F');
    doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(txt, M + 10, y);
    y += 8;
  };
  const tabla = (opts) => { doc.autoTable({ ...estilo, ...opts, startY: y, margin: { left: M, right: M, bottom: 36 } }); y = doc.lastAutoTable.finalY + 24; };
  const nota = (txt) => { if (y + 24 > H - 36){ doc.addPage(); y = M; } doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(110, 110, 110); doc.text(txt, M, y + 8); y += 26; };
  const limite = (arr, n) => arr.slice(0, n);

  // Cabecera y resumen
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 64, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(`Reporte consolidado${consContrata ? ' - ' + consContrata : ''}`, M, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`${fmtFechaCierre(d.cierre)}   |   ${consContrata ? 'Contrata ' + consContrata : 'Todas las contratas'}   |   Stand by ${cierreSinStandby ? 'excluidos' : 'incluidos'} en el cierre`, M, 50);
  const tarjetas = [['CASOS', d.casos.length, '#334155'], ['ADICIONALES', d.adicionales.length, '#7c3aed'], ['CUMPLIMIENTO', t.cumpl + '%', colorPct(t.cumpl)],
    ['ALERTAS', d.al.alertas.length + d.al.sinMov.length + d.zonas.length, '#dc2626'], ['PROBLEMAS DE DATOS', d.calidad.length, '#d97706']];
  const gap = 12, cw = (W - 2 * M - 4 * gap) / 5;
  tarjetas.forEach(([txt, n, c], i) => {
    const x = M + i * (cw + gap);
    doc.setFillColor(...suave(c)); doc.setDrawColor(...rgb(c)); doc.roundedRect(x, 80, cw, 58, 8, 8, 'FD');
    doc.setTextColor(...rgb(c)); doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.text(String(n), x + 14, 114);
    doc.setFontSize(8.5); doc.setTextColor(60, 60, 60); doc.text(txt, x + 14, 129);
  });
  y = 168;

  if (consSel.cierre){
    seccion('Cierre del dia', '#059669', 160);
    const f = (o, conC) => [o.nombre, ...(conC ? [o.contratista] : []), String(o.total), String(o.cumplido), String(o.encurso), String(o.pendiente), String(o.reprog), String(o.standby),
      { content: o.cumpl + '%', styles: { fillColor: rgb(colorPct(o.cumpl)), textColor: 255, fontStyle: 'bold' } }];
    const cab = (p, conC) => [[p, ...(conC ? ['Contratista'] : []), 'Programados', 'Cumplidos', 'En curso', 'Sin atender', 'Reprog.', 'Stand by', 'Cumplimiento']];
    nota(`Con stand by: ${d.cierre.alt.conCumpl}% (${d.cierre.alt.conPend} pendientes)   |   Sin stand by: ${d.cierre.alt.sinCumpl}% (${d.cierre.alt.sinPend} pendientes)   |   Stand by: ${d.cierre.alt.standby} ordenes`);
    tabla({ head: cab('Contratista', false), body: d.cierre.porContratista.map(o => f(o, false)) });
    tabla({ head: cab('Cuadrilla', true), body: d.cierre.porCuadrilla.map(o => f(o, true)), columnStyles: { 0: { halign: 'left' }, 1: { halign: 'left' } } });
  }
  if (consSel.alertas){
    seccion('Alertas', '#dc2626', 120);
    if (d.al.alertas.length) tabla({ head: [['Accion', 'Cuadrilla', 'Estado', 'Tiempo', 'Cliente', 'ID', 'Distrito']],
      body: limite(d.al.alertas, 40).map(a => [{ content: a.nivel === 'presionar' ? 'PRESIONAR' : 'CONSULTAR', styles: { fillColor: rgb(colNivel(a.nivel)), textColor: 255, fontStyle: 'bold' } },
        a.c.cuadrilla || '', ETQ_ESTADO_T[a.clave], { content: fmtMin(a.min), styles: { textColor: rgb(colNivel(a.nivel)), fontStyle: 'bold' } }, a.c.nombre || '', idCaso(a.c), a.c.distrito || '']) });
    else nota('Ningun caso supera los tiempos en este momento.');
    if (d.al.sinMov.length) tabla({ head: [['Cuadrilla sin movimiento', 'Contratista', 'Casos vencidos', 'Primera hora', 'Sin movimiento']],
      body: d.al.sinMov.map(s => [s.cuadrilla, s.contratista, String(s.pendientes), fmtHoraMs(s.primera), fmtMin(s.min)]) });
    if (d.zonas.length) tabla({ head: [['Zona caliente', 'Vencidos', 'Reprogramados', 'Stand by', 'Total', 'Nivel']],
      body: d.zonas.map(z => [z.distrito, String(z.vencidos), String(z.reprog), String(z.standby), String(z.total), z.nivel === 'presionar' ? 'Critica' : 'Atencion']) });
  }
  if (consSel.kpis){
    seccion('KPIs', '#2563eb', 120);
    const b = d.kpi.buckets, pm = a => a.length ? Math.round(a.reduce((x, z) => x + z, 0) / a.length) + ' min' : '-';
    tabla({ head: [['Tiempo hasta instalar o solucionar', 'Casos', 'Promedio']],
      body: [['Excelente (hasta 30 min)', b.excelente.length, pm(b.excelente)], ['Bueno (hasta 50 min)', b.bueno.length, pm(b.bueno)], ['Normal (hasta 60 min)', b.normal.length, pm(b.normal)],
             ['Irregular (mas de 60 min)', b.irregular.length, pm(b.irregular)]].map(r => r.map(String)) });
    if (d.kpi.epf.length) tabla({ head: [['En proceso a resuelto: cuadrilla', 'Casos', 'Promedio', 'Minimo', 'Maximo', 'Hasta 60 min']],
      body: limite(d.kpi.epf, 25).map(f => [f.cuadrilla, String(f.n), Math.round(f.prom) + ' min', Math.round(f.min) + ' min', Math.round(f.max) + ' min', f.ok60 + '%']) });
  }
  if (consSel.mapa){
    seccion('Distritos por carga', '#f59e0b', 120);
    const max = Math.max(1, ...d.distritos.map(o => o.total));
    tabla({ head: [['#', 'Distrito', 'Casos', 'Pendientes', 'Carga']], columnStyles: { 1: { halign: 'left' }, 4: { cellWidth: 200 } },
      body: limite(d.distritos, 25).map((o, i) => [String(i + 1), o.distrito, String(o.total), String(o.pend), '']),
      didDrawCell: h => { if (h.section === 'body' && h.column.index === 4){
        const o = d.distritos[h.row.index]; if (!o) return;
        doc.setFillColor(245, 158, 11); doc.rect(h.cell.x + 3, h.cell.y + 4, Math.max(2, (h.cell.width - 6) * o.total / max), h.cell.height - 8, 'F'); } } });
    if (d.sinCoord) nota(`${d.sinCoord} casos sin coordenadas no se pueden ubicar en el mapa.`);
  }
  if (consSel.adicionales){
    seccion('Adicionales', '#7c3aed', 100);
    if (d.adicionales.length) tabla({ head: [['Hora', 'Cuadrilla', 'ID', 'Cliente', 'Distrito', 'Estado', 'Coordinacion']],
      body: d.adicionales.map(a => [a.c.hora || '-', a.c.cuadrilla || '', idCaso(a.c), a.c.nombre || '', a.c.distrito || '', a.c.estadoOrigen || '',
        { content: a.coordinado ? 'Coordinado' + (a.contrata ? ': ' + a.contrata : '') : 'Sin asignar', styles: { textColor: rgb(a.coordinado ? '#059669' : '#d97706'), fontStyle: 'bold' } }]) });
    else nota('No hay adicionales.');
  }
  if (consSel.carga){
    seccion('Carga por cuadrilla y franja', '#0ea5e9', 120);
    tabla({ head: [['Cuadrilla', 'Total', ...d.franjas]],
      body: d.carga.map(o => [o.cuadrilla, String(o.total), ...d.franjas.map(f => { const n = o.por[f] || 0;
        return n ? { content: String(n), styles: { fillColor: n >= 3 ? [254, 202, 202] : (n === 2 ? [254, 240, 138] : [187, 247, 208]), fontStyle: 'bold' } } : ''; })]) });
  }
  if (consSel.casos){
    seccion('Casos por estado', '#334155', 100);
    tabla({ head: [['Estado', 'Casos']], body: contadorPor(d.casos, 'estadoOrigen').map(([k, v]) => [k, String(v)]) });
  }
  if (consSel.datos){
    seccion('Revision de datos', '#d97706', 100);
    const por = {}; d.calidad.forEach(i => { por[i.tipo] = (por[i.tipo] || 0) + 1; });
    if (d.calidad.length) tabla({ head: [['Problema', 'Casos']], body: Object.keys(por).sort((a, b) => por[b] - por[a]).map(k => [k, String(por[k])]) });
    else nota('No se encontraron problemas en los datos del dia.');
  }
  if (consSel.conformidad){
    seccion('Llamadas de conformidad', '#059669', 100);
    tabla({ head: [['Resultado', 'Casos']], body: Object.keys(d.resCon).map(k => [ETQ_LLAMADA[k] || k, String(d.resCon[k])]) });
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++){
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130, 130, 130);
    doc.text(`Pagina ${i} de ${n}`, W - M, H - 14, { align: 'right' });
  }
  doc.save(`Consolidado_${consContrata ? consContrata.replace(/\W+/g, '_') + '_' : ''}${stampArchivo()}.pdf`);
  toast('PDF consolidado descargado');
}

/* ==================== INTEGRACIÓN CON PYTHON ==================== */
/* ---- Casos que salen del día (reprogramados a otra fecha) ---- */
const KEY_OCULTAR_REPROG = 'zaaz_ocultar_reprog';
let ocultarReprog = false;
try { ocultarReprog = localStorage.getItem(KEY_OCULTAR_REPROG) === '1'; } catch(e){}
const esReprogramado = estado => /^reprogramad/.test(norm(estado));

function pintarBtnReprog(){
  const b = $('#btnReprog'); if (!b) return;
  b.textContent = ocultarReprog ? '🙈 Reprogramados ocultos' : '👁️ Reprogramados visibles';
  b.classList.toggle('primary', ocultarReprog);
}
function toggleOcultarReprog(){
  ocultarReprog = !ocultarReprog;
  try { localStorage.setItem(KEY_OCULTAR_REPROG, ocultarReprog ? '1' : '0'); } catch(e){}
  pintarBtnReprog();
  if (ocultarReprog){
    const n = stateSeg.casos.filter(c => esReprogramado(c.estadoOrigen)).length;
    stateSeg.casos = stateSeg.casos.filter(c => !esReprogramado(c.estadoOrigen));
    saveSeg();
    renderImportInfoSeg(); renderCasos(); renderConf(); renderCarga(); renderKpis(); renderReporte(); renderAdicionales();
    toast(`🙈 ${n} reprogramado(s) ocultos`);
  } else {
    toast('👁️ Reprogramados visibles');
    ejecutarSincroZaaz();
  }
}
// Deja solo lo que Zaaz sigue mostrando para HOY y quita del tablero lo que ya no está
function depurarCasosDelDia(filas){
  const hoy = diaLocal(Date.now());
  let items = filas.map(r => ({ r, m: mapRowSeg(r) }));
  items = items.filter(x => !x.m.fecha || x.m.fecha === hoy);          // filas con otra fecha: ya no son de hoy
  if (ocultarReprog) items = items.filter(x => !esReprogramado(x.m.estadoOrigen));
  if (!items.length) return { filas: [], salieron: 0 };                // sin datos válidos no se borra nada
  const presentes = new Set(items.map(x => keySeg(x.m)));
  const antes = stateSeg.casos.length;
  stateSeg.casos = stateSeg.casos.filter(c => {
    if (c.fecha && c.fecha !== hoy) return true;                       // cargas manuales de otra fecha no se tocan
    if (presentes.has(keySeg(c))){ c._ausente = 0; return true; }
    c._ausente = (c._ausente || 0) + 1;
    return c._ausente < 2;                                             // sale si falta en 2 sincronizaciones seguidas
  });
  return { filas: items.map(x => x.r), salieron: antes - stateSeg.casos.length };
}

/* ---- Salud de la sincronización: avisa si falla ---- */
let _fallosSync = 0, _ultimoAvisoFallo = 0, _ultimoOkSync = 0;

function mostrarAlertaSync(msg){
  const el = $('#alertaSync'); if (!el) return;
  if (!msg){ el.style.display = 'none'; return; }
  const t = $('#alertaSyncTxt'); if (t) t.textContent = msg;
  el.style.display = 'flex';
}
// Sonido + notificación del sistema (solo si tienes los Avisos activados)
function avisarSistema(titulo, cuerpo, tag, grave){
  if (!notifOn) return;
  sonidoAviso(grave);
  if (document.visibilityState !== 'visible') parpadearTitulo(grave ? '⚠️ Sincro con error' : '✅ Sincro restablecida');
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(titulo, { body: cuerpo, tag, requireInteraction: !!grave });
    n.onclick = () => { window.focus(); n.close(); };
  } catch(e){}
}
function registrarSincroOk(){
  const venia = _fallosSync > 0;
  _fallosSync = 0; _ultimoAvisoFallo = 0; _ultimoOkSync = Date.now();
  mostrarAlertaSync(null);
  if (venia) avisarSistema('✅ Sincronización restablecida', 'Zaaz vuelve a responder.', 'sync-ok', false);
}
function registrarSincroFallo(tipo, detalle){
  _fallosSync++;
  const ultima = _ultimoOkSync ? new Date(_ultimoOkSync).toLocaleTimeString() : 'ninguna todavía';
  let msg;
  if (tipo === 'sesion')        msg = '🔑 La sesión de Zaaz expiró. Actualiza cookie.txt con una cookie nueva y pulsa Reintentar.';
  else if (tipo === 'servidor') msg = `🔌 Sin conexión con servidor.py (¿está encendido?). Última sincro correcta: ${ultima}.`;
  else                          msg = `⚠️ Falló la sincronización: ${detalle || 'error desconocido'}. Última correcta: ${ultima}.`;
  mostrarAlertaSync(msg);
  // La sesión vencida no se arregla sola: avisa de inmediato. Lo demás, desde el 2.º fallo seguido.
  const urgente = tipo === 'sesion' ? _fallosSync >= 1 : _fallosSync >= 2;
  const ahora = Date.now();
  if (urgente && ahora - _ultimoAvisoFallo > 15 * 60000){   // primer aviso y luego recordatorio cada 15 min
    _ultimoAvisoFallo = ahora;
    avisarSistema('⚠️ Sincronización con error', msg.replace(/^\S+\s/, ''), 'sync-fallo', true);
  }
}

async function ejecutarSincroZaaz(){
  let tipoFallo = 'otro', detalle = '';
  try {
    await revisarCambioDeDia();
    toast('Consultando Zaaz vía Python...');
    let res;
    try { res = await fetch('http://localhost:5000/api/sincronizar?tipo=seguimiento'); }
    catch(e){ tipoFallo = 'servidor'; throw e; }
    let json = null;
    try { json = await res.json(); } catch(e){}
    if (!res.ok || !json || json.status !== 'ok'){
      tipoFallo = (json && json.codigo === 'sesion_expirada') ? 'sesion' : 'zaaz';
      detalle = (json && json.mensaje) || 'Respuesta inválida del servidor';
      throw new Error(detalle);
    }

    const dep = depurarCasosDelDia(json.datos);
    importRowsSeg(dep.filas, 'Sincro Automática (Python)');

    const dot = $('#autoDot');
    const txt = $('#autoText');
    if (dot) dot.classList.add('active');
    if (txt) txt.textContent = `Activo · Última sincro: ${new Date().toLocaleTimeString()} (${json.nuevas_adicionales||0} adic.)${dep.salieron ? ` · ${dep.salieron} salieron del día` : ''}`;
    registrarSincroOk();
  } catch(err){
    console.error(err);
    if (tipoFallo === 'otro') detalle = String((err && err.message) || err);
    toast('⚠️ Falló la sincronización');
    const dot = $('#autoDot');
    const txt = $('#autoText');
    if (dot) dot.classList.remove('active');
    if (txt) txt.textContent = tipoFallo === 'sesion' ? 'Sesión de Zaaz vencida' :
                               tipoFallo === 'servidor' ? 'Error de conexión. ¿Está corriendo servidor.py?' : 'Error de sincronización';
    registrarSincroFallo(tipoFallo, detalle);
  }
}

async function reiniciarBasePython(){
  if (!confirm('¿Reiniciar? Se borrarán los casos, coordinaciones y la línea base del día (tus filtros se mantienen) y se volverá a sincronizar con los datos de hoy.')) return;
  await borrarTodoSeguimiento();
  toast('Todo restablecido');
  ejecutarSincroZaaz();
}

function toggleAutoMonitoreo(){
  const btn = $('#btnAutoToggle');
  if (autoTimerId){
    clearInterval(autoTimerId);
    clearTimeout(autoTimerId);
    autoTimerId = null;
    if (btn){
      btn.textContent = '▶ Iniciar Ciclo';
      btn.classList.add('primary');
    }
    const dot = $('#autoDot');
    const txt = $('#autoText');
    if (dot) dot.classList.remove('active');
    if (txt) txt.textContent = 'Monitoreo pausado';
    return;
  }

  if (btn){
    btn.textContent = '⏸ Pausar';
    btn.classList.remove('primary');
  }
  // Guardar el timestamp de la última sincro para saber cuándo toca la siguiente
  window._ultimaSincro = Date.now();
  window._intervaloMin = 5; // 5 minutos

  ejecutarSincroZaaz();
  segsRestantes = 300;

  // Timer visual (contador 05:00)
  autoTimerId = setInterval(() => {
    // Si la pestaña está visible, cuenta normal
    if (document.visibilityState !== 'visible') return;
    segsRestantes--;
    if (segsRestantes < 0) segsRestantes = 0;
    const m = String(Math.floor(segsRestantes / 60)).padStart(2, '0');
    const s = String(segsRestantes % 60).padStart(2, '0');
    const timer = $('#autoTimer');
    if (timer) timer.textContent = `${m}:${s}`;
  }, 1000);

  // Timer de fondo (verifica cada 30 seg si toca sincronizar)
  window._checkSyncTimer = setInterval(() => {
    const ahora = Date.now();
    const minutosPasados = (ahora - window._ultimaSincro) / 60000;
    if (minutosPasados >= window._intervaloMin){
      window._ultimaSincro = ahora;
      segsRestantes = 300;
      ejecutarSincroZaaz();
    }
  }, 30000);
}

/* ==================== TRIAJE DE ADICIONALES ==================== */
function toggleCoordCaso(idCaso){
  if (mapaCoordinacion[idCaso]){
    delete mapaCoordinacion[idCaso];
  } else {
    const contrata = prompt("Indica el nombre de la Contrata o Cuadrilla que tomará el caso:", "PROPIA / CONTRATA");
    if (contrata === null) return;
    mapaCoordinacion[idCaso] = {
      contrata: contrata.trim() || 'ASIGNADA',
      fecha: new Date().toLocaleTimeString()
    };
  }
  localStorage.setItem(KEY_COORD, JSON.stringify(mapaCoordinacion));
  renderAdicionales();
  renderCasos();
}
/* ==================== BADGES ==================== */
function badgeEstadoSeg(e){ return `<span class="badge ${e}">${ESTADOS[e]||e}</span>`; }
function badgeLlamada(c){
  if (!c.llamada) return '<span class="badge pendiente">Sin llamar</span>';
  return `<span class="badge ${c.llamada.resultado}">${RESULTADOS[c.llamada.resultado]||c.llamada.resultado}</span>`;
}
function badgeDisponible(c){
  if (!c.disponible) return '<span class="badge pendiente">Sin gestionar</span>';
  const map = { disponible:'disponible', no_contesta:'no_contesta', manual:'manual' };
  return `<span class="badge ${map[c.disponible.resultado]||'pendiente'}">${RESULTADOS_DISP[c.disponible.resultado]||c.disponible.resultado}</span>`;
}
function badgeEstadoOrigen(e){
  if (!e) return '';
  const key = norm(e).replace(/\s+/g,'_');
  return `<span class="badge ${key}">${esc(e)}</span>`;
}
function badgeTipoTrabajo(t){
  if (!t) return '';
  const key = norm(t).replace(/\s+/g,'_');
  return `<span class="badge ${key}">${esc(t)}</span>`;
}
function badgeEstadoOs(e){
  if (!e) return '';
  const key = norm(e).replace(/\s+/g,'_');
  return `<span class="badge ${key}">${esc(e)}</span>`;
}
function deteccionLabel(k){
  return {
    wifi6_req:  '🔵 Wifi 6 obligatorio',
    mesh_req:   '🟢 Mesh sugerido',
    revisar_tec:'⚠️ Revisar técnico',
    equipo_ok:  '✅ Equipo OK',
    estandar:   '⚪ Estándar'
  }[k] || k;
}
function badgeDeteccion(d){
  const map = { wifi6_req:'wifi6_req', mesh_req:'mesh_req', revisar_tec:'revisar_tec', equipo_ok:'equipo_ok', estandar:'estandar' };
  const lbl = { wifi6_req:'🔵 Wifi 6', mesh_req:'🟢 Mesh', revisar_tec:'⚠️ Revisar', equipo_ok:'✅ Equipo OK', estandar:'⚪ Estándar' };
  return `<span class="badge ${map[d]||'estandar'}">${lbl[d]||'Estándar'}</span>`;
}

/* ==================== WHATSAPP + 3CX ==================== */
function cleanPhone(p){
  if (!p) return '';
  let d = String(p).replace(/\D/g,'');
  if (!d) return '';
  if (d.length === 9 && d.startsWith('9')) d = '51' + d;
  else if (d.length === 8) d = '511' + d;
  return d;
}

function cleanPhone3CX(p){
  if (!p) return '';
  return String(p).replace(/\D/g,'');
}
function buildWhatsText(ctx){
  if (!ctx || !ctx.nombre) return '';
  const tipoRaw = (ctx.tipoTrabajo || '').toLowerCase();
  let tipoSolicitud = 'instalación';
  if (/reinstala/.test(tipoRaw)) tipoSolicitud = 'instalación';
  else if (/traslado interno/.test(tipoRaw)) tipoSolicitud = 'traslado interno';
  else if (/traslado externo/.test(tipoRaw)) tipoSolicitud = 'traslado externo';
  else if (/instala/.test(tipoRaw)) tipoSolicitud = 'instalación';
  else if (/garant[ií]a|aver[ií]a/.test(tipoRaw)) tipoSolicitud = 'reparación';
  else if (/traslado/.test(tipoRaw)) tipoSolicitud = 'traslado';
  else if (tipoRaw) tipoSolicitud = tipoRaw;
  return `Hola ${ctx.nombre}, te saludamos de ZAAZ Internet. Nos comunicamos referente a tu solicitud de ${tipoSolicitud}, queríamos confirmar tu disponibilidad para que se pueda acercar el técnico.`;
}
function waIconHTML(tel, ctx = {}){
  const num = cleanPhone3CX(tel);
  if (!num) return '';
  const texto = buildWhatsText(ctx);
  const link = 'https://wa.me/' + num + (texto ? '?text=' + encodeURIComponent(texto) : '');
  return `<a href="${link}" target="_blank" rel="noopener" title="WhatsApp" class="wa-link" onclick="event.stopPropagation()">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  </a>`;
}
let _3cxBase = '';
function get3CXBase(){
  if (_3cxBase) return _3cxBase;
  _3cxBase = localStorage.getItem('3cx_base') || '';
  return _3cxBase;
}
function set3CXBase(url){
  _3cxBase = url.replace(/\/+$/,'');
  localStorage.setItem('3cx_base', _3cxBase);
}
function tcxIconHTML(tel){
    const num = cleanPhone3CX(tel);
  if (!num) return '';
  const base = get3CXBase();
  if (base){
    return `<a href="${base}/webclient/#/call?phone=${num}" target="_blank" rel="noopener" title="Llamar con 3CX" class="tcx-link" onclick="event.stopPropagation()">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.44-5.15-3.75-6.59-6.59l1.97-1.57c.27-.27.36-.66.24-1.01A11.36 11.36 0 0 1 8.96 4.33c0-.55-.45-1-1-1H4.4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.56c0-.55-.45-1-1-1zM12 3a9 9 0 0 1 9 9h-2a7 7 0 0 0-7-7V3z"/></svg>
    </a>`;
  }
  return `<a href="javascript:void(0)" title="Configurar 3CX" class="tcx-link" onclick="event.preventDefault();event.stopPropagation();open3CXConfig('${esc(num)}')">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.44-5.15-3.75-6.59-6.59l1.97-1.57c.27-.27.36-.66.24-1.01A11.36 11.36 0 0 1 8.96 4.33c0-.55-.45-1-1-1H4.4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.56c0-.55-.45-1-1-1zM12 3a9 9 0 0 1 9 9h-2a7 7 0 0 0-7-7V3z"/></svg>
  </a>`;
}
function open3CXConfig(num){
  const actual = get3CXBase() || '';
  $('#modal').innerHTML = `
    <div class="mhead">
      <div><h2>Configurar 3CX Web</h2></div>
      <button class="btn sm" id="mClose">✕</button>
    </div>
    <div class="hint" style="margin-bottom:8px">Pega la URL de tu cliente Web 3CX (ej: <code>https://tuempresa.3cx.pe</code>). Se guardará en este navegador.</div>
    <input id="tcxInput" placeholder="https://tuempresa.3cx.pe" value="${esc(actual)}" style="margin-bottom:10px">
    <div class="row">
      <button class="btn" id="tcxCancel" style="flex:1">Cancelar</button>
      <button class="btn primary" id="tcxSave" style="flex:1">Guardar y llamar</button>
    </div>
  `;
  $('#modalBg').classList.add('open');
  $('#mClose').onclick = cerrarModal;
  $('#tcxCancel').onclick = cerrarModal;
  $('#tcxSave').onclick = () => {
    const val = ($('#tcxInput').value||'').trim();
    if (!val){ toast('Ingresa una URL válida'); return; }
    set3CXBase(val);
    cerrarModal();
    toast('3CX configurado');
    window.open(get3CXBase() + '/webclient/#/call?phone=' + num, '_blank');
  };
}
function mapsLinkHTML(coords, texto){
  if (!coords) return '';
  return `<a href="https://www.google.com/maps?q=${esc(coords)}" target="_blank" rel="noopener" style="color:#3b82f6;text-decoration:none;font-weight:600">${esc(texto||coords)}</a>`;
}

/* ==================== TELÉFONOS HTML ==================== */
function telsSegHTML(c, inline=true){
  const tels = [
    c.telefono    && { label:'T1',  val:c.telefono },
    c.telefono2   && { label:'T2',  val:c.telefono2 },
    c.telefono3   && { label:'T3',  val:c.telefono3 },
    c.telefonoRef && { label:'Ref', val:c.telefonoRef }
  ].filter(Boolean);
  if (!tels.length) return '';
  const ctx = { nombre: c.nombre, tipoTrabajo: c.tipoTrabajo };
  if (inline){
    return `<div class="linea">📞 ${tels.map(t =>
      `<span class="tel-link" style="cursor:pointer" onclick="copyText('${esc(t.val)}')">${esc(t.val)}</span>` +
      `<span class="hint" style="margin-left:3px">${t.label}</span>` +
      waIconHTML(t.val, ctx) + tcxIconHTML(t.val)
    ).join(' · ')}</div>`;
  }
  return tels.map(t =>
    `<div class="info-line"><b>📞 ${t.label}:</b> ` +
    `<span class="tel-link-modal" style="cursor:pointer" onclick="copyText('${esc(t.val)}')">${esc(t.val)}</span>` +
    waIconHTML(t.val, ctx) + tcxIconHTML(t.val) +
    `</div>`
  ).join('');
}
function telsEqHTML(c, inline=true){
  const raw = [c.telefono, c.celulares].filter(Boolean).join('/').split(/[\/,;]+/).map(x => x.trim()).filter(Boolean);
  const tels = [...new Set(raw)];
  if (!tels.length) return '';
  const ctx = { nombre: c.cliente, tipoTrabajo: c.tipoOrden };
  if (inline){
    return `<div class="linea">📞 ${tels.map(t =>
      `<span class="tel-link" style="cursor:pointer" onclick="copyText('${esc(t)}')">${esc(t)}</span>` +
      waIconHTML(t, ctx) + tcxIconHTML(t)
    ).join(' · ')}</div>`;
  }
  return tels.map(t =>
    `<div class="info-line"><b>📞</b> ` +
    `<span class="tel-link-modal" style="cursor:pointer" onclick="copyText('${esc(t)}')">${esc(t)}</span>` +
    waIconHTML(t, ctx) + tcxIconHTML(t) +
    `</div>`
  ).join('');
}

/* ==================== FILTROS SEGUIMIENTO ==================== */
function labelSeg(k, v){ return k === 'estados' ? (ESTADOS[v]||v) : v; }
function getOptionsSeg(key){
  const cs = stateSeg.casos, f = stateSeg.filtros;
  const uniq = arr => uniqNormalizado(arr);
  switch(key){
    case 'cuadrillas':     return uniq(cs.map(c => c.cuadrilla));
    case 'estados':        return Object.keys(ESTADOS);
    case 'estadosOrigen':  return uniq(cs.map(c => c.estadoOrigen));
    case 'empresas':       return uniq(cs.map(c => c.empresa));
    case 'contratistas':   return uniq(cs.map(c => c.contratista));
    case 'trabajos':       return uniq(cs.map(c => c.tipoTrabajo));
    case 'progs':          return uniq(cs.map(c => c.tipoProg));
    case 'departamentos':  return uniq(cs.map(c => c.departamento));
    case 'provincias': {
      const dep = f.departamentos;
      return uniq(cs.filter(c => !dep.length || dep.some(v => norm(v) === norm(c.departamento))).map(c => c.provincia));
    }
    case 'distritos': {
      const dep = f.departamentos, prov = f.provincias;
      return uniq(cs.filter(c =>
        (!dep.length || dep.some(v => norm(v) === norm(c.departamento))) &&
        (!prov.length || prov.some(v => norm(v) === norm(c.provincia)))
      ).map(c => c.distrito));
    }
  }
  return [];
}
function limpiarFiltrosSeg(){
  const f = stateSeg.filtros;
  if (f.departamentos.length){
    const pv = new Set(stateSeg.casos.filter(c => f.departamentos.some(v => norm(v) === norm(c.departamento))).map(c => norm(c.provincia)));
    f.provincias = f.provincias.filter(p => pv.has(norm(p)));
  }
  const depOk  = c => !f.departamentos.length || f.departamentos.some(v => norm(v) === norm(c.departamento));
  const provOk = c => !f.provincias.length    || f.provincias.some(v => norm(v) === norm(c.provincia));
  const dv = new Set(stateSeg.casos.filter(c => depOk(c) && provOk(c)).map(c => norm(c.distrito)));
  f.distritos = f.distritos.filter(d => dv.has(norm(d)));
}
function applyFiltersSeg(lista, opts={}){
  const f = stateSeg.filtros;
  const q = norm(opts.buscar !== undefined ? opts.buscar : f.buscar);
  return lista.filter(c => {
    if (f.cuadrillas.length    && !f.cuadrillas.some(v => norm(v) === norm(c.cuadrilla)))     return false;
    if (f.estados.length       && !f.estados.includes(c.estado))                              return false;
    if (f.estadosOrigen.length && !f.estadosOrigen.some(v => norm(v) === norm(c.estadoOrigen))) return false;
    if (f.empresas.length      && !f.empresas.some(v => norm(v) === norm(c.empresa)))         return false;
   if (f.contratistas.length  && !f.contratistas.some(v => norm(v) === norm(c.contratista))) return false;
    if (f.trabajos.length      && !f.trabajos.some(v => norm(v) === norm(c.tipoTrabajo)))     return false;
    if (f.progs.length         && !f.progs.some(v => norm(v) === norm(c.tipoProg)))           return false;
    if (f.departamentos.length && !f.departamentos.some(v => norm(v) === norm(c.departamento))) return false;
    if (f.provincias.length    && !f.provincias.some(v => norm(v) === norm(c.provincia)))     return false;
    if (f.distritos.length     && !f.distritos.some(v => norm(v) === norm(c.distrito)))       return false;
    if (opts.soloNuevas && !c.esNueva) return false;
    if (q){
      const blob = norm([c.id_interno, c.os, c.osSig, c.nroTac, c.codVenta, c.nombre, c.telefono, c.telefono2,
                        c.telefono3, c.telefonoRef, c.dni, c.direccion, c.distrito, c.cuadrilla].join(' '));
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

/* ==================== FILTROS DISPONIBILIDAD ==================== */
function getOptionsDisp(key){
  const cs = stateDisp.casos, f = stateDisp.filtros;
  const uniq = arr => uniqNormalizado(arr);
  switch(key){
    case 'cuadrillas':    return uniq(cs.map(c => c.cuadrilla));
    case 'estadosOrigen': return uniq(cs.map(c => c.estadoOrigen));
    case 'empresas':      return uniq(cs.map(c => c.empresa));
    case 'contratistas':  return uniq(cs.map(c => c.contratista));
    case 'trabajos':      return uniq(cs.map(c => c.tipoTrabajo));
    case 'progs':         return uniq(cs.map(c => c.tipoProg));
    case 'departamentos': return uniq(cs.map(c => c.departamento));
    case 'provincias': {
      const dep = f.departamentos;
      return uniq(cs.filter(c => !dep.length || dep.some(v => norm(v) === norm(c.departamento))).map(c => c.provincia));
    }
    case 'distritos': {
      const dep = f.departamentos, prov = f.provincias;
      return uniq(cs.filter(c =>
        (!dep.length || dep.some(v => norm(v) === norm(c.departamento))) &&
        (!prov.length || prov.some(v => norm(v) === norm(c.provincia)))
      ).map(c => c.distrito));
    }
  }
  return [];
}
function limpiarFiltrosDisp(){
  const f = stateDisp.filtros;
  if (f.departamentos.length){
    const pv = new Set(stateDisp.casos.filter(c => f.departamentos.some(v => norm(v) === norm(c.departamento))).map(c => norm(c.provincia)));
    f.provincias = f.provincias.filter(p => pv.has(norm(p)));
  }
  const depOk  = c => !f.departamentos.length || f.departamentos.some(v => norm(v) === norm(c.departamento));
  const provOk = c => !f.provincias.length    || f.provincias.some(v => norm(v) === norm(c.provincia));
  const dv = new Set(stateDisp.casos.filter(c => depOk(c) && provOk(c)).map(c => norm(c.distrito)));
  f.distritos = f.distritos.filter(d => dv.has(norm(d)));
}
function applyFiltersDisp(lista, opts={}){
  const f = stateDisp.filtros;
  const q = norm(opts.buscar !== undefined ? opts.buscar : f.buscar);
  return lista.filter(c => {
    if (f.cuadrillas.length    && !f.cuadrillas.some(v => norm(v) === norm(c.cuadrilla)))       return false;
    if (f.estadosOrigen.length && !f.estadosOrigen.some(v => norm(v) === norm(c.estadoOrigen))) return false;
    if (f.empresas.length      && !f.empresas.some(v => norm(v) === norm(c.empresa)))           return false;
    if (f.contratistas.length  && !f.contratistas.some(v => norm(v) === norm(c.contratista)))     return false;
    if (f.trabajos.length      && !f.trabajos.some(v => norm(v) === norm(c.tipoTrabajo)))       return false;
    if (f.progs.length         && !f.progs.some(v => norm(v) === norm(c.tipoProg)))             return false;
    if (f.departamentos.length && !f.departamentos.some(v => norm(v) === norm(c.departamento))) return false;
    if (f.provincias.length    && !f.provincias.some(v => norm(v) === norm(c.provincia)))       return false;
    if (f.distritos.length     && !f.distritos.some(v => norm(v) === norm(c.distrito)))         return false;
    if (q){
      const blob = norm([c.id_interno, c.os, c.osSig, c.nroTac, c.codVenta, c.nombre, c.telefono, c.telefono2,
                        c.telefono3, c.telefonoRef, c.dni, c.direccion, c.distrito, c.cuadrilla].join(' '));
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

/* ==================== FILTROS EQUIPOS Y PLANES ==================== */
function getOptionsEq(key){
  const cs = stateEq.casos, f = stateEq.filtros;
  const uniq = arr => uniqNormalizado(arr);
  switch(key){
    case 'tipoOrden':     return uniq(cs.map(c => c.tipoOrden));
    case 'estadoOs':      return uniq(cs.map(c => c.estadoOs));
    case 'detalle':       return uniq(cs.map(c => c.detalle));
    case 'tecnicos':      return uniq(cs.map(c => c.tecnico));
    case 'contratistas':  return uniq(cs.map(c => c.contratista));
    case 'departamentos': return uniq(cs.map(c => c.departamento));
    case 'provincias': {
      const dep = f.departamentos;
      return uniq(cs.filter(c => !dep.length || dep.some(v => norm(v) === norm(c.departamento))).map(c => c.provincia));
    }
    case 'distritos': {
      const dep = f.departamentos, prov = f.provincias;
      return uniq(cs.filter(c =>
        (!dep.length || dep.some(v => norm(v) === norm(c.departamento))) &&
        (!prov.length || prov.some(v => norm(v) === norm(c.provincia)))
      ).map(c => c.distrito));
    }
    case 'deteccion': return ['wifi6_req','mesh_req','revisar_tec','equipo_ok','estandar'];
  }
  return [];
}
function limpiarFiltrosEq(){
  const f = stateEq.filtros;
  if (f.departamentos.length){
    const pv = new Set(stateEq.casos.filter(c => f.departamentos.some(v => norm(v) === norm(c.departamento))).map(c => norm(c.provincia)));
    f.provincias = f.provincias.filter(p => pv.has(norm(p)));
  }
  const depOk  = c => !f.departamentos.length || f.departamentos.some(v => norm(v) === norm(c.departamento));
  const provOk = c => !f.provincias.length    || f.provincias.some(v => norm(v) === norm(c.provincia));
  const dv = new Set(stateEq.casos.filter(c => depOk(c) && provOk(c)).map(c => norm(c.distrito)));
  f.distritos = f.distritos.filter(d => dv.has(norm(d)));
}
function applyFiltersEq(lista){
  const f = stateEq.filtros;
  const q = norm(f.buscar);
  return lista.filter(c => {
    if (f.tipoOrden.length     && !f.tipoOrden.some(v => norm(v) === norm(c.tipoOrden)))       return false;
    if (f.estadoOs.length      && !f.estadoOs.some(v => norm(v) === norm(c.estadoOs)))         return false;
    if (f.detalle.length       && !f.detalle.some(v => norm(v) === norm(c.detalle)))           return false;
    if (f.tecnicos.length      && !f.tecnicos.some(v => norm(v) === norm(c.tecnico)))          return false;
    if (f.departamentos.length && !f.departamentos.some(v => norm(v) === norm(c.departamento))) return false;
    if (f.provincias.length    && !f.provincias.some(v => norm(v) === norm(c.provincia)))       return false;
    if (f.distritos.length     && !f.distritos.some(v => norm(v) === norm(c.distrito)))         return false;
    if (f.deteccion.length     && !f.deteccion.includes(c.deteccion))                           return false;
    if (q){
      const blob = norm([c.id_servicio, c.nro_os, c.abonado, c.idos, c.cliente, c.dni, c.telefono, c.celulares,
                        c.direccion, c.distrito, c.tecnico, c.tarifaServicio, c.detalle].join(' '));
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

/* ==================== FILTROS CARGA ==================== */
function getOptionsCarga(key){
  const cs = stateSeg.casos;
  const uniq = arr => uniqNormalizado(arr);
  switch(key){
    case 'empresas':  return uniq(cs.map(c => c.empresa));
    case 'contratistas':   return uniq(cs.map(c => c.contratista));
    case 'trabajos':  return uniq(cs.map(c => c.tipoTrabajo));
    case 'cuadrillas':return uniq(cs.map(c => c.cuadrilla));
    case 'departamentos': return uniq(cs.map(c => c.departamento));
    case 'provincias': {
      const dep = cargaFiltros.departamentos;
      return uniq(cs.filter(c => !dep.length || dep.some(v => norm(v) === norm(c.departamento))).map(c => c.provincia));
    }
    case 'distritos': {
      const dep = cargaFiltros.departamentos, prov = cargaFiltros.provincias;
      return uniq(cs.filter(c =>
        (!dep.length || dep.some(v => norm(v) === norm(c.departamento))) &&
        (!prov.length || prov.some(v => norm(v) === norm(c.provincia)))
      ).map(c => c.distrito));
    }
  }
  return [];
}
function limpiarFiltrosCarga(){
  const f = cargaFiltros;
  if (f.departamentos.length){
    const pv = new Set(stateSeg.casos.filter(c => f.departamentos.some(v => norm(v) === norm(c.departamento))).map(c => norm(c.provincia)));
    f.provincias = f.provincias.filter(p => pv.has(norm(p)));
  }
  const depOk  = c => !f.departamentos.length || f.departamentos.some(v => norm(v) === norm(c.departamento));
  const provOk = c => !f.provincias.length    || f.provincias.some(v => norm(v) === norm(c.provincia));
  const dv = new Set(stateSeg.casos.filter(c => depOk(c) && provOk(c)).map(c => norm(c.distrito)));
  f.distritos = f.distritos.filter(d => dv.has(norm(d)));
}
function applyFiltrosCarga(lista){
  return lista.filter(c => {
    if (cargaFiltros.fecha && c.fecha !== cargaFiltros.fecha) return false;
    if (cargaFiltros.empresas.length      && !cargaFiltros.empresas.some(v => norm(v) === norm(c.empresa)))         return false;
    if (cargaFiltros.contratistas.length  && !cargaFiltros.contratistas.some(v => norm(v) === norm(c.contratista))) return false;
    if (cargaFiltros.trabajos.length      && !cargaFiltros.trabajos.some(v => norm(v) === norm(c.tipoTrabajo)))     return false;
    if (cargaFiltros.cuadrillas.length    && !cargaFiltros.cuadrillas.some(v => norm(v) === norm(c.cuadrilla)))     return false;
    if (cargaFiltros.departamentos.length && !cargaFiltros.departamentos.some(v => norm(v) === norm(c.departamento))) return false;
    if (cargaFiltros.provincias.length    && !cargaFiltros.provincias.some(v => norm(v) === norm(c.provincia)))     return false;
    if (cargaFiltros.distritos.length     && !cargaFiltros.distritos.some(v => norm(v) === norm(c.distrito)))       return false;
    if (cargaFiltros.buscar && !norm(c.cuadrilla||'').includes(norm(cargaFiltros.buscar))) return false;
    return true;
  });
}

/* ==================== FILTROS KPI ==================== */
function getOptionsKpi(key){
  const cs = stateSeg.casos;
  const uniq = arr => uniqNormalizado(arr);
  switch(key){
    case 'empresas':   return uniq(cs.map(c => c.empresa));
    case 'contratistas': return uniq(cs.map(c => c.contratista));
    case 'cuadrillas': return uniq(cs.map(c => c.cuadrilla));
    case 'trabajos':   return uniq(cs.map(c => c.tipoTrabajo));
    case 'departamentos': return uniq(cs.map(c => c.departamento));
    case 'provincias': {
      const dep = kpiFiltros.departamentos;
      return uniq(cs.filter(c => !dep.length || dep.some(v => norm(v) === norm(c.departamento))).map(c => c.provincia));
    }
    case 'distritos': {
      const dep = kpiFiltros.departamentos, prov = kpiFiltros.provincias;
      return uniq(cs.filter(c =>
        (!dep.length || dep.some(v => norm(v) === norm(c.departamento))) &&
        (!prov.length || prov.some(v => norm(v) === norm(c.provincia)))
      ).map(c => c.distrito));
    }
  }
  return [];
}
function limpiarFiltrosKpi(){
  const f = kpiFiltros;
  if (f.departamentos.length){
    const pv = new Set(stateSeg.casos.filter(c => f.departamentos.some(v => norm(v) === norm(c.departamento))).map(c => norm(c.provincia)));
    f.provincias = f.provincias.filter(p => pv.has(norm(p)));
  }
  const depOk  = c => !f.departamentos.length || f.departamentos.some(v => norm(v) === norm(c.departamento));
  const provOk = c => !f.provincias.length    || f.provincias.some(v => norm(v) === norm(c.provincia));
  const dv = new Set(stateSeg.casos.filter(c => depOk(c) && provOk(c)).map(c => norm(c.distrito)));
  f.distritos = f.distritos.filter(d => dv.has(norm(d)));
}
/* ==================== FILTROS ADICIONALES ==================== */
function getOptionsAdic(key){
  const cs = stateSeg.casos.filter(c => c.esAdicional);
  const uniq = arr => uniqNormalizado(arr);
  switch(key){
    case 'empresas':       return uniq(cs.map(c => c.empresa));
    case 'contratistas':   return uniq(cs.map(c => c.contratista));
    case 'cuadrillas':     return uniq(cs.map(c => c.cuadrilla));
    case 'trabajos':       return uniq(cs.map(c => c.tipoTrabajo));
    case 'estadosOrigen':  return uniq(cs.map(c => c.estadoOrigen));
    case 'distritos':      return uniq(cs.map(c => c.distrito));
  }
  return [];
}
function limpiarFiltrosAdic(){
  // Los filtros de Adicionales son independientes: no se limpian al aplicar.
  // Limpiar todo solo ocurre al presionar el botón "Limpiar".
}
function applyFiltrosAdic(lista){
  const f = adicFiltros;
  const q = norm(f.buscar || '');
  return lista.filter(c => {
    if (f.empresas.length      && !f.empresas.some(v => norm(v) === norm(c.empresa)))         return false;
        if (f.contratistas.length  && !f.contratistas.some(v => norm(v) === norm(c.contratista))) return false;
    if (f.cuadrillas.length    && !f.cuadrillas.some(v => norm(v) === norm(c.cuadrilla)))     return false;
    if (f.trabajos.length      && !f.trabajos.some(v => norm(v) === norm(c.tipoTrabajo)))     return false;
    if (f.estadosOrigen.length && !f.estadosOrigen.some(v => norm(v) === norm(c.estadoOrigen))) return false;
    if (f.distritos.length     && !f.distritos.some(v => norm(v) === norm(c.distrito)))       return false;
    if (q){
      const blob = norm([c.id_interno, c.os, c.nroTac, c.codVenta, c.nombre, c.telefono, c.telefono2,
                        c.telefono3, c.telefonoRef, c.dni, c.direccion, c.distrito, c.cuadrilla].join(' '));
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}
function applyFiltrosKpi(lista){
  return lista.filter(c => {
    if (kpiFiltros.empresas.length      && !kpiFiltros.empresas.some(v => norm(v) === norm(c.empresa)))         return false;
    if (kpiFiltros.cuadrillas.length    && !kpiFiltros.cuadrillas.some(v => norm(v) === norm(c.cuadrilla)))     return false;
    if (kpiFiltros.trabajos.length      && !kpiFiltros.trabajos.some(v => norm(v) === norm(c.tipoTrabajo)))     return false;
    if (kpiFiltros.departamentos.length && !kpiFiltros.departamentos.some(v => norm(v) === norm(c.departamento))) return false;
    if (kpiFiltros.provincias.length    && !kpiFiltros.provincias.some(v => norm(v) === norm(c.provincia)))     return false;
    if (kpiFiltros.distritos.length     && !kpiFiltros.distritos.some(v => norm(v) === norm(c.distrito)))       return false;
    if (kpiFiltros.contratistas.length  && !kpiFiltros.contratistas.some(v => norm(v) === norm(c.contratista))) return false;
    return true;
  });
}

/* ==================== RENDER BOTONES FILTROS ==================== */
function renderFilterBtnsGroup(scope, filtros, labelFn){
  $$(`[data-scope="${scope}"]`).forEach(btn => {
    const key = btn.dataset.filter || btn.dataset.eqfilter;
    const name = btn.dataset.label;
    const values = filtros[key] || [];
    if (!values.length){
      btn.classList.remove('active');
      btn.innerHTML = `<span class="name">${name}</span><span class="arr">▾</span>`;
    } else if (values.length === 1){
      btn.classList.add('active');
      btn.innerHTML = `<span class="name">${name}:</span> <b>${esc(labelFn(key, values[0]))}</b><span class="arr">▾</span>`;
    } else {
      btn.classList.add('active');
      btn.innerHTML = `<span class="name">${name}</span> <span class="count">${values.length}</span><span class="arr">▾</span>`;
    }
  });
}
function renderFiltroBtnsSeg(){ renderFilterBtnsGroup('seg', stateSeg.filtros, labelSeg); }
function renderFiltroBtnsDisp(){ renderFilterBtnsGroup('disp', stateDisp.filtros, (k,v) => v); }
function renderFiltroBtnsCarga(){ renderFilterBtnsGroup('carga', cargaFiltros, (k,v) => v); }
function renderFiltroBtnsKpi(){ renderFilterBtnsGroup('kpi', kpiFiltros, (k,v) => v); }
function renderFiltroBtnsAdic(){ renderFilterBtnsGroup('adic', adicFiltros, (k,v) => v); }
function renderFiltroBtnsEq(){
  $$('[data-scope="eq"]').forEach(btn => {
    const key = btn.dataset.eqfilter;
    const name = btn.dataset.label;
    const values = stateEq.filtros[key] || [];
    if (!values.length){
      btn.classList.remove('active');
      btn.innerHTML = `<span class="name">${name}</span><span class="arr">▾</span>`;
    } else if (values.length === 1){
      btn.classList.add('active');
      const lbl = key === 'deteccion' ? deteccionLabel(values[0]) : values[0];
      btn.innerHTML = `<span class="name">${name}:</span> <b>${esc(lbl)}</b><span class="arr">▾</span>`;
    } else {
      btn.classList.add('active');
      btn.innerHTML = `<span class="name">${name}</span> <span class="count">${values.length}</span><span class="arr">▾</span>`;
    }
  });
}
/* ==================== PICKER (multiselección) ==================== */
function openPicker(scope, key){
  let options, selected, labelFn, title, getFilters, setFilters, limpiarFn, renderFn;

  if (scope === 'seg'){
    options = getOptionsSeg(key); selected = new Set(stateSeg.filtros[key] || []);
    labelFn = v => labelSeg(key, v);
    title = $$(`[data-scope="seg"][data-filter="${key}"]`)[0]?.dataset.label || key;
    getFilters = () => stateSeg.filtros; setFilters = v => { stateSeg.filtros[key] = v; };
    limpiarFn = () => { limpiarFiltrosSeg(); saveSeg(); };
    renderFn  = () => { renderFiltroBtnsSeg(); renderCasos(); renderConf(); renderCarga(); renderReporte(); };
  } else if (scope === 'disp'){
    options = getOptionsDisp(key); selected = new Set(stateDisp.filtros[key] || []);
    labelFn = v => v;
    title = $$(`[data-scope="disp"][data-filter="${key}"]`)[0]?.dataset.label || key;
    getFilters = () => stateDisp.filtros; setFilters = v => { stateDisp.filtros[key] = v; };
    limpiarFn = () => { limpiarFiltrosDisp(); saveDisp(); };
    renderFn  = () => { renderFiltroBtnsDisp(); renderDisp(); renderDReporte(); };
  } else if (scope === 'carga'){
    options = getOptionsCarga(key); selected = new Set(cargaFiltros[key] || []);
    labelFn = v => v;
    title = $$(`[data-scope="carga"][data-filter="${key}"]`)[0]?.dataset.label || key;
    getFilters = () => cargaFiltros; setFilters = v => { cargaFiltros[key] = v; };
    limpiarFn = () => limpiarFiltrosCarga();
    renderFn  = () => { renderFiltroBtnsCarga(); renderCarga(); };
  } else if (scope === 'kpi'){
  options = getOptionsKpi(key); selected = new Set(kpiFiltros[key] || []);
  labelFn = v => v;
  title = $$(`[data-scope="kpi"][data-filter="${key}"]`)[0]?.dataset.label || key;
  getFilters = () => kpiFiltros; setFilters = v => { kpiFiltros[key] = v; };
  limpiarFn = () => limpiarFiltrosKpi();
  renderFn  = () => { renderFiltroBtnsKpi(); renderKpis(); };
} else if (scope === 'adic'){
  options = getOptionsAdic(key); selected = new Set(adicFiltros[key] || []);
  labelFn = v => v;
  title = $$(`[data-scope="adic"][data-filter="${key}"]`)[0]?.dataset.label || key;
  getFilters = () => adicFiltros; setFilters = v => { adicFiltros[key] = v; };
  limpiarFn = () => limpiarFiltrosAdic();
  renderFn  = () => { renderFiltroBtnsAdic(); renderAdicionales(); };
} else if (scope === 'alert'){
  options = getOptionsAlert(key); selected = new Set(alertFiltros[key] || []);
  labelFn = v => v;
  title = $$(`[data-scope="alert"][data-filter="${key}"]`)[0]?.dataset.label || key;
  getFilters = () => alertFiltros; setFilters = v => { alertFiltros[key] = v; };
  limpiarFn = () => saveAlertFiltros();
  renderFn  = () => { saveAlertFiltros(); renderFiltroBtnsAlert(); renderAlertas(); };
} else if (scope === 'notif'){
  options = getOptionsNotif(key); selected = new Set(notifFiltros[key] || []);
  labelFn = v => v;
  title = $$(`[data-scope="notif"][data-filter="${key}"]`)[0]?.dataset.label || key;
  getFilters = () => notifFiltros; setFilters = v => { notifFiltros[key] = v; };
  limpiarFn = () => saveNotifFiltros();
  renderFn  = () => { saveNotifFiltros(); renderFiltroBtnsNotif(); };
} else {
    options = getOptionsEq(key); selected = new Set(stateEq.filtros[key] || []);
    labelFn = v => key === 'deteccion' ? deteccionLabel(v) : v;
    title = $$(`[data-scope="eq"][data-eqfilter="${key}"]`)[0]?.dataset.label || key;
    getFilters = () => stateEq.filtros; setFilters = v => { stateEq.filtros[key] = v; };
    limpiarFn = () => { limpiarFiltrosEq(); saveEq(); };
    renderFn  = () => { renderFiltroBtnsEq(); renderEqAnalisis(); renderEqReporte(); };
  }

  $('#picker').innerHTML = `
    <div class="mhead">
      <h2>Filtrar: ${esc(title)}</h2>
      <button class="btn sm" id="pkClose">✕</button>
    </div>
    <div class="hint" style="margin-bottom:8px">${options.length} opción(es) disponibles</div>
    <input id="pkSearch" placeholder="Buscar dentro de las opciones...">
    <label class="pk-all"><input type="checkbox" id="pkAll"> Seleccionar todo</label>
    <div class="pk-list" id="pkList"></div>
    <div class="row" style="margin-top:12px">
      <button class="btn" id="pkClear" style="flex:1">Limpiar</button>
      <button class="btn primary" id="pkApply" style="flex:1">Aplicar</button>
    </div>
  `;
  $('#pickerBg').classList.add('open');

  const updateAllState = () => {
    const boxes = [...$('#pkList').querySelectorAll('input[type=checkbox]')];
    $('#pkAll').checked = boxes.length > 0 && boxes.every(b => b.checked);
  };

  const renderList = (q='') => {
    const qq = norm(q);
    const filtered = options.filter(o => !qq || norm(labelFn(o)).includes(qq));
    $('#pkList').innerHTML = filtered.length
      ? filtered.map(o => `
          <label class="pk-item">
            <input type="checkbox" value="${esc(o)}" ${selected.has(o)?'checked':''}>
            <span>${esc(labelFn(o))}</span>
          </label>
        `).join('')
      : '<div class="hint" style="padding:16px;text-align:center">Sin coincidencias</div>';
    $('#pkList').querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.onchange = () => {
        if (cb.checked) selected.add(cb.value);
        else selected.delete(cb.value);
        updateAllState();
      };
    });
    updateAllState();
  };
  renderList();

  $('#pkSearch').oninput = e => renderList(e.target.value);
  $('#pkAll').onchange = e => {
    const boxes = [...$('#pkList').querySelectorAll('input[type=checkbox]')];
    boxes.forEach(b => {
      if (e.target.checked) selected.add(b.value);
      else selected.delete(b.value);
      b.checked = e.target.checked;
    });
  };
  $('#pkClear').onclick = () => {
    selected.clear();
    $('#pkList').querySelectorAll('input[type=checkbox]').forEach(b => b.checked = false);
    $('#pkAll').checked = false;
  };
  $('#pkApply').onclick = () => {
    setFilters([...selected]);
    limpiarFn();
    closePicker();
    renderFn();
  };
  $('#pkClose').onclick = closePicker;
}
function closePicker(){ $('#pickerBg').classList.remove('open'); }
$('#pickerBg').onclick = e => { if (e.target.id === 'pickerBg') closePicker(); };

/* ==================== GRÁFICAS ==================== */
function barChartHTML(titulo, datos, color){
  const max = Math.max(1, ...datos.map(d => d[1]));
  return `
    <div class="chart-wrap">
      <h3 class="chart-title">${esc(titulo)}</h3>
      <div class="chart-bars">
        ${datos.length
          ? datos.map(([k,v]) => `
            <div class="chart-row">
              <div class="chart-lbl" title="${esc(k)}">${esc(k)}</div>
              <div class="chart-bar-bg"><div class="chart-bar" style="width:${(v/max*100).toFixed(1)}%;background:${color}"></div></div>
              <div class="chart-val">${v}</div>
            </div>`).join('')
          : '<div class="hint">Sin datos</div>'}
      </div>
    </div>`;
}
function pieChartHTML(titulo, datos){
  const total = datos.reduce((a,d) => a + d[1], 0) || 1;
  const colors = ['#3b82f6','#16a34a','#f59e0b','#dc2626','#7c3aed','#059669','#0ea5e9','#ec4899','#64748b','#eab308'];
  let acc = 0;
  const r = 80, cx = 110, cy = 110, stroke = 40;
  const segments = datos.map((d, i) => {
    const frac = d[1]/total;
    const dash = frac * 2 * Math.PI * r;
    const offset = acc;
    acc += dash;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${colors[i%colors.length]}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${2*Math.PI*r}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
  }).join('');
  return `
    <div class="pie-wrap">
      <h3 class="chart-title">${esc(titulo)}</h3>
      <div class="pie-container">
        <svg class="pie-svg" viewBox="0 0 220 220">
          ${datos.length ? segments : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--hover)" stroke-width="${stroke}"/>`}
        </svg>
        <div class="pie-legend">
          ${datos.length
            ? datos.map(([k,v], i) => `
              <div class="pie-legend-item">
                <div class="pie-legend-color" style="background:${colors[i%colors.length]}"></div>
                <div class="pie-legend-lbl">${esc(k)}</div>
                <div class="pie-legend-val">${v} (${((v/total)*100).toFixed(0)}%)</div>
              </div>`).join('')
            : '<div class="hint">Sin datos</div>'}
        </div>
      </div>
    </div>`;
}
function contadorPor(lista, campo){
  const map = new Map();
  lista.forEach(c => {
    const raw = c[campo] || '(sin dato)', k = norm(raw);
    if (!map.has(k)) map.set(k, { n: 0, vars: new Set() });
    const o = map.get(k); o.n++; o.vars.add(raw);
  });
  return [...map.values()].map(o => [etiquetaCanon([...o.vars]), o.n]).sort((a, b) => b[1] - a[1]);
}

/* ==================== KPIs (tiempos de resolución) ==================== */
function estadoEsFinal(e){
  const n = norm(e);
  return n === 'solucionado' || n === 'instalado';
}
function calcularTiemposKpi(lista){
  const buckets = { excelente: [], bueno: [], normal: [], irregular: [] };
  lista.forEach(c => {
    const hist = c.historialEstado || [];
    if (hist.length < 2) return;
    for (let i=1; i<hist.length; i++){
      if (estadoEsFinal(hist[i].estado) && !estadoEsFinal(hist[i-1].estado)){
        const t1 = new Date(hist[i-1].fecha);
        const t2 = new Date(hist[i].fecha);
        const min = (t2 - t1) / 60000;
        if (isNaN(min) || min < 0) continue;
        if (min <= 30) buckets.excelente.push(min);
        else if (min <= 50) buckets.bueno.push(min);
        else if (min <= 60) buckets.normal.push(min);
        else buckets.irregular.push(min);
      }
    }
  });
  return buckets;
}
/* Tiempo desde que el caso pasa a "en proceso" hasta "instalado"/"solucionado", por cuadrilla */
function calcularEnProcesoAFinal(lista){
  const porCuad = new Map();
  lista.forEach(c => {
    let inicio = null;
    (c.historialEstado || []).forEach(h => {
      if (norm(h.estado) === 'en proceso'){ if (!inicio) inicio = h.fecha; }
      else if (estadoEsFinal(h.estado) && inicio){
        const min = (new Date(h.fecha) - new Date(inicio)) / 60000;
        inicio = null;
        if (isNaN(min) || min < 0) return;
        const k = c.cuadrilla || '(sin cuadrilla)';
        if (!porCuad.has(k)) porCuad.set(k, []);
        porCuad.get(k).push(min);
      }
    });
  });
  return [...porCuad.entries()].map(([cuadrilla, t]) => ({
    cuadrilla, n: t.length,
    prom: t.reduce((a,b) => a+b, 0) / t.length,
    min: Math.min(...t), max: Math.max(...t),
    ok60: Math.round(t.filter(x => x <= 60).length * 100 / t.length)
  })).sort((a,b) => a.prom - b.prom);
}
function tiemposEnProcesoHTML(lista){
  const filas = calcularEnProcesoAFinal(lista);
  if (!filas.length) return `<div class="card"><h2>⏱️ En proceso → Instalado / Solucionado</h2>
    <div class="empty">Aún no hay casos que hayan pasado de "en proceso" a instalado o solucionado.</div></div>`;
  const total = filas.reduce((a,f) => a + f.n, 0);
  const promGen = filas.reduce((a,f) => a + f.prom * f.n, 0) / total;
  const color = m => m <= 30 ? '#059669' : m <= 50 ? '#2563eb' : m <= 60 ? '#d97706' : '#dc2626';
  const r = x => Math.round(x);
  const tr = filas.map(f => `<tr>
      <td style="padding:6px 8px">${esc(f.cuadrilla)}</td>
      <td style="padding:6px 8px;text-align:center">${f.n}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:700;color:${color(f.prom)}">${r(f.prom)} min</td>
      <td style="padding:6px 8px;text-align:center">${r(f.min)}</td>
      <td style="padding:6px 8px;text-align:center">${r(f.max)}</td>
      <td style="padding:6px 8px;text-align:center">${f.ok60}%</td></tr>`).join('');
  return `<div class="card">
    <h2>⏱️ En proceso → Instalado / Solucionado</h2>
    <div class="hint" style="margin-bottom:8px">${total} casos resueltos · promedio general <b>${r(promGen)} min</b>. Ordenado de más rápido a más lento.</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="text-align:center;border-bottom:1px solid var(--border,#ddd)">
        <th style="padding:6px 8px;text-align:left">Cuadrilla</th><th>Casos</th><th>Promedio</th><th>Mín</th><th>Máx</th><th>≤60 min</th>
      </tr></thead><tbody>${tr}</tbody></table></div>
  </div>` + barChartHTML('Tiempo promedio por cuadrilla (min)', filas.slice(0, 15).map(f => [f.cuadrilla, r(f.prom)]), '#0ea5e9');
}

function renderKpis(){
  const lista = applyFiltrosKpi(stateSeg.casos);
  const countEl = $('#kpiCount');
  if (countEl) countEl.textContent = `${lista.length} casos`;

  const buckets = calcularTiemposKpi(lista);
  const cardHTML = (label, arr, cls) => `
    <div class="tiempo-card ${cls}">
      <div class="tv">${arr.length}</div>
      <div class="tk">${label}</div>
      <div class="hint" style="margin-top:4px">
        ${arr.length ? `Prom. ${Math.round(arr.reduce((a,b)=>a+b,0)/arr.length)} min` : '—'}
      </div>
    </div>`;
  const tiempos = $('#kpiTiempos');
  if (tiempos){
    tiempos.innerHTML =
      cardHTML('🟢 Excelente (≤30 min)', buckets.excelente, 'excelente') +
      cardHTML('🔵 Bueno (≤50 min)',     buckets.bueno,     'bueno') +
      cardHTML('🟡 Normal (≤60 min)',    buckets.normal,    'normal') +
      cardHTML('🔴 Irregular (>60 min)', buckets.irregular, 'irregular');
  }

  const charts = [
    barChartHTML('Casos por contratista', contadorPor(lista, 'contratista').slice(0, 12), '#3b82f6'),
    barChartHTML('Casos por empresa',     contadorPor(lista, 'empresa').slice(0, 12), '#0ea5e9'),
    barChartHTML('Casos por cuadrilla',          contadorPor(lista, 'cuadrilla').slice(0, 15), '#7c3aed'),
    barChartHTML('Casos por distrito',           contadorPor(lista, 'distrito').slice(0, 15), '#f59e0b'),
    barChartHTML('Casos por tipo de trabajo',    contadorPor(lista, 'tipoTrabajo').slice(0, 10), '#059669')
  ];
  const torta = pieChartHTML(
    'Estados del caso',
    contadorPor(lista, 'estadoOrigen').filter(([k]) => k && k !== '(sin dato)').slice(0, 10)
  );
  const cont = $('#kpiCharts');
  if (cont) cont.innerHTML = tiemposEnProcesoHTML(lista) + charts.join('') + torta;
}

/* ==================== RENDER IMPORT INFO ==================== */
function renderImportInfoSeg(){
  const el = $('#importInfo'); if (!el) return;
  if (!stateSeg.casos.length){ el.textContent = 'No hay datos cargados todavía.'; return; }
  const nuevas = stateSeg.casos.filter(c => c.esNueva).length;
  const adics  = stateSeg.casos.filter(c => c.esAdicional).length;
  el.innerHTML = `Total: <b>${stateSeg.casos.length}</b> casos` +
    `${nuevas ? ` · <b>${nuevas}</b> nuevas 🆕` : ''}` +
    `${adics  ? ` · <b>${adics}</b> adicionales 📌` : ''}.`;

  const h = stateSeg.historial.map(x => `
    <div class="nota">
      <b>${esc(x.archivo)}</b> — ${x.total} filas
      <div class="fecha">${new Date(x.fecha).toLocaleString()} · <b>+${x.nuevos} nuevas</b> · ${x.actualizados} actualizadas${x.adicionalesNuevos ? ' · 📌 ' + x.adicionalesNuevos + ' adic.' : ''}</div>
    </div>`).join('');
  const hist = $('#historial');
  if (hist) hist.innerHTML = h || '<div class="hint">Sin importaciones aún.</div>';
}
function renderImportInfoDisp(){
  const el = $('#importInfoDisp'); if (!el) return;
  if (!stateDisp.casos.length){ el.textContent = 'No hay datos cargados todavía.'; return; }
  el.innerHTML = `Total: <b>${stateDisp.casos.length}</b> casos cargados.`;
  const h = stateDisp.historial.map(x => `
    <div class="nota">
      <b>${esc(x.archivo)}</b> — ${x.total} filas
      <div class="fecha">${new Date(x.fecha).toLocaleString()}</div>
    </div>`).join('');
  const hist = $('#historialDisp');
  if (hist) hist.innerHTML = h || '<div class="hint">Sin importaciones aún.</div>';
}
function renderImportInfoEq(){
  const el = $('#importInfoEq'); if (!el) return;
  if (!stateEq.casos.length){ el.textContent = 'No hay datos cargados todavía.'; return; }
  const w6 = stateEq.casos.filter(c => c.deteccion === 'wifi6_req').length;
  const ms = stateEq.casos.filter(c => c.deteccion === 'mesh_req').length;
  const rt = stateEq.casos.filter(c => c.deteccion === 'revisar_tec').length;
  el.innerHTML = `Total: <b>${stateEq.casos.length}</b> órdenes · <b>${w6}</b> Wifi6 · <b>${ms}</b> Mesh · <b>${rt}</b> revisar.`;
  const h = stateEq.historial.map(x => `
    <div class="nota">
      <b>${esc(x.archivo)}</b> — ${x.total} filas
      <div class="fecha">${new Date(x.fecha).toLocaleString()}</div>
    </div>`).join('');
  const hist = $('#historialEq');
  if (hist) hist.innerHTML = h || '<div class="hint">Sin importaciones aún.</div>';
}

/* ==================== TARJETA SEGUIMIENTO ==================== */
function tarjetaSeg(c){
  const locArr = [c.direccion, c.distrito, c.provincia].filter(Boolean);
  const idKey  = c.id_interno || c.os;
  const coord  = mapaCoordinacion[idKey];
  return `
    <div class="caso ${c.esAdicional ? 'es-adicional' : (c.esNueva ? 'nueva' : '')}">
      <div class="top">
        <div style="min-width:0">
          <div class="idtag" onclick="copyText('${esc(c.id_interno)}','ID')">ID ${esc(c.id_interno||'—')}</div>
          <div class="nombre">${esc(c.nombre) || '(sin nombre)'}</div>
          <div class="os">
            ${c.os     ? `<span class="clip-btn" onclick="copyText('${esc(c.os)}','OS')">OS ${esc(c.os)}</span> · ` : ''}
            ${c.nroTac ? `<span class="clip-btn" onclick="copyText('${esc(c.nroTac)}','TAC')">TAC ${esc(c.nroTac)}</span> · ` : ''}
            ${c.dni    ? `<span class="clip-btn" onclick="copyText('${esc(c.dni)}','DNI')">DNI ${esc(c.dni)}</span> · ` : ''}
${esc(c.empresa||'')}${c.contratista?' · '+esc(c.contratista):''}          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${c.esAdicional ? `<span class="badge adicional-tag">📌 ADICIONAL</span><br>` : (c.esNueva ? '<span class="badge nueva-tag">🆕 NUEVA</span><br>' : '')}
          ${coord ? `<span class="badge coord-ok">🤝 ${esc(coord.contrata)}</span><br>` : ''}
          ${badgeEstadoSeg(c.estado)}
          ${c.estadoOrigen ? '<br>' + badgeEstadoOrigen(c.estadoOrigen) : ''}
        </div>
      </div>
      <div class="linea"><b>${esc(c.hora||'—')}</b> · ${esc(c.fecha||'')} ${c.cuadrilla ? '· ' + esc(c.cuadrilla) : ''}</div>
      ${telsSegHTML(c, true)}
      ${locArr.length ? `<div class="linea">📍 ${esc(locArr.join(', '))}</div>` : ''}
      ${c.coords ? `<div class="linea">🗺️ ${mapsLinkHTML(c.coords, 'Ver en Google Maps')}</div>` : ''}
      <div class="linea">
        ${badgeTipoTrabajo(c.tipoTrabajo)}
        <span class="badge tipo">${esc(c.tipoProg||'—')}</span>
        ${c.area ? `<span class="badge tipo">${esc(c.area)}</span>` : ''}
      </div>
      <div class="linea">${badgeLlamada(c)} ${c.llamada && c.llamada.observacion ? '<span class="hint">' + esc(c.llamada.observacion) + '</span>' : ''}</div>
      ${(c.seguimiento||[]).length ? `<div class="linea hint">📝 ${c.seguimiento.length} nota(s) · ${esc(ultimaNota(c))}</div>` : ''}
      <div class="acciones"><button class="btn sm primary" data-id="${c._id}">Abrir</button> <button class="btn sm" data-nota="${c._id}">📝 Nota</button></div>
    </div>`;
}

/* ==================== RENDER CASOS ==================== */
function renderCasos(){
  const cont = $('#listaCasos'); if (!cont) return;
  const lista = applyFiltersSeg(stateSeg.casos, { soloNuevas: stateSeg.filtros.soloNuevas })
    .sort((a,b) => ((a.fecha||'')+(a.hora||'')).localeCompare((b.fecha||'')+(b.hora||'')));
  cont.innerHTML = lista.length
    ? lista.map(c => tarjetaSeg(c)).join('')
    : '<div class="card"><div class="empty">No hay casos con estos filtros.<br><span class="hint">Sube un archivo o presiona Sincronizar Zaaz.</span></div></div>';
  const cc = $('#casosCount');
  if (cc) cc.textContent = `${lista.length} / ${stateSeg.casos.length}`;
  cont.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => abrirCaso(b.dataset.id));
}

/* ==================== RENDER CONFORMIDAD ==================== */
function renderConf(){
  const cont = $('#listaConf'); if (!cont) return;
  const hoy = todayStr();
  let lista = applyFiltersSeg(stateSeg.casos, { buscar: confOpts.buscar });
  if (confOpts.modo === 'pendientes')     lista = lista.filter(c => !c.llamada);
  if (confOpts.modo === 'con_resultado')  lista = lista.filter(c => c.llamada);
  if (confOpts.modo === 'hoy')            lista = lista.filter(c => c.llamada && c.llamada.fecha.slice(0,10) === hoy);
  if (confOpts.desde) lista = lista.filter(c => c.hora && c.hora >= confOpts.desde);
  if (confOpts.hasta) lista = lista.filter(c => c.hora && c.hora <= confOpts.hasta);
  lista.sort((a,b) => (a.hora||'99:99').localeCompare(b.hora||'99:99'));

  cont.innerHTML = lista.length
    ? lista.map(c => tarjetaSeg(c)).join('')
    : '<div class="card"><div class="empty">No hay casos con este filtro.</div></div>';
  const cc = $('#confCount');
  if (cc) cc.textContent = `${lista.length} casos`;
  cont.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => abrirCaso(b.dataset.id));
}

/* ==================== RENDER CARGA ==================== */
function pueblaFechaCarga(){
  const sel = $('#cargaFecha'); if (!sel) return;
  const fechas = [...new Set(stateSeg.casos.map(c => c.fecha).filter(Boolean))].sort();
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todas las fechas</option>' +
    fechas.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
  if (fechas.includes(cur)) sel.value = cur;
}
function clasificarHora(n){
  if (n === 0) return 'vacio';
  if (n === 1) return 'uno';
  if (n === 2) return 'dos';
  if (n === 3) return 'tres';
  return 'cuatro';
}
/* Color de cada hora en Carga según el estado del caso (el mismo que se ve en la pestaña Casos) */
function claveEstadoCarga(e){
  const n = norm(e);
  if (/^reprogramad/.test(n)) return 'reprogramado';
  if (/^programad/.test(n))   return 'programado';
  if (/stand/.test(n))        return 'stand_by';
  if (/camino/.test(n))       return 'en_camino';
  if (/proceso/.test(n))      return 'en_proceso';
  if (/^instalad/.test(n))    return 'instalado';
  if (/^solucionad/.test(n))  return 'solucionado';
  return 'otro';
}
const ESTADOS_CARGA_LABEL = {
  stand_by:'Stand by', reprogramado:'Reprogramado', en_proceso:'En proceso', en_camino:'En camino',
  programado:'Programado', instalado:'Instalado', solucionado:'Solucionado', otro:'Otro'
};
// Si una hora tiene órdenes en varios estados, el chip toma el color del que pide más atención
function claveDominanteCarga(claves){
  const prioridad = ['stand_by','reprogramado','en_proceso','en_camino','programado','instalado','solucionado','otro'];
  return prioridad.find(k => claves.includes(k)) || 'otro';
}
function leyendaCargaHTML(){
  const it = [['programado','Programado'],['reprogramado','Reprogramado'],['stand_by','Stand by'],
              ['en_camino','En camino'],['en_proceso','En proceso'],['instalado','Instalado / Solucionado']];
  return `<div class="carga-leyenda">${it.map(([k,t]) => `<span><i class="st-dot st-${k}"></i>${t}</span>`).join('')}</div>`;
}

function renderCarga(){
  const cont = $('#listaCarga'); if (!cont) return;
  pueblaFechaCarga();

  const todosCarga = applyFiltrosCarga(stateSeg.casos);
  const lista = todosCarga.filter(c => !esAlMomento(c));
  const extraAM = seccionAlMomentoHTML(todosCarga.filter(esAlMomento));
  const porCuadrilla = new Map();
  lista.forEach(c => {
    const k = c.cuadrilla || '(sin cuadrilla)';
    if (!porCuadrilla.has(k)) porCuadrilla.set(k, []);
    porCuadrilla.get(k).push(c);
  });

  const rows = [...porCuadrilla.entries()].map(([cuadrilla, casos]) => {
    const porHora = new Map();
    casos.forEach(c => {
      const h = c.hora ? c.hora.slice(0,5) : '';
      if (!h) return;
      if (!porHora.has(h)) porHora.set(h, []);
      porHora.get(h).push(c);
    });
    const horasConCarga = [...porHora.keys()].sort();
    const horas = [...new Set([...HORAS_CARGA, ...porHora.keys()])].sort();
    let estado = 'libre';
    if (horasConCarga.length === 0) estado = 'libre';
    else if (horasConCarga.length <= 2) estado = 'parcial';
    else estado = 'cargada';
    return { cuadrilla, total: casos.length, porHora, estado, horasConCarga, horas };
  }).sort((a,b) => a.cuadrilla.localeCompare(b.cuadrilla));

  if (!rows.length){
    cont.innerHTML = extraAM + '<div class="card"><div class="empty">No hay cuadrillas con estos filtros.<br><span class="hint">Sube una base en la pestaña Cargar.</span></div></div>';
    const cc = $('#cargaCount'); if (cc) cc.textContent = '0 cuadrillas';
    return;
  }

  cont.innerHTML = leyendaCargaHTML() + extraAM + rows.map(r => {
    const chips = r.horas.map(h => {
      const arr = r.porHora.get(h) || [];
      const n = arr.length;
      const claves = arr.map(c => claveEstadoCarga(c.estadoOrigen));
      const cls = n ? 'st-' + claveDominanteCarga(claves) : clasificarHora(n);
      const resumen = [...new Set(claves)].map(k => `${claves.filter(x => x === k).length} ${ESTADOS_CARGA_LABEL[k]}`).join(', ');
      const dots = n > 1 ? `<span class="h-dots">${claves.map(k => `<i class="st-dot st-${k}"></i>`).join('')}</span>` : '';
      const dists = [...new Set(arr.map(c => c.distrito).filter(Boolean))];
      const distsTxt = dists.length
        ? dists.slice(0,3).join(', ') + (dists.length > 3 ? ` +${dists.length-3}` : '')
        : (n > 0 ? '(sin distrito)' : 'Libre');
      return `<span class="hora-chip ${cls}" title="${n ? esc(resumen) : 'Libre'}">
        <span class="h-hora">${h} · ${n}</span>
        <span class="h-dists">${esc(distsTxt)}</span>${dots}
      </span>`;
    }).join('');
    return `
      <div class="carga-row">
        <div class="carga-top">
          <div style="min-width:0">
            <div class="carga-nombre">${esc(r.cuadrilla)}</div>
            <div class="carga-total">${r.total} orden(es) · ${r.horasConCarga.length} hora(s) ocupada(s)</div>
          </div>
          <span class="carga-estado ${r.estado}">${r.estado === 'libre' ? 'LIBRE' : r.estado === 'parcial' ? 'PARCIAL' : 'CARGADA'}</span>
        </div>
        <div class="carga-horas">${chips}</div>
      </div>`;
  }).join('');
  const cc = $('#cargaCount'); if (cc) cc.textContent = `${rows.length} cuadrillas`;
}

/* ==================== RENDER ADICIONALES ==================== */
function renderAdicionales(){
  const cont = $('#listaAdicionales'); if (!cont) return;

  // Sincronizar filtros desde el select
  const sel = $('#filtroAdicCoord');
  if (sel) adicFiltros.coordinacion = sel.value;

  // Base: solo los casos marcados como adicionales
  const adicionales = stateSeg.casos.filter(c => c.esAdicional);

  // Badge del menú
  const badgeMenu = $('#adicionalesBadge');
  if (badgeMenu){
    badgeMenu.textContent = adicionales.length;
    badgeMenu.style.display = adicionales.length ? 'inline-block' : 'none';
  }

  // 1) Filtro por estado de coordinación
  const paso1 = adicionales.filter(c => {
    const idKey = c.id_interno || c.os;
    const coordinado = !!mapaCoordinacion[idKey];
    if (adicFiltros.coordinacion === 'pendientes')  return !coordinado;
    if (adicFiltros.coordinacion === 'coordinados') return coordinado;
    return true;
  });

  // 2) Filtros multi-selección + búsqueda
  const filtrados = applyFiltrosAdic(paso1);

  const countPill = $('#adicCount');
  if (countPill) countPill.textContent = `${filtrados.length} / ${adicionales.length} adicionales`;

  // Refrescar botones de filtro
  renderFiltroBtnsAdic();

  if (!filtrados.length){
    cont.innerHTML = '<div class="card"><div class="empty">No hay casos adicionales con estos filtros.</div></div>';
    return;
  }

  cont.innerHTML = filtrados.map(c => {
    const idKey = c.id_interno || c.os;
    const coord = mapaCoordinacion[idKey];
    const locArr = [c.direccion, c.distrito, c.provincia].filter(Boolean);
    return `
      <div class="caso es-adicional">
        <div class="top">
          <div style="min-width:0">
            <div class="idtag" onclick="copyText('${esc(c.id_interno)}','ID')">ID ${esc(c.id_interno||'—')}</div>
            <div class="nombre">${esc(c.nombre) || '(sin nombre)'}</div>
            <div class="os">
              ${c.os ? `<span class="clip-btn" onclick="copyText('${esc(c.os)}','OS')">OS ${esc(c.os)}</span> · ` : ''}
              ${esc(c.empresa||'')}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <span class="badge adicional-tag">📌 ADICIONAL</span><br>
            <span class="badge ${coord ? 'coord-ok' : 'coord-wait'}" style="margin-top:4px">
              ${coord ? '✅ COORDINADO' : '⏳ SIN ASIGNAR'}
            </span>
          </div>
        </div>
        <div class="linea"><b>${esc(c.hora||'—')}</b> · ${esc(c.fecha||'')} ${c.cuadrilla ? '· ' + esc(c.cuadrilla) : ''}</div>
        ${telsSegHTML(c, true)}
        ${locArr.length ? `<div class="linea">📍 ${esc(locArr.join(', '))}</div>` : ''}
        ${c.estadoOrigen ? `<div class="linea">${badgeEstadoOrigen(c.estadoOrigen)} ${badgeTipoTrabajo(c.tipoTrabajo)}</div>` : ''}
        ${coord ? `<div class="linea" style="color:var(--text-soft);font-weight:600">🤝 Coordinado con: ${esc(coord.contrata)} (${coord.fecha})</div>` : ''}
        <div class="acciones">
          <button class="btn sm ${coord ? '' : 'primary'}" onclick="toggleCoordCaso('${esc(idKey)}')">
            ${coord ? '↩ Cambiar Contrata' : '🤝 Marcar Coordinado'}
          </button>
          <button class="btn sm" onclick="abrirCaso('${c._id}')">Detalles</button>
        </div>
      </div>
    `;
  }).join('');
}
/* ==================== RENDER REPORTE (Seguimiento) ==================== */
function renderReporte(){
  const cs = stateSeg.casos;
  const filtrados = applyFiltersSeg(stateSeg.casos);
  const stat = (k,v) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const stats = $('#stats');
  if (stats){
    stats.innerHTML =
      stat('Total', cs.length) +
      stat('🆕 Última carga', cs.filter(c => c.esNueva).length) +
      stat('📌 Adicionales',  cs.filter(c => c.esAdicional).length) +
      stat('Pend. llamar',    cs.filter(c => !c.llamada).length) +
      stat('Conformes',       cs.filter(c => c.llamada && c.llamada.resultado === 'conforme').length) +
      stat('No contesta',     cs.filter(c => c.llamada && c.llamada.resultado === 'no_contesta').length) +
      stat('No probó',        cs.filter(c => c.llamada && c.llamada.resultado === 'no_probo').length) +
      stat('Observ. manual',  cs.filter(c => c.llamada && c.llamada.resultado === 'manual').length);
  }
  const info = $('#exportInfo');
  if (info) info.textContent = `Se exportarán ${filtrados.length} casos (ID, Resultado, Observación).`;
}
/* ==================== MODAL SEGUIMIENTO ==================== */
function abrirCaso(id){
  const c = stateSeg.casos.find(x => x._id === id);
  if (!c) return;
  const historial = (c.historialEstado||[]).slice().reverse().map(h =>
    `<div class="nota">${esc(h.estado)}<div class="fecha">${new Date(h.fecha).toLocaleString()}</div></div>`
  ).join('');
  const html = `
    <div class="mhead">
      <div>
        <div class="idtag">ID ${esc(c.id_interno||'—')}</div>
        <h2 style="margin-top:6px">${esc(c.nombre)||'(sin nombre)'}</h2>
        <div class="msub">${esc(c.os||'')} ${c.osSig?'· '+esc(c.osSig):''} ${c.nroTac?'· TAC '+esc(c.nroTac):''}</div>
      </div>
      <button class="btn sm" id="mClose">✕</button>
    </div>
    <div style="background:var(--hover);border-radius:10px;padding:12px;margin-bottom:12px">
      ${c.estadoOrigen ? `<div class="info-line"><b>🔄 Estado caso:</b> ${badgeEstadoOrigen(c.estadoOrigen)}</div>` : ''}
      <div class="info-line"><b>📅</b> ${esc(c.fecha)} · <b>${esc(c.hora||'—')}</b> · ${esc(c.tipoTrabajo||'')}</div>
      ${telsSegHTML(c, false) || '<div class="info-line"><b>📞</b> Sin teléfonos registrados</div>'}
      ${c.direccion ? `<div class="info-line"><b>📍</b> ${esc(c.direccion)}${c.distrito?', '+esc(c.distrito):''}${c.provincia?', '+esc(c.provincia):''}${c.departamento?', '+esc(c.departamento):''}</div>` : ''}
      ${c.coords ? `<div class="info-line"><b>🗺️</b> ${mapsLinkHTML(c.coords, 'Ver en Google Maps')}</div>` : ''}
      ${c.cuadrilla ? `<div class="info-line"><b>👷</b> ${esc(c.cuadrilla)} · ${esc(c.empresa||'')}</div>` : ''}
    </div>
    <div>
      <label style="font-size:12px;color:var(--muted);font-weight:600">Estado del caso (interno)</label>
      <select id="mEstado" style="margin-top:4px">
        ${Object.entries(ESTADOS).map(([k,v]) =>
          `<option value="${k}" ${c.estado===k?'selected':''}>${v}</option>`
        ).join('')}
      </select>
    </div>
    <h3>📞 Llamada de conformidad</h3>
    <div class="res-btns">
      ${Object.entries(RESULTADOS).map(([k,v]) =>
        `<button class="btn ${c.llamada&&c.llamada.resultado===k?'primary':''}" data-res="${k}">${v}</button>`
      ).join('')}
    </div>
    <textarea id="mObs" placeholder="Observación (opcional)" style="margin-top:8px;min-height:70px">${esc(c.llamada&&c.llamada.observacion||'')}</textarea>
    <div class="hint">${c.llamada ? 'Registrada: '+new Date(c.llamada.fecha).toLocaleString() : 'Sin registrar'}</div>
    ${historial ? `<h3>📜 Historial de estados</h3>${historial}` : ''}
    <h3>📝 Notas</h3>
    <div id="mNotas">
      ${(c.seguimiento||[]).map(s =>
        `<div class="nota">${esc(s.nota)}<div class="fecha">${new Date(s.fecha).toLocaleString()}</div></div>`
      ).join('') || '<div class="hint">Sin notas</div>'}
    </div>
    <div class="row" style="margin-top:6px">
      <input id="mNota" placeholder="Nueva nota..." style="flex:1;min-width:0">
      <button class="btn" id="mAddNota">Agregar</button>
    </div>
  `;
  $('#modal').innerHTML = html;
  $('#modalBg').classList.add('open');
  $('#mClose').onclick = cerrarModal;
  $('#mEstado').onchange = e => {
    c.estado = e.target.value;
    saveSeg();
    renderCasos(); renderConf(); renderReporte();
  };
  $('#modal').querySelectorAll('button[data-res]').forEach(b => b.onclick = () => {
    const res = b.dataset.res;
    c.llamada = { resultado: res, observacion: ($('#mObs').value||'').trim(), fecha: nowISO() };
    if (res !== 'manual' && c.estado === 'nuevo') c.estado = 'contactado';
    saveSeg();
    abrirCaso(id);
    renderCasos(); renderConf(); renderReporte();
    toast('Resultado guardado');
  });
  $('#mAddNota').onclick = () => {
    const v = ($('#mNota').value||'').trim();
    if (!v) return;
    c.seguimiento = c.seguimiento || [];
    c.seguimiento.push({ nota: v, fecha: nowISO() });
    saveSeg();
    abrirCaso(id);
    renderCasos(); renderConf();
    toast('Nota agregada');
  };
}
function cerrarModal(){ $('#modalBg').classList.remove('open'); }
$('#modalBg').onclick = e => { if (e.target.id === 'modalBg') cerrarModal(); };

/* ==================== MODAL DISPONIBILIDAD ==================== */
function abrirCasoDisp(id){
  const c = stateDisp.casos.find(x => x._id === id);
  if (!c) return;
  const html = `
    <div class="mhead">
      <div>
        <div class="idtag">ID ${esc(c.id_interno||'—')}</div>
        <h2 style="margin-top:6px">${esc(c.nombre)||'(sin nombre)'}</h2>
        <div class="msub">${esc(c.os||'')} ${c.osSig?'· '+esc(c.osSig):''} ${c.nroTac?'· TAC '+esc(c.nroTac):''}</div>
      </div>
      <button class="btn sm" id="mClose">✕</button>
    </div>
    <div style="background:var(--hover);border-radius:10px;padding:12px;margin-bottom:12px">
      ${c.estadoOrigen ? `<div class="info-line"><b>🔄 Estado caso:</b> ${badgeEstadoOrigen(c.estadoOrigen)}</div>` : ''}
      <div class="info-line"><b>📅</b> ${esc(c.fecha)} · <b>${esc(c.hora||'—')}</b> · ${esc(c.tipoTrabajo||'')}</div>
      ${telsSegHTML(c, false) || '<div class="info-line"><b>📞</b> Sin teléfonos registrados</div>'}
      ${c.direccion ? `<div class="info-line"><b>📍</b> ${esc(c.direccion)}${c.distrito?', '+esc(c.distrito):''}${c.provincia?', '+esc(c.provincia):''}${c.departamento?', '+esc(c.departamento):''}</div>` : ''}
      ${c.coords ? `<div class="info-line"><b>🗺️</b> ${mapsLinkHTML(c.coords, 'Ver en Google Maps')}</div>` : ''}
      ${c.cuadrilla ? `<div class="info-line"><b>👷</b> ${esc(c.cuadrilla)} · ${esc(c.empresa||'')}</div>` : ''}
    </div>
    <h3>📞 Disponibilidad</h3>
    <div class="res-btns">
      ${Object.entries(RESULTADOS_DISP).map(([k,v]) =>
        `<button class="btn ${c.disponible&&c.disponible.resultado===k?'primary':''}" data-disp="${k}">${v}</button>`
      ).join('')}
    </div>
    <textarea id="mObsDisp" placeholder="Observación (opcional)" style="margin-top:8px;min-height:70px">${esc(c.disponible&&c.disponible.observacion||'')}</textarea>
    <div class="hint">${c.disponible ? 'Registrada: '+new Date(c.disponible.fecha).toLocaleString() : 'Sin registrar'}</div>
  `;
  $('#modal').innerHTML = html;
  $('#modalBg').classList.add('open');
  $('#mClose').onclick = cerrarModal;
  $('#modal').querySelectorAll('button[data-disp]').forEach(b => b.onclick = () => {
    const res = b.dataset.disp;
    c.disponible = { resultado: res, observacion: ($('#mObsDisp').value||'').trim(), fecha: nowISO() };
    saveDisp();
    abrirCasoDisp(id);
    renderDisp(); renderDReporte();
    toast('Disponibilidad guardada');
  });
}

/* ==================== MODAL EQUIPOS ==================== */
function abrirCasoEq(id){
  const c = stateEq.casos.find(x => x._id === id);
  if (!c) return;
  const badge = (label, cls) => `<span class="badge ${cls}" style="margin-right:4px;margin-top:4px">${label}</span>`;
  const badges = [];
  if (c.wifi6Oblig) badges.push(badge('🔵 REQUIERE WIFI 6','wifi6_req'));
  if (c.meshSug)    badges.push(badge('🟢 MESH SUGERIDO','mesh_req'));
  if (c.revisarTec) badges.push(badge('⚠️ REVISAR TÉCNICO','revisar_tec'));
  if (c.equipoOk)   badges.push(badge('✅ EQUIPO OK','equipo_ok'));
  if (!badges.length) badges.push(badge('⚪ ESTÁNDAR','estandar'));

  const html = `
    <div class="mhead">
      <div>
        <div class="idtag">ID Servicio ${esc(c.id_servicio||'—')}</div>
        <h2 style="margin-top:6px">${esc(c.cliente)||'(sin nombre)'}</h2>
        <div class="msub">OS ${esc(c.nro_os||'')} ${c.abonado?'· Abonado '+esc(c.abonado):''} ${c.filial?'· '+esc(c.filial):''}</div>
      </div>
      <button class="btn sm" id="mClose">✕</button>
    </div>
    <div style="background:var(--hover);border-radius:10px;padding:12px;margin-bottom:12px">
      <div style="margin-bottom:6px">${badges.join('')}</div>
      <div class="info-line"><b>Tipo orden:</b> ${badgeTipoTrabajo(c.tipoOrden)} ${badgeEstadoOs(c.estadoOs)}</div>
      <div class="info-line"><b>💼 Plan actual:</b> ${esc(c.tarifaServicio||'—')}</div>
      ${c.tarifaInicial ? `<div class="info-line"><b>📋 Plan inicial:</b> ${esc(c.tarifaInicial)}</div>` : ''}
      ${c.tarifaPactado ? `<div class="info-line"><b>✍️ Plan pactado:</b> ${esc(c.tarifaPactado)}</div>` : ''}
      ${c.detalle       ? `<div class="info-line"><b>📄 Detalle:</b> ${esc(c.detalle)}</div>` : ''}
      ${c.servicio      ? `<div class="info-line"><b>🛠️ Servicio:</b> ${esc(c.servicio)}</div>` : ''}
      ${c.detalleMaterial ? `<div class="info-line"><b>📦 Material:</b> ${esc(c.detalleMaterial)}</div>` : ''}
      ${telsEqHTML(c, false) || '<div class="info-line"><b>📞</b> Sin teléfonos registrados</div>'}
      ${c.dni       ? `<div class="info-line"><b>🆔 DNI/RUC:</b> ${esc(c.dni)}</div>` : ''}
      ${c.direccion ? `<div class="info-line"><b>📍</b> ${esc(c.direccion)}${c.distrito?', '+esc(c.distrito):''}${c.provincia?', '+esc(c.provincia):''}</div>` : ''}
      ${c.tecnico   ? `<div class="info-line"><b>👷 Técnico:</b> ${esc(c.tecnico)}</div>` : ''}
      ${c.fechaIngreso   ? `<div class="info-line"><b>📅 Ingreso:</b> ${esc(c.fechaIngreso)}</div>` : ''}
      ${c.fechaEjecucion ? `<div class="info-line"><b>✅ Ejecución:</b> ${esc(c.fechaEjecucion)}</div>` : ''}
    </div>
    ${c.observaciones ? `<h3>📝 Observaciones</h3><div class="nota">${esc(c.observaciones)}</div>` : ''}
    ${c.obsTecnico    ? `<h3>🔧 Observaciones del técnico</h3><div class="nota">${esc(c.obsTecnico)}</div>` : ''}
    ${c.causa||c.motivo ? `
      <h3>🔍 Causa / Motivo</h3>
      ${c.motivo   ? `<div class="info-line"><b>Motivo:</b> ${esc(c.motivo)}</div>` : ''}
      ${c.causa    ? `<div class="info-line"><b>Causa:</b> ${esc(c.causa)}</div>` : ''}
      ${c.solucion ? `<div class="info-line"><b>Solución:</b> ${esc(c.solucion)}</div>` : ''}
    ` : ''}
  `;
  $('#modal').innerHTML = html;
  $('#modalBg').classList.add('open');
  $('#mClose').onclick = cerrarModal;
}

/* ==================== TARJETA DISPONIBILIDAD ==================== */
function tarjetaDisp(c){
  const locArr = [c.direccion, c.distrito, c.provincia].filter(Boolean);
  return `
    <div class="caso ${c.esNueva?'nueva':''}">
      <div class="top">
        <div style="min-width:0">
          <div class="idtag">ID ${esc(c.id_interno||'—')}</div>
          <div class="nombre">${esc(c.nombre) || '(sin nombre)'}</div>
<div class="os">${esc(c.os||c.nroTac||c.codVenta||'')} ${c.empresa?'· '+esc(c.empresa):''} ${c.contratista?'· '+esc(c.contratista):''}</div>        </div>
        <div style="text-align:right;flex-shrink:0">
          ${badgeDisponible(c)}
          ${c.estadoOrigen?'<br>'+badgeEstadoOrigen(c.estadoOrigen):''}
        </div>
      </div>
      <div class="linea"><b>${esc(c.hora||'—')}</b> · ${esc(c.fecha||'')} ${c.cuadrilla?'· '+esc(c.cuadrilla):''}</div>
      ${telsSegHTML(c, true)}
      ${locArr.length ? `<div class="linea">📍 ${esc(locArr.join(', '))}</div>` : ''}
      ${c.coords ? `<div class="linea">🗺️ ${mapsLinkHTML(c.coords, 'Ver en Google Maps')}</div>` : ''}
      <div class="linea">
        ${badgeTipoTrabajo(c.tipoTrabajo)}
        <span class="badge tipo">${esc(c.tipoProg||'—')}</span>
      </div>
      <div class="acciones"><button class="btn sm primary" data-id="${c._id}">Abrir</button> <button class="btn sm" data-nota="${c._id}">📝 Nota</button></div>
    </div>`;
}
function renderDisp(){
  const cont = $('#listaDisp'); if (!cont) return;
  const hoy = todayStr();
  let lista = applyFiltersDisp(stateDisp.casos, { buscar: dispOpts.buscar });
  if (dispOpts.modo === 'pendientes')    lista = lista.filter(c => !c.disponible);
  if (dispOpts.modo === 'con_resultado') lista = lista.filter(c => c.disponible);
  if (dispOpts.desde) lista = lista.filter(c => c.hora && c.hora >= dispOpts.desde);
  if (dispOpts.hasta) lista = lista.filter(c => c.hora && c.hora <= dispOpts.hasta);
  lista.sort((a,b) => (a.hora||'99:99').localeCompare(b.hora||'99:99'));

  cont.innerHTML = lista.length
    ? lista.map(c => tarjetaDisp(c)).join('')
    : '<div class="card"><div class="empty">No hay casos con este filtro.<br><span class="hint">Sube una base en la pestaña Cargar.</span></div></div>';
  const cc = $('#dispCount');
  if (cc) cc.textContent = `${lista.length} casos`;
  cont.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => abrirCasoDisp(b.dataset.id));
}

/* ==================== TARJETA EQUIPOS ==================== */
function tarjetaEq(c){
  const badges = [];
  if (c.deteccion === 'wifi6_req')   badges.push('<span class="badge wifi6_req">🔵 REQUIERE WIFI 6</span>');
  if (c.deteccion === 'mesh_req')    badges.push('<span class="badge mesh_req">🟢 MESH SUGERIDO</span>');
  if (c.deteccion === 'revisar_tec') badges.push('<span class="badge revisar_tec">⚠️ REVISAR TÉCNICO</span>');
  if (c.deteccion === 'equipo_ok')   badges.push('<span class="badge equipo_ok">✅ EQUIPO OK</span>');
  if (c.deteccion === 'estandar')    badges.push('<span class="badge estandar">⚪ ESTÁNDAR</span>');
  return `
    <div class="caso">
      <div class="top">
        <div style="min-width:0">
          <div class="idtag">ID Servicio ${esc(c.id_servicio||'—')}</div>
          <div class="nombre">${esc(c.cliente)||'(sin nombre)'}</div>
          <div class="os">OS ${esc(c.nro_os||'')} ${c.filial?'· '+esc(c.filial):''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          ${badgeTipoTrabajo(c.tipoOrden)}
          ${badgeEstadoOs(c.estadoOs)}
        </div>
      </div>
      <div class="linea">${badges.join(' ')}</div>
      <div class="linea"><b>Plan:</b> ${esc(c.tarifaServicio||'—')} ${c.tarifaInicial && c.tarifaInicial !== c.tarifaServicio?`<span class="hint">(antes: ${esc(c.tarifaInicial)})</span>`:''}</div>
      ${c.detalle        ? `<div class="linea"><b>Detalle:</b> ${esc(c.detalle)}</div>` : ''}
      ${c.detalleMaterial ? `<div class="linea"><b>Equipo:</b> ${esc(c.detalleMaterial)}</div>` : ''}
      ${telsEqHTML(c, true)}
      ${c.direccion ? `<div class="linea">📍 ${esc(c.direccion)}${c.distrito?', '+esc(c.distrito):''}${c.provincia?', '+esc(c.provincia):''}</div>` : ''}
      ${c.tecnico ? `<div class="linea">👷 ${esc(c.tecnico)}</div>` : ''}
      ${c.observaciones ? `<div class="linea hint">📝 ${esc(c.observaciones).slice(0,140)}${c.observaciones.length>140?'...':''}</div>` : ''}
      <div class="acciones"><button class="btn sm primary" data-eqid="${c._id}">Ver detalle</button></div>
    </div>`;
}
function renderEqAnalisis(){
  const cont = $('#listaEq'); if (!cont) return;
  const lista = applyFiltersEq(stateEq.casos)
    .sort((a,b) => (a.estadoOs||'').localeCompare(b.estadoOs||'') || (a.id_servicio||'').localeCompare(b.id_servicio||''));
  cont.innerHTML = lista.length
    ? lista.map(c => tarjetaEq(c)).join('')
    : '<div class="card"><div class="empty">No hay órdenes con estos filtros.<br><span class="hint">Sube un archivo en la pestaña Cargar.</span></div></div>';
  const cc = $('#eqCount');
  if (cc) cc.textContent = `${lista.length} / ${stateEq.casos.length}`;
  cont.querySelectorAll('button[data-eqid]').forEach(b => b.onclick = () => abrirCasoEq(b.dataset.eqid));
}

/* ==================== REPORTES DISPONIBILIDAD / EQUIPOS ==================== */
function renderDReporte(){
  const cs = stateDisp.casos;
  const filtrados = applyFiltersDisp(stateDisp.casos);
  const stat = (k,v) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const stats = $('#dStats');
  if (stats){
    stats.innerHTML =
      stat('Total', cs.length) +
      stat('Pend. gestionar', cs.filter(c=>!c.disponible).length) +
      stat('Disponibles',    cs.filter(c=>c.disponible&&c.disponible.resultado==='disponible').length) +
      stat('No contesta',    cs.filter(c=>c.disponible&&c.disponible.resultado==='no_contesta').length) +
      stat('Observ. manual', cs.filter(c=>c.disponible&&c.disponible.resultado==='manual').length);
  }
  const info = $('#dExportInfo');
  if (info) info.textContent = `Se exportarán ${filtrados.length} casos (ID, Resultado, Observación).`;
}
function renderEqReporte(){
  const cs = stateEq.casos;
  const filtrados = applyFiltersEq(stateEq.casos);
  const stat = (k,v) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const stats = $('#eqStats');
  if (stats){
    stats.innerHTML =
      stat('Total', cs.length) +
      stat('🔵 Wifi 6 req.',    cs.filter(c=>c.deteccion==='wifi6_req').length) +
      stat('🟢 Mesh sugerido',  cs.filter(c=>c.deteccion==='mesh_req').length) +
      stat('⚠️ Revisar téc.',   cs.filter(c=>c.deteccion==='revisar_tec').length) +
      stat('✅ Equipo OK',      cs.filter(c=>c.deteccion==='equipo_ok').length) +
      stat('⚪ Estándar',       cs.filter(c=>c.deteccion==='estandar').length) +
      stat('Plan 1000+',        cs.filter(c=>/1000/i.test(c.tarifaServicio||'')).length) +
      stat('Con Mesh mencionado', cs.filter(c=>/mesh|repetidor/i.test((c.observaciones||'')+(c.detalleMaterial||''))).length);
  }
  const info = $('#eqExportInfo');
  if (info) info.textContent = `Se exportarán ${filtrados.length} órdenes.`;
}

/* ==================== EXPORTAR SEGUIMIENTO ==================== */
function buildRowsSeg(){
  const lista = applyFiltersSeg(stateSeg.casos).sort((a,b) => ((a.fecha||'')+(a.hora||'')).localeCompare((b.fecha||'')+(b.hora||'')));
  return lista.map(c => ({
    ID: c.id_interno,
    RESULTADO: c.llamada ? (RESULTADOS[c.llamada.resultado]||c.llamada.resultado) : '',
    OBSERVACION: c.llamada ? c.llamada.observacion : ''
  }));
}
const btnXlsx = $('#btnXlsx');
if (btnXlsx) btnXlsx.onclick = () => {
  const rows = buildRowsSeg();
  if (!rows.length) return toast('No hay datos para exportar');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Seguimiento');
  XLSX.writeFile(wb, `reporte_seguimiento_${todayStr()}.xlsx`);
  toast(`${rows.length} casos exportados`);
};
const btnCsv = $('#btnCsv');
if (btnCsv) btnCsv.onclick = () => {
  const rows = buildRowsSeg();
  if (!rows.length) return toast('No hay datos para exportar');
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(["\ufeff"+csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `reporte_seguimiento_${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast(`${rows.length} casos exportados`);
};

/* ==================== EXPORTAR DISPONIBILIDAD ==================== */
function buildRowsDisp(){
  const lista = applyFiltersDisp(stateDisp.casos).sort((a,b) => ((a.fecha||'')+(a.hora||'')).localeCompare((b.fecha||'')+(b.hora||'')));
  return lista.map(c => ({
    ID: c.id_interno,
    RESULTADO: c.disponible ? (RESULTADOS_DISP[c.disponible.resultado]||c.disponible.resultado) : '',
    OBSERVACION: c.disponible ? c.disponible.observacion : ''
  }));
}
const btnDXlsx = $('#btnDXlsx');
if (btnDXlsx) btnDXlsx.onclick = () => {
  const rows = buildRowsDisp();
  if (!rows.length) return toast('No hay datos para exportar');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Disponibilidad');
  XLSX.writeFile(wb, `reporte_disponibilidad_${todayStr()}.xlsx`);
  toast(`${rows.length} casos exportados`);
};
const btnDCsv = $('#btnDCsv');
if (btnDCsv) btnDCsv.onclick = () => {
  const rows = buildRowsDisp();
  if (!rows.length) return toast('No hay datos para exportar');
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(["\ufeff"+csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `reporte_disponibilidad_${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast(`${rows.length} casos exportados`);
};

/* ==================== EXPORTAR EQUIPOS ==================== */
function buildRowsEq(){
  const lista = applyFiltersEq(stateEq.casos).sort((a,b) => (a.id_servicio||'').localeCompare(b.id_servicio||''));
  return lista.map(c => ({
    'ID Servicio': c.id_servicio,
    'Nro OS': c.nro_os,
    'Abonado': c.abonado,
    'IDOS': c.idos,
    'Cliente': c.cliente,
    'DNI/RUC': c.dni,
    'Filial': c.filial,
    'Tipo Orden': c.tipoOrden,
    'Estado OS': c.estadoOs,
    'Detalle': c.detalle,
    'Servicio': c.servicio,
    'Plan Actual': c.tarifaServicio,
    'Plan Inicial': c.tarifaInicial,
    'Plan Pactado': c.tarifaPactado,
    'Telefono': c.telefono,
    'Celulares': c.celulares,
    'Direccion': c.direccion,
    'Distrito': c.distrito,
    'Provincia': c.provincia,
    'Zona': c.zona,
    'Tecnico Ejecutor': c.tecnico,
    'Tecnico Responsable': c.tecnicoResp,
    'Material': c.detalleMaterial,
    'Observaciones': c.observaciones,
    'Obs. Tecnico': c.obsTecnico,
    'Motivo': c.motivo,
    'Causa': c.causa,
    'Solucion': c.solucion,
    'Fecha Ingreso': c.fechaIngreso,
    'Fecha Ejecucion': c.fechaEjecucion,
    'Wifi6 Oblig': c.wifi6Oblig ? 'SÍ' : 'NO',
    'Mesh Sugerido': c.meshSug ? 'SÍ' : 'NO',
    'Revisar Tecnico': c.revisarTec ? 'SÍ' : 'NO',
    'Equipo OK': c.equipoOk ? 'SÍ' : 'NO',
    'Detección': deteccionLabel(c.deteccion)
  }));
}
const btnEqXlsx = $('#btnEqXlsx');
if (btnEqXlsx) btnEqXlsx.onclick = () => {
  const rows = buildRowsEq();
  if (!rows.length) return toast('No hay datos para exportar');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Equipos y Planes');
  XLSX.writeFile(wb, `reporte_equipos_${todayStr()}.xlsx`);
  toast(`${rows.length} órdenes exportadas`);
};
const btnEqCsv = $('#btnEqCsv');
if (btnEqCsv) btnEqCsv.onclick = () => {
  const rows = buildRowsEq();
  if (!rows.length) return toast('No hay datos para exportar');
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(["\ufeff"+csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `reporte_equipos_${todayStr()}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast(`${rows.length} órdenes exportadas`);
};

/* ==================== EXPORTAR KPIs (Excel + PDF) ==================== */
const btnKpiXlsx = $('#btnKpiXlsx');
if (btnKpiXlsx) btnKpiXlsx.onclick = () => {
  if (typeof XLSX === 'undefined') return toast('No se cargó la librería de Excel (¿hay internet?)');
  const lista = applyFiltrosKpi(stateSeg.casos);
  if (!lista.length) return toast('No hay datos para exportar');
  const wb = XLSX.utils.book_new();
  const agrupaciones = [
    ['Por contratista', contadorPor(lista, 'contratista')],
    ['Por empresa',  contadorPor(lista, 'empresa')],
    ['Por cuadrilla', contadorPor(lista, 'cuadrilla')],
    ['Por distrito',  contadorPor(lista, 'distrito')],
    ['Por trabajo',   contadorPor(lista, 'tipoTrabajo')],
    ['Por estado',    contadorPor(lista, 'estadoOrigen')]
  ];
  agrupaciones.forEach(([nombre, datos]) => {
    const rows = [['Valor','Cantidad'], ...datos];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 30));
  });
  const buckets = calcularTiemposKpi(lista);
  const rowsTiempos = [
    ['Categoría','Cantidad','Promedio (min)'],
    ['Excelente (≤30 min)', buckets.excelente.length, buckets.excelente.length ? Math.round(buckets.excelente.reduce((a,b)=>a+b,0)/buckets.excelente.length) : 0],
    ['Bueno (≤50 min)',     buckets.bueno.length,     buckets.bueno.length     ? Math.round(buckets.bueno.reduce((a,b)=>a+b,0)/buckets.bueno.length)         : 0],
    ['Normal (≤60 min)',    buckets.normal.length,    buckets.normal.length    ? Math.round(buckets.normal.reduce((a,b)=>a+b,0)/buckets.normal.length)       : 0],
    ['Irregular (>60 min)', buckets.irregular.length, buckets.irregular.length ? Math.round(buckets.irregular.reduce((a,b)=>a+b,0)/buckets.irregular.length) : 0]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsTiempos), 'Tiempos');
  const epf = calcularEnProcesoAFinal(lista);
  if (epf.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Cuadrilla', 'Casos', 'Promedio (min)', 'Mín (min)', 'Máx (min)', '% hasta 60 min']]
    .concat(epf.map(f => [f.cuadrilla, f.n, Math.round(f.prom), Math.round(f.min), Math.round(f.max), f.ok60]))), 'En proceso a resuelto');
  XLSX.writeFile(wb, `kpis_${todayStr()}.xlsx`);
  toast('KPIs exportados');
};
async function exportarKpiPDF(){
  const lista = applyFiltrosKpi(stateSeg.casos);
  if (!lista.length) return toast('No hay datos para exportar');
  try {
    toast('Generando PDF...');
    await cargarScriptExterno('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    await cargarScriptExterno('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js');
  } catch(e){ return toast('No se pudo cargar la librería de PDF (¿hay internet?)'); }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 32;
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const suave = h => rgb(h).map(v => Math.round(v * 0.12 + 255 * 0.88));
  const titulo = (txt, y) => { doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(txt, M, y); };
  const colMin = m => m <= 30 ? '#059669' : (m <= 50 ? '#2563eb' : (m <= 60 ? '#d97706' : '#dc2626'));
  const prom = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  const buckets = calcularTiemposKpi(lista);
  const etqF = { empresas: 'Empresa', contratistas: 'Contratista', cuadrillas: 'Cuadrilla', trabajos: 'Trabajo', departamentos: 'Departamento', provincias: 'Provincia', distritos: 'Distrito' };
  const filtrosTxt = Object.keys(etqF).filter(k => (kpiFiltros[k] || []).length).map(k => `${etqF[k]}: ${kpiFiltros[k].join(', ')}`).join('   |   ') || 'sin filtros';

  // Cabecera
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 64, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('KPIs operativos', M, 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Generado: ${new Date().toLocaleString()}   |   Casos considerados: ${lista.length}`, M, 50);
  doc.setTextColor(90, 90, 90); doc.setFontSize(9);
  const lf = doc.splitTextToSize('Filtros: ' + filtrosTxt, W - 2 * M);
  doc.text(lf, M, 80);
  let y = 80 + lf.length * 11 + 8;

  // Tiempos de resolución
  const tarjetas = [['EXCELENTE (hasta 30 min)', buckets.excelente, '#059669'], ['BUENO (hasta 50 min)', buckets.bueno, '#2563eb'],
                    ['NORMAL (hasta 60 min)', buckets.normal, '#d97706'], ['IRREGULAR (mas de 60 min)', buckets.irregular, '#dc2626']];
  const gap = 12, cw = (W - 2 * M - 3 * gap) / 4;
  tarjetas.forEach(([txt, arr, c], i) => {
    const x = M + i * (cw + gap), p = prom(arr);
    doc.setFillColor(...suave(c)); doc.setDrawColor(...rgb(c)); doc.roundedRect(x, y, cw, 62, 8, 8, 'FD');
    doc.setTextColor(...rgb(c)); doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.text(String(arr.length), x + 14, y + 32);
    doc.setFontSize(8.5); doc.setTextColor(60, 60, 60); doc.text(txt, x + 14, y + 47);
    doc.setFont('helvetica', 'normal'); doc.text(p === null ? '-' : `Prom. ${p} min`, x + 14, y + 58);
  });
  y += 62 + 12;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110, 110, 110);
  doc.text('Tiempo entre el estado anterior y el cambio a instalado o solucionado.', M, y);
  y += 22;

  // En proceso -> instalado / solucionado por cuadrilla
  const epf = calcularEnProcesoAFinal(lista);
  titulo('En proceso a Instalado / Solucionado, por cuadrilla', y);
  if (epf.length){
    const total = epf.reduce((a, f) => a + f.n, 0), promGen = epf.reduce((a, f) => a + f.prom * f.n, 0) / total;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
    doc.text(`${total} casos resueltos, promedio general ${Math.round(promGen)} min. Ordenado de la cuadrilla mas rapida a la mas lenta.`, M, y + 14);
    doc.autoTable({
      startY: y + 22, margin: { left: M, right: M }, theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 4, halign: 'center' }, headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      columnStyles: { 0: { halign: 'left' } },
      head: [['Cuadrilla', 'Casos', 'Promedio', 'Minimo', 'Maximo', 'Hasta 60 min']],
      body: epf.map(f => [f.cuadrilla, String(f.n),
        { content: Math.round(f.prom) + ' min', styles: { textColor: rgb(colMin(f.prom)), fontStyle: 'bold' } },
        Math.round(f.min) + ' min', Math.round(f.max) + ' min', f.ok60 + '%'])
    });
    y = doc.lastAutoTable.finalY + 26;
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(110, 110, 110);
    doc.text('Aun no hay casos que hayan pasado de "en proceso" a instalado o solucionado.', M, y + 16);
    y += 40;
  }

  // Distribución de casos (gráficos de barras)
  const grafico = (x, y0, w, tit, datos, color) => {
    const filas = datos.slice(0, 12), altoF = 15, etqW = 120, areaW = w - etqW - 40;
    const max = Math.max(1, ...filas.map(d => d[1]));
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(15, 23, 42); doc.text(tit, x, y0);
    if (!filas.length){ doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 120, 120); doc.text('Sin datos', x, y0 + 16); }
    filas.forEach(([k, v], i) => {
      const yy = y0 + 8 + i * altoF, et = String(k);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(50, 50, 50);
      doc.text(et.length > 24 ? et.slice(0, 23) + '.' : et, x, yy + 9);
      doc.setFillColor(235, 238, 242); doc.rect(x + etqW, yy + 1, areaW, 11, 'F');
      doc.setFillColor(...rgb(color)); doc.rect(x + etqW, yy + 1, Math.max(1, areaW * v / max), 11, 'F');
      doc.text(String(v), x + etqW + areaW + 5, yy + 9);
    });
  };
  const graf = [['Casos por contratista', contadorPor(lista, 'contratista'), '#3b82f6'], ['Casos por empresa', contadorPor(lista, 'empresa'), '#0ea5e9'],
                ['Casos por cuadrilla', contadorPor(lista, 'cuadrilla'), '#7c3aed'], ['Casos por distrito', contadorPor(lista, 'distrito'), '#f59e0b'],
                ['Casos por tipo de trabajo', contadorPor(lista, 'tipoTrabajo'), '#059669'], ['Casos por estado', contadorPor(lista, 'estadoOrigen'), '#dc2626']];
  if (y + 80 > H - 36){ doc.addPage(); y = M; }
  titulo('Distribucion de casos', y); y += 18;
  const colW = (W - 2 * M - 28) / 2;
  for (let i = 0; i < graf.length; i += 2){
    const par = graf.slice(i, i + 2);
    const alto = Math.max(...par.map(g => 8 + Math.max(1, Math.min(12, g[1].length)) * 15)) + 22;
    if (y + alto > H - 36){ doc.addPage(); y = M + 6; }
    par.forEach((g, k) => grafico(M + k * (colW + 28), y, colW, g[0], g[1], g[2]));
    y += alto;
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++){
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130, 130, 130);
    doc.text(`Pagina ${i} de ${n}`, W - M, H - 14, { align: 'right' });
  }
  doc.save(`KPIs_${stampArchivo()}.pdf`);
  toast('PDF descargado');
}
const btnKpiPdf = $('#btnKpiPdf');
if (btnKpiPdf) btnKpiPdf.onclick = exportarKpiPDF;

/* ==================== BORRAR DATOS ==================== */
function limpiarTodoSeg(){
  stateSeg.filtros = JSON.parse(JSON.stringify(FILTROS_SEG_DEF));
  const fb = $('#fBuscar'); if (fb) fb.value = '';
  const cb = $('#cBuscar'); if (cb) cb.value = '';
  const fn = $('#fNuevos'); if (fn) fn.checked = false;
  saveSeg();
  renderFiltroBtnsSeg(); renderCasos(); renderConf(); renderReporte();
}
function limpiarTodoDisp(){
  stateDisp.filtros = JSON.parse(JSON.stringify(FILTROS_DISP_DEF));
  const db = $('#dBuscar'); if (db) db.value = '';
  saveDisp();
  renderFiltroBtnsDisp(); renderDisp(); renderDReporte();
}
function limpiarTodoEq(){
  stateEq.filtros = JSON.parse(JSON.stringify(FILTROS_EQ_DEF));
  const eb = $('#eqBuscar'); if (eb) eb.value = '';
  saveEq();
  renderFiltroBtnsEq(); renderEqAnalisis(); renderEqReporte();
}
function limpiarTodoCarga(){
  cargaFiltros = JSON.parse(JSON.stringify(FILTROS_CARGA_DEF));
  const cb = $('#cargaBuscar'); if (cb) cb.value = '';
  const cf = $('#cargaFecha');   if (cf) cf.value = '';
  renderFiltroBtnsCarga(); renderCarga();
}
function limpiarTodoKpi(){
  kpiFiltros = JSON.parse(JSON.stringify(FILTROS_KPI_DEF));
  renderFiltroBtnsKpi(); renderKpis();
}
const btnLimpiarC     = $('#btnLimpiarC');     if (btnLimpiarC)     btnLimpiarC.onclick = limpiarTodoSeg;
const btnLimpiarF     = $('#btnLimpiarF');     if (btnLimpiarF)     btnLimpiarF.onclick = limpiarTodoSeg;
const btnLimpiarD     = $('#btnLimpiarD');     if (btnLimpiarD)     btnLimpiarD.onclick = limpiarTodoDisp;
const btnLimpiarEq    = $('#btnLimpiarEq');    if (btnLimpiarEq)    btnLimpiarEq.onclick = limpiarTodoEq;
const btnLimpiarCarga = $('#btnLimpiarCarga'); if (btnLimpiarCarga) btnLimpiarCarga.onclick = limpiarTodoCarga;
const btnLimpiarKpi   = $('#btnLimpiarKpi');   if (btnLimpiarKpi)   btnLimpiarKpi.onclick = limpiarTodoKpi;

/* Borra los DATOS de Seguimiento: casos, historial, coordinaciones de adicionales
   y la línea base del servidor Python. Los filtros y buscadores se conservan
   (solo se limpia la fecha de Carga, porque depende de los casos cargados). */
async function borrarTodoSeguimiento(){
  // 1) Casos e historial (se conservan los filtros guardados)
  stateSeg = { casos: [], historial: [], filtros: stateSeg.filtros };
  saveSeg();

  // 2) Coordinaciones de adicionales (antes quedaban guardadas del día anterior)
  mapaCoordinacion = {};
  try { localStorage.removeItem(KEY_COORD); } catch(e){}
  _alertasVistas.clear();
  try { localStorage.removeItem(KEY_ALERTAS); } catch(e){}
  gestiones = {};
  try { localStorage.removeItem(KEY_GESTIONES); } catch(e){}

  // 3) La fecha de Carga sí se limpia: sus opciones salen de los casos y si
  //    quedara la de ayer, ocultaría los datos de hoy
  cargaFiltros.fecha = '';
  const cf = $('#cargaFecha'); if (cf) cf.value = '';

  // 4) Línea base del servidor Python (si no está encendido, no pasa nada)
  try { await fetch('http://localhost:5000/api/reiniciar-base', { method: 'POST' }); } catch(e){}

  // 5) Redibujar todo
  renderImportInfoSeg();
  renderFiltroBtnsSeg(); renderFiltroBtnsCarga(); renderFiltroBtnsKpi(); renderFiltroBtnsAdic();
  renderCasos(); renderConf(); renderCarga(); renderKpis(); renderReporte(); renderAdicionales();
}

/* ---- Reinicio automático al cambiar de día ---- */
const KEY_DIA = 'zaaz_dia_datos';
const diaLocal = d => new Date(d).toLocaleDateString('en-CA');   // AAAA-MM-DD en hora local
function diaDeLosDatos(){
  let g = '';
  try { g = localStorage.getItem(KEY_DIA) || ''; } catch(e){}
  if (g) return g;
  // Primera vez con esta versión: usar la fecha de la última importación guardada
  const fechas = (stateSeg.historial || []).map(x => x.fecha).filter(Boolean).sort();
  return fechas.length ? diaLocal(fechas[fechas.length - 1]) : '';
}
function marcarDiaHoy(){ try { localStorage.setItem(KEY_DIA, diaLocal(Date.now())); } catch(e){} }
let _revisandoDia = false;
async function revisarCambioDeDia(){
  if (_revisandoDia) return false;
  _revisandoDia = true;
  try {
    const hoy = diaLocal(Date.now());
    const guardado = diaDeLosDatos();
    if (guardado && guardado !== hoy){
      await borrarTodoSeguimiento();        // conserva tus filtros
      marcarDiaHoy();
      toast('🗓️ Nuevo día: se limpiaron los datos de ayer (tus filtros se mantienen)');
      return true;
    }
    marcarDiaHoy();
    return false;
  } finally { _revisandoDia = false; }
}

const btnClear = $('#btnClear');
if (btnClear) btnClear.onclick = async () => {
  const hayDatos = stateSeg.casos.length || Object.keys(mapaCoordinacion).length;
  if (!hayDatos) return toast('No hay datos para borrar');
  if (!confirm(`¿Borrar TODO el Seguimiento (${stateSeg.casos.length} casos, coordinaciones y línea base)?`)) return;
  await borrarTodoSeguimiento();
  toast('Datos borrados');
};
const btnClearDisp = $('#btnClearDisp');
if (btnClearDisp) btnClearDisp.onclick = () => {
  if (!stateDisp.casos.length) return toast('No hay datos para borrar');
  if (!confirm(`¿Borrar los ${stateDisp.casos.length} casos de Disponibilidad?`)) return;
  stateDisp = { casos: [], historial: [], filtros: JSON.parse(JSON.stringify(FILTROS_DISP_DEF)) };
  saveDisp();
  renderImportInfoDisp(); renderFiltroBtnsDisp(); renderDisp(); renderDReporte();
  toast('Datos borrados');
};
const btnClearEq = $('#btnClearEq');
if (btnClearEq) btnClearEq.onclick = () => {
  if (!stateEq.casos.length) return toast('No hay datos para borrar');
  if (!confirm(`¿Borrar las ${stateEq.casos.length} órdenes de Equipos y Planes?`)) return;
  stateEq = { casos: [], historial: [], filtros: JSON.parse(JSON.stringify(FILTROS_EQ_DEF)) };
  saveEq();
  renderImportInfoEq(); renderFiltroBtnsEq(); renderEqAnalisis(); renderEqReporte();
  toast('Datos borrados');
};

/* ==================== EVENTOS UI ==================== */
const fBuscar = $('#fBuscar');
if (fBuscar) fBuscar.oninput = e => { stateSeg.filtros.buscar = e.target.value; saveSeg(); renderCasos(); };
const cBuscar = $('#cBuscar');
if (cBuscar) cBuscar.oninput = e => { confOpts.buscar = e.target.value; renderConf(); };
const dBuscar = $('#dBuscar');
if (dBuscar) dBuscar.oninput = e => { dispOpts.buscar = e.target.value; renderDisp(); };
const eqBuscar = $('#eqBuscar');
if (eqBuscar) eqBuscar.oninput = e => { stateEq.filtros.buscar = e.target.value; saveEq(); renderEqAnalisis(); };
const fNuevos = $('#fNuevos');
if (fNuevos) fNuevos.onchange = e => { stateSeg.filtros.soloNuevas = e.target.checked; saveSeg(); renderCasos(); };
const cargaBuscar = $('#cargaBuscar');
if (cargaBuscar) cargaBuscar.oninput = e => { cargaFiltros.buscar = e.target.value; renderCarga(); };
const cargaFecha = $('#cargaFecha');
if (cargaFecha) cargaFecha.onchange = e => { cargaFiltros.fecha = e.target.value; renderCarga(); };

['cModo','cDesde','cHasta'].forEach(id => {
  const el = $('#' + id);
  if (!el) return;
  el.onchange = () => {
    confOpts.modo  = $('#cModo').value;
    confOpts.desde = $('#cDesde').value;
    confOpts.hasta = $('#cHasta').value;
    renderConf();
  };
});
['dModo','dDesde','dHasta'].forEach(id => {
  const el = $('#' + id);
  if (!el) return;
  el.onchange = () => {
    dispOpts.modo  = $('#dModo').value;
    dispOpts.desde = $('#dDesde').value;
    dispOpts.hasta = $('#dHasta').value;
    renderDisp();
  };
});

const filtroAdicCoord = $('#filtroAdicCoord');
if (filtroAdicCoord) filtroAdicCoord.onchange = () => {
  adicFiltros.coordinacion = filtroAdicCoord.value;
  renderAdicionales();
};
const adicBuscar = $('#adicBuscar');
if (adicBuscar) adicBuscar.oninput = e => {
  adicFiltros.buscar = e.target.value;
  renderAdicionales();
};
const btnLimpiarAdic = $('#btnLimpiarAdic');
if (btnLimpiarAdic) btnLimpiarAdic.onclick = () => {
  limpiarFiltrosAdic();
  adicFiltros.buscar = '';
  if (adicBuscar) adicBuscar.value = '';
  renderFiltroBtnsAdic();
  renderAdicionales();
};

/* ==================== SIDEBAR / TABS ==================== */
const burger = $('#burger'), sidebar = $('#sidebar'), overlay = $('#overlay');
if (burger && sidebar && overlay){
  burger.onclick = () => { sidebar.classList.toggle('open'); overlay.classList.toggle('open'); };
  overlay.onclick = () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); };
}
$$('.section-btn').forEach(btn => btn.onclick = () => {
  const sec = btn.dataset.section;
  $$('.section-btn').forEach(b => b.classList.toggle('active', b === btn));
  const titles = { seguimiento:'📋 Seguimiento', disponibilidad:'📞 Disponibilidad', equipos:'📦 Equipos y Planes' };
  const titleEl = $('#sectionTitle');
  if (titleEl) titleEl.textContent = titles[sec] || '';

  const tabsSeg  = $('#tabsSeg');
  const tabsDisp = $('#tabsDisp');
  const tabsEq   = $('#tabsEq');
  const secSeg   = $('#seccionSeguimiento');
  const secDisp  = $('#seccionDisponibilidad');
  const secEq    = $('#seccionEquipos');
  if (tabsSeg)  tabsSeg.style.display  = sec === 'seguimiento'    ? 'flex' : 'none';
  if (tabsDisp) tabsDisp.style.display = sec === 'disponibilidad' ? 'flex' : 'none';
  if (tabsEq)   tabsEq.style.display   = sec === 'equipos'        ? 'flex' : 'none';
  if (secSeg)   secSeg.style.display   = sec === 'seguimiento'    ? 'block' : 'none';
  if (secDisp)  secDisp.style.display  = sec === 'disponibilidad' ? 'block' : 'none';
  if (secEq)    secEq.style.display    = sec === 'equipos'        ? 'block' : 'none';

  if (window.innerWidth < 768){
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  }
  if (sec === 'seguimiento'){ renderCasos(); renderConf(); renderCarga(); renderKpis(); renderReporte(); renderAdicionales(); }
  else if (sec === 'disponibilidad'){ renderDisp(); renderDReporte(); }
  else { renderEqAnalisis(); renderEqReporte(); }
});

$$('#tabsSeg .tab').forEach(btn => btn.onclick = () => {
  $$('#tabsSeg .tab').forEach(b => b.classList.toggle('active', b === btn));
  $$('#seccionSeguimiento .panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + btn.dataset.tab));
  const t = btn.dataset.tab;
  if (t === 'casos')        renderCasos();
  if (t === 'adicionales')  renderAdicionales();
  if (t === 'carga')        renderCarga();
  if (t === 'kpis')         renderKpis();
  if (t === 'alertas')      renderAlertas();
  if (t === 'cierre')       renderCierre();
  if (t === 'consolidado')  renderConsolidado();
  if (t === 'mapa')         renderMapa();
  if (t === 'calidad')      renderCalidad();
  if (t === 'conformidad')  renderConf();
  if (t === 'reporte')      renderReporte();
});
$$('#tabsDisp .tab').forEach(btn => btn.onclick = () => {
  $$('#tabsDisp .tab').forEach(b => b.classList.toggle('active', b === btn));
  $$('#seccionDisponibilidad .panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + btn.dataset.tab));
  if (btn.dataset.tab === 'dDisponibilidad') renderDisp();
  if (btn.dataset.tab === 'dReporte')        renderDReporte();
});
$$('#tabsEq .tab').forEach(btn => btn.onclick = () => {
  $$('#tabsEq .tab').forEach(b => b.classList.toggle('active', b === btn));
  $$('#seccionEquipos .panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + btn.dataset.tab));
  if (btn.dataset.tab === 'eAnalisis') renderEqAnalisis();
  if (btn.dataset.tab === 'eReporte')  renderEqReporte();
});

/* ==================== FILE INPUTS ==================== */
const drop = $('#drop'), fileInput = $('#fileInput');
if (drop && fileInput){
  drop.onclick = () => fileInput.click();
  fileInput.onchange = e => { const f = e.target.files[0]; if (f) handleFileSeg(f); fileInput.value = ''; };
  drop.ondragover = e => { e.preventDefault(); drop.style.borderColor = '#3b82f6'; };
  drop.ondragleave = () => { drop.style.borderColor = 'var(--linea)'; };
  drop.ondrop = e => {
    e.preventDefault();
    drop.style.borderColor = 'var(--linea)';
    const f = e.dataTransfer.files[0]; if (f) handleFileSeg(f);
  };
}
const dropDisp = $('#dropDisp'), fileDisp = $('#fileDisp');
if (dropDisp && fileDisp){
  dropDisp.onclick = () => fileDisp.click();
  fileDisp.onchange = e => { const f = e.target.files[0]; if (f) handleFileDisp(f); fileDisp.value = ''; };
  dropDisp.ondragover = e => { e.preventDefault(); dropDisp.style.borderColor = '#3b82f6'; };
  dropDisp.ondragleave = () => { dropDisp.style.borderColor = 'var(--linea)'; };
  dropDisp.ondrop = e => {
    e.preventDefault();
    dropDisp.style.borderColor = 'var(--linea)';
    const f = e.dataTransfer.files[0]; if (f) handleFileDisp(f);
  };
}
const dropEq = $('#dropEq'), fileEq = $('#fileEq');
if (dropEq && fileEq){
  dropEq.onclick = () => fileEq.click();
  fileEq.onchange = e => { const f = e.target.files[0]; if (f) handleFileEq(f); fileEq.value = ''; };
  dropEq.ondragover = e => { e.preventDefault(); dropEq.style.borderColor = '#3b82f6'; };
  dropEq.ondragleave = () => { dropEq.style.borderColor = 'var(--linea)'; };
  dropEq.ondrop = e => {
    e.preventDefault();
    dropEq.style.borderColor = 'var(--linea)';
    const f = e.dataTransfer.files[0]; if (f) handleFileEq(f);
  };
}

/* ==================== BOTONES PORTAL ZAAZ ==================== */
const btnZaazHoy = $('#btnZaazHoy');
if (btnZaazHoy) btnZaazHoy.onclick = () => {
  window.open(`https://zaaz.purpura-lab.com/admin/operaciones/reserva-cupos/cupos/asignar?date=${todayStr()}`, '_blank');
};
const btnZaazManana = $('#btnZaazManana');
if (btnZaazManana) btnZaazManana.onclick = () => {
  window.open(`https://zaaz.purpura-lab.com/admin/operaciones/reserva-cupos/cupos/asignar?date=${tomorrowStr()}`, '_blank');
};

/* ==================== PEGAR CON CTRL+V ==================== */
window.addEventListener('paste', e => {
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (activeTag === 'input' || activeTag === 'textarea') return;
  const text = e.clipboardData ? e.clipboardData.getData('text') : '';
  if (!text || !/<table/i.test(text)) return;
  e.preventDefault();
  const secDisp = $('#seccionDisponibilidad') && $('#seccionDisponibilidad').style.display !== 'none';
  const secSeg  = $('#seccionSeguimiento')    && $('#seccionSeguimiento').style.display !== 'none';
  try {
    const rows = parseHTMLTable(text);
    if (secDisp)      importRowsDisp(rows, 'Pegado (Ctrl+V)');
    else if (secSeg)  importRowsSeg(rows, 'Pegado (Ctrl+V)');
    else              importRowsEq(rows, 'Pegado (Ctrl+V)');
  } catch(err){
    toast('No se pudo procesar la tabla pegada');
  }
});
/* ==================== WIRING DE BOTONES FILTROS ==================== */
$$('[data-scope="seg"][data-filter]').forEach(btn => {
  btn.onclick = () => openPicker('seg', btn.dataset.filter);
});
$$('[data-scope="disp"][data-filter]').forEach(btn => {
  btn.onclick = () => openPicker('disp', btn.dataset.filter);
});
$$('[data-scope="carga"][data-filter]').forEach(btn => {
  btn.onclick = () => openPicker('carga', btn.dataset.filter);
});
$$('[data-scope="kpi"][data-filter]').forEach(btn => {
  btn.onclick = () => openPicker('kpi', btn.dataset.filter);
});
$$('[data-scope="eq"][data-eqfilter]').forEach(btn => {
  btn.onclick = () => openPicker('eq', btn.dataset.eqfilter);
});
$$('[data-scope="adic"][data-filter]').forEach(btn => {
  btn.onclick = () => openPicker('adic', btn.dataset.filter);
});
$$('[data-scope="notif"][data-filter]').forEach(btn => {
  btn.onclick = () => openPicker('notif', btn.dataset.filter);
});
$$('[data-scope="alert"][data-filter]').forEach(btn => {
  btn.onclick = () => openPicker('alert', btn.dataset.filter);
});
/* ==================== INIT FINAL ==================== */
function inicializar(){
  loadAll();
  applyTheme();

  const themeBtn = $('#themeToggle');
  if (themeBtn) themeBtn.onclick = toggleTheme;

  const btnAutoToggle = $('#btnAutoToggle');
  if (btnAutoToggle) btnAutoToggle.onclick = toggleAutoMonitoreo;
  pintarBtnNotif();
  renderFiltroBtnsNotif();
  renderFiltroBtnsAlert();

  // Poblar inputs con estado guardado
  const fBuscarEl = $('#fBuscar'); if (fBuscarEl) fBuscarEl.value = stateSeg.filtros.buscar || '';
  const fNuevosEl = $('#fNuevos'); if (fNuevosEl) fNuevosEl.checked = !!stateSeg.filtros.soloNuevas;
  const cModoEl   = $('#cModo');   if (cModoEl)   cModoEl.value   = confOpts.modo;
  const cDesdeEl  = $('#cDesde');  if (cDesdeEl)  cDesdeEl.value  = confOpts.desde;
  const cHastaEl  = $('#cHasta');  if (cHastaEl)  cHastaEl.value  = confOpts.hasta;
  const dBuscarEl = $('#dBuscar'); if (dBuscarEl) dBuscarEl.value = stateDisp.filtros.buscar || '';
  const dModoEl   = $('#dModo');   if (dModoEl)   dModoEl.value   = dispOpts.modo;
  const dDesdeEl  = $('#dDesde');  if (dDesdeEl)  dDesdeEl.value  = dispOpts.desde;
  const dHastaEl  = $('#dHasta');  if (dHastaEl)  dHastaEl.value  = dispOpts.hasta;
  const eqBuscarEl = $('#eqBuscar'); if (eqBuscarEl) eqBuscarEl.value = stateEq.filtros.buscar || '';

  renderImportInfoSeg();
  renderImportInfoDisp();
  renderImportInfoEq();
  renderFiltroBtnsSeg();
  renderFiltroBtnsDisp();
  renderFiltroBtnsCarga();
  renderFiltroBtnsKpi();
  renderFiltroBtnsEq();
  renderFiltroBtnsAdic();
  renderCasos();
  renderConf();
  renderCarga();
  renderKpis();
  renderReporte();
  renderDisp();
  renderDReporte();
  renderEqAnalisis();
  renderEqReporte();
  renderAdicionales();
}
/* ==================== RECUPERACIÓN AL VOLVER A LA PESTAÑA ==================== */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  // Solo actuar si el ciclo automático está activo
  if (!autoTimerId) return;
  // Si ya pasaron 5+ min, forzar sincro inmediata
  if (window._ultimaSincro){
    const minutosPasados = (Date.now() - window._ultimaSincro) / 60000;
    if (minutosPasados >= window._intervaloMin){
      window._ultimaSincro = Date.now();
      segsRestantes = 300;
      ejecutarSincroZaaz();
    }
  }
});
// Ejecutar init cuando el DOM esté listo
function arrancar(){ normalizarLugares(); inicializar(); pintarBtnReprog(); revisarCambioDeDia(); evaluarAlertasTiempo(); setInterval(evaluarAlertasTiempo, 60000); }
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', arrancar);
} else {
  arrancar();
}