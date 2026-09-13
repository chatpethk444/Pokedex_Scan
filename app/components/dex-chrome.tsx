import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DEX, FONTS, typeColor } from '../lib/theme';
import { normDexKey } from '../lib/dex151';
import { Press3D } from './fx';

const STAT_SHORT: Record<string, string> = {
  hp: 'HP', attack: 'ATK', defense: 'DEF',
  'special-attack': 'SPA', 'special-defense': 'SPD', speed: 'SPE',
};

function statColor(v: number): string {
  if (v >= 90) return '#31e368';
  if (v >= 50) return DEX.cyan;
  return '#ffb86c';
}

/** Segmented telemetry gauge (stepped blocks, not a smooth bar).
 *  Blocks cascade in with stagger; value counts 0 -> value. Remount (key) to replay. */
export function StatGauge({ name, value, max = 160 }: { name: string; value: number; max?: number }): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    v.setValue(0);
    setShown(0);
    const id = v.addListener(({ value: t }) => setShown(Math.round(t * value)));
    Animated.timing(v, {
      toValue: 1, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: false,
    }).start();
    return () => v.removeListener(id);
  }, [value, v]);
  const filled = Math.max(1, Math.round(Math.min(1, value / max) * 10));
  return (
    <View style={styles.gaugeRow}>
      <Text style={styles.gaugeLabel}>{STAT_SHORT[name] ?? name.toUpperCase().slice(0, 3)}</Text>
      <View style={styles.blocks}>
        {Array.from({ length: 10 }, (_, i) => {
          const op = v.interpolate({
            inputRange: [i * 0.06, i * 0.06 + 0.2],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          });
          const sc = v.interpolate({
            inputRange: [i * 0.06, i * 0.06 + 0.2],
            outputRange: [0.6, 1],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={i}
              style={[
                styles.block,
                i < filled ? { backgroundColor: statColor(value) } : styles.blockOff,
                { opacity: op, transform: [{ scale: sc }] },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.gaugeVal}>{shown}</Text>
    </View>
  );
}

export function artUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

/** Animated confidence readout: counts 0 -> target. Remount (key) to replay. */
export function ConfCount({ target }: { target: number }): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const id = v.addListener(({ value }) => setShown(Math.round(value * 100)));
    Animated.timing(v, { toValue: Math.max(0, Math.min(1, target)), duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: false }).start();
    return () => v.removeListener(id);
  }, [target, v]);
  return <Text style={styles.confVal}>{shown}%</Text>;
}

/** Vector type icon: rounded-square badge in type color + monochrome glyph.
 *  Pure Views (no fonts/assets), scales with `size`. Covers Gen 1 + fairy/dark/steel. */
const WHITE_GLYPH = new Set(['poison', 'ghost', 'dragon', 'fighting', 'dark', 'water']);

export function TypeIcon({ type, size = 22 }: { type: string; size?: number }): React.JSX.Element {
  const t = type.toLowerCase();
  const bg = typeColor(t);
  const g = WHITE_GLYPH.has(t) ? '#f4f4f5' : '#26262e';
  const k = size / 22;
  const box = {
    width: size, height: size, borderRadius: 5 * k, backgroundColor: bg,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)', overflow: 'hidden' as const,
  };
  const dot = (d: number, left: number, top: number, color: string = g) => ({
    position: 'absolute' as const, width: d * k, height: d * k, borderRadius: (d * k) / 2,
    left: left * k, top: top * k, backgroundColor: color,
  });
  const bar = (w: number, h: number, left: number, top: number, rot: number, color: string = g) => ({
    position: 'absolute' as const, width: w * k, height: h * k, left: left * k, top: top * k,
    backgroundColor: color, transform: [{ rotate: `${rot}deg` }],
  });
  const sq = (s: number, left: number, top: number, rot: number, color: string = g) => ({
    position: 'absolute' as const, width: s * k, height: s * k, left: left * k, top: top * k,
    backgroundColor: color, transform: [{ rotate: `${rot}deg` }],
  });
  const triUp = (base: number, h: number, left: number, top: number, color: string = g) => ({
    position: 'absolute' as const, width: 0, height: 0,
    borderLeftWidth: (base / 2) * k, borderRightWidth: (base / 2) * k, borderBottomWidth: h * k,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color,
    left: left * k, top: top * k,
  });

  let glyph: React.JSX.Element | null = null;
  switch (t) {
    case 'normal':
      glyph = <View style={dot(10, 6, 6)} />;
      break;
    case 'fire':
      glyph = (<>
        <View style={triUp(13, 13, 4.5, 5)} />
        <View style={triUp(6, 7, 8, 10, bg)} />
      </>);
      break;
    case 'water':
      glyph = (<>
        <View style={triUp(10, 8, 6, 3)} />
        <View style={dot(10, 6, 6)} />
      </>);
      break;
    case 'electric':
      glyph = (<>
        <View style={bar(5.5, 9, 8, 2.5, 20)} />
        <View style={bar(5.5, 9, 8, 10.5, -20)} />
      </>);
      break;
    case 'grass':
      glyph = (<>
        <View style={dot(9, 6.5, 7)} />
        <View style={triUp(6, 5, 8, 2.5)} />
        <View style={bar(1.6, 8, 10.2, 7, 35)} />
      </>);
      break;
    case 'ice':
      glyph = (<>
        <View style={sq(9.5, 6.25, 6.25, 45)} />
        <View style={sq(4, 9, 9, 45, bg)} />
      </>);
      break;
    case 'fighting':
      glyph = (<>
        <View style={sq(11, 5.5, 5.5, 0)} />
        <View style={sq(11, 5.5, 5.5, 45)} />
      </>);
      break;
    case 'poison':
      glyph = (<>
        <View style={dot(9, 6.5, 7.5)} />
        <View style={dot(3, 14, 3.5)} />
        <View style={dot(2, 17, 6)} />
      </>);
      break;
    case 'ground':
      glyph = (<>
        <View style={triUp(14, 9, 4, 9)} />
        <View style={triUp(8, 6, 12, 12)} />
      </>);
      break;
    case 'flying':
      glyph = (<>
        <View style={bar(2.4, 13, 9.8, 4.5, 35)} />
        <View style={{ position: 'absolute', width: 10 * k, height: 5.5 * k, left: 6 * k, top: 3 * k, backgroundColor: g, borderRadius: 3 * k, transform: [{ rotate: '35deg' }] }} />
      </>);
      break;
    case 'psychic':
      glyph = (<>
        <View style={{ position: 'absolute', width: 13 * k, height: 8 * k, left: 4.5 * k, top: 7 * k, backgroundColor: g, borderRadius: 4 * k }} />
        <View style={dot(4, 9, 9, bg)} />
      </>);
      break;
    case 'bug':
      glyph = (<>
        <View style={bar(1.4, 5, 4.2, 8, -40)} />
        <View style={bar(1.4, 5, 16.4, 8, 40)} />
        <View style={bar(1.4, 5, 4.2, 12, 40)} />
        <View style={bar(1.4, 5, 16.4, 12, -40)} />
        <View style={{ position: 'absolute', width: 8 * k, height: 11 * k, left: 7 * k, top: 6.5 * k, backgroundColor: g, borderRadius: 4 * k }} />
        <View style={dot(4.5, 8.75, 3.5)} />
        <View style={bar(1.4, 3.5, 9, 0.5, -25)} />
        <View style={bar(1.4, 3.5, 11.6, 0.5, 25)} />
      </>);
      break;
    case 'rock':
      glyph = (<>
        <View style={sq(11, 5.5, 5.5, 45)} />
        <View style={sq(5, 8.5, 8.5, 45, bg)} />
      </>);
      break;
    case 'ghost':
      glyph = (<>
        <View style={dot(10, 6, 3)} />
        <View style={{ position: 'absolute', width: 10 * k, height: 6 * k, left: 6 * k, top: 9 * k, backgroundColor: g }} />
        <View style={dot(2.2, 8.2, 6.5, bg)} />
        <View style={dot(2.2, 11.6, 6.5, bg)} />
      </>);
      break;
    case 'dragon':
      glyph = (<>
        <View style={triUp(3, 4, 6.5, 2.5)} />
        <View style={triUp(3, 4, 12.5, 2.5)} />
        <View style={sq(10, 6, 7, 45)} />
        <View style={sq(4, 9, 10, 45, bg)} />
      </>);
      break;
    case 'fairy':
      glyph = (<>
        <View style={bar(2.6, 12, 9.7, 5, 0)} />
        <View style={bar(12, 2.6, 5, 9.7, 0)} />
        <View style={dot(3, 9.5, 9.5)} />
      </>);
      break;
    case 'dark':
      glyph = (<>
        <View style={dot(11, 5.5, 5.5)} />
        <View style={dot(9, 8, 3.5, bg)} />
      </>);
      break;
    case 'steel':
      glyph = (<>
        <View style={sq(11, 5.5, 5.5, 45)} />
        <View style={dot(2, 10, 6.5, bg)} />
        <View style={dot(2, 7.5, 10.5, bg)} />
        <View style={dot(2, 12.5, 10.5, bg)} />
      </>);
      break;
    default:
      glyph = <View style={dot(10, 6, 6)} />;
      break;
  }
  return <View style={box}>{glyph}</View>;
}

/** Evolution chain strip. current = highlighted species name.
 *  Unseen evolutions render as silhouette + ??? (seen = scanned set). */
export function EvoChain({
  chain,
  current,
  seen,
}: {
  chain: { name: string; id: number; min_level: number | null }[];
  current: string;
  seen?: Set<string>;
}): React.JSX.Element {
  if (chain.length < 2) return <></>;
  return (
    <View style={styles.evoRow}>
      {chain.map((e, i) => {
        const isCurrent = e.name === current;
        const isSeen = isCurrent || (seen !== undefined && seen.has(normDexKey(e.name)));
        return (
          <View key={e.id} style={styles.evoCell}>
            {i > 0 && (
              <Text style={styles.evoArrow}>
                {e.min_level !== null ? `Lv${e.min_level}` : '→'}
              </Text>
            )}
            <Image
              source={{ uri: artUrl(e.id) }}
              style={[styles.evoImg, !isSeen && styles.evoShadow]}
              resizeMode="contain"
              {...(isSeen ? {} : { tintColor: '#4a4a54' })}
            />
            <Text style={[styles.evoName, isCurrent && styles.evoCur]} numberOfLines={1}>
              {isSeen ? e.name.toUpperCase() : '???'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function Lens({ active, level }: { active?: boolean; level?: number }): React.JSX.Element {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (level !== undefined) {
      // driven by real audio envelope (0..1)
      pulse.setValue(Math.max(0, Math.min(1, level)));
      return;
    }
    if (active !== true) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 380, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 380, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, level, pulse]);

  const inner = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] });
  const press = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });

  return (
    <LinearGradient
      colors={['#ffffff', '#d7dee6', '#9aa7b5', '#f2f5f8']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.lensRing}
    >
      {/* dark gasket: ring reads raised, dome reads recessed */}
      <View style={styles.lensGasket}>
      <Animated.View style={{ flex: 1, transform: [{ scale: press }] }}>
      <LinearGradient
        colors={['#c9f4ff', '#38bdf8', '#0369a1', '#082f49']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.lens}
      >
        <View style={styles.lensShade} pointerEvents="none" />
        <View style={styles.glare} />
        <View style={styles.lensSpeck} />
        <View style={styles.lensCore} />
        <Animated.View style={[styles.innerFlash, { opacity: inner }]} pointerEvents="none" />
      </LinearGradient>
      </Animated.View>
      </View>
    </LinearGradient>
  );
}

export function Led({ color, glow, pulse }: { color: string; glow: string; pulse?: boolean }): React.JSX.Element {
  return (
    <LinearGradient
      colors={['#ffffff', '#c3ccd5', '#8b96a3']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.ledBezel}
    >
      <View
        style={[
          styles.led,
          { backgroundColor: color, shadowColor: glow, opacity: pulse ? 0.55 : 1 },
        ]}
      >
        <View style={styles.ledShade} pointerEvents="none" />
        <View style={styles.ledGloss} pointerEvents="none" />
        <View style={styles.ledDot} />
      </View>
    </LinearGradient>
  );
}

export function LedRow({ busy }: { busy: boolean }): React.JSX.Element {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!busy) return;
    t.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 2, duration: 480, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 480, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [busy, t]);
  const lamps = [
    { color: '#dc2626', glow: '#ef4444' },
    { color: DEX.amber, glow: '#f59e0b' },
    { color: DEX.emerald, glow: '#10b981' },
  ];
  if (!busy) {
    return (
      <View style={styles.ledRow}>
        {lamps.map((l) => (
          <Led key={l.color} color={l.color} glow={l.glow} />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.ledRow}>
      {lamps.map((l, i) => {
        const k = t.interpolate({
          inputRange: [i - 1, i, i + 1],
          outputRange: [0, 1, 0],
          extrapolate: 'clamp',
        });
        const body = k.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
        const bleed = k.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] });
        return (
          <Animated.View key={l.color} style={[styles.lampSlot, { opacity: body }]}>
            <Animated.View
              style={[styles.lampHalo, { backgroundColor: l.glow, opacity: bleed, shadowColor: l.glow }]}
              pointerEvents="none"
            />
            <Led color={l.color} glow={l.glow} />
          </Animated.View>
        );
      })}
    </View>
  );
}

