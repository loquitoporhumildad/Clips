import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {Theme} from './themes';
import {Word} from './types';

const BODY = "'Inter', 'DejaVu Sans', sans-serif";

type Chunk = {words: Word[]; start: number; end: number};

// Agrupa las palabras en frases cortas (máx. 3 palabras y ~18 letras, para que quepan en una línea).
const chunks = (words: Word[]): Chunk[] => {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const largo = cur.reduce((a, x) => a + x.w.length + 1, 0) + w.w.length;
    if (cur.length && (cur.length >= 3 || largo > 18 || cur[0].scene !== w.scene)) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
    if (/[.,;:!?]$/.test(w.w)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out.map((ws, i) => ({
    words: ws,
    start: ws[0].t0 - 0.04,
    end: Math.min(ws[ws.length - 1].t1 + 0.3, out[i + 1] ? out[i + 1][0].t0 - 0.04 : Infinity),
  }));
};

const limpia = (w: string) => w.replace(/[.,;:!?¿¡"()]/g, '').toUpperCase();

// Subtítulos palabra por palabra, sincronizados con la voz.
export const Captions: React.FC<{words: Word[]; t: Theme; pos?: 'top' | 'bottom'}> = ({words, t, pos = 'bottom'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const now = frame / fps;
  const cs = React.useMemo(() => chunks(words), [words]);
  const c = cs.find((x) => now >= x.start && now < x.end);
  if (!c) return null;
  return (
    <AbsoluteFill style={pos === 'top' ? {justifyContent: 'flex-start', alignItems: 'center', paddingTop: 300} : {justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 270}}>
      <div style={{display: 'flex', flexWrap: 'nowrap', whiteSpace: 'nowrap', justifyContent: 'center', gap: '0 36px', padding: '0 40px'}}>
        {c.words.map((w, i) => {
          const on = now >= w.t0 && now < w.t1;
          const done = now >= w.t1;
          return (
            <span
              key={i}
              style={{
                fontFamily: BODY,
                fontWeight: 900,
                fontSize: 72,
                lineHeight: 1.15,
                color: on ? (pos === 'top' ? t.bg1 : t.accent) : '#fff',
                background: on && pos === 'top' ? t.accent : 'transparent',
                borderRadius: 18,
                padding: pos === 'top' ? '0 14px' : 0,
                opacity: on || done ? 1 : 0.55,
                transform: `scale(${on ? 1.06 : 1})`,
                textShadow: '0 4px 0 rgba(0,0,0,0.85), 0 0 18px rgba(0,0,0,0.7)',
                WebkitTextStroke: '3px rgba(0,0,0,0.9)',
                paintOrder: 'stroke fill',
              }}
            >
              {limpia(w.w)}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
