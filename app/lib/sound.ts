import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { preload, setAudioModeAsync, useAudioPlayer } from 'expo-audio';

// Warm the decode cache at import: the first button press must never be
// silent while a sound is still buffering. Cry _001s are the guaranteed
// first-play variants (see cryVariantsFor).
const PRELOAD_SOURCES: unknown[] = [
  require('../assets/sounds/pokedex_click.ogg'),
  require('../assets/sounds/pokedex_click_short.ogg'),
  require('../assets/sounds/sweep.wav'),
  require('../assets/sounds/shutter.wav'),
  require('../assets/sounds/success.wav'),
  require('../assets/sounds/entry.wav'),
  require('../assets/sounds/error.wav'),
  require('../assets/sounds/lowconf.wav'),
  require('../assets/sounds/pokedex_open.ogg'),
  require('../assets/sounds/pokedex_close.ogg'),
  require('../assets/sounds/pokedex_scan_open.ogg'),
  require('../assets/sounds/pokedex_scan_loop.ogg'),
  require('../assets/sounds/pokedex_scan_close.ogg'),
  require('../assets/sounds/pokedex_scan_detail.ogg'),
  require('../assets/sounds/pokedex_scan_zoom_increment.ogg'),
  require('../assets/sounds/pokedex_scan_register_pokemon.ogg'),
  require('../assets/sounds/pokedex_scan_register_aspect.ogg'),
  require('../assets/cries/pikachu/pikachu_001.wav'),
  require('../assets/cries/eevee/eevee_001.wav'),
];
try {
  for (const src of PRELOAD_SOURCES) {
    void Promise.resolve(preload(src as string)).catch(() => undefined);
  }
} catch {
  /* best-effort */
}

export interface SoundPrefs {
  muted: boolean;
  /** 0..1 */
  volume: number;
  autoCry: boolean;
  autoNarrate: boolean;
}

export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  muted: false,
  volume: 1,
  autoCry: true,
  autoNarrate: true,
};

const PREFS_KEY = 'pokt-sound-v1';

export function sanitizeSoundPrefs(raw: unknown): SoundPrefs {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<SoundPrefs>;
  const vol = typeof r.volume === 'number' && Number.isFinite(r.volume)
    ? Math.min(1, Math.max(0, r.volume))
    : 1;
  return {
    muted: r.muted === true,
    volume: vol,
    autoCry: r.autoCry !== false,
    autoNarrate: r.autoNarrate !== false,
  };
}

export async function loadSoundPrefs(): Promise<SoundPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_SOUND_PREFS;
    return sanitizeSoundPrefs(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_SOUND_PREFS;
  }
}

export async function saveSoundPrefs(p: SoundPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* best-effort */
  }
}

export interface DexSounds {
  click: () => void;
  clickShort: () => void;
  sweep: () => void;
  shutter: () => void;
  success: () => void;
  entry: () => void;
  error: () => void;
  lowconf: () => void;
  open: () => void;
  close: () => void;
  snap: () => void;
  scanLoopStart: () => void;
  scanLoopStop: () => void;
  scanClose: () => void;
  detail: () => void;
  zoom: () => void;
  regPokemon: () => void;
  regAspect: () => void;
  cry: (url: string, name?: string) => void;
  cryFirst: (url: string, name?: string) => void;
  cryRandom: (url: string, name?: string) => void;
  narrate: (name: string) => Narration;
  hasNarration: (name: string) => boolean;
  stopNarrate: () => void;
  prefs: SoundPrefs;
  updatePrefs: (patch: Partial<SoundPrefs>) => void;
}

export interface Narration {
  ms: number;
  peaks: number[];
}

