#!/usr/bin/env python3
"""Voz narrada para los videos (Kokoro, gratis, en CPU).

Uso:
  python clips/voz.py [YYYY-MM-DD]      # guiones de content/<fecha> (por defecto hoy en Panamá)
  python clips/voz.py --muestras        # genera out/voces/*.wav para elegir voz

Para cada guion con narración y cada idioma escribe en remotion/public/voz/:
  <id>-<lang>.wav   la voz, ya colocada en el tiempo de cada escena
  <id>-<lang>.json  {seconds: [...], words: [{w, t0, t1, scene}]} para los subtítulos
Cada escena dura lo que dice el guion o lo que tarda la voz, lo que sea mayor.

Un guion se narra si tiene "narrate": true o alguna escena con "narration"
({"en": "...", "es": "..."}). "narrate": false lo apaga. Las escenas sin
"narration" usan un texto sacado de la propia escena (peor: mejor escribirlo).
"""
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((Path(__file__).parent / "voces.json").read_text(encoding="utf-8"))
MODEL_DIR = Path(os.environ.get("KOKORO_DIR", Path.home() / ".cache" / "kokoro"))
BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
SR = 24000
LEAD = 0.15  # silencio antes de la voz en cada escena
TAIL = 0.30  # y después
GAP = 0.18  # pausa entre frases
KLANG = {"en": "en-us", "es": "es"}
MODELOS_GEMINI = ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]
_kokoro = None
_gemini_ok = None  # el modelo de Gemini que sí respondió


def modelo() -> Kokoro:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for f in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
        p = MODEL_DIR / f
        if not p.exists():
            print(f"Descargando {f}…", flush=True)
            urllib.request.urlretrieve(BASE + f, p)
    return Kokoro(str(MODEL_DIR / "kokoro-v1.0.onnx"), str(MODEL_DIR / "voices-v1.0.bin"))


def kokoro() -> Kokoro:
    global _kokoro
    if _kokoro is None:
        _kokoro = modelo()
    return _kokoro


def gemini(texto: str, nombre: str, lang: str) -> np.ndarray:
    """Voz de Gemini TTS (usa GEMINI_API_KEY). Prueba los modelos en orden y reintenta."""
    global _gemini_ok
    key = os.environ["GEMINI_API_KEY"]
    estilo = CFG.get("estilo", {}).get(lang, "")
    ultimo = None
    for m in ([_gemini_ok] if _gemini_ok else MODELOS_GEMINI):
        if m.startswith("gemini-3.8"):
            parte = {"text": texto, **({"speech_metadata": {"style": estilo}} if estilo else {})}
        else:
            parte = {"text": f"{estilo}: {texto}" if estilo else texto}
        body = {"contents": [{"role": "user", "parts": [parte]}],
                "generationConfig": {"responseModalities": ["AUDIO"],
                                     "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": nombre}}}}}
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent",
            data=json.dumps(body).encode(), headers={"x-goog-api-key": key, "Content-Type": "application/json"})
        for intento in range(3):
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    d = json.load(r)
                inline = d["candidates"][0]["content"]["parts"][0]["inlineData"]
                pcm = np.frombuffer(base64.b64decode(inline["data"]), dtype="<i2").astype(np.float32) / 32768
                m_sr = re.search(r"rate=(\d+)", inline.get("mimeType", ""))
                sr = int(m_sr.group(1)) if m_sr else SR
                if sr != SR:  # remuestreo simple
                    pcm = np.interp(np.arange(int(len(pcm) * SR / sr)) * sr / SR, np.arange(len(pcm)), pcm).astype(np.float32)
                _gemini_ok = m
                return pcm
            except (urllib.error.HTTPError, KeyError, IndexError, urllib.error.URLError) as e:
                ultimo = e
                if isinstance(e, urllib.error.HTTPError) and e.code in (400, 403, 404):
                    break  # este modelo no sirve: probar el siguiente
                time.sleep((25 if isinstance(e, urllib.error.HTTPError) and e.code == 429 else 4) * (intento + 1))
    raise RuntimeError(f"Gemini TTS falló: {ultimo}")


