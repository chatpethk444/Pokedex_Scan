export const DEX = {
  chassis: '#c52028',
  chassisDark: '#7d0d13',
  lens: '#0284c7',
  lensHi: '#a5f3fc',
  lcd: '#a9c6e8',
  lcdInk: '#2b3a4a',
  bezel: '#eaebec',
  greenLcd: '#65c559',
  greenInk: '#1d2b1a',
  black: '#0d1117',
  keyBlue: '#2f7fc5',
  keyBlueDark: '#1b5387',
  amber: '#f59e0b',
  emerald: '#10b981',
  crimson: '#ef4444',
  yellow: '#fab005',
  cyan: '#00f0ff',
} as const;

export const TYPE_COLORS: Record<string, string> = {
  psychic: '#bd93f9',
  rock: '#b6a136',
  flying: '#a890f0',
  fire: '#ee8130',
  water: '#6390f0',
  grass: '#7ac74c',
  electric: '#f1fa8c',
  normal: '#a8a77a',
  poison: '#a040a0',
  bug: '#a8b820',
  fairy: '#ee99ac',
  ghost: '#705898',
  dragon: '#7038f8',
  dark: '#705848',
  steel: '#b8b8d0',
  ice: '#98d8d8',
  fighting: '#c03028',
  ground: '#e0c068',
};

export function typeColor(t: string): string {
  return TYPE_COLORS[t] ?? '#888888';
}

export const FONTS = {
  pixel: 'PressStart2P_400Regular',
  tech: 'VT323_400Regular',
} as const;
