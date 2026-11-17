import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Lang, Scene, tr} from '../types';
import {Theme} from '../themes';
import {BODY, HEAD, Rise, Source, fmt, useEnter} from './common';
import {StoryScene} from './Story';

// Zona segura: TikTok/Reels tapan ~380px abajo y ~150px a la derecha.
const Frame: React.FC<{children: React.ReactNode}> = ({children}) => {
  const p = useEnter(0);
  return (
    <AbsoluteFill style={{padding: '280px 40px 450px 40px', justifyContent: 'center'}}>
      <div style={{padding: '48px 56px', borderRadius: 48, background: 'rgba(8,8,16,0.55)', border: '3px solid rgba(255,255,255,0.14)', boxShadow: '0 18px 0 rgba(0,0,0,0.3)', textShadow: '0 4px 0 rgba(0,0,0,0.4)', transform: `translateY(${(1 - p) * 80}px) scale(${0.94 + 0.06 * p})`, opacity: p, marginRight: 150}}>{children}</div>
    </AbsoluteFill>
  );
};

const Hook: React.FC<{s: Extract<Scene, {type: 'hook'}>; t: Theme; lang: Lang}> = ({s, t, lang}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 6], [1.25, 1], {extrapolateRight: 'clamp'});
  return (
    <Frame>
      {s.kicker && (
        <div style={{fontFamily: HEAD, fontSize: 150, lineHeight: 0.95, color: t.accent, transform: `scale(${scale})`, transformOrigin: 'left center'}}>
          {tr(s.kicker, lang)}
        </div>
      )}
      <Rise delay={4}>
        <div style={{fontFamily: BODY, fontWeight: 900, fontSize: 76, lineHeight: 1.08, color: t.text, marginTop: 30}}>{tr(s.text, lang)}</div>
      </Rise>
    </Frame>
  );
};

const Stat: React.FC<{s: Extract<Scene, {type: 'stat'}>; t: Theme; lang: Lang}> = ({s, t, lang}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = interpolate(frame, [0, fps * 1.2], [0, s.value], {extrapolateRight: 'clamp', easing: (x) => 1 - Math.pow(1 - x, 3)});
  const chars = (s.prefix ?? '').length + fmt(s.value, s.decimals ?? 0).length;
  const size = Math.min(260, Math.floor(1700 / Math.max(chars, 1)));
  return (
    <Frame>
      <div style={{fontFamily: HEAD, fontSize: size, lineHeight: 1, color: t.accent, fontVariantNumeric: 'tabular-nums'}}>
        {s.prefix ?? ''}
        {fmt(v, s.decimals ?? 0)}
        <span style={{fontSize: 120, color: t.accent2}}> {tr(s.suffix, lang)}</span>
      </div>
      <Rise delay={8}>
        <div style={{fontFamily: BODY, fontWeight: 800, fontSize: 64, color: t.text, marginTop: 20, lineHeight: 1.1}}>{tr(s.label, lang)}</div>
      </Rise>
      <Source text={s.source} t={t} />
    </Frame>
  );
};

const Bars: React.FC<{s: Extract<Scene, {type: 'bars'}>; t: Theme; lang: Lang}> = ({s, t, lang}) => {
  const frame = useCurrentFrame();
  const max = Math.max(...s.items.map((i) => i.value));
  return (
    <Frame>
      <Rise>
        <div style={{fontFamily: BODY, fontWeight: 900, fontSize: 62, color: t.text, marginBottom: 50, lineHeight: 1.1}}>{tr(s.title, lang)}</div>
      </Rise>
      {s.items.map((it, i) => {
        const start = 8 + i * 8;
        const p = interpolate(frame, [start, start + 24], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (x) => 1 - Math.pow(1 - x, 3)});
        const color = it.highlight ? t.accent : t.muted;
        return (
          <div key={i} style={{marginBottom: 44, opacity: interpolate(p, [0, 0.2], [0, 1], {extrapolateRight: 'clamp'})}}>
            <div style={{fontFamily: BODY, fontWeight: 700, fontSize: 40, color: t.text, marginBottom: 12}}>{tr(it.label, lang)}</div>
            <div style={{display: 'flex', alignItems: 'center', gap: 24}}>
              <div style={{height: 70, width: `${(it.value / max) * 72 * p}%`, background: color, borderRadius: 14}} />
              <div style={{fontFamily: HEAD, fontSize: 64, color}}>
                {fmt(it.value * p, it.value % 1 ? 1 : 0)}
                {tr(s.unit, lang)}
              </div>
            </div>
          </div>
        );
      })}
      <Source text={s.source} t={t} />
    </Frame>
  );
};

