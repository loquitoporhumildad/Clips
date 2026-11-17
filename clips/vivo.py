"""Vigilante de directos: entra a un stream en vivo y corta los momentos apenas pasan.

Qué hace, todo gratis y sin API de pago:
  1. Graba el directo con streamlink en pedazos de 10 s (se guardan solo ~20 min).
  2. Lee el chat en vivo (Twitch por IRC anónimo, YouTube con chat-downloader).
     En Kick u otras plataformas sin chat legible usa solo el audio.
  3. Cada 10 s mide la fuerza del chat (una reacción vale triple) y la compara con
     los 5 min anteriores. Si se dispara, o si el streamer sube la voz muy por
     encima de lo normal, es un momento.
  4. 15 s después del pico corta de 20 s antes a 15 s después, transcribe con
     faster-whisper, ajusta el corte a la frase, lo pasa a 9:16 con subtítulos
     palabra por palabra, lo sube al panel y avisa por Discord.

Variables de entorno (ver .github/workflows/vivo.yml):
  LIVE_ENTRADA   "link" o "link|campaña"  (la campaña o permiso es obligatoria para publicar)
  CLIP_CAMPANA   campaña por defecto
  LIVE_MINUTOS   cuánto vigilar (330 = 5 h 30 min, cabe en el límite de 6 h de Actions)
  LIVE_MAX       tope de clips por ejecución (default 60)
  LIVE_SIMULAR   archivo de video local para probar sin stream (con CLIP_CHAT_FILE para el chat)
Solo para streams con campaña abierta o permiso del streamer.
"""
import json
import os
import re
import socket
import ssl
import statistics
import subprocess
import sys
import threading
import traceback
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault('WHISPER_MODEL', 'base')       # en vivo importa la velocidad
os.environ.setdefault('CLIP_URL', 'vivo')
sys.path.insert(0, str(Path(__file__).resolve().parent))
import cortar as C                                    # noqa: E402  (reutiliza subtítulos, 9:16, subida)

E = os.environ.get
entrada = E('LIVE_ENTRADA', '')
URL, _, CAMP = entrada.partition('|')
URL = URL.strip()
CAMP = (CAMP.strip() or E('CLIP_CAMPANA') or '').strip()
MINUTOS = float(E('LIVE_MINUTOS') or 330)
MAXIMO = int(E('LIVE_MAX') or 60)
SIMULAR = E('LIVE_SIMULAR') or ''
DUR = C.DUR
ADELANTO = C.ADELANTO
POST = DUR - ADELANTO                                # segundos que se esperan después del pico
SEG = 10
# Sensibilidad del chat: LIVE_SENS=alta (por defecto, más clips, tú filtras) | media | baja (solo momentos muy claros)
Z_MIN, F_MIN, VECES = {'alta': (2.2, 5, 2.0), 'media': (3.0, 8, 2.5), 'baja': (4.0, 14, 3.5)}.get(E('LIVE_SENS') or 'alta', (2.2, 5, 2.0))
ENFRIAR = DUR * 2                                    # no repetir momento dentro de este margen
AUDIO_DB = 9                                         # subida de volumen que cuenta como momento

REGISTRO = E('LIVE_REGISTRO') or ''                  # fila de clips_vigilar (la crea la página)


def sigue_despues():
    """True si queda otra tanda encadenada (hay hora límite en el futuro)."""
    h = (E('LIVE_HASTA') or '').strip()[:16]
    try:
        import datetime as _d
        return _d.datetime.strptime(h, '%Y-%m-%dT%H:%M') > _d.datetime.utcnow()
    except ValueError:
        return False


def estado_panel(**campos):
    """Avisa a la página cómo va esta ejecución (estado, clips, minutos). Nunca tumba el vigilante."""
    base, key = E('SUPABASE_URL'), E('SUPABASE_SERVICE_KEY')
    if not (REGISTRO and base and key):
        return
    try:
        import urllib.request
        campos['actualizado'] = datetime.now(timezone.utc).isoformat()
        req = urllib.request.Request(f"{base}/rest/v1/clips_vigilar?id=eq.{REGISTRO}", data=json.dumps(campos).encode(),
                                     headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}, method='PATCH')
        urllib.request.urlopen(req, timeout=30).read()
    except Exception as e:
        print('no pude avisar al panel:', str(e)[:120], flush=True)


live = C.raiz / 'out' / 'vivo' / 'seg'
live.mkdir(parents=True, exist_ok=True)
for f in live.glob('*.ts'):
    f.unlink()

chat = deque()                                       # (epoch, texto)
chat_vivo = threading.Event()                        # llegó al menos un mensaje
parar = threading.Event()
t_inicio = time.time()


def log(*a):
    print(datetime.now(timezone.utc).strftime('%H:%M:%S'), *a, flush=True)