export function TactileKey({
  label,
  onPress,
  color,
  wide,
  lit,
}: {
  label: string;
  onPress: () => void;
  color: string;
  wide?: boolean;
  lit?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        wide === true && styles.keyWide,
        {
          backgroundColor: lit === true ? '#8fd0ff' : color,
          transform: [{ translateY: pressed || lit === true ? 2 : 0 }],
          shadowColor: lit === true ? '#7cc4f5' : undefined,
          shadowOpacity: lit === true ? 0.9 : 0,
          shadowRadius: lit === true ? 8 : 0,
        },
      ]}
    >
      <View style={styles.keyGloss} pointerEvents="none" />
      <Text style={styles.keyLabel}>{label}</Text>
    </Pressable>
  );
}

export function GreenLcd({ children }: { children: ReactNode }): React.JSX.Element {
  return <View style={styles.greenLcd}>{children}</View>;
}

export function LcdText({ children }: { children: ReactNode }): React.JSX.Element {
  return <Text style={styles.lcdText}>{children}</Text>;
}

/** Direction arrow drawn with borders (font-independent — geometric glyphs
 *  vanish on some Android system fonts). ~13px, light gray. */
function DPadArrowGlyph({ dir }: { dir: 'up' | 'down' | 'left' | 'right' }): React.JSX.Element {
  const c = '#d8d8de';
  if (dir === 'up') {
    return (
      <View style={{
        width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 11,
        borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: c,
      }} />
    );
  }
  if (dir === 'down') {
    return (
      <View style={{
        width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 11,
        borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: c,
      }} />
    );
  }
  if (dir === 'left') {
    return (
      <View style={{
        width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 7, borderRightWidth: 11,
        borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: c,
      }} />
    );
  }
  return (
    <View style={{
      width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 7, borderLeftWidth: 11,
      borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: c,
    }} />
  );
}

