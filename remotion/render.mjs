// Renderiza todos los videos de un día y (si hay credenciales) los sube a
// Supabase y avisa por Discord.
// Uso: node render.mjs [YYYY-MM-DD]   (por defecto: hoy en Panamá)
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

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

console.log(`Empaquetando Remotion…`);
const serveUrl = await bundle({entryPoint: path.join(here, 'src/index.ts')});

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

// --- Supabase (opcional) ---
const sb = async (p, init) => {
  const r = await fetch(`${SUPABASE_URL}${p}`, {
    ...init,
    headers: {apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, ...(init.headers ?? {})},
  });
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`);
  return r;
};

if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  for (const d of done) {
    const key = `${date}/${path.basename(d.file)}`;
    await sb(`/storage/v1/object/videos/${key}`, {
      method: 'POST',
      headers: {'Content-Type': 'video/mp4', 'x-upsert': 'true'},
      body: fs.readFileSync(d.file),
    });
    await sb(`/rest/v1/videos?on_conflict=day,spec_id,lang`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates'},
      body: JSON.stringify({
        day: date,
        spec_id: d.spec.id,
        brand: d.spec.brand,
        lang: d.lang,
        account: d.spec.accounts?.[d.lang] ?? null,
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