# ---------- Chat ----------
def canal_twitch(url):
    m = re.search(r'twitch\.tv/([A-Za-z0-9_]+)', url)
    return m.group(1).lower() if m else ''


def chat_twitch(canal):
    """IRC anónimo de Twitch (sin login ni clave)."""
    while not parar.is_set():
        try:
            s = socket.create_connection(('irc.chat.twitch.tv', 6697), timeout=30)
            s = ssl.create_default_context().wrap_socket(s, server_hostname='irc.chat.twitch.tv')
            s.settimeout(60)
            for linea in ('PASS SCHMOOPIIE', 'NICK justinfan48213', f'JOIN #{canal}'):
                s.sendall((linea + '\r\n').encode())
            buf = ''
            while not parar.is_set():
                buf += s.recv(8192).decode('utf-8', 'ignore')
                *lineas, buf = buf.split('\r\n')
                for ln in lineas:
                    if ln.startswith('PING'):
                        s.sendall(b'PONG :tmi.twitch.tv\r\n')
                    elif ' PRIVMSG ' in ln:
                        chat.append((time.time(), ln.split(' PRIVMSG ', 1)[1].split(' :', 1)[-1]))
                        chat_vivo.set()
        except Exception as e:
            log(f'chat Twitch reconectando ({str(e)[:80]})')
            time.sleep(5)


def chat_youtube(url):
    while not parar.is_set():
        try:
            from chat_downloader import ChatDownloader
            for m in ChatDownloader().get_chat(url, message_types=['text_message']):
                chat.append((time.time(), m.get('message') or ''))
                chat_vivo.set()
                if parar.is_set():
                    return
        except Exception as e:
            log(f'chat YouTube reconectando ({str(e)[:80]})')
            time.sleep(10)


def chat_simulado(archivo):
    """Reproduce un chat ya bajado [{"t": segundos, "m": "msg"}] al ritmo del video simulado."""
    msgs = sorted((float(x['t']), str(x.get('m', ''))) for x in json.loads(Path(archivo).read_text()))
    t0 = time.time()
    for t, m in msgs:
        while time.time() - t0 < t:
            if parar.is_set():
                return
            time.sleep(0.05)
        chat.append((time.time(), m))
        chat_vivo.set()


def arrancar_chat():
    if SIMULAR:
        if C.CHAT_ARCHIVO:
            threading.Thread(target=chat_simulado, args=(C.CHAT_ARCHIVO,), daemon=True).start()
        return 'simulado'
    if canal_twitch(URL):
        threading.Thread(target=chat_twitch, args=(canal_twitch(URL),), daemon=True).start()
        return 'Twitch'
    if 'youtube.com' in URL or 'youtu.be' in URL:
        threading.Thread(target=chat_youtube, args=(URL,), daemon=True).start()
        return 'YouTube'
    return ''                                         # Kick y otros: solo audio


# ---------- Grabación ----------
def lanzar_grabacion():
    env = {**os.environ, 'TZ': 'UTC'}
    seg = ['-c', 'copy', '-f', 'segment', '-segment_time', str(SEG), '-segment_format', 'mpegts',
           '-reset_timestamps', '1', '-strftime', '1', str(live / '%Y%m%d%H%M%S.ts')]
    if SIMULAR:
        return None, subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-re', '-i', SIMULAR, *seg], env=env)
    sl = subprocess.Popen(['streamlink', '--stdout', '--loglevel', 'error', '--twitch-disable-ads', URL, '720p60,720p,best'],
                          stdout=subprocess.PIPE, env=env)
    ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-i', 'pipe:0', *seg], stdin=sl.stdout, env=env)
    sl.stdout.close()
    return sl, ff


def segmentos():
    """[(inicio_epoch, archivo)] ordenados. El último puede estar incompleto."""
    res = []
    for f in live.glob('*.ts'):
        try:
            t = datetime.strptime(f.stem, '%Y%m%d%H%M%S').replace(tzinfo=timezone.utc).timestamp()
            res.append((t, f))
        except ValueError:
            pass
    return sorted(res)


def limpiar():
    corte = time.time() - 20 * 60
    for t, f in segmentos():
        if t < corte:
            f.unlink(missing_ok=True)


# ---------- Detección ----------
class Oido:
    """Volumen por segundo de los pedazos ya completos, para detectar gritos y risas."""

    def __init__(self):
        self.vistos = set()
        self.db = deque(maxlen=400)                  # (epoch, dB)

    def actualizar(self, segs):
        for (t, f), (t_sig, _) in zip(segs, segs[1:]):
            if f in self.vistos:
                continue
            self.vistos.add(f)
            try:
                v = C.volumen(f)
            except Exception:
                continue
            for k, x in enumerate(v):
                self.db.append((t + k, x))

    def pico(self):
        """(epoch, subida_dB) del último segundo si sube mucho sobre los 2 min anteriores."""
        d = list(self.db)
        if len(d) < 60:
            return None
        ult = d[-3:]
        antes = [x for _, x in d[-123:-3]]
        sube = statistics.fmean(x for _, x in ult) - statistics.median(antes)
        return (ult[-1][0], sube) if sube >= AUDIO_DB else None


