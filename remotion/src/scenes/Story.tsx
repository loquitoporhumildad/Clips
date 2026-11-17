import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Lang, Scene, tr} from '../types';
import {Theme} from '../themes';
import {BODY, HEAD, TopCaptions, fmt} from './common';

// Escena "story": recrea lo que pasó con dibujos planos que se mueven.
// Cada item es un dibujo (sprite) con un movimiento; se combinan como piezas de teatro.
type Story = Extract<Scene, {type: 'story'}>;
type Item = NonNullable<Story['items']>[number];

const K = '#0b0b14'; // contorno

const SPRITES: Record<string, (t: Theme, f: number) => React.ReactNode> = {
  rocket: (t, f) => (
    <>
      <g transform={`translate(0 ${Math.sin(f / 2) * 1.5})`}>
        <path d="M50 74 L38 74 L50 98 Z" fill="#ff7a00" transform={`scale(1 ${0.85 + 0.3 * Math.abs(Math.sin(f / 1.5))})`} style={{transformOrigin: '50px 74px'}} />
        <path d="M50 74 L43 74 L50 90 L57 74 Z" fill="#ffd23f" transform={`scale(1 ${0.8 + 0.4 * Math.abs(Math.cos(f / 1.2))})`} style={{transformOrigin: '50px 74px'}} />
      </g>
      <path d="M38 56 L20 80 L38 74 Z M62 56 L80 80 L62 74 Z" fill={t.accent} stroke={K} strokeWidth={3} strokeLinejoin="round" />
      <path d="M50 4 C66 20 68 46 62 74 H38 C32 46 34 20 50 4 Z" fill="#f4f6fb" stroke={K} strokeWidth={3.5} strokeLinejoin="round" />
      <path d="M38 52 H62" stroke={K} strokeWidth={3} />
      <circle cx={50} cy={34} r={9} fill={t.accent2} stroke={K} strokeWidth={3.5} />
      <circle cx={47} cy={31} r={2.6} fill="#fff" />
    </>
  ),
  satellite: (t) => (
    <>
      <rect x={4} y={36} width={30} height={28} rx={3} fill={t.accent2} stroke={K} strokeWidth={3} />
      <rect x={66} y={36} width={30} height={28} rx={3} fill={t.accent2} stroke={K} strokeWidth={3} />
      <path d="M19 36 V64 M11.5 50 H26.5 M81 36 V64 M73.5 50 H88.5" stroke={K} strokeWidth={1.6} opacity={0.5} />
      <rect x={34} y={40} width={32} height={20} rx={4} fill="#dfe4ef" stroke={K} strokeWidth={3} />
      <path d="M50 40 V26 M44 26 H56" stroke={K} strokeWidth={3} strokeLinecap="round" />
      <circle cx={50} cy={50} r={4} fill={t.accent} />
    </>
  ),
  clock: (t, f) => (
    <>
      <circle cx={50} cy={50} r={42} fill="#fff" stroke={K} strokeWidth={4} />
      <path d="M50 14 V20 M50 80 V86 M14 50 H20 M80 50 H86" stroke={K} strokeWidth={4} strokeLinecap="round" />
      <line x1={50} y1={50} x2={50} y2={22} stroke={K} strokeWidth={4} strokeLinecap="round" style={{transformOrigin: '50px 50px', transform: `rotate(${f * 14}deg)`}} />
      <line x1={50} y1={50} x2={50} y2={32} stroke={t.accent} strokeWidth={5} strokeLinecap="round" style={{transformOrigin: '50px 50px', transform: `rotate(${f * 1.2}deg)`}} />
      <circle cx={50} cy={50} r={4} fill={K} />
    </>
  ),
  warning: () => (
    <>
      <path d="M50 8 L94 88 H6 Z" fill="#ffd23f" stroke={K} strokeWidth={5} strokeLinejoin="round" />
      <rect x={46} y={34} width={8} height={30} rx={4} fill={K} />
      <circle cx={50} cy={74} r={5} fill={K} />
    </>
  ),
  explosion: (t, f) => (
    <>
      <path d="M50 2 L58 30 L84 14 L70 40 L98 50 L70 60 L84 86 L58 70 L50 98 L42 70 L16 86 L30 60 L2 50 L30 40 L16 14 L42 30 Z" fill="#ff5a1f" stroke={K} strokeWidth={4} strokeLinejoin="round" transform={`rotate(${f * 2} 50 50)`} />
      <path d="M50 20 L55 38 L72 30 L62 46 L80 50 L62 56 L72 72 L55 62 L50 80 L45 62 L28 72 L38 56 L20 50 L38 46 L28 30 L45 38 Z" fill="#ffd23f" />
      <circle cx={50} cy={50} r={11} fill="#fff" />
    </>
  ),
  check: () => (
    <>
      <circle cx={50} cy={50} r={44} fill="#2ecc71" stroke={K} strokeWidth={5} />
      <path d="M28 52 L44 68 L74 34" fill="none" stroke="#fff" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  cross: () => (
    <>
      <circle cx={50} cy={50} r={44} fill="#ff3b3b" stroke={K} strokeWidth={5} />
      <path d="M32 32 L68 68 M68 32 L32 68" stroke="#fff" strokeWidth={10} strokeLinecap="round" />
    </>
  ),
  earth: () => (
    <>
      <circle cx={50} cy={50} r={48} fill="#2f7be0" stroke={K} strokeWidth={4} />
      <path d="M20 34 Q34 22 44 30 Q40 44 28 46 Q18 44 20 34 Z M56 56 Q74 50 82 62 Q78 80 62 80 Q52 70 56 56 Z" fill="#3fbf6a" />
      <path d="M22 24 Q40 8 62 14" stroke="#fff" strokeOpacity={0.5} strokeWidth={5} strokeLinecap="round" fill="none" />
    </>
  ),
  question: (t) => (
    <>
      <circle cx={50} cy={50} r={44} fill={t.accent} stroke={K} strokeWidth={5} />
      <text x={50} y={70} textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize={64} fill="#fff" stroke={K} strokeWidth={4} paintOrder="stroke">?</text>
    </>
  ),
  dot: (t) => <circle cx={50} cy={50} r={30} fill={t.accent2} stroke={K} strokeWidth={5} />,
};

const useMotion = (it: Item, i: number) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const f = Math.max(0, frame - (it.d ?? 0));
  const pop = spring({frame: frame - (it.d ?? 0), fps, config: {damping: 11, stiffness: 150}});
  let x = 0, y = 0, rot = it.r ?? 0, sc = 1, op = 1;
  switch (it.m ?? 'pop') {
    case 'pop': sc = pop; op = Math.min(1, pop * 2); break;
    case 'rise': y = -f * 7; sc = Math.min(1, pop); break;
    case 'fall': y = f * f * 0.12; rot += f * 6 * (i % 2 ? 1 : -1); op = interpolate(f, [0, 4], [0, 1], {extrapolateRight: 'clamp'}); break;
    case 'shake': x = Math.sin(frame * 2.4) * 10; y = Math.cos(frame * 3.1) * 6; sc = Math.min(1, pop); break;
    case 'float': y = Math.sin(frame / 8 + i) * 14; sc = Math.min(1, pop); break;
    case 'slideL': x = interpolate(f, [0, 14], [-700, 0], {extrapolateRight: 'clamp'}); break;
    case 'slideR': x = interpolate(f, [0, 14], [700, 0], {extrapolateRight: 'clamp'}); break;
    case 'blink': sc = pop; op = Math.sin(frame / 3) > 0 ? 1 : 0.35; break;
  }
  return {x, y, rot, sc, op, f};
};