/** Single beveled D-pad arm: gradient face, edge light, sinks when pressed.
 *  Static children only (no render-prop) for identical native/web render. */
function DPadArm({
  dir,
  onPress,
  style,
  faceStyle,
}: {
  dir: 'up' | 'down' | 'left' | 'right';
  onPress?: () => void;
  style?: object;
  faceStyle?: object;
}): React.JSX.Element {
  return (
      <Press3D onPress={onPress} hitSlop={8} style={[styles.dpadArm, style]}>
      <LinearGradient
        colors={['#565661', '#2e2e34', '#17171b']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.dpadFace, faceStyle, styles.dpadFaceUp]}
      >
        <View style={styles.dpadEdgeLight} pointerEvents="none" />
        <DPadArrowGlyph dir={dir} />
      </LinearGradient>
    </Press3D>
  );
}

export function DPad({
  onUp,
  onDown,
  onLeft,
  onRight,
  onCenter,
}: {
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onCenter?: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.dpad}>
      {/* recessed dish the cross sits in */}
      <View style={styles.dpadWellRing} pointerEvents="none" />
      <View style={styles.dpadWell} pointerEvents="none" />
      <View style={styles.dpadWellLight} pointerEvents="none" />
      <DPadArm dir="up" onPress={onUp} style={styles.dpadNorth} faceStyle={styles.dpadFaceV} />
      <DPadArm dir="down" onPress={onDown} style={styles.dpadSouth} faceStyle={styles.dpadFaceV} />
      <DPadArm dir="left" onPress={onLeft} style={styles.dpadWest} faceStyle={styles.dpadFaceH} />
      <DPadArm dir="right" onPress={onRight} style={styles.dpadEast} faceStyle={styles.dpadFaceH} />
      <Press3D onPress={onCenter} style={styles.dpadPivot}>
        <LinearGradient
          colors={['#4a4a52', '#26262b', '#101013']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.dpadDome}
        >
          <View style={styles.dpadNub} pointerEvents="none" />
          <View style={styles.dpadNubGloss} pointerEvents="none" />
        </LinearGradient>
      </Press3D>
    </View>
  );
}

