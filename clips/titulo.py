"""Pone (o cambia) el título de un clip en vivo: toma la copia sin título y le quema el texto que eligió Juan.

Entradas por entorno: CLIP_VIDEO_ID (id en clips_videos), CLIP_TITULO (vacío = quitar título).
"""
import json
import os
import sys
import urllib.parse
import urllib.request

import cortar as C

E = os.environ.get
BASE, KEY = E('SUPABASE_URL'), E('SUPABASE_SERVICE_KEY')
AUTH = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}


def pedir(url, data=None, headers=None, metodo=None):
    req = urllib.request.Request(url, data=data, headers={**AUTH, **(headers or {})}, method=metodo)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def main():
    vid, texto = E('CLIP_VIDEO_ID'), (E('CLIP_TITULO') or '').strip()[:90]
    if not (vid and BASE and KEY):
        sys.exit('Faltan CLIP_VIDEO_ID o las claves de Supabase')
    fila = json.loads(pedir(f'{BASE}/rest/v1/clips_videos?id=eq.{vid}&select=*'))[0]
    origen = fila.get('base_path') or fila['storage_path']
    ruta = urllib.parse.quote(origen)
    base = C.tmp / 'base.mp4'
    base.write_bytes(pedir(f'{BASE}/storage/v1/object/clips-videos/{ruta}'))
    ass = C.titulo_ass(texto, C.tmp / 'titulo.ass')
    final = C.tmp / 'final.mp4'
    if ass:
        C.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(base), '-vf', f"subtitles='{ass.as_posix()}'",
               '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy',
               '-movflags', '+faststart', str(final)])
    else:
        final = base
    pedir(f"{BASE}/storage/v1/object/clips-videos/{urllib.parse.quote(fila['storage_path'])}", final.read_bytes(),
          {'Content-Type': 'video/mp4', 'x-upsert': 'true'}, 'POST')
    cambio = {'hook': texto or None}
    if texto:
        cambio['title'] = texto
    pedir(f'{BASE}/rest/v1/clips_videos?id=eq.{vid}', json.dumps(cambio).encode(),
          {'Content-Type': 'application/json'}, 'PATCH')
    print('título puesto:', texto or '(quitado)')


if __name__ == '__main__':
    main()
