import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import '@fontsource/anton/400.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/inter/900.css';
import {Props, Scene, tr} from './types';
import {theme} from './themes';
import {SceneView} from './scenes/Scenes';

const isVideo = (f: string) => /\.(mp4|webm|mov)$/i.test(f);

// Fondo de la escena: clip o imagen de public/media, oscurecido para que se lea el texto.
const Bg: React.FC<{s: Scene; dark: string}> = ({s, dark}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (!s.bg) return null;
  const src = staticFile(`media/${s.bg}`);
  const zoom = 1.08 + frame * 0.0006;
  const fill: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})`};
  return (
    <AbsoluteFill>
      {isVideo(s.bg) ? <OffthreadVideo muted src={src} startFrom={Math.round((s.bgStart ?? 0) * fps)} style={fill} /> : <Img src={src} style={fill} />}
      <AbsoluteFill style={{background: `linear-gradient(180deg, ${dark}cc 0%, ${dark}99 45%, ${dark}f2 100%)`}} />
    </AbsoluteFill>
  );
};

// Entrada de cada corte: destello + pequeño zoom, como en una edición hecha a mano.
const Cut: React.FC<{children: React.ReactNode}> = ({children}) => {
  const frame = useCurrentFrame();
  const z = interpolate(frame, [0, 7], [1.07, 1], {extrapolateRight: 'clamp'});
  const flash = interpolate(frame, [0, 5], [0.3, 0], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{transform: `scale(${z})`}}>{children}</AbsoluteFill>
      <AbsoluteFill style={{background: '#fff', opacity: flash}} />
    </AbsoluteFill>
  );
};

const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{opacity: 0.16, mixBlendMode: 'overlay'}}>
      <svg width="100%" height="100%">
        <filter id="g">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={frame % 6} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#g)" />
      </svg>
    </AbsoluteFill>
  );
};

export const DataShort: React.FC<Props> = ({spec, lang}) => {
  const {fps, durationInFrames} = useVideoConfig();
  const frame = useCurrentFrame();
  const t = theme(spec.theme);
  let from = 0;
  const drift = interpolate(frame, [0, durationInFrames], [0, 30]);
  return (
    <AbsoluteFill style={{background: `linear-gradient(${160 + drift}deg, ${t.bg1}, ${t.bg2})`}}>
      {/* barra de progreso: ayuda a la retención */}
      <div style={{position: 'absolute', top: 0, left: 0, height: 12, width: `${(frame / durationInFrames) * 100}%`, background: t.accent}} />
      {spec.scenes.map((s, i) => {
        const len = Math.round(s.seconds * fps);
        const seq = (
          <Sequence key={i} from={from} durationInFrames={len}>
            <Bg s={s} dark={t.bg1} />
            <Cut>
              <SceneView s={s} t={t} lang={lang} />
            </Cut>
          </Sequence>
        );
        from += len;
        return seq;
      })}
      {spec.tag && (
        <div style={{position: 'absolute', top: 170, left: 80, padding: '10px 22px', background: t.accent, color: t.bg1, fontFamily: "'Inter', sans-serif", fontWeight: 900, fontSize: 34, letterSpacing: 2, transform: 'rotate(-2deg)'}}>
          {tr(spec.tag, lang)}
        </div>
      )}
      <Grain />
      {spec.audio !== false && <Audio src={staticFile(`audio/${spec.id}.wav`)} />}
    </AbsoluteFill>
  );
};
