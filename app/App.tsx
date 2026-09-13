import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import * as ImagePicker from 'expo-image-picker';
import { DPad, EvoChain, GreenLcd, LcdText, LedRow, Lens, StatGauge, TypeIcon } from './components/dex-chrome';
import { Scanner, ScannerHandle } from './components/scanner';
import { PokeBall, Reveal } from './components/reveal';
import { MonBackdrop } from './components/mon-backdrop';
import { ScanPortal } from './components/scan-portal';
import { Press3D, AnalyzeSteps, PowerOff, ScanSweep, MountPop, Sheen, SlideIn, Sparkles, StampSlam, TypeText, IdlePulse, ChipPop, CryWail, CrtFlicker } from './components/fx';
import * as Haptics from 'expo-haptics';

/** Best-effort haptics (silent on web / unsupported devices). */
function buzz(kind: 'snap' | 'good' | 'bad'): void {
  try {
    if (kind === 'snap') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (kind === 'good') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    /* no haptics */
  }
}
import { DEFAULT_BASE_URL, ScanResult, checkBackend, fetchPokemonInfo, isLinkDown, scanImage } from './lib/api';
import { loadSeen, saveSeen, clearSeen } from './lib/seen';
import { DEX151, normDexKey, aliasSeenKeys, type DexEntry } from './lib/dex151';
import { DexGrid } from './components/dex-grid';
import { Settings } from './components/settings';
import { Boot } from './components/boot';
import { useDexSounds } from './lib/sound';
import { DEX, FONTS, typeColor } from './lib/theme';
import { gen1Matchups } from './lib/types';

type Phase =
  | { kind: 'idle' }
  | { kind: 'camera' }
  | { kind: 'loading'; uri: string }
  | { kind: 'result'; uri: string; scan: ScanResult; isNew?: boolean }
  | { kind: 'dex' }
  | { kind: 'settings' }
  | { kind: 'error'; message: string; lowconf?: boolean };

const CONF_THRESHOLD = 0.7;

async function pickFrom(
  launch: () => Promise<ImagePicker.ImagePickerResult>,
): Promise<string | null> {
  const result = await launch();
  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0].uri;
}