const Versus: React.FC<{s: Extract<Scene, {type: 'versus'}>; t: Theme; lang: Lang}> = ({s, t, lang}) => {
  const a = useEnter(6);
  const b = useEnter(16);
  const d = s.decimals ?? 0;
  const col = (label: string, value: number, color: string, p: number) => (
    <div style={{flex: 1, opacity: p, transform: `scale(${0.8 + 0.2 * p})`}}>
      <div style={{fontFamily: HEAD, fontSize: 150, color, lineHeight: 1}}>
        {s.prefix ?? ''}
        {fmt(value, d)}
      </div>
      <div style={{fontFamily: BODY, fontWeight: 700, fontSize: 40, color: t.text, marginTop: 16, lineHeight: 1.15}}>{label}</div>
    </div>
  );
  return (
    <Frame>
      <Rise>
        <div style={{fontFamily: BODY, fontWeight: 900, fontSize: 62, color: t.text, marginBottom: 60, lineHeight: 1.1}}>{tr(s.title, lang)}</div>
      </Rise>
      <div style={{display: 'flex', gap: 40}}>
        {col(tr(s.left.label, lang), s.left.value, t.accent, a)}
        {col(tr(s.right.label, lang), s.right.value, t.muted, b)}
      </div>
      {s.note && (
        <Rise delay={26}>
          <div style={{fontFamily: BODY, fontWeight: 800, fontSize: 52, color: t.accent2, marginTop: 60}}>{tr(s.note, lang)}</div>
        </Rise>
      )}
      <Source text={s.source} t={t} />
    </Frame>
  );
};

const Outro: React.FC<{s: Extract<Scene, {type: 'outro'}>; t: Theme; lang: Lang}> = ({s, t, lang}) => {
  const frame = useCurrentFrame();
  const pulse = 1 + 0.04 * Math.sin(frame / 4);
  return (
    <Frame>
      <Rise>
        <div style={{fontFamily: HEAD, fontSize: 170, color: t.accent, lineHeight: 1}}>{tr(s.big, lang)}</div>
      </Rise>
      <Rise delay={6}>
        <div style={{fontFamily: BODY, fontWeight: 800, fontSize: 56, color: t.text, marginTop: 24}}>{tr(s.small, lang)}</div>
      </Rise>
      <Rise delay={14}>
        <div style={{display: 'inline-block', marginTop: 70, padding: '24px 40px', borderRadius: 999, background: t.accent2, color: t.bg1, fontFamily: BODY, fontWeight: 900, fontSize: 48, transform: `scale(${pulse})`}}>
          {tr(s.cta, lang)}
        </div>
      </Rise>
    </Frame>
  );
};

// Formato "progreso": número gigante, barra casi llena y fondo que cambia con la música.
// Pensado para verse en bucle: no tiene entrada ni salida.
const Progress: React.FC<{s: Extract<Scene, {type: 'progress'}>; t: Theme; lang: Lang}> = ({s, t, lang}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const golpe = 1 + 0.035 * Math.max(0, 1 - ((frame % Math.round(fps * 0.5)) / (fps * 0.18)));
  const brillo = 0.55 + 0.45 * Math.abs(Math.sin(frame / 9));
  return (
    <AbsoluteFill style={{padding: '300px 160px 440px 80px', justifyContent: 'center', textShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 50px rgba(0,0,0,0.6)'}}>
      <div style={{fontFamily: BODY, fontWeight: 900, fontSize: 54, letterSpacing: 3, color: t.text}}>{tr(s.kicker, lang)}</div>
      <div style={{display: 'flex', alignItems: 'baseline', gap: 26, transform: `scale(${golpe})`, transformOrigin: 'left center'}}>
        <span style={{fontFamily: HEAD, fontSize: 520, lineHeight: 0.92, color: t.accent}}>{s.value}</span>
        <span style={{fontFamily: HEAD, fontSize: 150, color: t.accent2}}>{tr(s.unit, lang)}</span>
      </div>
      <div style={{marginTop: 34, height: 44, borderRadius: 22, background: 'rgba(255,255,255,0.22)', overflow: 'hidden', boxShadow: '0 6px 0 rgba(0,0,0,0.35)'}}>
        <div style={{height: '100%', width: `${s.percent}%`, borderRadius: 22, background: t.accent, opacity: brillo}} />
      </div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 18}}>
        <span style={{fontFamily: BODY, fontWeight: 800, fontSize: 44, color: t.text}}>{tr(s.label, lang)}</span>
        <span style={{fontFamily: HEAD, fontSize: 84, color: t.text, fontVariantNumeric: 'tabular-nums'}}>{fmt(s.percent, 1)}%</span>
      </div>
      {s.footer && <div style={{fontFamily: BODY, fontWeight: 800, fontSize: 46, color: t.accent2, marginTop: 44}}>{tr(s.footer, lang)}</div>}
    </AbsoluteFill>
  );
};

export const SceneView: React.FC<{s: Scene; t: Theme; lang: Lang}> = ({s, t, lang}) => {
  switch (s.type) {
    case 'hook':
      return <Hook s={s} t={t} lang={lang} />;
    case 'stat':
      return <Stat s={s} t={t} lang={lang} />;
    case 'bars':
      return <Bars s={s} t={t} lang={lang} />;
    case 'versus':
      return <Versus s={s} t={t} lang={lang} />;
    case 'progress':
      return <Progress s={s} t={t} lang={lang} />;
    case 'story':
      return <StoryScene s={s} t={t} lang={lang} />;
    case 'outro':
      return <Outro s={s} t={t} lang={lang} />;
  }
};
