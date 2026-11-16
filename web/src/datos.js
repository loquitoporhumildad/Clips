// Capa de datos: Supabase real, o datos de muestra con ?demo=1 (solo para revisar el diseño).
import {createClient} from '@supabase/supabase-js';

export const DEMO = new URLSearchParams(location.search).has('demo');
export const sb = createClient('https://gxipxajizzenankexarj.supabase.co', 'sb_publishable_Cj1gdSovetxWLwDKS1dV7Q_dqb0hNMp');

const ERRORES = {
  'Invalid login credentials': 'Correo o contraseña incorrectos. Si es tu primera vez, toca "Primera vez".',
  'Email not confirmed': 'Falta confirmar la cuenta. Avísale a Claude para que la active.',
  'User already registered': 'Ese correo ya tiene cuenta. Entra con "Ya tengo cuenta".',
};
export const enEspanol = (m) => ERRORES[m] || m;

const muestra = {
  videos: [
    {id: 1, day: '2026-11-15', lang: 'en', owner: 'juan', account: 'Vice Data', brand: 'gta', status: 'listo', storage_path: 'x', title: 'GTA VI: 1,080 days from first trailer to launch', description: 'Two delays, 177 extra days and a $79.99 price tag. 4 days to go.', hashtags: ['#GTA6', '#GTAVI', '#gaming'], notes: 'El cierre es una pregunta: responde los primeros comentarios.'},
    {id: 2, day: '2026-11-14', lang: 'en', owner: 'juan', account: 'Vice Data', brand: 'gta', status: 'publicado', storage_path: 'x', title: "GTA VI is 5 days away and it's already breaking records", description: '475M views in 24h, a Guinness record and a $79.99 price tag.', hashtags: ['#GTA6', '#GTAVI'], notes: null},
    {id: 3, day: '2026-11-14', lang: 'es', owner: 'socio', account: 'Datos de Vice', brand: 'gta', status: 'listo', storage_path: 'x', title: 'Faltan 5 días para GTA VI y ya rompió récords', description: '475M de vistas en 24h.', hashtags: ['#GTA6'], notes: null},
  ],
  pedidos: [
    {id: 1, brand: 'gta', kind: 'clip', folder: 'gta', owner: null, status: 'pendiente', title: '5 o 6 recortes de los tráilers oficiales de GTA VI', detail: 'Menos de 10 s cada uno, sin texto encima. Ideal: ciudad de noche, playa, persecución.'},
    {id: 2, brand: 'gta', kind: 'musica', folder: 'music', owner: null, status: 'listo', title: '3 pistas sin copyright para fondo', detail: 'Synthwave o trap suave, sin voz, en .mp3.'},
  ],
  metricas: [{video_id: 2, platform: 'tiktok', views: 1840}, {video_id: 2, platform: 'instagram', views: 420}, {video_id: 2, platform: 'youtube', views: 310}],
};

const porDueno = (q, dueno) => (dueno === 'todos' ? q : q.eq('owner', dueno));