export function App(): React.JSX.Element {
  const [fonts] = useFonts({ PressStart2P_400Regular, VT323_400Regular });
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [imgIdx, setImgIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [narrateLevel, setNarrateLevel] = useState<number | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [booted, setBooted] = useState(false);
  const [dying, setDying] = useState(false);
  const [slideDir, setSlideDir] = useState<1 | -1>(1);
  // Bumps only on D-pad flips: SlideIn playKey follows this, so scan reveal stays static.
  const [slideNonce, setSlideNonce] = useState(0);
  const [cryTick, setCryTick] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Bumps on every navigation/reset: late scan results after timeout/Back are dropped.
  const reqSeq = useRef(0);
  const chaseTick = useRef<ReturnType<typeof setInterval> | null>(null);
  const scannerRef = useRef<ScannerHandle | null>(null);
  const sounds = useDexSounds();
  // Cry session: first play per result (scan auto + first CRY press) = _001,
  // next CRY presses = random _002.._N. Reset on new mon/uri.
  const cryPressRef = useRef(0);
  const crySessionRef = useRef<string | null>(null);
  const { width: winW } = useWindowDimensions();

  function later(fn: () => void, ms: number): void {
    timers.current.push(setTimeout(fn, ms));
  }

  function markSeen(key: string): void {
    setSeen((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  function importSeen(keys: string[]): void {
    const clean = keys
      .filter((k): k is string => typeof k === 'string')
      .map((k) => k.toLowerCase().replace(/[^a-z]/g, ''))
      .filter((k) => k.length > 0)
      .slice(0, 500);
    if (clean.length === 0) return;
    setSeen((prev) => new Set([...prev, ...clean]));
  }

  const seenLoaded = useRef(false);
  // null = checking, true = connected, false = down.
  const [linkOk, setLinkOk] = useState<boolean | null>(null);
  const endpoint = baseUrl.trim().replace(/\/$/, '');
  const endpointRef = useRef(endpoint);
  endpointRef.current = endpoint;

  useEffect(() => {
    void loadSeen().then((list) => {
      // Union, never overwrite: a scan landing mid-load survives reload races.
      setSeen((prev) => new Set([...prev, ...list]));
      seenLoaded.current = true;
    });
  }, []);

  // LINK ping: deferred until boot done, retried, never sticks DOWN on first fail.
  // Old code pinged once on mount (during 2.6s Boot cover, cold backend = timeout
  // -> DOWN before user saw LCD). Now: stay … while trying, 3 attempts x 2s,
  // then background re-ping every 10s while DOWN.
  useEffect(() => {
    if (!booted) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    async function ping(): Promise<void> {
      if (!live) return;
      try {
        const r = await checkBackend(endpointRef.current);
        if (!live) return;
        if (r.ok) {
          setLinkOk(true);
          return;
        }
        throw new Error(r.message);
      } catch {
        if (!live) return;
        attempt += 1;
        if (attempt >= 3) {
          setLinkOk(false);
          // Cold start / WiFi lag: keep re-pinging, flip OK when backend wakes.
          timer = setTimeout(() => {
            attempt = 0;
            setLinkOk(null);
            void ping();
          }, 10000);
        } else {
          setLinkOk(null);
          timer = setTimeout(() => void ping(), 2000);
        }
      }
    }
    setLinkOk(null);
    void ping();
    return () => {
      live = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [booted]);

  // Single choke point for persistence; skipped until initial load lands
  // (otherwise first mount would wipe storage with an empty set).
  useEffect(() => {
    if (!seenLoaded.current) return;
    void saveSeen([...seen]);
  }, [seen]);

  function stopChase(): void {
    setNarrating(false);
    reqSeq.current += 1;
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    if (chaseTick.current !== null) {
      clearInterval(chaseTick.current);
      chaseTick.current = null;
    }
    setNarrateLevel(null);
    sounds.stopNarrate();
  }

  /** Drives the lens from the narration's real envelope. Call after sounds.narrate(). */
  function beginNarrationFx(ms: number, peaks: number[]): void {
    if (ms <= 0) return;
    if (peaks.length > 0) {
      let i = 0;
      setNarrateLevel(peaks[0] ?? 0);
      chaseTick.current = setInterval(() => {
        i += 1;
        if (i >= peaks.length) {
          if (chaseTick.current !== null) {
            clearInterval(chaseTick.current);
            chaseTick.current = null;
          }
          setNarrateLevel(null);
          return;
        }
        setNarrateLevel(peaks[i] ?? 0);
      }, 100);
      return;
    }
    setNarrateLevel(1);
    chaseTick.current = setInterval(() => {
      setNarrateLevel((v) => (v === 1 ? 0 : 1));
    }, 280);
    later(() => {
      if (chaseTick.current !== null) {
        clearInterval(chaseTick.current);
        chaseTick.current = null;
      }
      setNarrateLevel(null);
    }, ms);
  }

  useEffect(() => {
    const stash = timers.current;
    const tick = chaseTick.current;
    return () => {
      for (const t of stash) clearTimeout(t);
      if (tick !== null) clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    if (phase.kind === 'result') {
      sounds.scanLoopStop();
      sounds.scanClose();
      sounds.regPokemon();
      buzz('good');
      // New mon/session: next scan-auto + first CRY press both play _001.
      const key = `${phase.scan.info.id}-${phase.uri}`;
      if (crySessionRef.current !== key) {
        crySessionRef.current = key;
        cryPressRef.current = 0;
      }
    } else if (phase.kind === 'error') {
      sounds.scanLoopStop();
      sounds.scanClose();
      if (phase.lowconf === true) sounds.lowconf();
      else sounds.error();
      buzz('bad');
    }
  }, [phase, sounds]);

  if (!fonts) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={DEX.cyan} />
      </View>
    );
  }

  if (!booted) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe}>
          <Boot
            onDone={() => setBooted(true)}
            onStage={(n) => {
              if (n === 0) sounds.cryFirst('', 'pikachu');
              else if (n === 1 || n === 2) sounds.clickShort();
              else sounds.success();
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const busy = phase.kind === 'loading' || phase.kind === 'camera';
  // Gallery stage scales with screen (190x160 design size, phones ~0.9x, tablets ~1.4x).
  const galleryScale = Math.min(1.4, Math.max(0.9, winW / 430));
  const compact = winW < 360;

  // Back from full-screen Dex/Settings: instant, no PowerOff delay.
  // onReset (750ms dying fx) is only for result/error where overlay visible.
  function onBackToIdle(): void {
    stopChase();
    sounds.close();
    setPhase({ kind: 'idle' });
  }

  if (phase.kind === 'dex') {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe}>
          <DexGrid
            seen={seen}
            onBack={onBackToIdle}
            onOpen={(e) => void onOpenDexEntry(e)}
            onLocked={() => sounds.error()}
            onTap={() => sounds.clickShort()}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (phase.kind === 'settings') {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe}>
          <Settings
            baseUrl={baseUrl}
            seenCount={seen.size}
            seenList={[...seen]}
            onResetDex={() => {
              void clearSeen();
              setSeen(new Set());
              sounds.close();
            }}
            onImportSeen={importSeen}
            prefs={sounds.prefs}
            onPrefs={(patch) => {
              sounds.clickShort();
              sounds.updatePrefs(patch);
            }}
            onBack={onBackToIdle}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }
  const gallery = phase.kind === 'result'
    ? (phase.scan.info.gallery.length > 0 ? phase.scan.info.gallery : [phase.scan.info.artwork])
    : [];
  const shown = Math.min(imgIdx, Math.max(0, gallery.length - 1));
  const weak = phase.kind === 'result' ? gen1Matchups(phase.scan.info.types) : [];
  const canReset = phase.kind === 'result' || phase.kind === 'error';
  const canBrowse = phase.kind === 'result' && seen.size > 1;

  async function handleUri(uri: string | null): Promise<void> {
    if (!uri) return;
    stopChase();
    const seq = ++reqSeq.current;
    sounds.scanLoopStart();
    setPhase({ kind: 'loading', uri });
    try {
      const scan = await scanImage(endpoint, uri);
      if (seq !== reqSeq.current) return;
      setLinkOk(true);
      if (scan.confidence < CONF_THRESHOLD) {
        setPhase({
          kind: 'error',
          lowconf: true,
          message: `LOW CONFIDENCE ${(scan.confidence * 100).toFixed(1)}% < 70% — ` +
            `best guess was ${scan.prediction.toUpperCase()}, try a closer shot`,
        });
        return;
      }
      setImgIdx(0);
      setRevealed(false);
      const key = normDexKey(scan.prediction);
      const firstSeen = !seen.has(key);
      markSeen(key);
      for (const extra of aliasSeenKeys(scan.prediction)) markSeen(extra);
      setPhase({ kind: 'result', uri, scan, isNew: firstSeen });
    } catch (e) {
      if (seq !== reqSeq.current) return;
      if (isLinkDown(e)) setLinkOk(false);
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  function onScan(): void {
    stopChase();
    sounds.clickShort();
    setDying(true);
    later(() => {
      setDying(false);
      sounds.open();
      setPhase({ kind: 'camera' });
    }, 750);
  }

  async function onGallery(): Promise<void> {
    sounds.click();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPhase({ kind: 'error', message: 'Photo library permission denied' });
      return;
    }
    await handleUri(
      await pickFrom(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 })),
    );
  }

  function onReset(): void {
    stopChase();
    sounds.clickShort();
    setDying(true);
    later(() => {
      setDying(false);
      sounds.close();
      setPhase({ kind: 'idle' });
    }, 750);
  }

  function onOpenDex(): void {
    sounds.open();
    stopChase();
    setPhase({ kind: 'dex' });
  }

  async function onOpenDexEntry(entry: DexEntry): Promise<void> {
    sounds.clickShort();
    const uri = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${entry.id}.png`;
    setPhase({ kind: 'loading', uri });
    const seq = ++reqSeq.current;
    try {
      const info = await fetchPokemonInfo(endpoint, entry.api);
      if (seq !== reqSeq.current) return;
      setLinkOk(true);
      setImgIdx(0);
      setRevealed(true);
      // Dex entry = fresh cry session: first CRY press always plays _001,
      // even when reopening the same mon (phase key would match).
      crySessionRef.current = `${info.id}-${uri}`;
      cryPressRef.current = 0;
      setPhase({
        kind: 'result',
        uri,
        scan: { prediction: entry.cls ?? entry.display, confidence: 1, probs: {}, info },
        isNew: false,
      });
      // Auto-cry once on Dex open (single-flight in sound layer).
      if (sounds.prefs.autoCry) sounds.cryFirst(info.cry, info.name);
    } catch (e) {
      if (seq !== reqSeq.current) return;
      if (isLinkDown(e)) setLinkOk(false);
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  function onCry(): void {
    if (phase.kind === 'result' && phase.scan.info.cry) {
      const { cry, name } = phase.scan.info;
      if (cryPressRef.current === 0) sounds.cryFirst(cry, name);
      else sounds.cryRandom(cry, name);
      cryPressRef.current += 1;
      setCryTick((t) => t + 1);
    } else {
      sounds.click();
    }
  }

  function onReplayNarration(): void {
    if (phase.kind === 'result') {
      if (narrating) {
        stopChase();
        return;
      }
      stopChase();
      sounds.clickShort();
      const narration = sounds.narrate(phase.scan.info.name);
      if (narration.ms <= 0) return;
      beginNarrationFx(narration.ms, narration.peaks);
      setNarrating(true);
      later(() => setNarrating(false), narration.ms + 500);
    } else {
      sounds.click();
    }
  }

  function stepImg(dir: 1 | -1): void {
    sounds.click();
    if (phase.kind !== 'result' || gallery.length < 2) return;
    setSlideDir(dir);
    setSlideNonce((n) => n + 1);
    setRevealed(true);
    setImgIdx((i) => (i + dir + gallery.length) % gallery.length);
  }

  /** Browse prev/next dex id, landing only on seen mons (wraps 1..151). */
  function stepDex(dir: 1 | -1): void {
    if (phase.kind !== 'result' || seen.size < 2) return;
    const cur = phase.scan.info.id;
    for (let step = 1; step <= 151; step += 1) {
      const id = ((((cur - 1 + dir * step) % 151) + 151) % 151) + 1;
      if (id === cur) return;
      const entry = DEX151.find((e) => e.id === id);
      if (!entry) continue;
      const key = entry.cls !== null ? normDexKey(entry.cls) : normDexKey(entry.api);
      if (seen.has(key)) {
        void onOpenDexEntry(entry);
        return;
      }
    }
  }

  const conf =
    phase.kind === 'result' ? `${Math.round(phase.scan.confidence * 100)}%` : '--';

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.bg}>
          <LinearGradient colors={['#d32730', '#a6161e', '#7d0d13']} style={[styles.chassis, compact && styles.chassisCompact]}>
            <View style={styles.sensorRow}>
              <View style={styles.sensorLeft}>
                <View style={styles.lensWrap}>
                  <Lens active={narrateLevel !== null} level={narrateLevel ?? undefined} />
                </View>
                <LedRow busy={busy} />
              </View>
              <Text style={styles.genStamp}>GENERATION 1.0</Text>
            </View>

            <View style={styles.bezel}>
              <View style={styles.bezelDots}>
                {[0, 1].map((i) => (
                  <LinearGradient
                    key={i}
                    colors={['#fca5a5', '#dc2626', '#7f1d1d']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.bezelDot}
                  >
                    <View style={styles.bezelDotGloss} pointerEvents="none" />
                  </LinearGradient>
                ))}
              </View>
              <View style={styles.lcd}>
                <View style={styles.lcdHead}>
                  <Press3D
                    onPress={() => stepDex(-1)}
                    disabled={!canBrowse}
                    hitSlop={6}
                    style={[styles.navBtn, !canBrowse && styles.navOff]}
                  >
                    <Text style={styles.navGlyph}>‹</Text>
                  </Press3D>
                  <Text style={styles.lcdName} numberOfLines={1}>
                    {phase.kind === 'result' ? phase.scan.info.name.toUpperCase()
                      : phase.kind === 'loading' ? 'SCANNING'
                      : phase.kind === 'camera' ? 'SCAN MODE' : '???'}
                  </Text>
                  <Text style={styles.lcdName}>
                    {phase.kind === 'result' ? `No. ${phase.scan.info.id}` : 'No. ---'}
                  </Text>
                  <Press3D
                    onPress={() => stepDex(1)}
                    disabled={!canBrowse}
                    hitSlop={6}
                    style={[styles.navBtn, !canBrowse && styles.navOff]}
                  >
                    <Text style={styles.navGlyph}>›</Text>
                  </Press3D>
                </View>
                <View style={styles.lcdBody}>
                  <CrtFlicker key={phase.kind === 'result' ? `crt-${phase.scan.info.id}-${phase.uri}` : `crt-${phase.kind}`} />
                  {phase.kind !== 'camera' && (
                    <View style={styles.portalBg} pointerEvents="none">
                      <ScanPortal />
                    </View>
                  )}
                  <MountPop key={phase.kind}>
                  {phase.kind === 'camera' && (
                    <Scanner
                      ref={scannerRef}
                      onCapture={(uri) => void handleUri(uri)}
                      onCancel={() => {
                        sounds.close();
                        setPhase({ kind: 'idle' });
                      }}
                      onShutter={() => {
                        sounds.snap();
                        buzz('snap');
                      }}
                    />
                  )}
                  {phase.kind === 'loading' && (
                    <View style={styles.lcdCenter}>
                      <Text style={styles.lcdWait}>SCANNING…</Text>
                      <AnalyzeSteps />
                    </View>
                  )}
                  {phase.kind === 'result' && !revealed && (
                    <View style={[styles.stageScaled, { width: 190 * galleryScale, height: 160 * galleryScale }]}>
                      <View style={{ transform: [{ scale: galleryScale }] }}>
                    <Reveal
                      key={`dex-${phase.scan.info.id}-${phase.uri}`}
                      imageUri={gallery[0]}
                      onDone={() => {
                        setRevealed(true);
                        sounds.zoom();
                        const wantCry = sounds.prefs.autoCry;
                        const wantNarr = sounds.prefs.autoNarrate;
                        if (wantCry) sounds.cryFirst(phase.scan.info.cry, phase.scan.info.name);
                        const spoken = phase.scan.info.name;
                        later(() => {
                          if (!wantNarr) return;
                          if (sounds.hasNarration(spoken)) sounds.regAspect();
                          const narration = sounds.narrate(spoken);
                          if (narration.ms <= 0) return;
                          beginNarrationFx(narration.ms, narration.peaks);
                          setNarrating(true);
                          later(() => setNarrating(false), narration.ms + 500);
                        }, 1500);
                      }}
                    />
                      </View>
                    </View>
                  )}
                  {phase.kind === 'result' && revealed && (
                    <View style={styles.lcdCenter}>
                      <View style={[styles.stageScaled, { width: 190 * galleryScale, height: 160 * galleryScale }]}>
                        <View style={{ transform: [{ scale: galleryScale }] }}>
                      <SlideIn dir={slideDir} dist={110} dur={180} playKey={slideNonce}>
                        <MonBackdrop color={typeColor((phase.scan.info.types[0] ?? '').toLowerCase())}>
                          <CryWail tick={cryTick}>
                            <Image source={{ uri: gallery[shown] }} style={styles.lcdImg} resizeMode="contain" />
                          </CryWail>
                        </MonBackdrop>
                      </SlideIn>
                        </View>
                      </View>
                      <Sheen key={`sheen-${shown}`} />
                      {gallery[shown]?.includes('shiny') === true && <Sparkles />}
                      {gallery.length > 1 && (
                        <Text style={styles.dots}>
                          {gallery.map((_, i) => (i === shown ? '●' : '○')).join(' ')}
                          {'  '}IMG {shown + 1}/{gallery.length}
                        </Text>
                      )}
                    </View>
                  )}
                  {phase.kind === 'idle' && (
                    <View style={styles.lcdCenter}>
                      <Text style={styles.lcdWait}>AWAITING SPECIMEN</Text>
                    </View>
                  )}
                  {phase.kind === 'error' && (
                    <View style={styles.lcdCenter}>
                      <Text style={styles.lcdWait}>SENSOR FAULT</Text>
                    </View>
                  )}
                  </MountPop>
                  {phase.kind === 'result' && revealed && phase.isNew === true && (
                    <StampSlam key={`new-${phase.scan.info.id}`} />
                  )}
                  {(phase.kind === 'loading' || phase.kind === 'camera') && (
                    <ScanSweep height={220} />
                  )}
                  {dying && <PowerOff />}
                </View>
                <View style={styles.lcdFoot}>
                  <Text style={styles.lcdFootText}>
                    {phase.kind === 'result'
                      ? `HT ${phase.scan.info.height_m}m  WT ${phase.scan.info.weight_kg}kg`
                      : 'HT --  WT --'}
                  </Text>
                </View>
              </View>
              <View style={styles.bezelBottom}>
                <View style={styles.bezelSlotLeft}>
                  <Press3D
                    onPress={onReset}
                    disabled={!canReset}
                    hitSlop={8}
                  >
                    <View style={[styles.crimsonDot, !canReset && styles.crimsonDotOff]} />
                  </Press3D>
                </View>
                <View style={styles.bezelSlotCenter}>
                  <Press3D
                    onPress={() => {
                      if (phase.kind === 'camera') scannerRef.current?.snap();
                      else onScan();
                    }}
                    style={styles.scanBtn}
                  >
                    <IdlePulse active={phase.kind === 'idle'}>
                      {phase.kind === 'camera' ? (
                        <LinearGradient
                          colors={['#ffffff', '#dbe2ea', '#94a3b8']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.snapIcon}
                        >
                          <LinearGradient
                            colors={['#f87171', '#dc2626', '#7f1d1d']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={styles.snapCore}
                          >
                            <View style={styles.domeGlossSm} pointerEvents="none" />
                          </LinearGradient>
                        </LinearGradient>
                      ) : (
                        <LinearGradient
                          colors={['#f87171', '#c52028', '#7d0d13']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.scanIcon}
                        >
                          <View style={styles.domeGloss} pointerEvents="none" />
                          <View style={styles.scanIconInner}>
                            <PokeBall size={40} />
                          </View>
                        </LinearGradient>
                      )}
                      <Text style={styles.scanLabel}>
                        {phase.kind === 'camera' ? 'SNAP' : 'SCAN'}
                      </Text>
                    </IdlePulse>
                  </Press3D>
                </View>
                <View style={styles.bezelSlotRight}>
                  <View style={styles.grille}>
                    {[0, 1, 2, 3].map((i) => (
                      <View key={i} style={styles.slit} />
                    ))}
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.deck}>
              <View style={styles.deckLeft}>
                <View style={styles.pillRow}>
                  <Press3D onPress={onCry} style={styles.cryBtn}>
                    <View style={styles.cryIcon}>
                      <View style={styles.cryBox} />
                      <View style={styles.cryCone} />
                      <View style={styles.cryWave1} />
                      <View style={styles.cryWave2} />
                    </View>
                    <Text style={styles.cryText}>CRY</Text>
                  </Press3D>
                  <Press3D onPress={onScan} style={styles.pillRed}>
                    <View style={styles.pillFill} />
                  </Press3D>
                  <Press3D onPress={onGallery} style={styles.pillLime}>
                    <View style={styles.pillFill} />
                  </Press3D>
                </View>
                <GreenLcd>
                  <LcdText>LINK: {linkOk === null ? '…' : linkOk ? 'OK' : 'DOWN'}</LcdText>
                  <LcdText>
                    CONF: {conf}
                    {phase.kind === 'result' && gallery.length > 1 ? ` IMG:${shown + 1}/${gallery.length}` : ''}
                  </LcdText>
                  <LcdText>GEN: KANTO</LcdText>
                </GreenLcd>
              </View>
              <DPad
                onUp={() => sounds.clickShort()}
                onDown={() => sounds.clickShort()}
                onLeft={() => stepImg(-1)}
                onRight={() => stepImg(1)}
                onCenter={() => sounds.clickShort()}
              />
            </View>

            <View style={styles.term}>
              <View style={styles.termHead}>
                <Text style={styles.termTitle}>
                  {phase.kind === 'result' ? `DATA ENTRY #${phase.scan.info.id}` : 'DATA ENTRY #---'}
                </Text>
                <View style={styles.termRight}>
                  {phase.kind === 'result' && (
                    <Press3D
                      onPress={onReplayNarration}
                      style={[styles.narrBtn, narrating && styles.narrBtnLive]}
                    >
                      <View style={styles.narrIcon}>
                        {narrating ? (
                          <View style={styles.narrStop} />
                        ) : (
                          <View style={styles.narrPlay} />
                        )}
                      </View>
                      <Text style={[styles.termReplay, narrating && styles.termReplayLive]}>
                        {narrating ? 'STOP' : 'NARRATE'}
                      </Text>
                    </Press3D>
                  )}
                  <Text style={styles.termInfo}>INFO</Text>
                </View>
              </View>
              {phase.kind === 'result' && (
                <View>
                  <View style={styles.typeRow}>
                    {phase.scan.info.types.map((t, i) => (
                      <ChipPop key={`${phase.scan.info.id}-${t}`} index={i}>
                        <View style={[styles.typeChipBox, { borderColor: typeColor(t) }]}>
                          <TypeIcon type={t} size={16} />
                          <Text style={[styles.typeChipText, { color: typeColor(t) }]}>
                            {t.toUpperCase()}
                          </Text>
                        </View>
                      </ChipPop>
                    ))}
                  </View>
                  {weak.length > 0 && (
                    <View style={styles.weakBox}>
                      <View style={styles.weakHead}>
                        <View style={styles.warnBadge}>
                          <Text style={styles.warnMark}>!</Text>
                        </View>
                        <Text style={styles.weakTitle}>WEAKNESS</Text>
                      </View>
                      <View style={styles.weakChips}>
                        {weak.map((w, i) => (
                          <ChipPop key={`${phase.scan.info.id}-${w.type}`} index={i} pulse={w.mult >= 4}>
                            <View
                              style={[
                                styles.weakChipBox,
                                { borderColor: typeColor(w.type) },
                                w.mult >= 4 && styles.weakChip4,
                              ]}
                            >
                              <TypeIcon type={w.type} size={14} />
                              <Text
                                style={[
                                  styles.weakChipText,
                                  { color: typeColor(w.type) },
                                ]}
                              >
                                {w.type.toUpperCase()} x{w.mult}
                              </Text>
                            </View>
                          </ChipPop>
                        ))}
                      </View>
                    </View>
                  )}
                  <Text style={styles.lore}>
                    <TypeText
                      key={`flavor-${phase.scan.info.id}`}
                      text={phase.scan.info.flavor.toUpperCase() || 'NO LORE DATA.'}
                      style={styles.lore}
                    />
                    <Text style={styles.loreCyan}> ▶</Text>
                  </Text>
                  <Text style={styles.sectHead}>BASE STATS</Text>
                  {phase.scan.info.stats.map((s) => (
                    <StatGauge key={`${phase.scan.info.id}-${s.name}`} name={s.name} value={s.value} />
                  ))}
                  <Text style={styles.sectHead}>ABILITIES</Text>
                  {phase.scan.info.abilities.map((a) => (
                    <View key={a.name} style={styles.abilityRow}>
                      <Text style={styles.abilityName}>{a.name.toUpperCase()}</Text>
                      {a.effect !== '' && <Text style={styles.abilityFx}>{a.effect}</Text>}
                    </View>
                  ))}
                  <Text style={styles.sectHead}>EVOLUTION</Text>
                  <EvoChain chain={phase.scan.info.evolution} current={phase.scan.info.name} seen={seen} />
                </View>
              )}
              {phase.kind === 'error' && (
                <TypeText
                  key={`err-${phase.message.length}`}
                  text={`ERR: ${phase.message.toUpperCase()}`}
                  style={styles.loreErr}
                />
              )}
              {phase.kind === 'loading' && (
                <TypeText key="loading" text="READING SPECIMEN…" style={styles.lore} />
              )}
              {(phase.kind === 'idle' || phase.kind === 'camera') && (
                <Text style={styles.lore}>
                  <TypeText
                    key={`hint-${phase.kind}`}
                    text="POINT AT A POKéMON. SCAN KEY TO SHOOT. ◀ ▶ FLIPS ART. CONF≥70% OR REJECT."
                    style={styles.lore}
                  />
                  <Text style={styles.loreCyan}> ▶</Text>
                </Text>
              )}
            </View>

            <View style={styles.dexRow}>
              <Press3D onPress={onOpenDex} style={styles.dexBar} pressScale={0.97}>
                <Text style={styles.dexBarTitle}>POKEDEX</Text>
                <Text style={styles.dexBarCount}>{seen.size}/151</Text>
                <Text style={styles.dexBarGo}>▶</Text>
              </Press3D>
              <Press3D
                onPress={() => {
                  sounds.click();
                  stopChase();
                  setPhase({ kind: 'settings' });
                }}
                style={styles.gearBtn}
              >
                <Text style={styles.gearLabel}>⚙</Text>
              </Press3D>
            </View>
          </LinearGradient>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12131a' },
  bg: { backgroundColor: '#12131a', padding: 8, alignItems: 'center' },
  boot: { flex: 1, backgroundColor: '#12131a', alignItems: 'center', justifyContent: 'center' },
  chassis: {
    width: '100%', maxWidth: 520, alignSelf: 'center',
    borderRadius: 24, padding: 16, gap: 14,
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  chassisCompact: { padding: 10, gap: 10, borderRadius: 18 },
  sensorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sensorLeft: { flexDirection: 'row', alignItems: 'center' },
  lensWrap: { alignItems: 'center', justifyContent: 'center' },
  genStamp: { fontFamily: FONTS.pixel, fontSize: 8, color: 'rgba(80,0,8,0.8)', paddingTop: 4 },
  bezel: { backgroundColor: DEX.bezel, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#cbd5e1' },
  bezelDots: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 8 },
  bezelDot: {
    width: 10, height: 10, borderRadius: 5, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.4)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35, shadowRadius: 1, elevation: 2,
  },
  bezelDotGloss: {
    position: 'absolute', top: 1, left: 1, width: 4, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  lcd: { backgroundColor: DEX.lcd, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#64748b', minHeight: 250 },
  lcdHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(71,85,105,0.5)',
  },
  lcdName: { fontFamily: FONTS.pixel, fontSize: 11, color: DEX.lcdInk, flexShrink: 1 },
  navBtn: {
    width: 28, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(71,85,105,0.35)', borderWidth: 1, borderColor: '#475569',
    borderBottomWidth: 3,
  },
  navOff: { opacity: 0.3 },
  navGlyph: { fontFamily: FONTS.pixel, fontSize: 11, color: DEX.lcdInk },
  lcdBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, minHeight: 170, overflow: 'hidden', borderRadius: 4 },
  portalBg: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', opacity: 0.85 },
  lcdCenter: { alignItems: 'center', gap: 8 },
  // Fixed 190x160 design stage, scaled by galleryScale wrapper (plain-number
  // transform only — never put Animated values on plain Views here).
  stageScaled: { alignItems: 'center', justifyContent: 'center' },
  lcdImg: { width: 190, height: 160 },
  dots: { fontFamily: FONTS.pixel, fontSize: 8, color: DEX.lcdInk },
  lcdWait: { fontFamily: FONTS.pixel, fontSize: 10, color: DEX.lcdInk },
  lcdFoot: { backgroundColor: 'rgba(100,116,139,0.25)', borderRadius: 4, padding: 4 },
  lcdFootText: { fontFamily: FONTS.pixel, fontSize: 7, color: '#334155', textAlign: 'center' },
  bezelBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 4 },
  bezelSlotLeft: { flex: 1, alignItems: 'flex-start' },
  bezelSlotCenter: { flex: 1, alignItems: 'center' },
  bezelSlotRight: { flex: 1, alignItems: 'flex-end' },
  scanBtn: { alignItems: 'center', gap: 2 },
  scanBtnPressed: { opacity: 0.75, transform: [{ scale: 0.94 }] },
  scanIcon: {
    width: 56, height: 56, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#5c0a10',
    borderBottomWidth: 4, borderBottomColor: 'rgba(0,0,0,0.5)',
    elevation: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4, shadowRadius: 3, overflow: 'hidden',
  },
  scanIconInner: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.4)',
  },
  domeGloss: {
    position: 'absolute', top: 2, left: 6, right: 6, height: 14, borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  domeGlossSm: {
    position: 'absolute', top: 2, left: 5, right: 5, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  snapIcon: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#c52028', elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4, shadowRadius: 3,
  },
  snapCore: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.4)',
  },
  scanLabel: { fontFamily: FONTS.pixel, fontSize: 9, color: '#1e293b' },
  crimsonDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#dc2626', borderWidth: 1, borderColor: '#7f1d1d', borderTopColor: 'rgba(255,255,255,0.5)', borderBottomWidth: 3, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 2 },
  grille: { gap: 4, width: 56 },
  slit: { height: 4, backgroundColor: '#1e293b', borderRadius: 2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.18)' },
  deck: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  deckLeft: { flex: 1, gap: 10 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cryBtn: { position: 'relative', flexDirection: 'row', height: 34, borderRadius: 17, backgroundColor: '#1c1917', borderWidth: 1, borderColor: '#44403c', borderTopColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, gap: 6, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 2 },
  cryIcon: { width: 24, height: 16, alignItems: 'center', justifyContent: 'center' },
  cryBox: { position: 'absolute', left: 0, width: 5, height: 10, borderRadius: 1, backgroundColor: '#e7e5e4' },
  cryCone: {
    position: 'absolute', left: 4, width: 0, height: 0,
    borderTopWidth: 6, borderBottomWidth: 6, borderLeftWidth: 8,
    borderTopColor: 'transparent', borderBottomColor: 'transparent',
    borderLeftColor: '#e7e5e4',
  },
  cryWave1: {
    position: 'absolute', left: 12, width: 9, height: 9, borderRadius: 5,
    borderWidth: 2, borderColor: 'transparent', borderRightColor: '#e7e5e4',
  },
  cryWave2: {
    position: 'absolute', left: 14, width: 13, height: 13, borderRadius: 7,
    borderWidth: 2, borderColor: 'transparent', borderRightColor: 'rgba(231,229,228,0.55)',
  },
  cryText: { fontFamily: FONTS.pixel, fontSize: 8, color: '#e7e5e4' },
  pillRed: { width: 38, height: 11, borderRadius: 6, backgroundColor: '#f43f5e', borderWidth: 1, borderColor: 'rgba(0,0,0,0.6)', borderTopColor: 'rgba(255,255,255,0.55)', borderBottomWidth: 3, elevation: 2 },
  pillLime: { width: 38, height: 11, borderRadius: 6, backgroundColor: '#a3e635', borderWidth: 1, borderColor: 'rgba(0,0,0,0.6)', borderTopColor: 'rgba(255,255,255,0.55)', borderBottomWidth: 3, elevation: 2 },
  pillFill: { width: '100%', height: '100%' },
  term: { backgroundColor: DEX.black, borderRadius: 8, padding: 12, borderWidth: 2, borderColor: '#450a0a', minHeight: 120 },
  termHead: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#27272a', paddingBottom: 4, marginBottom: 6 },
  termTitle: { fontFamily: FONTS.pixel, fontSize: 8, color: '#71717a' },
  termInfo: { fontFamily: FONTS.pixel, fontSize: 8, color: DEX.cyan },
  termRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  termReplay: { fontFamily: FONTS.pixel, fontSize: 8, color: '#31e368' },
  termReplayLive: { color: '#fca5a5' },
  narrBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#31e368', borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  narrBtnLive: { borderColor: '#ef4444', backgroundColor: 'rgba(127,29,29,0.6)' },
  narrIcon: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  narrPlay: {
    width: 0, height: 0,
    borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 9,
    borderTopColor: 'transparent', borderBottomColor: 'transparent',
    borderLeftColor: '#31e368',
  },
  narrStop: { width: 9, height: 9, borderRadius: 1, backgroundColor: '#ef4444' },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  typeChipBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4,
  },
  typeChipText: { fontFamily: FONTS.pixel, fontSize: 9 },
  weakBox: {
    backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.5)',
    borderRadius: 6, padding: 8, marginBottom: 8,
  },
  weakHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  warnBadge: {
    width: 16, height: 16, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center',
    borderRadius: 2, borderWidth: 1, borderColor: '#7f1d1d', borderTopColor: 'rgba(255,255,255,0.5)',
  },
  warnMark: { fontFamily: FONTS.pixel, fontSize: 9, color: '#fff' },
  weakTitle: { fontFamily: FONTS.pixel, fontSize: 8, color: '#f87171' },
  weakChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  weakChipBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  weakChipText: { fontFamily: FONTS.pixel, fontSize: 8 },
  weakChip4: { borderWidth: 2, backgroundColor: 'rgba(239,68,68,0.25)' },
  sectHead: { fontFamily: FONTS.pixel, fontSize: 8, color: DEX.cyan, marginTop: 10, marginBottom: 2 },
  abilityRow: { marginTop: 4 },
  abilityName: { fontFamily: FONTS.pixel, fontSize: 9, color: '#f1fa8c' },
  abilityFx: { fontFamily: FONTS.tech, fontSize: 16, color: '#a1a1aa' },
  lore: { fontFamily: FONTS.tech, fontSize: 19, lineHeight: 22, color: '#f4f4f5' },
  loreOk: { color: '#34d399' },
  loreCyan: { color: DEX.cyan },
  loreErr: { fontFamily: FONTS.tech, fontSize: 18, color: '#f87171' },
  crimsonDotOff: { opacity: 0.35, elevation: 0 },
  dexRow: { flexDirection: 'row', gap: 8 },
  dexBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0b0c0e', borderRadius: 6, padding: 10,
    borderWidth: 1, borderColor: '#31e368',
  },
  gearBtn: {
    width: 44, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0b0c0e', borderWidth: 1, borderColor: '#3f3f46',
    borderBottomWidth: 3,
  },
  gearLabel: { fontSize: 20, color: DEX.cyan },
  dexBarTitle: { fontFamily: FONTS.pixel, fontSize: 9, color: DEX.cyan },
  dexBarCount: { fontFamily: FONTS.pixel, fontSize: 9, color: '#31e368' },
  dexBarGo: { fontFamily: FONTS.pixel, fontSize: 9, color: '#71717a' },
});

export default App;