def fuerza_chat(ini, fin):
    n = 0.0
    for _ in range(3):
        try:
            copia = list(chat)
            break
        except RuntimeError:
            copia = []
    for t, m in copia:
        if ini <= t < fin:
            n += 1 + (2 if C.REACCION.search(m) else 0)
    return n


class Chat:
    def __init__(self):
        self.hist = deque(maxlen=30)                 # fuerza de los últimos 30 tramos de 10 s
        self.ultimo = int(time.time() // 10)

    def revisar(self):
        """Devuelve (epoch_del_pico, z) cuando el último tramo completo se dispara."""
        ahora = int(time.time() // 10)
        res = None
        while self.ultimo < ahora - 1:
            self.ultimo += 1
            f = fuerza_chat(self.ultimo * 10, self.ultimo * 10 + 10)
            if len(self.hist) >= 6:
                med = statistics.median(self.hist)
                z = (f - med) / max(statistics.pstdev(self.hist), 1)
                if z >= Z_MIN and f >= F_MIN and f >= VECES * max(med, 1):
                    res = (self.ultimo * 10 + 10, z)
            self.hist.append(f)
        while chat and chat[0][0] < time.time() - 900:
            chat.popleft()
        return res


# ---------- Contexto para el título ----------
def chat_del_momento(pico, n=25):
    """Mensajes del chat de 25 s antes a 10 s después del pico: lo que la gente reaccionó. Los más repetidos primero."""
    for _ in range(3):
        try:
            copia = list(chat)
            break
        except RuntimeError:
            copia = []
    else:
        copia = []
    cuenta = {}
    for t, m in copia:
        if pico - 25 <= t <= pico + 10:
            m = m.strip()[:80]
            if m:
                cuenta[m] = cuenta.get(m, 0) + 1
    orden = sorted(cuenta, key=lambda m: -cuenta[m])[:n]
    return ' | '.join(f'{m} (x{cuenta[m]})' if cuenta[m] > 1 else m for m in orden)


_meta = {}


def datos_directo():
    """Título y categoría del directo (best-effort con streamlink; vacío si no se puede)."""
    if 'listo' in _meta:
        return _meta.get('txt', '')
    _meta['listo'] = 1
    if SIMULAR:
        return ''
    try:
        r = subprocess.run(['streamlink', '--json', URL], capture_output=True, text=True, timeout=40)
        md = (json.loads(r.stdout or '{}').get('metadata') or {})
        _meta['txt'] = ' · '.join(str(md[k]) for k in ('author', 'category', 'title') if md.get(k))
    except Exception:
        _meta['txt'] = ''
    return _meta['txt']


# ---------- Corte ----------
def cortar(pico, fuente, puntos, n):
    a, b = pico - ADELANTO, pico + POST
    segs = [(t, f) for t, f in segmentos() if t + SEG > a - C.MARGEN and t < b + C.MARGEN]
    if len(segs) < 2:
        log('  sin segmentos suficientes para ese momento')
        return None
    lista = C.tmp / f'vivo{n}.txt'
    lista.write_text(''.join(f"file '{f.as_posix()}'\n" for _, f in segs))
    tramo = C.tmp / f'vivo{n}.ts'
    C.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(lista), '-c', 'copy', str(tramo)])
    ini = max(0, a - segs[0][0])
    palabras, frases, idioma = C.transcribir(tramo)
    i2, f2 = C.ajustar(frases, ini, DUR)
    ass, texto = None, ''
    if palabras:
        ass = C.tmp / f'vivo{n}.ass'
        texto = C.subtitulos(palabras, i2, f2, ass)
    cid = f"live-{re.sub(r'[^a-z0-9]+', '-', URL.lower().split('//')[-1])[:28].strip('-')}-{int(pico)}"
    destino = C.out / f'{cid}.mp4'
    C.vertical(tramo, i2, f2, ass, destino)
    hora = datetime.fromtimestamp(pico, timezone.utc).strftime('%H:%M:%S UTC')
    clip = {
        'id': cid, 'archivo': destino, 'idioma': idioma,
        'titulo': (texto[:70] + '…') if len(texto) > 70 else (texto or f'Momento en vivo {hora}'),
        'descripcion': f'{URL} · en vivo {hora}',
        'notas': (f"Campaña: {CAMP or 'SIN CAMPAÑA: no publicar hasta confirmar permiso'}. EN VIVO {hora}, elegido por "
                  f"{fuente} (fuerza {puntos:.1f}). Fuente: {URL}. Directo: {datos_directo() or 'sin datos'}. "
                  f"Dice: \"{texto[:300]}\". Chat en el momento: {chat_del_momento(pico) or 'sin chat'}"),
    }
    try:
        C.subir(clip)
    except Exception as e:
        log(f'  no pude subir al panel: {str(e)[:150]}')
    hook = E('DISCORD_WEBHOOK')
    if hook:
        try:
            C.http(hook, json.dumps({'content': f"🔴 Clip en vivo de **{URL}** ({CAMP or 'SIN CAMPAÑA'}) · {fuente}\n• {clip['titulo']}"}).encode(),
                   {'Content-Type': 'application/json', 'User-Agent': 'clips-bot'})
        except Exception:
            pass
    for x in (lista, tramo, ass):
        if x:
            Path(x).unlink(missing_ok=True)
    log(f'  ✅ {cid} ({fuente} {puntos:.1f})')
    return clip