export const api = {
  async sesion() {
    if (DEMO) return {miembro: {name: 'Juan', role: 'juan'}};
    const {data: {session}} = await sb.auth.getSession();
    if (!session) return {};
    const {data} = await sb.from('clips_members').select('name, role').maybeSingle();
    return {session, miembro: data};
  },
  async videos(dueno) {
    if (DEMO) return muestra.videos.filter((v) => dueno === 'todos' || v.owner === dueno);
    const {data, error} = await porDueno(sb.from('clips_videos').select('*'), dueno).order('day', {ascending: false}).order('id').limit(40);
    if (error) throw error;
    return data;
  },
  async urlVideo(ruta, descargar) {
    if (DEMO) return null;
    const {data} = await sb.storage.from('clips-videos').createSignedUrl(ruta, 3600, descargar ? {download: true} : undefined);
    return data?.signedUrl ?? null;
  },
  async estado(id, status) {
    if (!DEMO) await sb.from('clips_videos').update({status}).eq('id', id);
  },
  async pedidos(dueno) {
    if (DEMO) return muestra.pedidos;
    let q = sb.from('clips_requests').select('*').order('status', {ascending: false}).order('id', {ascending: false}).limit(40);
    if (dueno !== 'todos') q = q.or(`owner.eq.${dueno},owner.is.null`);
    const {data, error} = await q;
    if (error) throw error;
    return data;
  },
  async archivos(carpeta) {
    if (DEMO) return carpeta === 'music' ? ['noche-neon.mp3', 'costa.mp3'] : [];
    const {data} = await sb.storage.from('clips-media').list(carpeta, {limit: 100});
    return (data ?? []).map((f) => f.name);
  },
  async subir(carpeta, archivo) {
    if (DEMO) return null;
    const nombre = archivo.name.normalize('NFD').replace(/[^\w.\-]+/g, '-').toLowerCase();
    const {error} = await sb.storage.from('clips-media').upload(`${carpeta}/${nombre}`, archivo, {upsert: true, contentType: archivo.type});
    return error ? error.message : null;
  },
  // Buzón: links, notas y archivos sueltos para Claude. Van a clips-media/buzon
  // y el índice nocturno los copia a la rama media-index, donde Claude los lee.
  async buzon(dueno) {
    if (DEMO) return [{nombre: 'juan-demo-nota.txt', texto: 'https://www.twitch.tv/videos/123 · campaña de Whop', de: 'juan'}];
    const {data} = await sb.storage.from('clips-media').list('buzon', {limit: 100, sortBy: {column: 'created_at', order: 'desc'}});
    const mios = (data ?? []).filter((f) => f.id && (dueno === 'todos' || f.name.startsWith(`${dueno}-`))).slice(0, 12);
    return Promise.all(mios.map(async (f) => {
      const de = f.name.split('-')[0];
      if (!f.name.endsWith('-nota.txt')) return {nombre: f.name, texto: null, de};
      const {data: b} = await sb.storage.from('clips-media').download(`buzon/${f.name}`);
      return {nombre: f.name, texto: b ? await b.text() : '', de};
    }));
  },
  async enviarNota(dueno, texto) {
    if (DEMO) return null;
    const nombre = `${dueno}-${new Date().toISOString().replace(/[:.]/g, '')}-nota.txt`;
    const {error} = await sb.storage.from('clips-media').upload(`buzon/${nombre}`, new Blob([texto], {type: 'text/plain'}), {contentType: 'text/plain'});
    return error ? error.message : null;
  },
  async estadoPedido(id, status) {
    if (!DEMO) await sb.from('clips_requests').update({status}).eq('id', id);
  },
  // Directos: la página llama a la función "vigilar" de Supabase, que lanza el workflow en GitHub.
  async vigilarPing() {
    if (DEMO) return {ok: true, listos: ['juan'], cuota: 2000};
    const {data, error} = await sb.functions.invoke('vigilar', {body: {accion: 'ping'}});
    return error ? {ok: false, listos: [], cuota: 2000} : data;
  },
  async vigilar(cuerpo) {
    if (DEMO) return {ok: true, resultados: []};
    const {data, error} = await sb.functions.invoke('vigilar', {body: cuerpo});
    if (!error) return data;
    let mensaje = error.message;
    try { mensaje = (await error.context.json()).error || mensaje; } catch { /* sin detalle */ }
    return {ok: false, error: mensaje};
  },
  async directos(dueno) {
    if (DEMO) return [{id: 1, created_at: new Date().toISOString(), owner: 'juan', cuenta: 'Clip Vault', url: 'https://www.twitch.tv/ejemplo', campana: 'Whop: ejemplo', minutos: 330, estado: 'vigilando', clips: 3, minutos_usados: 120}];
    let q = sb.from('clips_vigilar').select('*').order('id', {ascending: false}).limit(30);
    if (dueno !== 'todos') q = q.eq('owner', dueno);
    const {data, error} = await q;
    if (error) throw error;
    return data;
  },
  async metricas() {
    if (DEMO) return muestra.metricas;
    const {data} = await sb.from('clips_metrics').select('*').order('captured_at', {ascending: false}).limit(500);
    return data ?? [];
  },
  async guardarVistas(filas) {
    if (DEMO) return null;
    const {error} = await sb.from('clips_metrics').insert(filas);
    return error ? error.message : null;
  },
};