def edge(texto: str, nombre: str, vel: float) -> np.ndarray:
    """Voz neuronal de Microsoft Edge (paquete edge-tts, no oficial)."""
    import asyncio

    import edge_tts

    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "v.mp3"
        asyncio.run(edge_tts.Communicate(texto, nombre, rate=f"{round((vel - 1) * 100):+d}%").save(str(f)))
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                             check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def hablar(texto: str, voz: str, lang: str, vel: float) -> np.ndarray:
    """voz = "am_michael" (Kokoro), "gemini:Kore" o "edge:es-PA-RobertoNeural"."""
    if voz.startswith("gemini:"):
        return gemini(texto, voz[7:], lang)
    if voz.startswith("edge:"):
        return edge(texto, voz[5:], vel)
    audio, sr = kokoro().create(texto, voice=voz, speed=vel, lang=KLANG[lang])
    assert sr == SR
    return np.asarray(audio, dtype=np.float32)


def tr(v, lang):
    return v if isinstance(v, str) or v is None else v.get(lang, "")


def num(v, decimals=0):
    return f"{v:.{decimals}f}" if decimals else f"{v:g}"


def narracion(s: dict, lang: str) -> str:
    """Texto que se dice en una escena: el de "narration" o uno sacado de la escena."""
    n = tr(s.get("narration"), lang)
    if n:
        return n.strip()
    t = s["type"]
    if t == "hook":
        return tr(s.get("text"), lang)
    if t == "stat":
        suf = tr(s.get("suffix"), lang).lower()
        money = {"en": "dollars", "es": "dólares"}[lang] if s.get("prefix") == "$" else ""
        cifra = " ".join(x for x in (num(s["value"], s.get("decimals", 0)), suf, money) if x)
        return f"{cifra}. {tr(s.get('label'), lang)}"
    if t == "bars":
        it = s["items"][0]
        return f"{tr(s.get('title'), lang)}. {tr(it['label'], lang)}: {num(it['value'])}."
    if t == "versus":
        d = s.get("decimals", 0)
        partes = [tr(s.get("title"), lang),
                  f"{tr(s['left']['label'], lang)}: {num(s['left']['value'], d)}",
                  f"{tr(s['right']['label'], lang)}: {num(s['right']['value'], d)}",
                  tr(s.get("note"), lang)]
        return ". ".join(p for p in partes if p)
    if t == "progress":
        return f"{tr(s.get('kicker'), lang)} {s['value']} {tr(s.get('unit'), lang)}. {tr(s.get('label'), lang)}"
    if t == "outro":
        return tr(s.get("small"), lang)
    return ""


def pronunciar(texto: str, lang: str, extra: dict) -> str:
    """Cambia siglas y cifras por cómo se dicen (solo para la voz, no para los subtítulos)."""
    d = {**CFG["pronunciacion"].get(lang, {}), **extra}
    for k in sorted(d, key=len, reverse=True):
        texto = re.sub(rf"(?<![\w]){re.escape(k)}(?![\w])", d[k], texto)
    texto = texto.replace("%", " por ciento" if lang == "es" else " percent")
    texto = re.sub(r"[☀-➿\U0001F300-\U0001FAFF]", "", texto)
    return re.sub(r"\s+", " ", texto).strip()


def frases(texto: str) -> list[str]:
    return [f for f in re.split(r"(?<=[.!?:;])\s+", texto.strip()) if f]


def peso(palabra: str) -> float:
    """Cuánto tarda más o menos una palabra, para repartir el tiempo de una frase."""
    p = len(re.sub(r"\W", "", palabra)) + 1.5
    if re.search(r"[,;:]$", palabra):
        p += 2
    if re.search(r"[.!?]$", palabra):
        p += 4
    return p


def silencio(seg: float) -> np.ndarray:
    return np.zeros(int(seg * SR), dtype=np.float32)


def sintetizar_escena(texto: str, lang: str, voz: str, vel: float, extra: dict):
    """Devuelve (audio, palabras con tiempo relativo al inicio del audio de la escena)."""
    partes, palabras, t = [], [], 0.0
    for fr in frases(texto):
        audio = hablar(pronunciar(fr, lang, extra), voz, lang, vel)
        dur = len(audio) / SR
        ws = fr.split()
        pesos = [peso(w) for w in ws]
        tot = sum(pesos)
        acc = 0.0
        for w, p in zip(ws, pesos):
            palabras.append({"w": w, "t0": round(t + dur * acc / tot, 3), "t1": round(t + dur * (acc + p) / tot, 3)})
            acc += p
        partes += [audio, silencio(GAP)]
        t += dur + GAP
    audio = np.concatenate(partes[:-1]) if partes else silencio(0)
    return audio, palabras


def elegir_voz(spec: dict, lang: str):
    """Voz del guion > voz de su marca > voz del idioma. None = sin voz en ese idioma."""
    if lang in spec.get("voices", {}):
        return spec["voices"][lang]
    marca = CFG.get("por_marca", {}).get(spec.get("brand", ""), {})
    return marca[lang] if lang in marca else CFG["voces"].get(lang)


