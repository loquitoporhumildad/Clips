import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Theme} from './themes';

export type Mood = 'hype' | 'shock' | 'think' | 'smile';
export type Variant = 'bolo' | 'robo' | 'zorro' | 'buho';

// "Bolo": personaje propio de la fábrica. Cuerpo redondo con ojos que parpadean,
// brazos que se mueven y una boca que cambia según el ánimo de la escena.
export const Mascot: React.FC<{mood: Mood; t: Theme; variant?: Variant}> = ({mood, t, variant = 'bolo'}) => {
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
      {variant === 'robo' && (
        <>
          <line x1={100} y1={34} x2={100} y2={14} stroke="#000" strokeWidth={6} />
          <circle cx={100} cy={12} r={9} fill={t.accent2} stroke="#000" strokeWidth={5} style={{transform: `scale(${1 + beat * 0.4})`, transformOrigin: '100px 12px'}} />
          <rect x={20} y={80} width={14} height={40} rx={6} fill={t.accent2} stroke="#000" strokeWidth={5} />
          <rect x={166} y={80} width={14} height={40} rx={6} fill={t.accent2} stroke="#000" strokeWidth={5} />
          <rect x={30} y={34} width={140} height={142} rx={30} fill={t.accent} stroke="#000" strokeWidth={6} />
          <rect x={44} y={56} width={112} height={78} rx={18} fill="#10131c" stroke="#000" strokeWidth={4} />
        </>
      )}
      {variant === 'zorro' && (
        <>
          <path d="M34 70 L44 14 L92 42 Z" fill={t.accent} stroke="#000" strokeWidth={6} strokeLinejoin="round" />
          <path d="M166 70 L156 14 L108 42 Z" fill={t.accent} stroke="#000" strokeWidth={6} strokeLinejoin="round" />
          <path d="M46 62 L50 32 L72 46 Z M154 62 L150 32 L128 46 Z" fill="#fff" opacity={0.9} />
          <ellipse cx={100} cy={108} rx={80} ry={72} fill={t.accent} stroke="#000" strokeWidth={6} />
          <path d="M22 118 Q60 160 100 168 Q140 160 178 118 Q140 128 100 112 Q60 128 22 118 Z" fill="#fff" />
          <ellipse cx={100} cy={118} rx={9} ry={7} fill="#000" />
        </>
      )}
      {variant === 'buho' && (
        <>
          <path d="M36 52 L30 14 L70 34 Z M164 52 L170 14 L130 34 Z" fill={t.accent} stroke="#000" strokeWidth={6} strokeLinejoin="round" />
          <ellipse cx={100} cy={110} rx={74} ry={80} fill={t.accent} stroke="#000" strokeWidth={6} />
          <ellipse cx={100} cy={142} rx={42} ry={34} fill="#fff" opacity={0.5} />
          <path d="M92 114 L108 114 L100 128 Z" fill={t.accent2} stroke="#000" strokeWidth={4} strokeLinejoin="round" />
        </>
      )}
      {variant === 'bolo' && (
        <>
          <circle cx={100} cy={105} r={78} fill={t.accent} stroke="#000" strokeWidth={6} />
          <path d="M40 80 Q60 40 100 36" stroke="#fff" strokeOpacity={0.45} strokeWidth={9} strokeLinecap="round" fill="none" />
        </>
      )}
      <g transform={`translate(0 ${mood === 'think' ? -4 : 0})`}>
        <ellipse cx={74} cy={92} rx={20} ry={24 * blink + 1} fill="#fff" stroke="#000" strokeWidth={5} />
        <ellipse cx={126} cy={92} rx={20} ry={24 * blink + 1} fill="#fff" stroke="#000" strokeWidth={5} />
        <circle cx={74 + look} cy={94} r={mood === 'shock' ? 5 : 9} fill="#000" opacity={blink > 0.5 ? 1 : 0} />
        <circle cx={126 + look} cy={94} r={mood === 'shock' ? 5 : 9} fill="#000" opacity={blink > 0.5 ? 1 : 0} />
      </g>
      {mood === 'think' && <path d="M54 62 L92 70 M146 62 L108 70" stroke="#000" strokeWidth={6} strokeLinecap="round" />}
      <path d={mouth} transform={variant === 'zorro' || variant === 'buho' ? 'translate(0 26)' : undefined} fill={fillMouth ? '#3a0a1a' : 'none'} stroke="#000" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
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