const One: React.FC<{it: Item; i: number; t: Theme; dx?: number; dy?: number; extraDelay?: number}> = ({it, i, t, dx = 0, dy = 0, extraDelay = 0}) => {
  const m = useMotion({...it, d: (it.d ?? 0) + extraDelay}, i);
  const draw = SPRITES[it.s] ?? SPRITES.dot;
  return (
    <svg
      viewBox="0 0 100 100"
      width={it.size}
      height={it.size}
      style={{position: 'absolute', left: `calc(${it.x}% - ${it.size / 2}px + ${dx + m.x}px)`, top: `calc(${it.y}% - ${it.size / 2}px + ${dy + m.y}px)`, opacity: m.op, transform: `rotate(${m.rot}deg) scale(${m.sc})`, overflow: 'visible', filter: 'drop-shadow(0 8px 0 rgba(0,0,0,0.3))'}}
    >
      {draw(t, m.f)}
    </svg>
  );
};

const Sky: React.FC<{t: Theme}> = ({t}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {Array.from({length: 26}, (_, i) => (
        <div key={i} style={{position: 'absolute', left: (i * 211) % 1060, top: 120 + ((i * 337) % 1500), width: 6 + (i % 3) * 3, height: 6 + (i % 3) * 3, borderRadius: '50%', background: '#fff', opacity: 0.25 + 0.5 * Math.abs(Math.sin(frame / 12 + i))}} />
      ))}
      <div style={{position: 'absolute', left: -300, right: -300, bottom: -1180, height: 1400, borderRadius: '50%', background: `radial-gradient(circle at 50% 12%, #3f8cff, #1a3f8f 70%)`, border: `6px solid ${K}`, opacity: 0.95}} />
    </AbsoluteFill>
  );
};

