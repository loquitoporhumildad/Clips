// Genera la pista de audio de un video (beat + golpes en cada corte + subidas
// en los conteos) como WAV, sin descargar nada. Uso: makeAudio(spec, archivo)
import fs from 'node:fs';

const SR = 44100;

export function makeAudio(spec, file) {
  const total = spec.scenes.reduce((a, s) => a + s.seconds, 0);
  const n = Math.ceil(total * SR);
  const buf = new Float32Array(n);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const add = (t0, dur, fn) => {
    const a = Math.max(0, Math.floor(t0 * SR));
    const b = Math.min(n, Math.floor((t0 + dur) * SR));
    for (let i = a; i < b; i++) buf[i] += fn((i - a) / SR, (i - a) / (b - a));
  };

  const bpm = spec.bpm ?? 96;
  const beat = 60 / bpm;

  // sub-bajo continuo, con "bombeo" en cada golpe
  add(0, total, (t) => 0.1 * Math.sin(2 * Math.PI * 49 * t) * (0.35 + 0.65 * Math.min(1, ((t % beat) / beat) * 2.5)));

  for (let k = 0; k * beat < total; k++) {
    const t0 = k * beat;
    // bombo: en 1 y 3, y un doble antes del 1 cada 4 tiempos
    const kick = (at, g) => {
      let ph = 0;
      add(at, 0.3, (t) => {
        const f = 45 + 95 * Math.exp(-t * 28);
        ph += (2 * Math.PI * f) / SR;
        return g * Math.sin(ph) * Math.exp(-t * 9);
      });
    };
    if (k % 2 === 0) kick(t0, 0.55);
    if (k % 4 === 3) kick(t0 + beat * 0.5, 0.4);
    // palmada/caja en 2 y 4
    if (k % 2 === 1) {
      let lp = 0;
      add(t0, 0.16, (t) => {
        const x = rnd();
        lp += 0.35 * (x - lp);
        return 0.22 * (x - lp * 0.6) * Math.exp(-t * 26);
      });
    }
    // hi-hats en corcheas
    for (const off of [0, 0.5]) {
      let prev = 0;
      add(t0 + off * beat, 0.05, (t) => {
        const x = rnd();
        const hp = x - prev;
        prev = x;
        return 0.07 * hp * Math.exp(-t * 90);
      });
    }
  }

  // cortes de escena: barrido de aire antes + golpe en el corte
  let at = 0;
  for (const s of spec.scenes) {
    if (at > 0) {
      let lp = 0;
      add(at - 0.28, 0.28, (t, p) => {
        lp += (0.05 + 0.5 * p) * (rnd() - lp);
        return 0.3 * p * p * lp;
      });
    }
    let ph = 0, lp2 = 0;
    add(at, 0.5, (t) => {
      ph += (2 * Math.PI * (38 + 60 * Math.exp(-t * 20))) / SR;
      lp2 += 0.12 * (rnd() - lp2);
      return (0.5 * Math.sin(ph) + 0.35 * lp2) * Math.exp(-t * 7);
    });
    // subida de tono mientras corre el contador o crecen las barras
    if (s.type === 'stat' || s.type === 'bars') {
      let p2 = 0;
      const d = s.type === 'stat' ? 1.2 : 1.4;
      add(at + 0.05, d, (t, p) => {
        p2 += (2 * Math.PI * (260 + 520 * p * p)) / SR;
        return 0.05 * Math.sin(p2) * Math.sin(Math.PI * p);
      });
      add(at + d + 0.05, 0.18, (t) => 0.12 * Math.sin(2 * Math.PI * 1320 * t) * Math.exp(-t * 30));
    }
    at += s.seconds;
  }

  // salida suave y limitador
  const fade = Math.floor(0.4 * SR);
  for (let i = 0; i < fade; i++) buf[n - 1 - i] *= i / fade;
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
  pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.tanh(buf[i] * 1.4) * 0.85 * 32767), 44 + i * 2);
  fs.writeFileSync(file, pcm);
}
