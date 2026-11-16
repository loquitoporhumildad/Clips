"""Oídos: lo que Claude "escucha" de cualquier video o audio.

Claude no oye el sonido, pero puede leer esto: transcripción con tiempos,
momentos donde sube la voz, silencios y ritmo (BPM) de la música de fondo.
Sirve para elegir momentos de un VOD, para analizar un video viral antes de
copiar su gancho, o para revisar el audio de nuestros propios videos.

Uso:  python clips/oidos.py <link o archivo> [--desde MIN] [--hasta MIN]
Salida: out/oidos/<nombre>.json y out/oidos/<nombre>.md (resumen legible).
Todo gratis: yt-dlp + ffmpeg + faster-whisper en CPU.
"""
import argparse
import json
import os
import re
import statistics
import subprocess
import sys
from pathlib import Path

raiz = Path(__file__).resolve().parent.parent
out = raiz / 'out' / 'oidos'
out.mkdir(parents=True, exist_ok=True)
MODELO = os.environ.get('WHISPER_MODEL') or 'small'


def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{args[0]} falló:\n{r.stderr[-1200:]}")
    return r


def hms(s):
    s = int(s)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


def conseguir_audio(fuente, desde, hasta):
    """Devuelve (archivo de audio wav 16 kHz mono, título)."""
    tmp = out / 'tmp'
    tmp.mkdir(exist_ok=True)
    wav = tmp / 'audio.wav'
    wav.unlink(missing_ok=True)
    titulo = Path(fuente).stem
    origen = fuente
    if not Path(fuente).exists():
        info = json.loads(run(['yt-dlp', '--no-warnings', '--no-playlist', '-J', fuente]).stdout)
        titulo = info.get('title') or 'video'
        crudo = tmp / 'crudo.%(ext)s'
        args = ['yt-dlp', '--no-warnings', '--no-playlist', '-f', 'bestaudio/worst', '-o', str(crudo)]
        if desde or hasta:
            fin = hms(hasta * 60) if hasta else 'inf'
            args += ['--download-sections', f"*{hms(desde * 60)}-{fin}"]
        run(args + [fuente])
        origen = str(next(tmp.glob('crudo.*')))
    cmd = ['ffmpeg', '-loglevel', 'error', '-y']
    if Path(fuente).exists() and desde:
        cmd += ['-ss', str(desde * 60)]
    if Path(fuente).exists() and hasta:
        cmd += ['-to', str(hasta * 60)]
    run(cmd + ['-i', origen, '-vn', '-ac', '1', '-ar', '16000', str(wav)])
    return wav, titulo


def volumen(wav):
    """dB RMS de cada segundo."""
    r = run(['ffmpeg', '-loglevel', 'error', '-i', str(wav), '-af',
             'asetnsamples=n=16000:p=0,astats=metadata=1:reset=1,'
             'ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-', '-f', 'null', '-'])
    return [-90.0 if m.group(1) == '-inf' else float(m.group(1))
            for m in re.finditer(r'RMS_level=(-?[\d.]+|-inf)', r.stdout)]


def momentos_fuertes(v, n=8):
    """Segundos donde la voz/sonido sube mucho sobre lo normal de los 2 min anteriores."""
    suave = [statistics.fmean(v[max(0, i - 1):i + 2]) for i in range(len(v))]
    punt = []
    for i in range(len(v)):
        antes = suave[max(0, i - 120):i] or [suave[i]]
        punt.append(suave[i] - statistics.median(antes))
    res = []
    for i in sorted(range(len(v)), key=lambda i: punt[i], reverse=True):
        if punt[i] < 3 or len(res) == n:
            break
        if all(abs(i - j['t']) > 20 for j in res):
            res.append({'t': i, 'tiempo': hms(i), 'sube_db': round(punt[i], 1)})
    return sorted(res, key=lambda x: x['t'])