// Per-species spoken Data entries (local bundle, all 149 Kanto).
// Key: normalized lowercase pokemon name (letters only).
const NARRATIONS: Record<string, { src: unknown; ms: number; peaks: number[] }> = {
  abra: {
    src: require('../assets/sounds/Abra_dataentry.wav'),
    ms: 9880,
    peaks: require('../assets/sounds/Abra_dataentry.peaks.json') as number[],
  },
  aerodactyl: {
    src: require('../assets/sounds/Aerodactyl_dataentry.wav'),
    ms: 11720,
    peaks: require('../assets/sounds/Aerodactyl_dataentry.peaks.json') as number[],
  },
  alakazam: {
    src: require('../assets/sounds/Alakazam_dataentry.wav'),
    ms: 9840,
    peaks: require('../assets/sounds/Alakazam_dataentry.peaks.json') as number[],
  },
  arbok: {
    src: require('../assets/sounds/Arbok_dataentry.wav'),
    ms: 10160,
    peaks: require('../assets/sounds/Arbok_dataentry.peaks.json') as number[],
  },
  arcanine: {
    src: require('../assets/sounds/Arcanine_dataentry.wav'),
    ms: 10800,
    peaks: require('../assets/sounds/Arcanine_dataentry.peaks.json') as number[],
  },
  articuno: {
    src: require('../assets/sounds/Articuno_dataentry.wav'),
    ms: 11560,
    peaks: require('../assets/sounds/Articuno_dataentry.peaks.json') as number[],
  },
  beedrill: {
    src: require('../assets/sounds/Beedrill_dataentry.wav'),
    ms: 11320,
    peaks: require('../assets/sounds/Beedrill_dataentry.peaks.json') as number[],
  },
  bellsprout: {
    src: require('../assets/sounds/Bellsprout_dataentry.wav'),
    ms: 11200,
    peaks: require('../assets/sounds/Bellsprout_dataentry.peaks.json') as number[],
  },
  blastoise: {
    src: require('../assets/sounds/Blastoise_dataentry.wav'),
    ms: 11280,
    peaks: require('../assets/sounds/Blastoise_dataentry.peaks.json') as number[],
  },
  bulbasaur: {
    src: require('../assets/sounds/Bulbasaur_dataentry.wav'),
    ms: 10720,
    peaks: require('../assets/sounds/Bulbasaur_dataentry.peaks.json') as number[],
  },
  butterfree: {
    src: require('../assets/sounds/Butterfree_dataentry.wav'),
    ms: 11040,
    peaks: require('../assets/sounds/Butterfree_dataentry.peaks.json') as number[],
  },
  caterpie: {
    src: require('../assets/sounds/Caterpie_dataentry.wav'),
    ms: 10160,
    peaks: require('../assets/sounds/Caterpie_dataentry.peaks.json') as number[],
  },
  chansey: {
    src: require('../assets/sounds/Chansey_dataentry.wav'),
    ms: 10200,
    peaks: require('../assets/sounds/Chansey_dataentry.peaks.json') as number[],
  },
  charizard: {
    src: require('../assets/sounds/Charizard_dataentry.wav'),
    ms: 11570,
    peaks: require('../assets/sounds/Charizard_dataentry.peaks.json') as number[],
  },
  charmander: {
    src: require('../assets/sounds/Charmander_dataentry.wav'),
    ms: 15840,
    peaks: require('../assets/sounds/Charmander_dataentry.peaks.json') as number[],
  },
  charmeleon: {
    src: require('../assets/sounds/Charmeleon_dataentry.wav'),
    ms: 11560,
    peaks: require('../assets/sounds/Charmeleon_dataentry.peaks.json') as number[],
  },
  clefable: {
    src: require('../assets/sounds/Clefable_dataentry.wav'),
    ms: 11360,
    peaks: require('../assets/sounds/Clefable_dataentry.peaks.json') as number[],
  },
  clefairy: {
    src: require('../assets/sounds/Clefairy_dataentry.wav'),
    ms: 9640,
    peaks: require('../assets/sounds/Clefairy_dataentry.peaks.json') as number[],
  },
  cloyster: {
    src: require('../assets/sounds/Cloyster_dataentry.wav'),
    ms: 11360,
    peaks: require('../assets/sounds/Cloyster_dataentry.peaks.json') as number[],
  },
  cubone: {
    src: require('../assets/sounds/Cubone_dataentry.wav'),
    ms: 9870,
    peaks: require('../assets/sounds/Cubone_dataentry.peaks.json') as number[],
  },
  dewgong: {
    src: require('../assets/sounds/Dewgong_dataentry.wav'),
    ms: 12160,
    peaks: require('../assets/sounds/Dewgong_dataentry.peaks.json') as number[],
  },
  diglett: {
    src: require('../assets/sounds/Diglett_dataentry.wav'),
    ms: 10680,
    peaks: require('../assets/sounds/Diglett_dataentry.peaks.json') as number[],
  },
  ditto: {
    src: require('../assets/sounds/Ditto_dataentry.wav'),
    ms: 11710,
    peaks: require('../assets/sounds/Ditto_dataentry.peaks.json') as number[],
  },
  dodrio: {
    src: require('../assets/sounds/Dodrio_dataentry.wav'),
    ms: 10840,
    peaks: require('../assets/sounds/Dodrio_dataentry.peaks.json') as number[],
  },
  doduo: {
    src: require('../assets/sounds/Doduo_dataentry.wav'),
    ms: 11360,
    peaks: require('../assets/sounds/Doduo_dataentry.peaks.json') as number[],
  },
  dragonair: {
    src: require('../assets/sounds/Dragonair_dataentry.wav'),
    ms: 10760,
    peaks: require('../assets/sounds/Dragonair_dataentry.peaks.json') as number[],
  },
  dragonite: {
    src: require('../assets/sounds/Dragonite_dataentry.wav'),
    ms: 10360,
    peaks: require('../assets/sounds/Dragonite_dataentry.peaks.json') as number[],
  },
  dratini: {
    src: require('../assets/sounds/Dratini_dataentry.wav'),
    ms: 10520,
    peaks: require('../assets/sounds/Dratini_dataentry.peaks.json') as number[],
  },
  drowzee: {
    src: require('../assets/sounds/Drowzee_dataentry.wav'),
    ms: 9850,
    peaks: require('../assets/sounds/Drowzee_dataentry.peaks.json') as number[],
  },
  dugtrio: {
    src: require('../assets/sounds/Dugtrio_dataentry.wav'),
    ms: 9040,
    peaks: require('../assets/sounds/Dugtrio_dataentry.peaks.json') as number[],
  },
  eevee: {
    src: require('../assets/sounds/Eevee_dataentry.wav'),
    ms: 11040,
    peaks: require('../assets/sounds/Eevee_dataentry.peaks.json') as number[],
  },
  ekans: {
    src: require('../assets/sounds/Ekans_dataentry.wav'),
    ms: 10320,
    peaks: require('../assets/sounds/Ekans_dataentry.peaks.json') as number[],
  },
  electabuzz: {
    src: require('../assets/sounds/Electabuzz_dataentry.wav'),
    ms: 12680,
    peaks: require('../assets/sounds/Electabuzz_dataentry.peaks.json') as number[],
  },
  electrode: {
    src: require('../assets/sounds/Electrode_dataentry.wav'),
    ms: 11470,
    peaks: require('../assets/sounds/Electrode_dataentry.peaks.json') as number[],
  },
  exeggcute: {
    src: require('../assets/sounds/Exeggcute_dataentry.wav'),
    ms: 11320,
    peaks: require('../assets/sounds/Exeggcute_dataentry.peaks.json') as number[],
  },
  exeggutor: {
    src: require('../assets/sounds/Exeggutor_dataentry.wav'),
    ms: 10320,
    peaks: require('../assets/sounds/Exeggutor_dataentry.peaks.json') as number[],
  },
  farfetchd: {
    src: require('../assets/sounds/Farfetchd_dataentry.wav'),
    ms: 10190,
    peaks: require('../assets/sounds/Farfetchd_dataentry.peaks.json') as number[],
  },
  fearow: {
    src: require('../assets/sounds/Fearow_dataentry.wav'),
    ms: 9760,
    peaks: require('../assets/sounds/Fearow_dataentry.peaks.json') as number[],
  },
  flareon: {
    src: require('../assets/sounds/Flareon_dataentry.wav'),
    ms: 10000,
    peaks: require('../assets/sounds/Flareon_dataentry.peaks.json') as number[],
  },
  gastly: {
    src: require('../assets/sounds/Gastly_dataentry.wav'),
    ms: 10680,
    peaks: require('../assets/sounds/Gastly_dataentry.peaks.json') as number[],
  },
  gengar: {
    src: require('../assets/sounds/Gengar_dataentry.wav'),
    ms: 11000,
    peaks: require('../assets/sounds/Gengar_dataentry.peaks.json') as number[],
  },
  geodude: {
    src: require('../assets/sounds/Geodude_dataentry.wav'),
    ms: 10670,
    peaks: require('../assets/sounds/Geodude_dataentry.peaks.json') as number[],
  },
  gloom: {
    src: require('../assets/sounds/Gloom_dataentry.wav'),
    ms: 9200,
    peaks: require('../assets/sounds/Gloom_dataentry.peaks.json') as number[],
  },
  golbat: {
    src: require('../assets/sounds/Golbat_dataentry.wav'),
    ms: 11480,
    peaks: require('../assets/sounds/Golbat_dataentry.peaks.json') as number[],
  },
  goldeen: {
    src: require('../assets/sounds/Goldeen_dataentry.wav'),
    ms: 10320,
    peaks: require('../assets/sounds/Goldeen_dataentry.peaks.json') as number[],
  },
  golduck: {
    src: require('../assets/sounds/Golduck_dataentry.wav'),
    ms: 11310,
    peaks: require('../assets/sounds/Golduck_dataentry.peaks.json') as number[],
  },
  golem: {
    src: require('../assets/sounds/Golem_dataentry.wav'),
    ms: 9720,
    peaks: require('../assets/sounds/Golem_dataentry.peaks.json') as number[],
  },
  graveler: {
    src: require('../assets/sounds/Graveler_dataentry.wav'),
    ms: 9880,
    peaks: require('../assets/sounds/Graveler_dataentry.peaks.json') as number[],
  },
  grimer: {
    src: require('../assets/sounds/Grimer_dataentry.wav'),
    ms: 11740,
    peaks: require('../assets/sounds/Grimer_dataentry.peaks.json') as number[],
  },
  growlithe: {
    src: require('../assets/sounds/Growlithe_dataentry.wav'),
    ms: 10350,
    peaks: require('../assets/sounds/Growlithe_dataentry.peaks.json') as number[],
  },
  gyarados: {
    src: require('../assets/sounds/Gyarados_dataentry.wav'),
    ms: 10520,
    peaks: require('../assets/sounds/Gyarados_dataentry.peaks.json') as number[],
  },
  haunter: {
    src: require('../assets/sounds/Haunter_dataentry.wav'),
    ms: 9520,
    peaks: require('../assets/sounds/Haunter_dataentry.peaks.json') as number[],
  },
  hitmonchan: {
    src: require('../assets/sounds/Hitmonchan_dataentry.wav'),
    ms: 12240,
    peaks: require('../assets/sounds/Hitmonchan_dataentry.peaks.json') as number[],
  },
  hitmonlee: {
    src: require('../assets/sounds/Hitmonlee_dataentry.wav'),
    ms: 11400,
    peaks: require('../assets/sounds/Hitmonlee_dataentry.peaks.json') as number[],
  },
  horsea: {
    src: require('../assets/sounds/Horsea_dataentry.wav'),
    ms: 10870,
    peaks: require('../assets/sounds/Horsea_dataentry.peaks.json') as number[],
  },
  hypno: {
    src: require('../assets/sounds/Hypno_dataentry.wav'),
    ms: 9830,
    peaks: require('../assets/sounds/Hypno_dataentry.peaks.json') as number[],
  },
  ivysaur: {
    src: require('../assets/sounds/Ivysaur_dataentry.wav'),
    ms: 11180,
    peaks: require('../assets/sounds/Ivysaur_dataentry.peaks.json') as number[],
  },
  jigglypuff: {
    src: require('../assets/sounds/Jigglypuff_dataentry.wav'),
    ms: 11600,
    peaks: require('../assets/sounds/Jigglypuff_dataentry.peaks.json') as number[],
  },
  jolteon: {
    src: require('../assets/sounds/Jolteon_dataentry.wav'),
    ms: 10680,
    peaks: require('../assets/sounds/Jolteon_dataentry.peaks.json') as number[],
  },
  jynx: {
    src: require('../assets/sounds/Jynx_dataentry.wav'),
    ms: 11400,
    peaks: require('../assets/sounds/Jynx_dataentry.peaks.json') as number[],
  },
  kabuto: {
    src: require('../assets/sounds/Kabuto_dataentry.wav'),
    ms: 12440,
    peaks: require('../assets/sounds/Kabuto_dataentry.peaks.json') as number[],
  },
  kabutops: {
    src: require('../assets/sounds/Kabutops_dataentry.wav'),
    ms: 11240,
    peaks: require('../assets/sounds/Kabutops_dataentry.peaks.json') as number[],
  },
  kadabra: {
    src: require('../assets/sounds/Kadabra_dataentry.wav'),
    ms: 9400,
    peaks: require('../assets/sounds/Kadabra_dataentry.peaks.json') as number[],
  },
  kakuna: {
    src: require('../assets/sounds/Kakuna_dataentry.wav'),
    ms: 10320,
    peaks: require('../assets/sounds/Kakuna_dataentry.peaks.json') as number[],
  },
  kangaskhan: {
    src: require('../assets/sounds/Kangaskhan_dataentry.wav'),
    ms: 10800,
    peaks: require('../assets/sounds/Kangaskhan_dataentry.peaks.json') as number[],
  },
  kingler: {
    src: require('../assets/sounds/Kingler_dataentry.wav'),
    ms: 10760,
    peaks: require('../assets/sounds/Kingler_dataentry.peaks.json') as number[],
  },
  koffing: {
    src: require('../assets/sounds/Koffing_dataentry.wav'),
    ms: 10350,
    peaks: require('../assets/sounds/Koffing_dataentry.peaks.json') as number[],
  },
  krabby: {
    src: require('../assets/sounds/Krabby_dataentry.wav'),
    ms: 8620,
    peaks: require('../assets/sounds/Krabby_dataentry.peaks.json') as number[],
  },
  lapras: {
    src: require('../assets/sounds/Lapras_dataentry.wav'),
    ms: 11800,
    peaks: require('../assets/sounds/Lapras_dataentry.peaks.json') as number[],
  },
  lickitung: {
    src: require('../assets/sounds/Lickitung_dataentry.wav'),
    ms: 10320,
    peaks: require('../assets/sounds/Lickitung_dataentry.peaks.json') as number[],
  },
  machamp: {
    src: require('../assets/sounds/Machamp_dataentry.wav'),
    ms: 10400,
    peaks: require('../assets/sounds/Machamp_dataentry.peaks.json') as number[],
  },
  machoke: {
    src: require('../assets/sounds/Machoke_dataentry.wav'),
    ms: 10320,
    peaks: require('../assets/sounds/Machoke_dataentry.peaks.json') as number[],
  },
  machop: {
    src: require('../assets/sounds/Machop_dataentry.wav'),
    ms: 9870,
    peaks: require('../assets/sounds/Machop_dataentry.peaks.json') as number[],
  },
  magikarp: {
    src: require('../assets/sounds/Magikarp_dataentry.wav'),
    ms: 10280,
    peaks: require('../assets/sounds/Magikarp_dataentry.peaks.json') as number[],
  },
  magmar: {
    src: require('../assets/sounds/Magmar_dataentry.wav'),
    ms: 10970,
    peaks: require('../assets/sounds/Magmar_dataentry.peaks.json') as number[],
  },
  magnemite: {
    src: require('../assets/sounds/Magnemite_dataentry.wav'),
    ms: 11360,
    peaks: require('../assets/sounds/Magnemite_dataentry.peaks.json') as number[],
  },
  magneton: {
    src: require('../assets/sounds/Magneton_dataentry.wav'),
    ms: 12200,
    peaks: require('../assets/sounds/Magneton_dataentry.peaks.json') as number[],
  },
  mankey: {
    src: require('../assets/sounds/Mankey_dataentry.wav'),
    ms: 11000,
    peaks: require('../assets/sounds/Mankey_dataentry.peaks.json') as number[],
  },
  marowak: {
    src: require('../assets/sounds/Marowak_dataentry.wav'),
    ms: 10260,
    peaks: require('../assets/sounds/Marowak_dataentry.peaks.json') as number[],
  },
  meowth: {
    src: require('../assets/sounds/Meowth_dataentry.wav'),
    ms: 10840,
    peaks: require('../assets/sounds/Meowth_dataentry.peaks.json') as number[],
  },
  metapod: {
    src: require('../assets/sounds/Metapod_dataentry.wav'),
    ms: 10050,
    peaks: require('../assets/sounds/Metapod_dataentry.peaks.json') as number[],
  },
  mew: {
    src: require('../assets/sounds/Mew_dataentry.wav'),
    ms: 11840,
    peaks: require('../assets/sounds/Mew_dataentry.peaks.json') as number[],
  },
  mewtwo: {
    src: require('../assets/sounds/Mewtwo_dataentry.wav'),
    ms: 12240,
    peaks: require('../assets/sounds/Mewtwo_dataentry.peaks.json') as number[],
  },
  moltres: {
    src: require('../assets/sounds/Moltres_dataentry.wav'),
    ms: 11160,
    peaks: require('../assets/sounds/Moltres_dataentry.peaks.json') as number[],
  },
  mrmime: {
    src: require('../assets/sounds/MrMime_dataentry.wav'),
    ms: 12600,
    peaks: require('../assets/sounds/MrMime_dataentry.peaks.json') as number[],
  },
  muk: {
    src: require('../assets/sounds/Muk_dataentry.wav'),
    ms: 9680,
    peaks: require('../assets/sounds/Muk_dataentry.peaks.json') as number[],
  },
  nidoranf: {
    src: require('../assets/sounds/Nidoran(Female).wav'),
    ms: 10800,
    peaks: require('../assets/sounds/Nidoran(Female).peaks.json') as number[],
  },
  nidoranm: {
    src: require('../assets/sounds/Nidoran(Male).wav'),
    ms: 10120,
    peaks: require('../assets/sounds/Nidoran(Male).peaks.json') as number[],
  },
  nidoking: {
    src: require('../assets/sounds/Nidoking_dataentry.wav'),
    ms: 11200,
    peaks: require('../assets/sounds/Nidoking_dataentry.peaks.json') as number[],
  },
  nidoqueen: {
    src: require('../assets/sounds/Nidoqueen_dataentry.wav'),
    ms: 11520,
    peaks: require('../assets/sounds/Nidoqueen_dataentry.peaks.json') as number[],
  },
  nidorina: {
    src: require('../assets/sounds/Nidorina_dataentry.wav'),
    ms: 10160,
    peaks: require('../assets/sounds/Nidorina_dataentry.peaks.json') as number[],
  },
  nidorino: {
    src: require('../assets/sounds/Nidorino_dataentry.wav'),
    ms: 10270,
    peaks: require('../assets/sounds/Nidorino_dataentry.peaks.json') as number[],
  },
  ninetales: {
    src: require('../assets/sounds/Ninetales_dataentry.wav'),
    ms: 10780,
    peaks: require('../assets/sounds/Ninetales_dataentry.peaks.json') as number[],
  },
  oddish: {
    src: require('../assets/sounds/Oddish_dataentry.wav'),
    ms: 10800,
    peaks: require('../assets/sounds/Oddish_dataentry.peaks.json') as number[],
  },
  omanyte: {
    src: require('../assets/sounds/Omanyte_dataentry.wav'),
    ms: 11200,
    peaks: require('../assets/sounds/Omanyte_dataentry.peaks.json') as number[],
  },
  omastar: {
    src: require('../assets/sounds/Omastar_dataentry.wav'),
    ms: 10950,
    peaks: require('../assets/sounds/Omastar_dataentry.peaks.json') as number[],
  },
  onix: {
    src: require('../assets/sounds/Onix_dataentry.wav'),
    ms: 12720,
    peaks: require('../assets/sounds/Onix_dataentry.peaks.json') as number[],
  },
  paras: {
    src: require('../assets/sounds/Paras_dataentry.wav'),
    ms: 10700,
    peaks: require('../assets/sounds/Paras_dataentry.peaks.json') as number[],
  },
  parasect: {
    src: require('../assets/sounds/Parasect_dataentry.wav'),
    ms: 10200,
    peaks: require('../assets/sounds/Parasect_dataentry.peaks.json') as number[],
  },
  persian: {
    src: require('../assets/sounds/Persian_dataentry.wav'),
    ms: 11400,
    peaks: require('../assets/sounds/Persian_dataentry.peaks.json') as number[],
  },
  pidgeot: {
    src: require('../assets/sounds/Pidgeot_dataentry.wav'),
    ms: 10550,
    peaks: require('../assets/sounds/Pidgeot_dataentry.peaks.json') as number[],
  },
  pidgeotto: {
    src: require('../assets/sounds/Pidgeotto_dataentry.wav'),
    ms: 11080,
    peaks: require('../assets/sounds/Pidgeotto_dataentry.peaks.json') as number[],
  },
  pidgey: {
    src: require('../assets/sounds/Pidgey_dataentry.wav'),
    ms: 10680,
    peaks: require('../assets/sounds/Pidgey_dataentry.peaks.json') as number[],
  },
  pikachu: {
    src: require('../assets/sounds/Pikachu_dataentry.wav'),
    ms: 11880,
    peaks: require('../assets/sounds/Pikachu_dataentry.peaks.json') as number[],
  },
  pinsir: {
    src: require('../assets/sounds/Pinsir_dataentry.wav'),
    ms: 11560,
    peaks: require('../assets/sounds/Pinsir_dataentry.peaks.json') as number[],
  },
  poliwag: {
    src: require('../assets/sounds/Poliwag_dataentry.wav'),
    ms: 12360,
    peaks: require('../assets/sounds/Poliwag_dataentry.peaks.json') as number[],
  },
  poliwhirl: {
    src: require('../assets/sounds/Poliwhirl_dataentry.wav'),
    ms: 13400,
    peaks: require('../assets/sounds/Poliwhirl_dataentry.peaks.json') as number[],
  },
  poliwrath: {
    src: require('../assets/sounds/Poliwrath_dataentry.wav'),
    ms: 12240,
    peaks: require('../assets/sounds/Poliwrath_dataentry.peaks.json') as number[],
  },
  ponyta: {
    src: require('../assets/sounds/Ponyta_dataentry.wav'),
    ms: 10750,
    peaks: require('../assets/sounds/Ponyta_dataentry.peaks.json') as number[],
  },
  porygon: {
    src: require('../assets/sounds/Porygon_dataentry.wav'),
    ms: 11280,
    peaks: require('../assets/sounds/Porygon_dataentry.peaks.json') as number[],
  },
  primeape: {
    src: require('../assets/sounds/Primeape_dataentry.wav'),
    ms: 12700,
    peaks: require('../assets/sounds/Primeape_dataentry.peaks.json') as number[],
  },
  psyduck: {
    src: require('../assets/sounds/Psyduck_dataentry.wav'),
    ms: 11280,
    peaks: require('../assets/sounds/Psyduck_dataentry.peaks.json') as number[],
  },
  raichu: {
    src: require('../assets/sounds/Raichu_dataentry.wav'),
    ms: 12720,
    peaks: require('../assets/sounds/Raichu_dataentry.peaks.json') as number[],
  },
  rapidash: {
    src: require('../assets/sounds/Rapidash_dataentry.wav'),
    ms: 9750,
    peaks: require('../assets/sounds/Rapidash_dataentry.peaks.json') as number[],
  },
  raticate: {
    src: require('../assets/sounds/Raticate_dataentry.wav'),
    ms: 12440,
    peaks: require('../assets/sounds/Raticate_dataentry.peaks.json') as number[],
  },
  rattata: {
    src: require('../assets/sounds/Rattata_dataentry.wav'),
    ms: 10760,
    peaks: require('../assets/sounds/Rattata_dataentry.peaks.json') as number[],
  },
  rhydon: {
    src: require('../assets/sounds/Rhydon_dataentry.wav'),
    ms: 10400,
    peaks: require('../assets/sounds/Rhydon_dataentry.peaks.json') as number[],
  },
  rhyhorn: {
    src: require('../assets/sounds/Rhyhorn_dataentry.wav'),
    ms: 12720,
    peaks: require('../assets/sounds/Rhyhorn_dataentry.peaks.json') as number[],
  },
  sandshrew: {
    src: require('../assets/sounds/Sandshrew_dataentry.wav'),
    ms: 10490,
    peaks: require('../assets/sounds/Sandshrew_dataentry.peaks.json') as number[],
  },
  sandslash: {
    src: require('../assets/sounds/Sandslash_dataentry.wav'),
    ms: 12200,
    peaks: require('../assets/sounds/Sandslash_dataentry.peaks.json') as number[],
  },
  scyther: {
    src: require('../assets/sounds/Scyther_dataentry.wav'),
    ms: 11160,
    peaks: require('../assets/sounds/Scyther_dataentry.peaks.json') as number[],
  },
  seadra: {
    src: require('../assets/sounds/Seadra_dataentry.wav'),
    ms: 11060,
    peaks: require('../assets/sounds/Seadra_dataentry.peaks.json') as number[],
  },
  seaking: {
    src: require('../assets/sounds/Seaking_dataentry.wav'),
    ms: 10450,
    peaks: require('../assets/sounds/Seaking_dataentry.peaks.json') as number[],
  },
  seel: {
    src: require('../assets/sounds/Seel_dataentry.wav'),
    ms: 11960,
    peaks: require('../assets/sounds/Seel_dataentry.peaks.json') as number[],
  },
  shellder: {
    src: require('../assets/sounds/Shellder_dataentry.wav'),
    ms: 10520,
    peaks: require('../assets/sounds/Shellder_dataentry.peaks.json') as number[],
  },
  slowbro: {
    src: require('../assets/sounds/Slowbro_dataentry.wav'),
    ms: 12200,
    peaks: require('../assets/sounds/Slowbro_dataentry.peaks.json') as number[],
  },
  slowpoke: {
    src: require('../assets/sounds/Slowpoke_dataentry.wav'),
    ms: 12760,
    peaks: require('../assets/sounds/Slowpoke_dataentry.peaks.json') as number[],
  },
  snorlax: {
    src: require('../assets/sounds/Snorlax_dataentry.wav'),
    ms: 11840,
    peaks: require('../assets/sounds/Snorlax_dataentry.peaks.json') as number[],
  },
  spearow: {
    src: require('../assets/sounds/Spearow_dataentry.wav'),
    ms: 12160,
    peaks: require('../assets/sounds/Spearow_dataentry.peaks.json') as number[],
  },
  squirtle: {
    src: require('../assets/sounds/Squirtle_dataentry.wav'),
    ms: 10670,
    peaks: require('../assets/sounds/Squirtle_dataentry.peaks.json') as number[],
  },
  starmie: {
    src: require('../assets/sounds/Starmie_dataentry.wav'),
    ms: 10720,
    peaks: require('../assets/sounds/Starmie_dataentry.peaks.json') as number[],
  },
  staryu: {
    src: require('../assets/sounds/Staryu_dataentry.wav'),
    ms: 11520,
    peaks: require('../assets/sounds/Staryu_dataentry.peaks.json') as number[],
  },
  tangela: {
    src: require('../assets/sounds/Tangela_dataentry.wav'),
    ms: 11240,
    peaks: require('../assets/sounds/Tangela_dataentry.peaks.json') as number[],
  },
  tauros: {
    src: require('../assets/sounds/Tauros_dataentry.wav'),
    ms: 11240,
    peaks: require('../assets/sounds/Tauros_dataentry.peaks.json') as number[],
  },
  tentacool: {
    src: require('../assets/sounds/Tentacool_dataentry.wav'),
    ms: 12220,
    peaks: require('../assets/sounds/Tentacool_dataentry.peaks.json') as number[],
  },
  tentacruel: {
    src: require('../assets/sounds/Tentacruel_dataentry.wav'),
    ms: 10400,
    peaks: require('../assets/sounds/Tentacruel_dataentry.peaks.json') as number[],
  },
  vaporeon: {
    src: require('../assets/sounds/Vaporeon_dataentry.wav'),
    ms: 10800,
    peaks: require('../assets/sounds/Vaporeon_dataentry.peaks.json') as number[],
  },
  venomoth: {
    src: require('../assets/sounds/Venomoth_dataentry.wav'),
    ms: 10640,
    peaks: require('../assets/sounds/Venomoth_dataentry.peaks.json') as number[],
  },
  venonat: {
    src: require('../assets/sounds/Venonat_dataentry.wav'),
    ms: 11520,
    peaks: require('../assets/sounds/Venonat_dataentry.peaks.json') as number[],
  },
  venusaur: {
    src: require('../assets/sounds/Venusaur_dataentry.wav'),
    ms: 11990,
    peaks: require('../assets/sounds/Venusaur_dataentry.peaks.json') as number[],
  },
  victreebel: {
    src: require('../assets/sounds/Victreebel_dataentry.wav'),
    ms: 11960,
    peaks: require('../assets/sounds/Victreebel_dataentry.peaks.json') as number[],
  },
  vileplume: {
    src: require('../assets/sounds/Vileplume_dataentry.wav'),
    ms: 10400,
    peaks: require('../assets/sounds/Vileplume_dataentry.peaks.json') as number[],
  },
  voltorb: {
    src: require('../assets/sounds/Voltorb_dataentry.wav'),
    ms: 8200,
    peaks: require('../assets/sounds/Voltorb_dataentry.peaks.json') as number[],
  },
  vulpix: {
    src: require('../assets/sounds/Vulpix_dataentry.wav'),
    ms: 10500,
    peaks: require('../assets/sounds/Vulpix_dataentry.peaks.json') as number[],
  },
  wartortle: {
    src: require('../assets/sounds/Wartortle_dataentry.wav'),
    ms: 11040,
    peaks: require('../assets/sounds/Wartortle_dataentry.peaks.json') as number[],
  },
  weedle: {
    src: require('../assets/sounds/Weedle_dataentry.wav'),
    ms: 9520,
    peaks: require('../assets/sounds/Weedle_dataentry.peaks.json') as number[],
  },
  weepinbell: {
    src: require('../assets/sounds/Weepinbell_dataentry.wav'),
    ms: 10840,
    peaks: require('../assets/sounds/Weepinbell_dataentry.peaks.json') as number[],
  },
  weezing: {
    src: require('../assets/sounds/Weezing_dataentry.wav'),
    ms: 10680,
    peaks: require('../assets/sounds/Weezing_dataentry.peaks.json') as number[],
  },
  wigglytuff: {
    src: require('../assets/sounds/Wigglytuff_dataentry.wav'),
    ms: 10920,
    peaks: require('../assets/sounds/Wigglytuff_dataentry.peaks.json') as number[],
  },
  zapdos: {
    src: require('../assets/sounds/Zapdos_dataentry.wav'),
    ms: 11800,
    peaks: require('../assets/sounds/Zapdos_dataentry.peaks.json') as number[],
  },
  zubat: {
    src: require('../assets/sounds/Zubat_dataentry.wav'),
    ms: 8400,
    peaks: require('../assets/sounds/Zubat_dataentry.peaks.json') as number[],
  },
};