export function EntButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  return (
    <Press3D onPress={onPress} style={styles.ent}>
      <LinearGradient
        colors={['#ffe27a', DEX.yellow, '#c98a00']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.entDome}
      >
        <View style={styles.entGloss} pointerEvents="none" />
        <Text style={styles.entLabel}>ENT</Text>
      </LinearGradient>
    </Press3D>
  );
}

export function Badge({ caption, value, color }: { caption: string; value: string; color: string }): React.JSX.Element {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeCap}>{caption}</Text>
      <Text style={[styles.badgeVal, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lensRing: {
    width: 72, height: 72, borderRadius: 36, padding: 5,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 5, elevation: 8,
  },
  lensGasket: {
    flex: 1, borderRadius: 31, padding: 2, backgroundColor: '#0b1220',
  },
  lens: { flex: 1, borderRadius: 29, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  lensShade: {
    ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 29, transform: [{ translateY: 12 }],
  },
  glare: {
    position: 'absolute', top: 5, left: 7, width: 30, height: 17, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.65)', transform: [{ rotate: '-20deg' }],
  },
  lensSpeck: {
    position: 'absolute', top: 22, left: 12, width: 9, height: 9, borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  lensCore: { width: 13, height: 13, borderRadius: 7, backgroundColor: 'rgba(224,254,255,0.85)' },
  innerFlash: { ...StyleSheet.absoluteFill, backgroundColor: '#e0feff' },
  ledRow: { flexDirection: 'row', gap: 8, paddingLeft: 8, alignItems: 'center' },
  lampSlot: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  lampHalo: {
    position: 'absolute', width: 28, height: 28, borderRadius: 14,
    shadowOpacity: 0.9, shadowRadius: 10, elevation: 2,
  },
  ledBezel: {
    width: 20, height: 20, borderRadius: 10, padding: 2,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.4)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 2, elevation: 3,
  },
  led: {
    flex: 1, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(0,0,0,0.5)',
    shadowOpacity: 0.9, shadowRadius: 6, elevation: 4, overflow: 'hidden',
  },
  ledShade: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  ledGloss: {
    position: 'absolute', top: 0, left: 1, right: 1, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  ledDot: {
    position: 'absolute', top: 2, left: 2, width: 4, height: 4,
    borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)',
  },
  key: {
    minWidth: 44, height: 34, borderRadius: 4, alignItems: 'center', justifyContent: 'center',
    borderBottomWidth: 3, borderBottomColor: 'rgba(0,0,0,0.45)', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35, shadowRadius: 2, elevation: 3,
  },
  keyGloss: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  keyWide: { minWidth: 64 },
  keyLabel: { fontFamily: FONTS.tech, fontSize: 16, color: '#06283d', fontWeight: 'bold' },
  greenLcd: {
    backgroundColor: DEX.greenLcd, borderRadius: 6, padding: 8,
    borderWidth: 1, borderColor: '#2f6b28',
  },
  lcdText: { fontFamily: FONTS.tech, fontSize: 17, color: DEX.greenInk, lineHeight: 20 },
  dpad: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dpadWellRing: {
    position: 'absolute', width: 134, height: 134, borderRadius: 67,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  dpadWell: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    backgroundColor: '#0a0a0c', borderWidth: 1, borderColor: '#000',
  },
  dpadWellLight: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    borderBottomWidth: 2, borderBottomColor: 'rgba(255,255,255,0.14)',
  },
  dpadArm: { position: 'absolute', zIndex: 1 },
  dpadNorth: { top: 6, left: 52, width: 36, height: 44 },
  dpadSouth: { bottom: 6, left: 52, width: 36, height: 44 },
  dpadWest: { left: 6, top: 52, width: 44, height: 36 },
  dpadEast: { right: 6, top: 52, width: 44, height: 36 },
  dpadFace: {
    width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#34343a',
  },
  dpadFaceV: { borderRadius: 5 },
  dpadFaceH: { borderRadius: 5 },
  dpadFaceUp: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.75, shadowRadius: 4, elevation: 6,
  },
  dpadEdgeLight: {
    position: 'absolute', top: 0, left: 3, right: 3, height: 3, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dpadPivot: { width: 36, height: 36, borderRadius: 18, zIndex: 2, elevation: 6 },
  dpadDome: {
    width: '100%', height: '100%', borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#3a3a40',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 2,
  },
  dpadNub: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: '#d32730',
    borderWidth: 1, borderColor: '#7d0d13', borderTopColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 2, elevation: 2,
  },
  dpadNubGloss: {
    position: 'absolute', top: 12, left: 12, width: 5, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  ent: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 1, borderColor: '#8f6500', borderBottomWidth: 4, elevation: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4, shadowRadius: 3,
  },
  entDome: {
    flex: 1, borderRadius: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  entGloss: {
    position: 'absolute', top: 3, left: 8, right: 8, height: 14, borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  entLabel: { fontFamily: FONTS.tech, fontWeight: 'bold', color: '#713f12', fontSize: 16 },
  badge: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', borderRadius: 6, padding: 8,
    borderWidth: 1, borderColor: '#3f3f46', alignItems: 'center',
  },
  badgeCap: { fontFamily: FONTS.pixel, fontSize: 7, color: '#71717a' },
  badgeVal: { fontFamily: FONTS.pixel, fontSize: 12, marginTop: 4 },
  confVal: { fontFamily: FONTS.pixel, fontSize: 12, marginTop: 4, color: '#31e368' },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  gaugeLabel: { fontFamily: FONTS.pixel, fontSize: 8, color: DEX.cyan, width: 30 },
  blocks: { flex: 1, flexDirection: 'row', gap: 3 },
  block: { flex: 1, height: 10, borderRadius: 1 },
  blockOff: { backgroundColor: 'rgba(255,255,255,0.12)' },
  gaugeVal: { fontFamily: FONTS.tech, fontSize: 16, color: '#f4f4f5', width: 30, textAlign: 'right' },
  evoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  evoCell: { alignItems: 'center', flex: 1 },
  evoArrow: { fontFamily: FONTS.pixel, fontSize: 7, color: DEX.cyan, marginBottom: 2 },
  evoImg: { width: 56, height: 56 },
  evoShadow: { opacity: 0.9 },
  evoDim: { opacity: 0.45 },
  evoName: { fontFamily: FONTS.pixel, fontSize: 6, color: '#71717a', marginTop: 2, textAlign: 'center' },
  evoCur: { color: '#31e368' },
});