def main():
    if not (URL or SIMULAR):
        sys.exit('Falta LIVE_ENTRADA')
    if not CAMP:
        log('⚠️ Sin campaña ni permiso: los clips se guardan marcados "no publicar".')
    log(f'Vigilando {URL or SIMULAR} por {MINUTOS:.0f} min · chat: {arrancar_chat() or "solo audio"}')
    fin = t_inicio + MINUTOS * 60
    estado_panel(estado='vigilando')
    oido, chat_det = Oido(), Chat()
    pool = ThreadPoolExecutor(max_workers=1)               # Whisper de a uno, sin frenar la grabación
    pendientes, hechos, futuros = [], [], []
    ultimo_pico, grabando = 0, False
    sl = ff = None
    while time.time() < fin and len(hechos) + len(futuros) < MAXIMO:
        if ff is None or ff.poll() is not None:
            if ff is not None:
                log('el directo se cortó o aún no empieza; reintento en 20 s')
                time.sleep(20)
            sl, ff = lanzar_grabacion()
        time.sleep(5)
        segs = segmentos()
        grabando = len(segs) > 0 and time.time() - segs[-1][0] < 60
        oido.actualizar(segs)
        limpiar()
        ahora = time.time()
        cand = []
        c = chat_det.revisar()
        if c:
            cand.append((c[0], 'chat', c[1]))
        p = oido.pico()
        if p:
            cand.append((p[0], 'audio', p[1]))
        for pico, fuente, puntos in cand:
            if pico - ultimo_pico >= ENFRIAR:
                ultimo_pico = pico
                pendientes.append((pico, fuente, puntos))
                log(f'momento detectado ({fuente} {puntos:.1f}); corto en {POST + SEG} s')
        listos = [x for x in pendientes if ahora >= x[0] + POST + SEG]
        for x in listos:
            pendientes.remove(x)
            futuros.append(pool.submit(cortar, *x, len(hechos) + len(futuros)))
        for fu in [f for f in futuros if f.done()]:
            futuros.remove(fu)
            try:
                if fu.result():
                    hechos.append(fu.result())
                    estado_panel(clips=len(hechos), minutos_usados=int((time.time() - t_inicio) / 60) + 1)
            except Exception as e:
                log(f'  corte falló: {str(e)[:200]}\n{traceback.format_exc()[-900:]}')
        if int(time.time() - t_inicio) % 300 < 6:      # cada ~5 min: minutos usados al día para la página
            estado_panel(minutos_usados=int((time.time() - t_inicio) / 60) + 1)
    parar.set()
    estado_panel(clips=len(hechos), minutos_usados=int((time.time() - t_inicio) / 60) + 1)
    for p_ in (sl, ff):
        if p_ and p_.poll() is None:
            p_.terminate()
    for fu in futuros:
        try:
            if fu.result(timeout=300):
                hechos.append(fu.result())
        except Exception as e:
            log(f'  corte falló: {str(e)[:200]}\n{traceback.format_exc()[-900:]}')
    (C.out / 'vivo.json').write_text(json.dumps([{**c, 'archivo': c['archivo'].name} for c in hechos], ensure_ascii=False, indent=2))
    estado_panel(estado='vigilando' if (grabando and not SIMULAR and sigue_despues()) else 'terminado', clips=len(hechos),
                 minutos_usados=int((time.time() - t_inicio) / 60) + 1)
    log(f'Fin: {len(hechos)} clips en vivo. Chat leído: {"sí" if chat_vivo.is_set() else "no"}.')
    salida = E('GITHUB_OUTPUT')
    if salida:
        with open(salida, 'a') as f:
            f.write(f"sigue={'true' if grabando and not SIMULAR else 'false'}\n")


if __name__ == '__main__':
    main()