function normName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

// Local multi-variant cries (bundled split wav).
// Rule: first play per mon session = _001, next presses = random _002.._N.
const PIKACHU_CRIES = [
  require('../assets/cries/pikachu/pikachu_001.wav'),
  require('../assets/cries/pikachu/pikachu_002.wav'),
  require('../assets/cries/pikachu/pikachu_003.wav'),
  require('../assets/cries/pikachu/pikachu_004.wav'),
  require('../assets/cries/pikachu/pikachu_005.wav'),
  require('../assets/cries/pikachu/pikachu_006.wav'),
  require('../assets/cries/pikachu/pikachu_007.wav'),
  require('../assets/cries/pikachu/pikachu_008.wav'),
  require('../assets/cries/pikachu/pikachu_009.wav'),
  require('../assets/cries/pikachu/pikachu_010.wav'),
  require('../assets/cries/pikachu/pikachu_011.wav'),
  require('../assets/cries/pikachu/pikachu_012.wav'),
  require('../assets/cries/pikachu/pikachu_013.wav'),
  require('../assets/cries/pikachu/pikachu_014.wav'),
  require('../assets/cries/pikachu/pikachu_015.wav'),
  require('../assets/cries/pikachu/pikachu_016.wav'),
  require('../assets/cries/pikachu/pikachu_017.wav'),
  require('../assets/cries/pikachu/pikachu_018.wav'),
  require('../assets/cries/pikachu/pikachu_019.wav'),
  require('../assets/cries/pikachu/pikachu_020.wav'),
  require('../assets/cries/pikachu/pikachu_021.wav'),
  require('../assets/cries/pikachu/pikachu_022.wav'),
  require('../assets/cries/pikachu/pikachu_023.wav'),
  require('../assets/cries/pikachu/pikachu_024.wav'),
  require('../assets/cries/pikachu/pikachu_025.wav'),
  require('../assets/cries/pikachu/pikachu_026.wav'),
  require('../assets/cries/pikachu/pikachu_027.wav'),
  require('../assets/cries/pikachu/pikachu_028.wav'),
  require('../assets/cries/pikachu/pikachu_029.wav'),
  require('../assets/cries/pikachu/pikachu_030.wav'),
  require('../assets/cries/pikachu/pikachu_031.wav'),
  require('../assets/cries/pikachu/pikachu_032.wav'),
  require('../assets/cries/pikachu/pikachu_033.wav'),
  require('../assets/cries/pikachu/pikachu_034.wav'),
  require('../assets/cries/pikachu/pikachu_035.wav'),
  require('../assets/cries/pikachu/pikachu_036.wav'),
  require('../assets/cries/pikachu/pikachu_037.wav'),
  require('../assets/cries/pikachu/pikachu_038.wav'),
  require('../assets/cries/pikachu/pikachu_039.wav'),
  require('../assets/cries/pikachu/pikachu_040.wav'),
  require('../assets/cries/pikachu/pikachu_041.wav'),
] as unknown[];

