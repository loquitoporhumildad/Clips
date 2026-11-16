// Busca los directos con más espectadores de la categoría GTA VI en Twitch y YouTube.
// Secretos (Supabase, Edge Functions, Secrets): TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, YOUTUBE_API_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function twitch(categoria: string, max: number) {
  const id = Deno.env.get("TWITCH_CLIENT_ID"), sec = Deno.env.get("TWITCH_CLIENT_SECRET");
  if (!id || !sec) throw new Error("Faltan TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET en Supabase.");
  const tk = await (await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: sec, grant_type: "client_credentials" }),
  })).json();
  if (!tk.access_token) throw new Error(`Twitch no dio token: ${tk.message ?? "revisa el Client ID y el Secret"}`);
  const h = { "Client-Id": id, Authorization: `Bearer ${tk.access_token}` };
  const cat = await (await fetch(`https://api.twitch.tv/helix/search/categories?query=${encodeURIComponent(categoria)}&first=5`, { headers: h })).json();
  const lista: { id: string; name: string }[] = cat.data ?? [];
  const juego = lista.find((c) => c.name.toLowerCase() === categoria.toLowerCase()) ?? lista[0];
  if (!juego) throw new Error(`Twitch no tiene la categoría "${categoria}".`);
  const st = await (await fetch(`https://api.twitch.tv/helix/streams?game_id=${juego.id}&first=${max}`, { headers: h })).json();
  return {
    categoria: juego.name,
    directos: (st.data ?? []).map((s: Record<string, unknown>) => ({
      canal: s.user_name, url: `https://www.twitch.tv/${s.user_login}`, espectadores: s.viewer_count,
      titulo: s.title, idioma: s.language,
    })),
  };
}

async function youtube(consulta: string, max: number) {
  const key = Deno.env.get("YOUTUBE_API_KEY");
  if (!key) throw new Error("Falta YOUTUBE_API_KEY en Supabase.");
  const q = new URLSearchParams({ part: "snippet", type: "video", eventType: "live", order: "viewCount", maxResults: String(max), q: consulta, key });
  const r = await (await fetch(`https://www.googleapis.com/youtube/v3/search?${q}`)).json();
  if (r.error) throw new Error(`YouTube: ${r.error.message}`);
  const ids = (r.items ?? []).map((i: { id: { videoId: string } }) => i.id.videoId);
  if (!ids.length) return { directos: [] };
  const v = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${ids.join(",")}&key=${key}`)).json();
  const directos = (v.items ?? []).map((i: Record<string, any>) => ({
    canal: i.snippet.channelTitle, url: `https://www.youtube.com/watch?v=${i.id}`,
    espectadores: Number(i.liveStreamingDetails?.concurrentViewers ?? 0), titulo: i.snippet.title,
    idioma: i.snippet.defaultAudioLanguage ?? i.snippet.defaultLanguage ?? "",
  })).sort((a: { espectadores: number }, b: { espectadores: number }) => b.espectadores - a.espectadores);
  return { directos };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({}));
  const categoria = String(body.categoria || "Grand Theft Auto VI");
  const max = Math.min(20, Math.max(3, Number(body.max) || 10));
  const [tw, yt] = await Promise.allSettled([twitch(categoria, max), youtube(`${categoria} live`, max)]);
  const salida = (p: PromiseSettledResult<any>) =>
    p.status === "fulfilled" ? p.value : { directos: [], error: String(p.reason?.message ?? p.reason) };
  return new Response(JSON.stringify({ twitch: salida(tw), youtube: salida(yt), kick: { directos: [], error: "Kick: por ahora manual." } }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
