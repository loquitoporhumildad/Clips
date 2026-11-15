import React from 'react';
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import '@fontsource/anton/400.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/inter/900.css';
import {Props} from './types';
import {theme} from './themes';
import {SceneView} from './scenes/Scenes';

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
            <SceneView s={s} t={t} lang={lang} />
          </Sequence>
        );
        from += len;
        return seq;
      })}
    </AbsoluteFill>
  );
};