const EEVEE_CRIES = [
  require('../assets/cries/eevee/eevee_001.wav'),
  require('../assets/cries/eevee/eevee_002.wav'),
  require('../assets/cries/eevee/eevee_003.wav'),
  require('../assets/cries/eevee/eevee_004.wav'),
  require('../assets/cries/eevee/eevee_005.wav'),
  require('../assets/cries/eevee/eevee_006.wav'),
  require('../assets/cries/eevee/eevee_007.wav'),
  require('../assets/cries/eevee/eevee_008.wav'),
  require('../assets/cries/eevee/eevee_009.wav'),
  require('../assets/cries/eevee/eevee_010.wav'),
  require('../assets/cries/eevee/eevee_011.wav'),
  require('../assets/cries/eevee/eevee_012.wav'),
  require('../assets/cries/eevee/eevee_013.wav'),
  require('../assets/cries/eevee/eevee_014.wav'),
  require('../assets/cries/eevee/eevee_015.wav'),
  require('../assets/cries/eevee/eevee_016.wav'),
  require('../assets/cries/eevee/eevee_017.wav'),
  require('../assets/cries/eevee/eevee_018.wav'),
  require('../assets/cries/eevee/eevee_019.wav'),
  require('../assets/cries/eevee/eevee_020.wav'),
  require('../assets/cries/eevee/eevee_021.wav'),
  require('../assets/cries/eevee/eevee_022.wav'),
  require('../assets/cries/eevee/eevee_023.wav'),
] as unknown[];

