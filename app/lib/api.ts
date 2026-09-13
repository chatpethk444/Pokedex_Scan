import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const DEFAULT_BASE_URL = 'http://10.200.49.135:8000';

const LINK_KEY = 'pokt-link-v1';

/** Saved LINK URL (survives reload). Null = never saved / invalid. */
export async function loadBaseUrl(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(LINK_KEY);
    return raw !== null && /^https?:\/\//.test(raw.trim()) ? raw : null;
  } catch {
    return null;
  }
}

export async function saveBaseUrl(url: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LINK_KEY, url);
  } catch {
    /* best-effort */
  }
}

// Fail fast: OS TCP timeout is ~60s (user stares at SCANNING). Cap waits here.
const UPLOAD_TIMEOUT_MS = 30000;
const JSON_TIMEOUT_MS = 15000;
const HEALTH_TIMEOUT_MS = 15000;

class NetTimeout extends Error {
  ms: number;
  constructor(ms: number) {
    super(`timed out after ${Math.round(ms / 1000)}s`);
    this.name = 'NetTimeout';
    this.ms = ms;
  }
}

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, '').split('/')[0];
}

function isNetDown(e: unknown): boolean {
  const raw = e instanceof Error ? `${e.message} ${e.name}` : String(e);
  return /failed to connect|etimedout|timed out|timeout|abort|network request failed|econnrefused|enotfound|ehostunreach/i.test(raw);
}

function friendlyNetError(baseUrl: string, e: unknown): Error {
  if (e instanceof NetTimeout) {
    return linkDown(new Error(
      `LINK TIMEOUT ${Math.round(e.ms / 1000)}s — NO ROUTE OR LINK TOO SLOW. CHECK TEST BUTTON`,
    ));
  }
  if (isNetDown(e)) {
    return linkDown(new Error(
      `Cannot reach LINK ${hostOf(baseUrl) || baseUrl} — same WiFi? backend running? IP changed? Fix LINK field, TEST it`,
    ));
  }
  return e instanceof Error ? e : new Error(String(e));
}

/** Tags network errors so UI can flip the LINK status lamp. */
function linkDown(e: Error): Error {
  (e as Error & { linkDown?: boolean }).linkDown = true;
  return e;
}

export function isLinkDown(e: unknown): boolean {
  return (
    e instanceof NetTimeout ||
    (e instanceof Error && (e as Error & { linkDown?: boolean }).linkDown === true)
  );
}

