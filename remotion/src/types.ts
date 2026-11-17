export type Lang = 'en' | 'es';
export type T = Record<Lang, string>;

type Bg = {mood?: 'hype' | 'shock' | 'think' | 'smile'; bg?: string; bgStart?: number; cuts?: number[]; cutEvery?: number; narration?: T};

export type Scene = Bg & (
  | {type: 'hook'; seconds: number; kicker?: T; text: T}
  | {type: 'stat'; seconds: number; value: number; prefix?: string; suffix?: T | string; decimals?: number; label: T; source?: string}
  | {type: 'bars'; seconds: number; title: T; unit?: T | string; items: {label: T | string; value: number; highlight?: boolean}[]; source?: string}
  | {type: 'versus'; seconds: number; title: T; left: {label: T; value: number}; right: {label: T; value: number}; prefix?: string; decimals?: number; note?: T; source?: string}
  | {type: 'progress'; seconds: number; kicker: T; value: number; unit: T; percent: number; label: T; footer?: T}
  | {type: 'story'; seconds: number; caption: T; sky?: boolean; count?: {value: number; suffix: T}; items: {s: string; x: number; y: number; size: number; m?: 'pop' | 'rise' | 'fall' | 'shake' | 'float' | 'slideL' | 'slideR' | 'blink' | 'none'; d?: number; r?: number; grid?: [number, number]; stagger?: number; alt?: Record<number, string>}[]}
  | {type: 'outro'; seconds: number; big: T; small: T; cta: T}
);

export type Word = {w: string; t0: number; t1: number; scene: number};
export type VoiceTrack = {file: string; words: Word[]};

export type VideoSpec = {
  id: string;
  theme: string;
  langs: Lang[];
  audio?: boolean;
  music?: string;
  autoBg?: boolean;
  audioFile?: string;
  voiceTrack?: VoiceTrack;
  brand?: string;
  deco?: 'ball' | 'star' | 'dots' | 'none';
  mascot?: boolean;
  mascotType?: 'bolo' | 'robo' | 'zorro' | 'buho' | 'ficha' | 'dado';
  tag?: T | string;
  scenes: Scene[];
};

export type Props = {spec: VideoSpec; lang: Lang};

export const tr = (v: T | string | undefined, lang: Lang): string =>
  v === undefined ? '' : typeof v === 'string' ? v : v[lang];
