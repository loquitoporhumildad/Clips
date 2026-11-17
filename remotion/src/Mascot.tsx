import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Theme} from './themes';

export type Mood = 'hype' | 'shock' | 'think' | 'smile';

// "Bolo": personaje propio de la fábrica. Cuerpo redondo con ojos que parpadean,
// brazos que se mueven y una boca que cambia según el ánimo de la escena.
export const Mascot: React.FC<{mood: Mood; t: Theme}> = ({mood, t}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame, fps, config: {damping: 9, stiffness: 140}});
  const beat = Math.max(0, 1 - ((frame % Math.round(fps * 0.5)) / (fps * 0.2)));
  const bob = Math.sin(frame / 5) * 6 - beat * 10;
  const blink = frame % 84 > 78 ? 0.1 : 1;
  const shake = mood === 'shock' ? Math.sin(frame * 2.2) * 5 : 0;
  const arm = mood === 'hype' ? Math.sin(frame / 3) * 38 : mood === 'smile' ? Math.sin(frame / 6) * 18 : 8;
  const look = interpolate(Math.sin(frame / 20), [-1, 1], [-6, 6]);
  const mouth = {
    hype: 'M70 128 Q100 168 130 128 Z',
    shock: 'M88 128 Q100 156 112 128 Q100 120 88 128 Z',
    think: 'M78 138 L122 134',
    smile: 'M72 130 Q100 156 128 130',
  }[mood];
  const fillMouth = mood === 'hype' || mood === 'shock';
  return (
    <svg width={250} height={270} viewBox="0 0 200 215" style={{transform: `translate(${shake}px, ${bob}px) scale(${pop})`, transformOrigin: '50% 100%', overflow: 'visible', filter: 'drop-shadow(0 10px 0 rgba(0,0,0,0.35))'}}>
      <g style={{transformOrigin: '30px 120px', transform: `rotate(${-arm}deg)`}}>
        <rect x={6} y={108} width={38} height={16} rx={8} fill={t.accent2} stroke="#000" strokeWidth={5} />
      </g>
      <g style={{transformOrigin: '170px 120px', transform: `rotate(${arm}deg)`}}>
        <rect x={156} y={108} width={38} height={16} rx={8} fill={t.accent2} stroke="#000" strokeWidth={5} />
      </g>
      <rect x={52} y={176} width={30} height={30} rx={12} fill={t.accent2} stroke="#000" strokeWidth={5} />
      <rect x={118} y={176} width={30} height={30} rx={12} fill={t.accent2} stroke="#000" strokeWidth={5} />
      <circle cx={100} cy={105} r={78} fill={t.accent} stroke="#000" strokeWidth={6} />
      <path d="M40 80 Q60 40 100 36" stroke="#fff" strokeOpacity={0.45} strokeWidth={9} strokeLinecap="round" fill="none" />
      <g transform={`translate(0 ${mood === 'think' ? -4 : 0})`}>
        <ellipse cx={74} cy={92} rx={20} ry={24 * blink + 1} fill="#fff" stroke="#000" strokeWidth={5} />
        <ellipse cx={126} cy={92} rx={20} ry={24 * blink + 1} fill="#fff" stroke="#000" strokeWidth={5} />
        <circle cx={74 + look} cy={94} r={mood === 'shock' ? 5 : 9} fill="#000" opacity={blink > 0.5 ? 1 : 0} />
        <circle cx={126 + look} cy={94} r={mood === 'shock' ? 5 : 9} fill="#000" opacity={blink > 0.5 ? 1 : 0} />
      </g>
      {mood === 'think' && <path d="M54 62 L92 70 M146 62 L108 70" stroke="#000" strokeWidth={6} strokeLinecap="round" />}
      <path d={mouth} fill={fillMouth ? '#3a0a1a' : 'none'} stroke="#000" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// Objetos que flotan al fondo para que el cuadro nunca esté quieto.
export const Floaters: React.FC<{t: Theme; kind?: string}> = ({t, kind}) => {
  const frame = useCurrentFrame();
  return (
    <>
      {Array.from({length: 7}, (_, i) => {
        const x = (i * 173 + 60) % 980;
        const y = 1900 - ((frame * (1.2 + (i % 3) * 0.6) + i * 290) % 2100);
        const r = 40 + (i % 3) * 22;
        const rot = frame * (i % 2 ? 1.5 : -1.2);
        return (
          <svg key={i} width={r * 2} height={r * 2} viewBox="-50 -50 100 100" style={{position: 'absolute', left: x, top: y, opacity: 0.16, transform: `rotate(${rot}deg)`}}>
            {kind === 'ball' ? (
              <g fill="none" stroke={t.accent} strokeWidth={5}>
                <circle r={44} />
                <path d="M-44 0 H44 M0 -44 V44 M-31 -31 Q0 0 -31 31 M31 -31 Q0 0 31 31" />
              </g>
            ) : kind === 'star' ? (
              <path d="M0 -44 L13 -14 L45 -12 L20 8 L28 40 L0 22 L-28 40 L-20 8 L-45 -12 L-13 -14 Z" fill={t.accent} />
            ) : (
              <circle r={40} fill={i % 2 ? t.accent : t.accent2} />
            )}
          </svg>
        );
      })}
    </>
  );
};
