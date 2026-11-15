# Clips

Fábrica de videos cortos (TikTok, Instagram Reels, YouTube Shorts).

- `content/AAAA-MM-DD/*.json` — guiones y datos del día (los escribe Claude en la sesión nocturna).
- `remotion/` — plantillas de animación y `render.mjs`.
- `.github/workflows/render.yml` — renderiza al subir contenido y cada día a las 6:00 a. m. (Panamá).
- `supabase/schema.sql` — tablas del proyecto Supabase `clips`.
- `CLAUDE.md` — contexto del proyecto.

## Render local
```
cd remotion && npm ci && node render.mjs 2026-11-14
```
Los MP4 y sus textos quedan en `out/AAAA-MM-DD/`.

## Secretos (Settings → Secrets and variables → Actions)
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DISCORD_WEBHOOK`. Sin ellos el workflow igual
renderiza y deja los videos como artefacto descargable de la ejecución.
