// Renderiza todos los videos de un día y (si hay credenciales) los sube a
// Supabase y avisa por Discord.
// Uso: node render.mjs [YYYY-MM-DD]   (por defecto: hoy en Panamá)
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeAudio} from './audio.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Panama'}).format(new Date());
const date = process.argv[2] || today;
const dir = path.join(root, 'content', date);
const outDir = path.join(root, 'out', date);

const {SUPABASE_URL, SUPABASE_SERVICE_KEY, DISCORD_WEBHOOK, CHROME_PATH} = process.env;

if (!fs.existsSync(dir)) {
  console.log(`No hay contenido para ${date} (${dir}).`);
  process.exit(0);
}
fs.mkdirSync(outDir, {recursive: true});

const specs = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

// --- Supabase ---
const sb = async (p, init = {}) => {
  const r = await fetch(`${SUPABASE_URL}${p}`, {
    ...init,
    headers: {apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, ...(init.headers ?? {})},
  });
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`);
  return r;
};
const hasSb = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

const pub = path.join(here, 'public');
const media = path.join(pub, 'media');
fs.mkdirSync(path.join(pub, 'audio'), {recursive: true});
fs.mkdirSync(media, {recursive: true});

// Baja lo que se subió desde la página (bucket clips-media) a public/media.
if (hasSb) {
  const list = async (prefix) =>
    (await sb('/storage/v1/object/list/clips-media', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({prefix, limit: 200}),
    })).json();
  try {
    for (const dirEntry of await list('')) {
      if (dirEntry.id) continue; // archivo suelto en la raíz: se ignora
      for (const f of await list(dirEntry.name)) {
        if (!f.id) continue;
        const rel = `${dirEntry.name}/${f.name}`;
        const dest = path.join(media, rel);
        if (fs.existsSync(dest)) continue;
        fs.mkdirSync(path.dirname(dest), {recursive: true});
        const r = await sb(`/storage/v1/object/clips-media/${rel.split('/').map(encodeURIComponent).join('/')}`);
        fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
        console.log(`Medio descargado: ${rel}`);
      }
    }
  } catch (e) {
    console.log(`No se pudieron bajar los medios: ${e.message}`);
  }
}

const filesIn = (sub, re) => {
  const d = path.join(media, sub);
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => re.test(f)).sort().map((f) => `${sub}/${f}`) : [];
};
const hash = (str) => [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

for (const spec of specs) {
  // Fondos: si la marca tiene clips/imágenes, se reparten entre las escenas sin fondo.
  const pool = filesIn(spec.brand ?? '', /\.(mp4|webm|mov|jpe?g|png|webp)$/i);
  let k = hash(spec.id);
  for (const s of spec.scenes) {
    if (s.bg && !fs.existsSync(path.join(media, s.bg))) {
      console.log(`Fondo no encontrado: ${s.bg}`);
      delete s.bg;
    }
    if (!s.bg && pool.length && spec.autoBg !== false) s.bg = pool[k++ % pool.length];
  }
  // Música: la que pida el guion, o una de public/media/music elegida por día.
  const tracks = filesIn('music', /\.(mp3|wav|m4a|ogg)$/i);
  if (spec.music && spec.music !== 'auto' && !fs.existsSync(path.join(media, spec.music))) delete spec.music;
  if ((!spec.music || spec.music === 'auto') && tracks.length && spec.music !== false) spec.music = tracks[hash(spec.id) % tracks.length];
  if (spec.music === 'auto' || spec.music === false) delete spec.music;
  if (spec.audio !== false) makeAudio(spec, path.join(pub, 'audio', `${spec.id}.wav`), {drums: !spec.music});
  console.log(`${spec.id}: música=${spec.music ?? 'beat propio'}, fondos=${spec.scenes.filter((s) => s.bg).length}/${spec.scenes.length}`);
}

console.log(`Empaquetando Remotion…`);
const serveUrl = await bundle({entryPoint: path.join(here, 'src/index.ts'), publicDir: pub});

const done = [];
for (const spec of specs) {
  for (const lang of spec.langs) {
    const inputProps = {spec, lang};
    const composition = await selectComposition({serveUrl, id: 'DataShort', inputProps, browserExecutable: CHROME_PATH});
    const file = path.join(outDir, `${spec.id}-${lang}.mp4`);
    console.log(`Renderizando ${spec.id} (${lang})…`);
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: file,
      inputProps,
      browserExecutable: CHROME_PATH,
      x264Preset: 'veryfast',
      crf: 20,
    });
    const meta = spec.meta?.[lang] ?? {};
    const caption = [meta.title, '', meta.description, '', (meta.hashtags ?? []).join(' ')].join('\n');
    fs.writeFileSync(file.replace(/\.mp4$/, '.txt'), caption);
    done.push({spec, lang, file, meta});
  }
}

// --- Subida a Supabase (opcional) ---
if (hasSb) {
  for (const d of done) {
    const key = `${date}/${path.basename(d.file)}`;
    await sb(`/storage/v1/object/clips-videos/${key}`, {
      method: 'POST',
      headers: {'Content-Type': 'video/mp4', 'x-upsert': 'true'},
      body: fs.readFileSync(d.file),
    });
    await sb(`/rest/v1/clips_videos?on_conflict=day,spec_id,lang`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates'},
      body: JSON.stringify({
        day: date,
        spec_id: d.spec.id,
        brand: d.spec.brand,
        lang: d.lang,
        account: d.spec.accounts?.[d.lang] ?? null,
        owner: d.spec.owners?.[d.lang] ?? (d.lang === 'es' ? 'socio' : 'juan'),
        storage_path: key,
        title: d.meta.title ?? null,
        description: d.meta.description ?? null,
        hashtags: d.meta.hashtags ?? [],
        notes: d.spec.notes ?? null,
      }),
    });
    console.log(`Subido ${key}`);
  }
} else {
  console.log('Sin SUPABASE_URL/SUPABASE_SERVICE_KEY: los videos quedan solo en out/.');
}

// --- Discord (opcional) ---
if (DISCORD_WEBHOOK && done.length) {
  const lines = done.map((d) => `• **${d.spec.accounts?.[d.lang] ?? d.spec.brand}** (${d.lang}): ${d.meta.title ?? d.spec.id}`);
  await fetch(DISCORD_WEBHOOK, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({content: `🎬 ${done.length} videos listos para ${date}\n${lines.join('\n')}`}),
  });
}

console.log(`Listo: ${done.length} videos en ${outDir}`);
