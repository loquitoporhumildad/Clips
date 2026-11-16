"""Voz en off para los videos de Remotion, gratis (edge-tts, voces neuronales de Microsoft).

Lee content/<fecha>/*.json, genera un mp3 por escena e idioma y escribe
remotion/public/audio/voz/manifest.json con la duración de cada uno.
render.mjs usa ese manifest para alargar la escena si la voz no cabe y para
reproducir la voz con la música más baja.

Cada escena puede traer su propia frase: "voz": {"en": "...", "es": "..."}.
Si no la trae, se arma con el texto de la escena (hook, label, title, etc.).
Uso: python clips/voz.py [YYYY-MM-DD]     (VOZ_FALSA=1 = silencios, solo para probar)
Aviso: edge-tts usa un servicio de Microsoft sin contrato; si algún día falla,
se cambia por Kokoro o Piper (offline) tocando solo la función sintetizar().
"""
import asyncio
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

raiz = Path(__file__).resolve().parent.parent
hoy = (datetime.now(timezone.utc) - timedelta(hours=5)).strftime('%Y-%m-%d')
fecha = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else hoy
carpeta = raiz / 'content' / fecha
destino = raiz / 'remotion' / 'public' / 'audio' / 'voz'
VOCES = {'en': os.environ.get('VOZ_EN', 'en-US-AndrewNeural'), 'es': os.environ.get('VOZ_ES', 'es-MX-JorgeNeural')}
RITMO = os.environ.get('VOZ_RITMO', '+12%')       # un poco más rápido que lo normal: retiene más


def t(v, lang):
    return v if isinstance(v, str) else (v or {}).get(lang, '')


def frase(s, lang):
    if s.get('voz'):
        return t(s['voz'], lang)
    tipo = s['type']
    if tipo == 'hook':
        return t(s.get('text'), lang)
    if tipo == 'stat':
        return t(s.get('label'), lang)
    if tipo == 'bars':
        return t(s.get('title'), lang)
    if tipo == 'versus':
        return f"{t(s.get('title'), lang)}. {t(s.get('note'), lang)}".strip(' .')
    if tipo == 'progress':
        return t(s.get('label'), lang)
    if tipo == 'outro':
        return f"{t(s.get('big'), lang)}. {t(s.get('small'), lang)}".strip(' .')
    return ''


def duracion(mp3):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(mp3)],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


async def sintetizar(texto, voz, archivo):
    if os.environ.get('VOZ_FALSA') == '1':
        seg = max(1.0, len(texto.split()) / 2.8)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
                        '-t', f'{seg:.2f}', '-q:a', '9', str(archivo)], check=True)
        return
    import edge_tts
    await edge_tts.Communicate(texto, voz, rate=RITMO).save(str(archivo))


async def main():
    if not carpeta.exists():
        print(f'No hay contenido para {fecha}')
        return
    destino.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for f in sorted(carpeta.glob('*.json')):
        spec = json.loads(f.read_text())
        if spec.get('voice') is False:
            continue
        for lang in spec['langs']:
            for i, s in enumerate(spec['scenes']):
                texto = frase(s, lang).strip()
                if not texto:
                    continue
                archivo = destino / f"{spec['id']}-{lang}-{i}.mp3"
                await sintetizar(texto, VOCES[lang], archivo)
                manifest[archivo.stem] = round(duracion(archivo), 2)
    (destino / 'manifest.json').write_text(json.dumps(manifest, indent=1))
    print(f'Voz lista: {len(manifest)} audios para {fecha}')


asyncio.run(main())
