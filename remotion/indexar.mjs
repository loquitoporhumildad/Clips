// Crea una "hoja de contacto" de cada video subido al panel: un cuadro cada 2 s
// con su minuto y segundo encima. Claude mira esas hojas para elegir qué partes
// usar de fondo ("bg" + "bgStart" en el guion). Uso: node indexar.mjs
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(here, '..', 'out', 'medios');
const dest = path.join(here, '..', 'out', 'indice');
const {SUPABASE_URL, SUPABASE_SERVICE_KEY} = process.env;
const principal = process.argv[1] === fileURLToPath(import.meta.url);
if (principal && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY');

const sb = async (p, init = {}) => {
  const r = await fetch(`${SUPABASE_URL}${p}`, {...init, headers: {apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, ...(init.headers ?? {})}});
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`);
  return r;
};
const list = async (prefix) => (await sb('/storage/v1/object/list/clips-media', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({prefix, limit: 200})})).json();
const run = (cmd, args) => spawnSync(cmd, args, {encoding: 'utf8'});

// "Ritmo" medido, para lo que una imagen quieta no muestra: cuánto cambia la
// imagen (movimiento/cortes) y qué tan fuerte suena cada tramo.
export function ritmo(local, paso, dur) {
  const n = Math.max(1, Math.ceil(dur / paso));
  const tramos = Array.from({length: n}, (_, i) => ({t: i * paso, mov: 0, k: 0, vol: null}));
  const leer = (salida, clave, usar) => {
    let t = 0;
    for (const l of salida.split('\n')) {
      const m = l.match(/pts_time:([\d.]+)/);
      if (m) t = Number(m[1]);
      const v = l.match(new RegExp(`${clave}=(-?[\\d.]+|-inf)`));
      if (v) usar(tramos[Math.min(n - 1, Math.floor(t / paso))], v[1] === '-inf' ? -90 : Number(v[1]));
    }
  };
  const v = run('ffmpeg', ['-loglevel', 'error', '-i', local, '-an', '-vf', "scale=160:-2,select='gte(scene,0)',metadata=print:file=-", '-f', 'null', '-']);
  leer(v.stdout, 'lavfi\\.scene_score', (x, val) => { x.mov += val; x.k++; });
  const a = run('ffmpeg', ['-loglevel', 'error', '-i', local, '-vn', '-af', `aresample=16000,asetnsamples=n=${16000 * paso}:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-`, '-f', 'null', '-']);
  leer(a.stdout, 'lavfi\\.astats\\.Overall\\.RMS_level', (x, val) => { x.vol = val; });
  return tramos.map((x) => ({t: x.t, movimiento: x.k ? Number(((x.mov / x.k) * 100).toFixed(1)) : 0, volumen_db: x.vol === null ? null : Number(x.vol.toFixed(1))}));
}

// Gemini mira el video (imagen y sonido) y devuelve las escenas con su tiempo.
// Docs: ai.google.dev/gemini-api/docs/video-understanding (video en línea < 100 MB).
export async function escenas(local) {
  const {GEMINI_API_KEY, GEMINI_MODEL = 'gemini-3.8-flash'} = process.env;
  if (!GEMINI_API_KEY) return null;
  const pedido = `Eres editor de videos cortos verticales. Divide este video en escenas (cada corte de cámara).
Devuelve SOLO un JSON: una lista de objetos con
"inicio" y "fin" (segundos, con un decimal),
"descripcion" (qué se ve, en español, máximo 15 palabras),
"energia" (1 = quieto, 5 = acción intensa),
"texto_o_logo" (true si hay texto grande, logos, marcas de consola o clasificación por edad en pantalla),
"sirve_de_fondo" (true si funciona como fondo oscurecido detrás de texto: imagen limpia, sin texto ni logos).`;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: {'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      contents: [{parts: [
        {inline_data: {mime_type: 'video/mp4', data: fs.readFileSync(local).toString('base64')}, video_metadata: {fps: 4}},
        {text: pedido},
      ]}],
      generationConfig: {responseMimeType: 'application/json', temperature: 0.2},
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const texto = (await r.json()).candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return JSON.parse(texto);
}

const resumen = [];
for (const dir of principal ? await list('') : []) {
  if (dir.id) continue;
  for (const f of await list(dir.name)) {
    if (!f.id || !/\.(mp4|mov|webm|mkv)$/i.test(f.name)) continue;
    const rel = `${dir.name}/${f.name}`;
    const local = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(local), {recursive: true});
    const r = await sb(`/storage/v1/object/clips-media/${rel.split('/').map(encodeURIComponent).join('/')}`);
    fs.writeFileSync(local, Buffer.from(await r.arrayBuffer()));
    const dur = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', local]).stdout) || 0;
    const paso = dur > 240 ? 4 : 2;
    const cuadros = Math.max(1, Math.ceil(dur / paso));
    const filas = Math.ceil(cuadros / 6);
    const salida = path.join(dest, `${rel}.jpg`);
    fs.mkdirSync(path.dirname(salida), {recursive: true});
    const vf = `fps=1/${paso},scale=240:-2,drawtext=text='%{pts\\:hms}':x=5:y=5:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=4,tile=6x${filas}`;
    const res = run('ffmpeg', ['-loglevel', 'error', '-y', '-i', local, '-vf', vf, '-frames:v', '1', '-q:v', '5', salida]);
    if (res.status !== 0) { console.log(`No se pudo indexar ${rel}: ${res.stderr.slice(0, 300)}`); continue; }
    const tramos = ritmo(local, paso, dur);
    fs.writeFileSync(`${salida}.json`, JSON.stringify(tramos));
    let vistas = '';
    try {
      const e = await escenas(local);
      if (e) { fs.writeFileSync(`${salida}.escenas.json`, JSON.stringify(e, null, 1)); vistas = ` · Gemini: ${e.length} escenas`; }
    } catch (err) {
      console.log(`Gemini no pudo con ${rel}: ${err.message}`);
      vistas = ' · Gemini: falló';
    }
    const top = [...tramos].sort((x, y) => y.movimiento - x.movimiento).slice(0, 5).map((x) => `${x.t}s (${x.movimiento})`).join(', ');
    resumen.push(`- \`${rel}\` · ${Math.round(dur)} s · un cuadro cada ${paso} s · más movimiento en: ${top}${vistas}`);
    console.log(`Indexado ${rel} (${Math.round(dur)} s)`);
  }
}
if (principal) fs.mkdirSync(dest, {recursive: true});
if (principal) fs.writeFileSync(path.join(dest, 'LEEME.md'), `# Índice de medios\n\nHojas de contacto de los videos subidos desde el panel. Cada cuadro lleva su tiempo.\n\n${resumen.join('\n') || 'Sin videos todavía.'}\n`);
