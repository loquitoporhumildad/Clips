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
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY');

const sb = async (p, init = {}) => {
  const r = await fetch(`${SUPABASE_URL}${p}`, {...init, headers: {apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, ...(init.headers ?? {})}});
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`);
  return r;
};
const list = async (prefix) => (await sb('/storage/v1/object/list/clips-media', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({prefix, limit: 200})})).json();
const run = (cmd, args) => spawnSync(cmd, args, {encoding: 'utf8'});

const resumen = [];
for (const dir of await list('')) {
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
    resumen.push(`- \`${rel}\` · ${Math.round(dur)} s · un cuadro cada ${paso} s`);
    console.log(`Indexado ${rel} (${Math.round(dur)} s)`);
  }
}
fs.mkdirSync(dest, {recursive: true});
fs.writeFileSync(path.join(dest, 'LEEME.md'), `# Índice de medios\n\nHojas de contacto de los videos subidos desde el panel. Cada cuadro lleva su tiempo.\n\n${resumen.join('\n') || 'Sin videos todavía.'}\n`);
