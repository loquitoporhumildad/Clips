"""Filtros contra momentos falsos del vigilante de directos (vivo.py).

Problema (19 nov): con el streamer dormido, el audio "subía" cuando un lector de donaciones
(Super Chat / TTS) hablaba, y el chat solo decía "wake up". El detector lo contaba como momento.
Dos filtros, ambos apagables con LIVE_FILTRO=0:
  1. Chat dormido: varios mensajes cerca del pico hablan de dormir / despertar.
  2. Donación leída: un pico de AUDIO cuya transcripción es la voz de una donación.
"""
import re

DORMIDO = re.compile(r"(?i)\b(sleep\w*|asleep|wake\s*up|wakey|zzz+|snor\w*|residentsleeper|duerme\w*|dormid\w*|despiert\w*)\b")
DONACION = re.compile(r"(?i)\b(super\s*chat|tipped|donat\w*|dollars?\s+(through|via)|re-?subscri\w*|cheer(ed)?\s+\d+)\b")

MIN_DORMIDOS = 2          # mensajes que mencionan dormir/despertar
MIN_PROPORCION = 0.05     # y al menos esta parte del chat de ese tramo


def chat_dormido(mensajes):
    """True si el chat cerca del pico habla de que el streamer duerme. `mensajes`: lista de textos."""
    total = len(mensajes)
    if not total:
        return False
    n = sum(1 for m in mensajes if DORMIDO.search(m))
    return n >= MIN_DORMIDOS and n / total >= MIN_PROPORCION


def es_donacion(texto):
    """True si la transcripción del tramo es una donación leída por voz."""
    return bool(texto and DONACION.search(texto))
