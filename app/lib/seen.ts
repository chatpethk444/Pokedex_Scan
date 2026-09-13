import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pokt-seen-v1';
const PROBE_KEY = '__pokt-probe';

function warn(where: string, e: unknown): void {
  try {
    // Visible in Metro + LogBox: silent storage failure = lost dex progress.
    console.warn(`[pokt-store] ${where}: ${e instanceof Error ? e.message : String(e)}`);
  } catch {
    /* never throw from diagnostics */
  }
}

/** Normalized seen keys (lowercase letters only, e.g. "mrmime"). */
export async function loadSeen(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch (e) {
    warn('loadSeen', e);
    return [];
  }
}

export async function saveSeen(seen: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(seen));
  } catch (e) {
    warn('saveSeen', e);
  }
}

export async function clearSeen(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (e) {
    warn('clearSeen', e);
  }
}

export interface StoreProbe {
  ok: boolean;
  message: string;
  savedCount: number;
}

/** Write/read/delete round-trip + current saved count. Never throws. */
export async function testStorage(): Promise<StoreProbe> {
  try {
    const stamp = `ok-${Date.now()}`;
    await AsyncStorage.setItem(PROBE_KEY, stamp);
    const back = await AsyncStorage.getItem(PROBE_KEY);
    await AsyncStorage.removeItem(PROBE_KEY);
    if (back !== stamp) {
      return { ok: false, message: 'WRITE-READ MISMATCH', savedCount: -1 };
    }
    const saved = await loadSeen();
    return { ok: true, message: 'STORE OK', savedCount: saved.length };
  } catch (e) {
    return {
      ok: false,
      message: (e instanceof Error ? e.message : String(e)).toUpperCase().slice(0, 90),
      savedCount: -1,
    };
  }
}