def narrar(spec: dict, lang: str, out: Path):
    voz = elegir_voz(spec, lang)
    if not voz:
        print(f"  {spec['id']} ({lang}): sin voz en este idioma", flush=True)
        return
    vel = CFG["velocidad"][lang]
    extra = spec.get("pronunciation", {}).get(lang, {})
    escenas = []
    for s in spec["scenes"]:
        texto = narracion(s, lang)
        audio, palabras = sintetizar_escena(texto, lang, voz, vel, extra) if texto else (silencio(0), [])
        dur = len(audio) / SR
        seconds = max(float(s["seconds"]), round(LEAD + dur + TAIL + 0.049, 1)) if texto else float(s["seconds"])
        escenas.append((audio, palabras, seconds))
    total = sum(e[2] for e in escenas)
    pista = np.zeros(int(total * SR) + SR // 2, dtype=np.float32)
    words, at = [], 0.0
    for i, (audio, palabras, seconds) in enumerate(escenas):
        ini = int((at + LEAD) * SR)
        pista[ini:ini + len(audio)] += audio
        for w in palabras:
            words.append({"w": w["w"], "t0": round(at + LEAD + w["t0"], 3), "t1": round(at + LEAD + w["t1"], 3), "scene": i})
        at += seconds
    pico = float(np.max(np.abs(pista))) or 1.0
    pista = pista / pico * 0.95
    out.mkdir(parents=True, exist_ok=True)
    sf.write(out / f"{spec['id']}-{lang}.wav", pista[: int(total * SR)], SR)
    (out / f"{spec['id']}-{lang}.json").write_text(
        json.dumps({"voice": voz, "seconds": [e[2] for e in escenas], "words": words}, ensure_ascii=False), encoding="utf-8")
    print(f"  {spec['id']} ({lang}): voz {voz}, {total:.1f} s, {len(words)} palabras", flush=True)


def debe_narrar(spec: dict) -> bool:
    if spec.get("narrate") is False:
        return False
    return spec.get("narrate") is True or any("narration" in s for s in spec["scenes"])


def muestras():
    d = ROOT / "out" / "voces"
    d.mkdir(parents=True, exist_ok=True)
    texto = {
        "en": "In 3 days, GTA VI has to beat one rival: GTA V. It made one billion dollars in its first three days. Does the new one break the record?",
        "es": "En 3 días, GTA VI tiene que vencer a un solo rival: GTA V. Hizo mil millones de dólares en sus primeros tres días. ¿Rompe el récord el nuevo?",
    }
    voces = {
        "en": ["am_michael", "af_heart"],
        "es": ["em_alex", "gemini:Kore", "gemini:Puck", "gemini:Charon", "gemini:Orus",
               "edge:es-PA-RobertoNeural", "edge:es-PA-MargaritaNeural", "edge:es-MX-JorgeNeural", "edge:es-MX-DaliaNeural",
               "edge:es-US-AlonsoNeural"],
    }
    for lang, lista in voces.items():
        for v in lista:
            if v.startswith("gemini:") and not os.environ.get("GEMINI_API_KEY"):
                continue
            try:
                audio, _ = sintetizar_escena(texto[lang], lang, v, CFG["velocidad"][lang], {})
                sf.write(d / f"{lang}-{v.replace(':', '_')}.wav", audio, SR)
                print("muestra", lang, v, flush=True)
                if v.startswith("gemini:"):
                    time.sleep(8)  # el plan gratis limita las peticiones por minuto
            except Exception as e:  # una voz que falla no tumba las demás
                print("FALLÓ", lang, v, "->", str(e)[:200], flush=True)


def main():
    if "--muestras" in sys.argv:
        return muestras()
    fecha = next((a for a in sys.argv[1:] if re.fullmatch(r"\d{4}-\d{2}-\d{2}", a)), None) \
        or datetime.now(ZoneInfo("America/Panama")).strftime("%Y-%m-%d")
    carpeta = ROOT / "content" / fecha
    if not carpeta.exists():
        print(f"No hay contenido para {fecha}.")
        return
    specs = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(carpeta.glob("*.json"))]
    specs = [s for s in specs if debe_narrar(s)]
    if not specs:
        print("Ningún guion pide voz.")
        return
    out = ROOT / "remotion" / "public" / "voz"
    for spec in specs:
        for lang in spec["langs"]:
            narrar(spec, lang, out)


if __name__ == "__main__":
    main()