const Badge: React.FC<{b: NonNullable<Story['badges']>[number]; t: Theme; lang: Lang}> = ({b, t, lang}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const f = Math.max(0, frame - (b.d ?? 0));
  const pop = spring({frame: f, fps, config: {damping: 11, stiffness: 150}});
  const k = interpolate(f, [0, 28], [0, 1], {extrapolateRight: 'clamp', easing: (x) => 1 - Math.pow(1 - x, 3)});
  const color = b.color ?? t.accent;
  let body: React.ReactNode;
  if (b.kind === 'day') {
    body = b.value === undefined ? <>{tr(b.label, lang)}</> : <>{tr(b.label, lang) || 'DAY'} {Math.max(1, Math.round(b.value * k))}</>;
  } else if (b.kind === 'price') {
    const to = b.to ?? 0;
    const cut = interpolate(f, [18, 30], [0, 100], {extrapolateRight: 'clamp', extrapolateLeft: 'clamp'});
    body = (
      <span style={{display: 'inline-flex', gap: 24, alignItems: 'center'}}>
        <span style={{position: 'relative', opacity: 0.8}}>
          {b.unit ?? ''}{fmt(b.value ?? 0, b.decimals ?? 0)}
          <span style={{position: 'absolute', left: 0, top: '52%', height: 8, width: `${cut}%`, background: '#ff3b3b', borderRadius: 4}} />
        </span>
        <span style={{opacity: f > 26 ? 1 : 0}}>{b.unit ?? ''}{fmt(to, b.decimals ?? 0)}</span>
      </span>
    );
  } else {
    body = <>{b.unit?.startsWith('$') || b.unit === '€' ? b.unit : ''}{fmt((b.value ?? 0) * k, b.decimals ?? 0)}{b.unit && !(b.unit.startsWith('$') || b.unit === '€') ? ` ${b.unit}` : ''}</>;
  }
  return (
    <div style={{position: 'absolute', left: `${b.x}%`, top: `${b.y}%`, transform: `translate(-50%, -50%) scale(${pop})`, opacity: Math.min(1, pop * 2)}}>
      <div style={{padding: '14px 34px', borderRadius: 999, background: color, border: `5px solid ${K}`, boxShadow: '0 10px 0 rgba(0,0,0,0.35)', fontFamily: HEAD, fontSize: 84, lineHeight: 1.05, color: '#fff', whiteSpace: 'nowrap', WebkitTextStroke: `2px ${K}`, paintOrder: 'stroke fill', fontVariantNumeric: 'tabular-nums'}}>
        {body}
      </div>
    </div>
  );
};

export const StoryScene: React.FC<{s: Story; t: Theme; lang: Lang}> = ({s, t, lang}) => {
  const frame = useCurrentFrame();
  const pop = spring({frame, fps: 30, config: {damping: 13, stiffness: 140}});
  const hide = React.useContext(TopCaptions);
  const v = s.count ? interpolate(frame, [0, 30], [0, s.count.value], {extrapolateRight: 'clamp'}) : 0;
  return (
    <AbsoluteFill>
      {s.sky !== false && <Sky t={t} />}
      <AbsoluteFill>
        {s.items.map((it, i) => {
          if (!it.grid) return <One key={i} it={it} i={i} t={t} />;
          const [cols, rows] = it.grid;
          const gap = it.size * 1.12;
          return Array.from({length: cols * rows}, (_, k) => {
            const c = k % cols, r = Math.floor(k / cols);
            return <One key={`${i}-${k}`} it={{...it, ...(it.alt && it.alt[k] ? {s: it.alt[k]} : {})}} i={k} t={t} dx={(c - (cols - 1) / 2) * gap} dy={(r - (rows - 1) / 2) * gap} extraDelay={k * (it.stagger ?? 1)} />;
          });
        })}
      </AbsoluteFill>
      {(s.badges ?? []).map((b, i) => <Badge key={i} b={b} t={t} lang={lang} />)}
      {!hide && <AbsoluteFill style={{padding: '270px 40px 0 40px', alignItems: 'center'}}>
        <div style={{maxWidth: 960, padding: '26px 44px', borderRadius: 40, background: 'rgba(8,8,16,0.72)', border: '3px solid rgba(255,255,255,0.18)', boxShadow: '0 14px 0 rgba(0,0,0,0.3)', textAlign: 'center', transform: `scale(${0.9 + 0.1 * pop})`, opacity: pop}}>
          {s.count && (
            <div style={{fontFamily: HEAD, fontSize: 170, lineHeight: 1, color: t.accent, fontVariantNumeric: 'tabular-nums'}}>
              {fmt(v)}<span style={{fontSize: 80, color: t.accent2}}> {tr(s.count.suffix, lang)}</span>
            </div>
          )}
          <div style={{fontFamily: BODY, fontWeight: 900, fontSize: s.count ? 50 : 64, lineHeight: 1.1, color: '#fff'}}>{tr(s.caption, lang)}</div>
        </div>
      </AbsoluteFill>}
    </AbsoluteFill>
  );
};