function cryVariantsFor(name: string | undefined): unknown[] | null {
  const n = normName(name ?? '');
  if (n === 'pikachu') return PIKACHU_CRIES;
  if (n === 'eevee') return EEVEE_CRIES;
  return null;
}

function pickRandomVariant(variants: unknown[]): unknown {
  if (variants.length <= 1) return variants[0];
  // Exclude index 0 (_001): reserved for first play.
  const idx = 1 + Math.floor(Math.random() * (variants.length - 1));
  return variants[idx];
}

function fire(player: { seekTo: (s: number) => Promise<void>; play: () => void }): void {
  try {
    void player.seekTo(0).then(() => player.play()).catch(() => player.play());
  } catch {
    /* audio best-effort */
  }
}

export function useDexSounds(): DexSounds {
  const clickP = useAudioPlayer(require('../assets/sounds/pokedex_click.ogg'));
  const clickShortP = useAudioPlayer(require('../assets/sounds/pokedex_click_short.ogg'));
  const sweepP = useAudioPlayer(require('../assets/sounds/sweep.wav'));
  const shutterP = useAudioPlayer(require('../assets/sounds/shutter.wav'));
  const successP = useAudioPlayer(require('../assets/sounds/success.wav'));
  const entryP = useAudioPlayer(require('../assets/sounds/entry.wav'));
  const errorP = useAudioPlayer(require('../assets/sounds/error.wav'));
  const lowconfP = useAudioPlayer(require('../assets/sounds/lowconf.wav'));
  const openP = useAudioPlayer(require('../assets/sounds/pokedex_open.ogg'));
  const closeP = useAudioPlayer(require('../assets/sounds/pokedex_close.ogg'));
  const scanOpenP = useAudioPlayer(require('../assets/sounds/pokedex_scan_open.ogg'));
  const scanLoopP = useAudioPlayer(require('../assets/sounds/pokedex_scan_loop.ogg'));
  const scanCloseP = useAudioPlayer(require('../assets/sounds/pokedex_scan_close.ogg'));
  const detailP = useAudioPlayer(require('../assets/sounds/pokedex_scan_detail.ogg'));
  const zoomP = useAudioPlayer(require('../assets/sounds/pokedex_scan_zoom_increment.ogg'));
  const regPokemonP = useAudioPlayer(require('../assets/sounds/pokedex_scan_register_pokemon.ogg'));
  const regAspectP = useAudioPlayer(require('../assets/sounds/pokedex_scan_register_aspect.ogg'));
  const cryP = useAudioPlayer(null);
  const narrateP = useAudioPlayer(null);
  const cryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Single-flight: cut any in-flight cry + drop queued retries before a new one. */
  function stopCryNow(): void {
    try {
      if (cryTimer.current !== null) {
        clearTimeout(cryTimer.current);
        cryTimer.current = null;
      }
      cryP.pause();
      void cryP.seekTo(0).catch(() => undefined);
    } catch {
      /* best-effort */
    }
  }

  const [prefs, setPrefs] = useState<SoundPrefs>(DEFAULT_SOUND_PREFS);
  const prefsRef = useRef(prefs);

  function applyVolume(v: number): void {
    const all = [clickP, clickShortP, sweepP, shutterP, successP, entryP, errorP, lowconfP,
      openP, closeP, scanOpenP, scanLoopP, scanCloseP, detailP, zoomP, regPokemonP, regAspectP,
      cryP, narrateP];
    for (const pl of all) {
      try {
        pl.volume = v;
      } catch {
        /* best-effort */
      }
    }
  }

  function updatePrefs(patch: Partial<SoundPrefs>): void {
    const next = sanitizeSoundPrefs({ ...prefsRef.current, ...patch });
    prefsRef.current = next;
    setPrefs(next);
    applyVolume(next.volume);
    void saveSoundPrefs(next);
  }

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    void loadSoundPrefs().then((p) => {
      prefsRef.current = p;
      setPrefs(p);
      applyVolume(p.volume);
    });
  }, []);

  function fired(player: { seekTo: (s: number) => Promise<void>; play: () => void }): void {
    if (prefsRef.current.muted) return;
    fire(player);
  }

  function playLocalCry(src: unknown): void {
    if (src == null || prefsRef.current.muted) return;
    try {
      stopCryNow();
      cryP.replace(src as string);
      try {
        cryP.play();
      } catch {
        cryTimer.current = setTimeout(() => {
          cryTimer.current = null;
          try {
            cryP.play();
          } catch {
            /* best-effort */
          }
        }, 150);
      }
    } catch {
      /* best-effort */
    }
  }

  function playRemoteCry(url: string): void {
    if (!url || prefsRef.current.muted) return;
    try {
      stopCryNow();
      cryP.replace(url);
      // remote ogg needs a beat to buffer before play()
      cryTimer.current = setTimeout(() => {
        cryTimer.current = null;
        try {
          cryP.play();
        } catch {
          /* best-effort */
        }
      }, 400);
    } catch {
      /* best-effort */
    }
  }

  function playCry(url: string, name?: string): void {
    const variants = cryVariantsFor(name);
    if (variants) {
      // Legacy direct call: default to random variant (local bundle).
      playLocalCry(pickRandomVariant(variants));
      return;
    }
    playRemoteCry(url);
  }

  function playCryFirst(url: string, name?: string): void {
    const variants = cryVariantsFor(name);
    if (variants && variants.length > 0) {
      playLocalCry(variants[0]);
      return;
    }
    playRemoteCry(url);
  }

  function playCryRandom(url: string, name?: string): void {
    const variants = cryVariantsFor(name);
    if (variants) {
      playLocalCry(pickRandomVariant(variants));
      return;
    }
    playRemoteCry(url);
  }

  function playNarrate(name: string): Narration {
    // Muted: silent + no envelope, so App also skips lens FX (it gates on ms).
    if (prefsRef.current.muted) return { ms: 0, peaks: [] };
    const entry = NARRATIONS[normName(name)];
    if (!entry) return { ms: 0, peaks: [] };
    try {
      narrateP.replace(entry.src as string);
      setTimeout(() => {
        try {
          narrateP.play();
        } catch {
          /* best-effort */
        }
      }, 400);
      return { ms: entry.ms, peaks: entry.peaks };
    } catch {
      return { ms: 0, peaks: [] };
    }
  }

  function stopNarrate(): void {
    try {
      narrateP.pause();
      void narrateP.seekTo(0).catch(() => undefined);
    } catch {
      /* best-effort */
    }
  }

  function scanLoopStart(): void {
    if (prefsRef.current.muted) return;
    try {
      scanLoopP.loop = true;
      void scanLoopP.seekTo(0).then(() => scanLoopP.play()).catch(() => scanLoopP.play());
    } catch {
      /* best-effort */
    }
  }

  function scanLoopStop(): void {
    try {
      scanLoopP.pause();
      void scanLoopP.seekTo(0).catch(() => undefined);
    } catch {
      /* best-effort */
    }
  }

  return useMemo<DexSounds>(
    () => ({
      click: () => fired(clickP),
      clickShort: () => fired(clickShortP),
      sweep: () => fired(sweepP),
      shutter: () => fired(shutterP),
      success: () => fired(successP),
      entry: () => fired(entryP),
      error: () => fired(errorP),
      lowconf: () => fired(lowconfP),
      open: () => fired(openP),
      close: () => fired(closeP),
      snap: () => {
        fired(shutterP);
        fired(scanOpenP);
      },
      scanLoopStart,
      scanLoopStop,
      scanClose: () => fired(scanCloseP),
      detail: () => fired(detailP),
      zoom: () => fired(zoomP),
      regPokemon: () => fired(regPokemonP),
      regAspect: () => fired(regAspectP),
      cry: playCry,
      cryFirst: playCryFirst,
      cryRandom: playCryRandom,
      narrate: playNarrate,
      hasNarration: (name: string) => normName(name) in NARRATIONS,
      stopNarrate,
      prefs,
      updatePrefs,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clickP, clickShortP, sweepP, shutterP, successP, entryP, errorP, lowconfP,
      openP, closeP, scanOpenP, scanLoopP, scanCloseP, detailP, zoomP, regPokemonP, regAspectP, cryP, narrateP,
      prefs],
  );
}
