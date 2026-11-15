export type Lang = 'en' | 'es';
export type T = Record<Lang, string>;

type Bg = {bg?: string; bgStart?: number; cuts?: number[]; cutEvery?: number};

export type Scene = Bg & (
  | {type: 'hook'; seconds: number; kicker?: T; text: T}
  | {type: 'stat'; seconds: number; value: number; prefix?: string; suffix?: T | string; decimals?: number; label: T; source?: string}
  | {type: 'bars'; seconds: number; title: T; unit?: T | string; items: {label: T | string; value: number; highlight?: boolean}[]; source?: string}
  | {type: 'versus'; seconds: number; title: T; left: {label: T; value: number}; right: {label: T; value: number}; prefix?: string; decimals?: number; note?: T; source?: string}
  | {type: 'progress'; seconds: number; kicker: T; value: number; unit: T; percent: number; label: T; footer?: T}
  | {type: 'outro'; seconds: number; big: T; small: T; cta: T}
);

export type VideoSpec = {
  id: string;
  theme: string;
  langs: Lang[];
  audio?: boolean;
  music?: string;
  autoBg?: boolean;
  brand?: string;
  tag?: T | string;
  scenes: Scene[];
};

export type Props = {spec: VideoSpec; lang: Lang};

export const tr = (v: T | string | undefined, lang: Lang): string =>
  v === undefined ? '' : typeof v === 'string' ? v : v[lang];
