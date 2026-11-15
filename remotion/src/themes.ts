export type Theme = {
  bg1: string;
  bg2: string;
  accent: string;
  accent2: string;
  text: string;
  muted: string;
  handle: string;
};

// Una paleta por marca. Agregar aquí cuando se abra una marca nueva.
export const THEMES: Record<string, Theme> = {
  vice: {bg1: '#12002b', bg2: '#3b0a4f', accent: '#ff3ea5', accent2: '#2de2e6', text: '#ffffff', muted: '#c9b6e4', handle: ''},
  ai: {bg1: '#050807', bg2: '#0d1f17', accent: '#3dff9a', accent2: '#9be7ff', text: '#ffffff', muted: '#9fb3a8', handle: ''},
  sports: {bg1: '#04170d', bg2: '#0b3d22', accent: '#ffd23f', accent2: '#ffffff', text: '#ffffff', muted: '#b5d3c1', handle: ''},
};

export const theme = (name: string): Theme => THEMES[name] ?? THEMES.vice;
