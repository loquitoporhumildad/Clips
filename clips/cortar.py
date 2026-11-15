"""Cortador de streams para Clip Vault.

Entra el link de un stream (o un archivo), salen clips verticales con subtítulos.

Cómo elige los momentos, sin pagar ninguna API:
  1. Chat: baja el chat del directo y cuenta reacciones cada 10 s. Donde el chat
     se dispara hay un momento; como el chat reacciona tarde, el clip arranca
     20 s antes del pico.
  2. Audio: mide el volumen segundo a segundo; un momento es donde el streamer
     sube la voz muy por encima de como venía hablando (grito, risa, susto).
     Se usa para completar, o solo, si el chat no se puede bajar.
  3. De cada momento baja solo ese pedazo de video, lo transcribe con
     faster-whisper y ajusta el corte para no partir una frase.
  4. Lo pasa a 9:16 y le quema subtítulos palabra por palabra.

Uso: python clips/cortar.py   (todo por variables de entorno, ver CONFIG)
Solo para streams con campaña abierta o permiso del streamer.
"""
import json
import os
import re
import statistics
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

E = os.environ.get
URL = E('CLIP_URL', '')
N = int(E('CLIP_CANTIDAD') or 5)
DUR = int(E('CLIP_DURACION') or 35)            # segundos por clip
MODO = E('CLIP_MODO') or 'recorte'             # recorte (centro) | relleno (video completo sobre fondo borroso)
CAMPANA = E('CLIP_CAMPANA') or ''
DESDE = float(E('CLIP_DESDE_MIN') or 0)        # minuto del stream donde empezar a buscar
HASTA = float(E('CLIP_HASTA_MIN') or 0)        # 0 = hasta el final
OWNER = E('CLIP_OWNER') or 'juan'
MODELO = E('WHISPER_MODEL') or 'small'
SIN_VOZ = E('CLIP_SIN_TRANSCRIBIR') == '1'     # para pruebas sin faster-whisper
COOKIES = E('YTDLP_COOKIES_FILE') or ''
CHAT = E('CLIP_CHAT') != '0'                   # 0 = no usar el chat
CHAT_ARCHIVO = E('CLIP_CHAT_FILE') or ''        # JSON [{"t": segundos, "m": "mensaje"}] ya bajado
ADELANTO = 20                                  # el chat reacciona tarde: empezar 20 s antes del pico
MARGEN = 4                                     # segundos extra a cada lado para ajustar a frases

hoy = (datetime.now(timezone.utc) - timedelta(hours=5)).strftime('%Y-%m-%d')   # fecha de Panamá
raiz = Path(__file__).resolve().parent.parent
out = raiz / 'out' / 'clips' / hoy
tmp = raiz / 'out' / 'clips' / 'tmp'
out.mkdir(parents=True, exist_ok=True)
tmp.mkdir(parents=True, exist_ok=True)
local = Path(URL).exists()


