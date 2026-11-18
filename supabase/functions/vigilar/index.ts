// Lanza el workflow "Vigilar directo" de GitHub desde la página de clips.
// Secretos (se cargan solos con el workflow "Supabase: aplicar" desde GitHub Secrets, nunca por chat):
//   GH_TARGETS = {"juan":{"repo":"loquitoporhumildad/Clips","token":"..."},"socio":{"repo":"<usuario>/Clips","token":"..."}}
//   GH_TOKEN_SOCIO / GH_REPO_SOCIO = llave del socio aparte (sin reescribir GH_TARGETS)
//   CUOTA_MIN  = minutos gratis al mes por repo (default 2000)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const OK_URL = /^https:\/\/(www\.)?(twitch\.tv|kick\.com|youtube\.com|youtu\.be)\/\S+$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const body = await req.json().catch(() => ({}));

  let targets: Record<string, { repo: string; token: string }> = {};
  try { targets = JSON.parse(Deno.env.get("GH_TARGETS") || "{}"); } catch { /* secreto mal escrito */ }
  const tokSocio = Deno.env.get("GH_TOKEN_SOCIO");
  if (tokSocio && !targets.socio) targets.socio = { repo: Deno.env.get("GH_REPO_SOCIO") || "Luis00-YVL/Clips", token: tokSocio };
  const cuota = Number(Deno.env.get("CUOTA_MIN") || 2000);
  if (body.accion === "ping") return json({ ok: true, listos: Object.keys(targets), cuota });

  if (body.accion === "titulo") {
    const t0 = targets[body.owner === "socio" ? "socio" : "juan"];
    if (!t0) return json({ error: "Falta conectar GitHub. Mira la pestaña Cómo funciona." }, 503);
    const id = String(Number(body.id) || "");
    if (!id) return json({ error: "Falta el video." }, 400);
    const r0 = await fetch(`https://api.github.com/repos/${t0.repo}/actions/workflows/titulo.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t0.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "clips-panel" },
      body: JSON.stringify({ ref: "main", inputs: { video_id: id, titulo: String(body.texto ?? "").trim().slice(0, 90) } }),
    });
    return r0.status === 204 ? json({ ok: true }) : json({ error: `GitHub ${r0.status}: ${(await r0.text()).slice(0, 200)}` }, 502);
  }

  const urls: string[] = (body.urls ?? []).map((u: string) => String(u).trim()).filter(Boolean);
  const owner = body.owner === "socio" ? "socio" : "juan";
  const cuenta = body.cuenta === "PeakClips" ? "PeakClips" : "Clip Vault";
  const campana = String(body.campana || (cuenta === "PeakClips" ? "Crecimiento sin campaña" : "")).trim();
  const minutos = Math.min(330, Math.max(30, Math.round(Number(body.minutos) || 330)));
  const hasta = body.hasta_utc ? new Date(body.hasta_utc) : null;

  if (!urls.length) return json({ error: "Falta al menos un link." }, 400);
  if (urls.some((u) => !OK_URL.test(u))) return json({ error: "Solo links de Twitch, Kick o YouTube (https)." }, 400);
  if (cuenta === "Clip Vault" && !campana) return json({ error: "Clip Vault necesita campaña o permiso." }, 400);
  if (hasta && isNaN(hasta.getTime())) return json({ error: "Fecha límite inválida." }, 400);
  const t = targets[owner];
  if (!t) return json({ error: `Falta conectar GitHub para ${owner}. Mira la pestaña Cómo funciona.` }, 503);

  const base = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = (path: string, init: RequestInit = {}) =>
    fetch(`${base}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
    });

  // Cuota del mes: minutos ya reservados por este dueño.
  const mes = new Date(); mes.setUTCDate(1); mes.setUTCHours(0, 0, 0, 0);
  const prev = await (await sb(`clips_vigilar?select=minutos&owner=eq.${owner}&estado=neq.error&created_at=gte.${mes.toISOString()}`)).json();
  const usados = Array.isArray(prev) ? prev.reduce((a: number, r: { minutos: number }) => a + r.minutos, 0) : 0;
  // Si hay hora límite, el vigilante se reencadena: cada tanda de `minutos` gasta minutos del mes.
  const tandas = hasta ? Math.max(1, Math.ceil((hasta.getTime() - Date.now()) / (minutos * 60000))) : 1;
  const reservar = minutos * tandas;
  const pedidos = reservar * urls.length;
  if (!body.forzar && usados + pedidos > cuota) {
    return json({ error: `Con esto pasarías de ${cuota} minutos este mes (llevas ${usados} reservados, pedirías ${pedidos}). Baja los minutos o repártelo con el otro socio.`, usados, cuota }, 409);
  }

  const resultados = [];
  for (const url of urls) {
    const ins = await (await sb("clips_vigilar", { method: "POST", body: JSON.stringify({ owner, cuenta, url, campana, minutos: reservar, hasta_utc: hasta?.toISOString() ?? null, estado: "pendiente" }) })).json();
    const fila = Array.isArray(ins) ? ins[0] : null;
    if (!fila) { resultados.push({ url, error: "No pude guardar el registro." }); continue; }
    const r = await fetch(`https://api.github.com/repos/${t.repo}/actions/workflows/vivo.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "clips-panel" },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          urls: url, campana, cuenta, owner, registro: String(fila.id), minutos: String(minutos),
          hasta_utc: hasta ? hasta.toISOString().slice(0, 16) : "",
        },
      }),
    });
    if (r.status === 204) {
      await sb(`clips_vigilar?id=eq.${fila.id}`, { method: "PATCH", body: JSON.stringify({ estado: "lanzado", actualizado: new Date().toISOString() }) });
      resultados.push({ url, id: fila.id, ok: true });
    } else {
      const detalle = `GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`;
      await sb(`clips_vigilar?id=eq.${fila.id}`, { method: "PATCH", body: JSON.stringify({ estado: "error", detalle, actualizado: new Date().toISOString() }) });
      resultados.push({ url, id: fila.id, error: detalle });
    }
  }
  return json({ ok: resultados.every((x) => "ok" in x), resultados, usados: usados + pedidos, cuota });
});
