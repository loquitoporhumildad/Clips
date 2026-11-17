import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Theme} from '../themes';

export const HEAD = "'Anton', 'Impact', sans-serif";
export const BODY = "'Inter', 'DejaVu Sans', sans-serif";

export const useEnter = (delay = 0) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({frame: frame - delay, fps, config: {damping: 14, stiffness: 120}});
};

export const Rise: React.FC<{delay?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({delay = 0, children, style}) => {
  const p = useEnter(delay);
  return (
    <div style={{opacity: p, transform: `translateY(${(1 - p) * 60}px)`, ...style}}>{children}</div>
  );
};

export const Source: React.FC<{text?: string; t: Theme}> = ({text, t}) => {
  const frame = useCurrentFrame();
  if (!text) return null;
  const o = interpolate(frame, [15, 30], [0, 0.8], {extrapolateRight: 'clamp'});
  return (
    <div style={{marginTop: 28, fontFamily: BODY, fontSize: 30, color: t.muted, opacity: o}}>
      {text}
    </div>
  );
};

export const fmt = (n: number, decimals = 0) =>
  n.toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