/** Rejects after ms (uploadAsync has no timeout opt; late result ignored by caller seq guard). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new NetTimeout(ms)), ms);
  });
  return Promise.race([
    p.then(
      (v) => {
        if (t !== undefined) clearTimeout(t);
        return v;
      },
      (e: unknown) => {
        if (t !== undefined) clearTimeout(t);
        throw e;
      },
    ),
    timeout,
  ]);
}

async function fetchJson(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (e) {
    if (ctl.signal.aborted) throw new NetTimeout(ms);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export interface PredictResponse {
  prediction: string;
  confidence: number;
  probs: Record<string, number>;
}

export interface StatEntry {
  name: string;
  value: number;
}

export interface AbilityEntry {
  name: string;
  effect: string;
}

export interface EvoEntry {
  name: string;
  id: number;
  min_level: number | null;
  trigger: string | null;
}

export interface PokemonInfo {
  id: number;
  name: string;
  types: string[];
  height_m: number;
  weight_kg: number;
  artwork: string;
  gallery: string[];
  cry: string;
  flavor: string;
  stats: StatEntry[];
  abilities: AbilityEntry[];
  evolution: EvoEntry[];
}

export interface ScanResult {
  prediction: string;
  confidence: number;
  probs: Record<string, number>;
  info: PokemonInfo;
}

async function postImage<T>(baseUrl: string, path: string, uri: string): Promise<T> {
  const endpoint = baseUrl.trim().replace(/\/$/, '');
  if (Platform.OS === 'web') {
    try {
      const src = await fetchJson(uri, JSON_TIMEOUT_MS);
      if (!src.ok) throw new Error(`Cannot read picked image (HTTP ${src.status})`);
      const form = new FormData();
      form.append('file', new Blob([await src.blob()], { type: 'image/jpeg' }), 'scan.jpg');
      const res = await fetchJson(`${endpoint}${path}`, UPLOAD_TIMEOUT_MS, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Server error: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
      return (await res.json()) as T;
    } catch (e) {
      throw friendlyNetError(endpoint, e);
    }
  }
  // Native: legacy multipart upload handles file:// and content:// reliably.
  // (fetch() Blob parts fail on some devices with "Unsupported FormDataPart".)
  try {
    const up = await withTimeout(
      FileSystem.uploadAsync(`${endpoint}${path}`, uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: 'image/jpeg',
      }),
      UPLOAD_TIMEOUT_MS,
    );
    if (up.status < 200 || up.status >= 300) {
      throw new Error(`Server error: HTTP ${up.status} — ${up.body.slice(0, 200)}`);
    }
    return JSON.parse(up.body) as T;
  } catch (e) {
    throw friendlyNetError(endpoint, e);
  }
}

export async function predictImage(baseUrl: string, uri: string): Promise<PredictResponse> {
  return postImage<PredictResponse>(baseUrl, '/predict', uri);
}

export async function fetchPokemonInfo(baseUrl: string, name: string): Promise<PokemonInfo> {
  const endpoint = baseUrl.trim().replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetchJson(`${endpoint}/pokemon/${name.toLowerCase()}`, JSON_TIMEOUT_MS);
  } catch (e) {
    throw friendlyNetError(endpoint, e);
  }
  if (!res.ok) throw new Error(`Pokemon info failed: HTTP ${res.status}`);
  return (await res.json()) as PokemonInfo;
}

/** Fast backend ping (GET /health, 15s). Use for TEST LINK button. */
export async function checkBackend(baseUrl: string): Promise<{ ok: boolean; message: string }> {
  const endpoint = baseUrl.trim().replace(/\/$/, '');
  if (!endpoint) return { ok: false, message: 'LINK EMPTY — TYPE BACKEND URL' };
  const t0 = Date.now();
  const secs = (): string => ((Date.now() - t0) / 1000).toFixed(1);
  try {
    const res = await fetchJson(`${endpoint}/health`, HEALTH_TIMEOUT_MS);
    if (!res.ok) return { ok: false, message: `REACHABLE BUT HTTP ${res.status}` };
    return { ok: true, message: `LINK OK (${secs()}s)` };
  } catch (e) {
    const host = hostOf(endpoint) || endpoint;
    if (e instanceof NetTimeout) return { ok: false, message: `TIMEOUT ${secs()}s TO ${host} — ROUTE DEAD OR TOO SLOW` };
    if (isNetDown(e)) return { ok: false, message: `NO ROUTE TO ${host} — WIFI? IP?` };
    return { ok: false, message: e instanceof Error ? e.message.toUpperCase().slice(0, 80) : 'UNKNOWN FAIL' };
  }
}

export async function scanImage(baseUrl: string, uri: string): Promise<ScanResult> {
  const pred = await predictImage(baseUrl, uri);
  const info = await fetchPokemonInfo(baseUrl, pred.prediction);
  return { ...pred, info };
}

export interface OcrLine {
  text: string;
  conf: number;
  box: [number, number, number, number];
}

export interface CardFields {
  name: string | null;
  hp: number | null;
  card_number: string | null;
  matched_class: string | null;
}

export interface CardScan {
  prediction: string;
  confidence: number;
  probs: Record<string, number>;
  ocr: { lines: OcrLine[]; fields: CardFields };
  name: string;
  agree: boolean | null;
  info: PokemonInfo;
}

export async function scanCard(baseUrl: string, uri: string): Promise<CardScan> {
  const data = await postImage<Omit<CardScan, 'info'>>(baseUrl, '/scan', uri);
  const info = await fetchPokemonInfo(baseUrl, data.name);
  return { ...data, info };
}

export { DEFAULT_BASE_URL };