def silencios(v, minimo=2):
    """Tramos de al menos `minimo` s por debajo de -50 dB."""
    res, ini = [], None
    for i, x in enumerate(v + [0]):
        if x < -50 and ini is None:
            ini = i
        elif x >= -50 and ini is not None:
            if i - ini >= minimo:
                res.append({'desde': hms(ini), 'hasta': hms(i), 'segundos': i - ini})
            ini = None
    return res


def bpm(wav):
    """Ritmo aproximado de la música: autocorrelación de la energía en tramos de 20 ms."""
    try:
        import numpy as np
    except ImportError:
        return None
    p =subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', str(wav), '-t', '120', '-f', 's16le', '-ac', '1', '-ar', '8000', '-'],
                       capture_output=True)
    x = np.frombuffer(p.stdout, dtype=np.int16).astype(np.float32)
    if len(x) < 8000 * 10:
        return None
    paso = 160                                          # 20 ms
    n = len(x) // paso
    e = np.sqrt((x[:n * paso].reshape(n, paso) ** 2).mean(axis=1))
    d = np.maximum(np.diff(e), 0)                      # solo subidas = golpes
    d = d - d.mean()
    ac = np.correlate(d, d, mode='full')[len(d) - 1:]
    lo, hi = int(60 / 180 / 0.02), int(60 / 70 / 0.02)  # entre 70 y 180 BPM
    k = lo + int(np.argmax(ac[lo:hi]))
    b = 60 / (k * 0.02)
    while b < 80:
        b *= 2
    while b > 160:
        b /= 2
    return round(float(b))


def transcribir(wav):
    from faster_whisper import WhisperModel
    m = WhisperModel(MODELO, device='cpu', compute_type='int8')
    segs, info = m.transcribe(str(wav), vad_filter=True)
    frases = [{'t0': round(s.start, 1), 't1': round(s.end, 1), 'texto': s.text.strip()} for s in segs]
    return frases, info.language


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('fuente')
    ap.add_argument('--desde', type=float, default=0)
    ap.add_argument('--hasta', type=float, default=0)
    ap.add_argument('--sin-voz', action='store_true', help='solo volumen, silencios y ritmo')
    a = ap.parse_args()

    wav, titulo = conseguir_audio(a.fuente, a.desde, a.hasta)
    v = volumen(wav)
    frases, idioma = ([], '') if a.sin_voz else transcribir(wav)
    r = {
        'titulo': titulo, 'fuente': a.fuente, 'idioma': idioma, 'duracion_s': len(v),
        'ritmo_bpm': bpm(wav),
        'volumen_medio_db': round(statistics.fmean(v), 1) if v else None,
        'momentos_fuertes': momentos_fuertes(v),
        'silencios': silencios(v),
        'primeros_3_segundos': ' '.join(f['texto'] for f in frases if f['t0'] < 3),
        'transcripcion': frases,
    }
    slug = re.sub(r'[^a-z0-9]+', '-', titulo.lower()).strip('-')[:40] or 'audio'
    (out / f'{slug}.json').write_text(json.dumps(r, ensure_ascii=False, indent=2))
    md = [f"# Oídos: {titulo}", f"Idioma: {idioma or '?'} · {hms(len(v))} · ritmo ≈ {r['ritmo_bpm']} BPM",
          f"**Gancho (primeros 3 s):** {r['primeros_3_segundos'] or '(sin voz)'}", '',
          '## Momentos donde sube el sonido']
    md += [f"- {m['tiempo']}  (+{m['sube_db']} dB)" for m in r['momentos_fuertes']] or ['- ninguno claro']
    md += ['', '## Silencios largos'] + ([f"- {s['desde']}–{s['hasta']}" for s in r['silencios']] or ['- ninguno'])
    md += ['', '## Transcripción'] + [f"[{hms(f['t0'])}] {f['texto']}" for f in frases]
    (out / f'{slug}.md').write_text('\n'.join(md) + '\n')
    print('\n'.join(md[:40]))
    print(f"\nGuardado en {out / (slug + '.md')}")


if __name__ == '__main__':
    sys.exit(main())