def run(args, **kw):
    r = subprocess.run(args, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise RuntimeError(f"{args[0]} falló:\n{r.stderr[-1500:]}")
    return r


def ytdlp(*args):
    base = ['yt-dlp', '--no-warnings', '--no-playlist']
    if COOKIES:
        base += ['--cookies', COOKIES]
    return run(base + list(args))


def hms(s):
    s = int(s)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


# ---------- 1. Audio y volumen por segundo ----------
def bajar_audio():
    if local:
        return Path(URL), {'title': Path(URL).stem, 'uploader': '', 'webpage_url': URL}
    info = json.loads(ytdlp('-J', URL).stdout)
    destino = tmp / 'audio.%(ext)s'
    args = ['-f', 'bestaudio/audio_only/worst', '-o', str(destino)]
    if DESDE or HASTA:
        fin = hms(HASTA * 60) if HASTA else 'inf'
        args += ['--download-sections', f"*{hms(DESDE * 60)}-{fin}"]
    ytdlp(*args, URL)
    return next(tmp.glob('audio.*')), info


def volumen(audio):
    """dB RMS de cada segundo."""
    r = run(['ffmpeg', '-loglevel', 'error', '-i', str(audio), '-vn', '-af',
             'aresample=16000,asetnsamples=n=16000:p=0,astats=metadata=1:reset=1,'
             'ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-', '-f', 'null', '-'])
    v = []
    for m in re.finditer(r'RMS_level=(-?[\d.]+|-inf)', r.stdout):
        v.append(-90.0 if m.group(1) == '-inf' else float(m.group(1)))
    return v


# ---------- 2. Momentos ----------
REACCION = re.compile(r"(?i)\b(l+o+l+|lmf?ao+|(ja|ha|je|ka){2,}\w*|kekw+|omegalul|lul+w*|pog\w*|w+|clip( it| that)?|"
                      r"no way|wtf|omg|bro+|xd+|holy|insane|goat|nooo+|que+|dios)\b|[😂🤣💀😭🔥]")


def bajar_chat():
    """Mensajes del chat como [(segundo, texto)]. Vacío si no se puede."""
    try:
        if CHAT_ARCHIVO:
            return [(float(x['t']), str(x.get('m', ''))) for x in json.loads(Path(CHAT_ARCHIVO).read_text())]
        if local or not CHAT:
            return []
        from chat_downloader import ChatDownloader          # github.com/xenova/chat-downloader (MIT)
        kw = {}
        if DESDE:
            kw['start_time'] = DESDE * 60
        if HASTA:
            kw['end_time'] = HASTA * 60
        msgs = []
        for m in ChatDownloader().get_chat(URL, **kw):
            t = m.get('time_in_seconds')
            if t is not None and t >= 0:
                msgs.append((float(t), m.get('message') or ''))
        return msgs
    except Exception as e:
        print(f"Chat no disponible ({str(e)[:200]}): sigo solo con el audio")
        return []


def momentos_chat(msgs):
    """Picos del chat en tramos de 10 s contra los 5 min anteriores."""
    if len(msgs) < 50:
        return []
    paso = 10
    n = int(max(t for t, _ in msgs) // paso) + 1
    fuerza = [0.0] * n
    for t, m in msgs:
        fuerza[int(t // paso)] += 1 + (2 if REACCION.search(m) else 0)     # una reacción vale triple
    picos = []
    for i in range(6, n):
        antes = fuerza[max(0, i - 30):i]
        med = statistics.median(antes)
        var = statistics.pstdev(antes) or 1
        z = (fuerza[i] - med) / max(var, 1)
        if z >= 3 and fuerza[i] >= 8:
            picos.append((z, i))
    res = []
    for z, i in sorted(picos, reverse=True):
        ini = max(0, i * paso - ADELANTO)
        if any(abs(ini - r['inicio']) < DUR * 2 for r in res):
            continue
        res.append({'pico': i * paso, 'inicio': ini, 'fin': ini + DUR, 'puntos': round(z, 1), 'fuente': 'chat'})
        if len(res) == N:
            break
    return res


def momentos(v):
    """Picos de emoción: volumen de 3 s contra la mediana de los 2 min anteriores."""
    n = len(v)
    suave = [statistics.fmean(v[max(0, i - 1):i + 2]) for i in range(n)]
    emocion = []
    for i in range(n):
        antes = suave[max(0, i - 120):i] or [suave[i]]
        emocion.append(suave[i] - statistics.median(antes))
    # el clip arranca antes del pico: la gracia es la subida y la reacción
    orden = sorted(range(n), key=lambda i: emocion[i], reverse=True)
    elegidos = []
    for i in orden:
        if len(elegidos) == N:
            break
        if i < DUR * 0.65 or emocion[i] < 3:           # menos de 3 dB sobre lo normal no es un momento
            continue
        if any(abs(i - j) < DUR * 2 for j, _ in elegidos):
            continue
        elegidos.append((i, emocion[i]))
    base = 0 if local else DESDE * 60
    res = []
    for pico, punt in elegidos:
        ini = max(0, pico - DUR * 0.65)
        res.append({'pico': base + pico, 'inicio': base + ini, 'fin': base + ini + DUR, 'puntos': round(punt, 1), 'fuente': 'audio'})
    return res


# ---------- 3. Pedazo de video + transcripción ----------
def bajar_tramo(m, i):
    a, b = max(0, m['inicio'] - MARGEN), m['fin'] + MARGEN
    seg = tmp / f'tramo{i}.mp4'
    seg.unlink(missing_ok=True)
    if local:
        run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(a), '-t', str(b - a), '-i', URL,
             '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', str(seg)])
    else:
        ytdlp('-f', 'bv*[height<=1080]+ba/b[height<=1080]/b', '--download-sections', f"*{hms(a)}-{hms(b)}",
              '--force-keyframes-at-cuts', '--merge-output-format', 'mp4', '-o', str(seg), URL)
    return seg, m['inicio'] - a


_whisper = None


def transcribir(seg):
    """Lista de palabras {t0, t1, w} y de frases {t0, t1}."""
    global _whisper
    if SIN_VOZ:
        return [], [], ''
    from faster_whisper import WhisperModel
    if _whisper is None:
        _whisper = WhisperModel(MODELO, device='cpu', compute_type='int8')
    segs, info = _whisper.transcribe(str(seg), word_timestamps=True, vad_filter=True)
    palabras, frases = [], []
    for s in segs:
        frases.append({'t0': s.start, 't1': s.end})
        for w in s.words or []:
            palabras.append({'t0': w.start, 't1': w.end, 'w': w.word.strip()})
    return palabras, frases, info.language


def ajustar(frases, ini, largo):
    """Mueve inicio y fin al borde de frase más cercano dentro del margen."""
    fin = ini + largo
    i2 = min((f['t0'] for f in frases if abs(f['t0'] - ini) <= MARGEN), key=lambda t: abs(t - ini), default=ini)
    f2 = min((f['t1'] for f in frases if abs(f['t1'] - fin) <= MARGEN), key=lambda t: abs(t - fin), default=fin)
    return max(0, i2 - 0.15), f2 + 0.25


# ---------- 4. Subtítulos y vertical ----------
def t_ass(s):
    s = max(0, s)
    return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"


def subtitulos(palabras, ini, fin, archivo):
    """Grupos de hasta 3 palabras; la que se está diciendo va en amarillo."""
    cab = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: S,Montserrat ExtraBold,86,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,7,3,2,70,70,520,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ws = [w for w in palabras if w['t1'] > ini and w['t0'] < fin and w['w']]
    grupos, g = [], []
    for w in ws:
        corta = g and (len(g) == 3 or sum(len(x['w']) for x in g) + len(w['w']) > 16 or w['t0'] - g[-1]['t1'] > 0.7)
        if corta:
            grupos.append(g)
            g = []
        g.append(w)
    if g:
        grupos.append(g)
    lineas = []
    for gi, g in enumerate(grupos):
        tope = grupos[gi + 1][0]['t0'] if gi + 1 < len(grupos) else g[-1]['t1'] + 0.3
        for k, w in enumerate(g):
            a = w['t0'] - ini
            b = (g[k + 1]['t0'] if k + 1 < len(g) else min(tope, g[-1]['t1'] + 0.3)) - ini
            if b <= a:
                continue
            txt = ' '.join(
                ('{\\c&H00E5FF&}' + x['w'].upper() + '{\\c&HFFFFFF&}') if j == k else x['w'].upper()
                for j, x in enumerate(g)).replace('\n', ' ')
            pop = '{\\fscx92\\fscy92\\t(0,90,\\fscx100\\fscy100)}' if k == 0 else ''
            lineas.append(f"Dialogue: 0,{t_ass(a)},{t_ass(b)},S,,0,0,0,,{pop}{txt}")
    archivo.write_text(cab + '\n'.join(lineas) + '\n', encoding='utf-8')
    return ' '.join(w['w'] for w in ws)


def vertical(seg, ini, fin, ass, destino):
    subs = f"subtitles='{ass.as_posix()}'" if ass else 'null'
    if MODO == 'relleno':
        vf = ("[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:4,eq=brightness=-0.12[bg];"
              f"[b]scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2-140,{subs},fps=30[v]")
    else:
        vf = f"[0:v]scale=-2:1920,crop=1080:1920,{subs},fps=30[v]"
    run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{ini:.2f}', '-t', f'{fin - ini:.2f}', '-i', str(seg),
         '-filter_complex', vf, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
         '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(destino)])


# ---------- 5. Supabase y Discord ----------
def http(url, data, headers):
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def subir(c):
    base, key = E('SUPABASE_URL'), E('SUPABASE_SERVICE_KEY')
    if not (base and key):
        return False
    auth = {'apikey': key, 'Authorization': f'Bearer {key}'}
    ruta = f"{hoy}/{c['archivo'].name}"
    http(f"{base}/storage/v1/object/clips-videos/{ruta}", c['archivo'].read_bytes(),
         {**auth, 'Content-Type': 'video/mp4', 'x-upsert': 'true'})
    fila = {'day': hoy, 'spec_id': c['id'], 'brand': 'clips', 'lang': c['idioma'] or 'en', 'account': 'Clip Vault',
            'owner': OWNER, 'storage_path': ruta, 'title': c['titulo'], 'description': c['descripcion'],
            'hashtags': [], 'notes': c['notas']}
    http(f"{base}/rest/v1/clips_videos?on_conflict=day,spec_id,lang", json.dumps(fila).encode(),
         {**auth, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'})
    return True


def main():
    if not URL:
        sys.exit('Falta CLIP_URL')
    audio, info = bajar_audio()
    v = volumen(audio)
    msgs = bajar_chat()
    ms = momentos_chat(msgs)
    for m in momentos(v):                              # el audio completa lo que el chat no dio
        if len(ms) < N and all(abs(m['inicio'] - x['inicio']) >= DUR * 2 for x in ms):
            ms.append(m)
    porchat = sum(1 for m in ms if m['fuente'] == 'chat')
    print(f"{len(v) / 60:.0f} min analizados, {len(msgs)} mensajes de chat, {len(ms)} momentos ({porchat} por chat)")
    if not ms:
        sys.exit('No encontré momentos claros. Prueba con otro tramo o baja CLIP_DURACION.')
    slug = re.sub(r'[^a-z0-9]+', '-', (info.get('uploader') or info.get('title') or 'stream').lower()).strip('-')[:30]
    hechos = []
    for i, m in enumerate(sorted(ms, key=lambda x: x['inicio']), 1):
        try:
            seg, ini = bajar_tramo(m, i)
            palabras, frases, idioma = transcribir(seg)
            a, b = ajustar(frases, ini, DUR)
            ass = None
            texto = ''
            if palabras:
                ass = tmp / f'subs{i}.ass'
                texto = subtitulos(palabras, a, b, ass)
            cid = f"clip-{slug}-{int(m['inicio'])}"
            destino = out / f"{cid}.mp4"
            vertical(seg, a, b, ass, destino)
            quien = info.get('uploader') or ''
            hechos.append({
                'id': cid, 'archivo': destino, 'idioma': idioma,
                'titulo': (texto[:70] + '…') if len(texto) > 70 else (texto or f"Momento {hms(m['inicio'])}"),
                'descripcion': f"{quien} · {info.get('title', '')}".strip(' ·'),
                'notas': (f"Campaña: {CAMPANA or 'SIN CAMPAÑA: no publicar hasta confirmar permiso'}. "
                          f"Minuto del stream {hms(m['inicio'])}, elegido por {m['fuente']} (fuerza {m['puntos']}). "
                          f"Fuente: {info.get('webpage_url', URL)}. Dice: \"{texto[:300]}\""),
            })
            print(f"  {cid}  {hms(m['inicio'])}  {m['fuente']} {m['puntos']}")
        except Exception as e:                       # un clip que falla no tumba los demás
            print(f"  momento {hms(m['inicio'])} falló: {e}")
    subidos = sum(1 for c in hechos if subir(c))
    (out / 'clips.json').write_text(json.dumps([{**c, 'archivo': c['archivo'].name} for c in hechos], ensure_ascii=False, indent=2))
    hook = E('DISCORD_WEBHOOK')
    if hook and hechos:
        lista = '\n'.join(f"• {c['titulo']}" for c in hechos)
        http(hook, json.dumps({'content': f"✂️ {len(hechos)} clips de **{info.get('uploader') or slug}** listos en el panel ({CAMPANA or 'sin campaña'})\n{lista}"}).encode(),
             {'Content-Type': 'application/json', 'User-Agent': 'clips-bot'})
    print(f"Listo: {len(hechos)} clips en {out} ({subidos} subidos)")
    if not hechos:
        sys.exit(1)


if __name__ == '__main__':
    main()
