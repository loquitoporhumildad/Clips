#!/usr/bin/env python3
"""Patrulla de directos: cada 2 h mira quién está en vivo y lanza el vigilante donde nadie vigila.

Solo la cuenta de crecimiento (PeakClips, sin campaña). Clip Vault necesita campaña o permiso, así que
NO se automatiza. Reglas en clips/patrulla.json:
  - canales de la lista que estén en vivo (por defecto, solo si juegan la categoría);
  - más los de mayor audiencia de la categoría (en inglés o español, con un mínimo de espectadores);
  - nunca más de `max_activos` vigilantes a la vez; no repite uno que ya está vigilando.
Variables: SUPABASE_URL, SUPABASE_SERVICE_KEY, GH_TOKEN, GITHUB_REPOSITORY, DISCORD_WEBHOOK (opcional),
PATRULLA_SIMULAR=1 (solo muestra qué lanzaría).
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

E = os.environ.get
CFG = json.loads((Path(__file__).parent / 'patrulla.json').read_text())
SIMULAR = E('PATRULLA_SIMULAR') == '1'
SUPA = (E('SUPABASE_URL') or '').rstrip('/')
KEY = E('SUPABASE_SERVICE_KEY') or ''
ACTIVO_MIN = 35          # una fila "vigilando" que no se actualiza en 35 min se considera muerta
UA = {'User-Agent': 'clips-bot'}


def http(url, datos=None, cab=None, metodo=None):
    req = urllib.request.Request(url, data=datos, headers={**UA, **(cab or {})}, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{e.code} {e.read()[:200].decode("utf-8", "ignore")}')


def rest(ruta, datos=None, metodo=None):
    cab = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
    return http(f'{SUPA}/rest/v1/{ruta}', json.dumps(datos).encode() if datos is not None else None, cab, metodo)


def login(url):
    m = re.search(r'twitch\.tv/([A-Za-z0-9_]+)', url or '')
    return m.group(1).lower() if m else (url or '').lower()


def vigilando_ahora():
    """Logins que ya tienen un vigilante vivo (fila activa y actualizada hace poco)."""
    if not (SUPA and KEY):
        print('⚠️ Sin SUPABASE_URL/SUPABASE_SERVICE_KEY: no sé quién se vigila (solo vale para simular).')
        return set()
    filas = rest('clips_vigilar?select=id,url,estado,created_at,actualizado&estado=in.(pendiente,lanzado,vigilando)&order=id.desc&limit=200')
    limite = datetime.now(timezone.utc) - timedelta(minutes=ACTIVO_MIN)
    vivos = set()
    for f in filas:
        t = max(datetime.fromisoformat(f[k].replace('Z', '+00:00')) for k in ('created_at', 'actualizado') if f.get(k))
        if t > limite:
            vivos.add(login(f['url']))
    return vivos


def quienes_estan_en_vivo():
    cuerpo = json.dumps({'categoria': CFG['categoria'], 'top': CFG['top_categoria'], 'logins': CFG['canales']}).encode()
    d = http(f'{SUPA}/functions/v1/en_vivo', cuerpo, {'Content-Type': 'application/json'})
    if d.get('error'):
        raise RuntimeError(d['error'])
    return d


def elegir(d, activos):
    """Lista ordenada de (login, motivo, espectadores) a lanzar, respetando el tope de vigilantes."""
    cat = d['categoria'].lower()
    cand, vistos = [], set()
    for s in sorted(d['canales_en_vivo'], key=lambda s: -(s['espectadores'] or 0)):
        if CFG['solo_en_categoria'] and (s['juego'] or '').lower() != cat:
            continue
        cand.append((s['login'], f"lista · {s['juego']}", s['espectadores']))
        vistos.add(s['login'])
    for s in d['top_categoria']:
        if s['login'] in vistos or (s['espectadores'] or 0) < CFG['min_espectadores_top']:
            continue
        if s['idioma'] not in CFG['idiomas_top']:
            continue
        cand.append((s['login'], f"top {s['juego']} ({s['idioma']})", s['espectadores']))
    libres = max(0, CFG['max_activos'] - len(activos))
    return [c for c in cand if c[0] not in activos][:libres], cand


def lanzar(lg, motivo):
    url = f'https://www.twitch.tv/{lg}'
    hasta = datetime.now(timezone.utc) + timedelta(hours=CFG['horas_cadena'])
    fila = rest('clips_vigilar', {'owner': CFG['owner'], 'cuenta': CFG['cuenta'], 'url': url, 'campana': CFG['campana'],
                                  'minutos': CFG['minutos'], 'hasta_utc': hasta.isoformat(), 'estado': 'lanzado'})[0]
    r = subprocess.run(['gh', 'workflow', 'run', 'vivo.yml', '-R', E('GITHUB_REPOSITORY', ''),
                        '-f', f'urls={url}', '-f', f"campana={CFG['campana']}", '-f', f"cuenta={CFG['cuenta']}",
                        '-f', f"owner={CFG['owner']}", '-f', f"registro={fila['id']}", '-f', f"minutos={CFG['minutos']}",
                        '-f', f"hasta_utc={hasta.strftime('%Y-%m-%dT%H:%M')}", '-f', 'cantidad_max=60'],
                       capture_output=True, text=True)
    if r.returncode != 0:
        rest(f"clips_vigilar?id=eq.{fila['id']}", {'estado': 'error', 'detalle': r.stderr[:200]}, 'PATCH')
        raise RuntimeError(r.stderr.strip()[:200])
    return fila['id']


def avisar(texto):
    hook = E('DISCORD_WEBHOOK')
    if hook:
        try:
            http(hook, json.dumps({'content': texto}).encode(), {'Content-Type': 'application/json'})
        except Exception as e:
            print('Discord falló:', e)


def main():
    if not SUPA:
        sys.exit('Falta SUPABASE_URL')
    d = quienes_estan_en_vivo()
    activos = vigilando_ahora()
    a_lanzar, todos = elegir(d, activos)
    print(f"Categoría: {d['categoria']} · en vivo y elegibles: {len(todos)} · ya vigilados: {sorted(activos) or 'ninguno'}")
    for lg, motivo, esp in todos:
        print(f"  {'✔ vigilado ya' if lg in activos else '·'} {lg:<14} {esp:>7} espectadores  [{motivo}]")
    if not a_lanzar:
        print('Nada que lanzar.')
        return
    hechos = []
    for lg, motivo, esp in a_lanzar:
        if SIMULAR:
            print(f'  [simulación] lanzaría {lg} ({esp} esp., {motivo})')
            continue
        try:
            rid = lanzar(lg, motivo)
            print(f'  🚀 lanzado {lg} (registro {rid})')
            hechos.append(f'**{lg}** · {esp:,} espectadores · {motivo}')
        except Exception as e:
            print(f'  ❌ {lg}: {e}')
    if hechos:
        avisar('🛰️ Patrulla: vigilante lanzado en\n• ' + '\n• '.join(hechos) + f"\nCuenta: {CFG['cuenta']} (sin campaña)")


if __name__ == '__main__':
    main()
