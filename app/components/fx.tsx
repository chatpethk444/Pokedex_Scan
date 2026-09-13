import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FONTS } from '../lib/theme';

/** 3D press: sinks + springs back like a real key.
 *  Accepts Pressable-style render props so existing pressed visuals keep working.
 *  pressScale: sink depth (0.9 chunky keys, ~0.97 full-width bars).
 *  NOTE: the animated scale MUST stay on the inner Animated.View — putting an
 *  Animated.Value transform on the plain Pressable crashes native
 *  (Invariant Violation: Transform ... must be a number). Buttons whose whole
 *  visual lives in `style` must pass it as children instead (see crimsonDot). */
export function Press3D({
  children,
  onPress,
  style,
  hitSlop,
  android_ripple,
  pressScale = 0.9,
  disabled,
}: {
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  onPress?: () => void;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  hitSlop?: number;
  android_ripple?: { color: string };
  pressScale?: number;
  disabled?: boolean;
}): React.JSX.Element {
  const s = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      android_ripple={android_ripple}
      disabled={disabled}
      onPressIn={() => Animated.timing(s, { toValue: pressScale, duration: 70, useNativeDriver: true }).start()}
      onPressOut={() =>
        Animated.spring(s, { toValue: 1, friction: 5, tension: 320, useNativeDriver: true }).start()
      }
      style={style}
    >
      {({ pressed }: { pressed: boolean }) => (
        <Animated.View style={{ transform: [{ scale: s }] }}>
          {typeof children === 'function' ? children({ pressed }) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}

/** Diagonal light sweep looping across its parent (parent needs overflow hidden). */

/** Diagonal light sweep looping across its parent (parent needs overflow hidden). */
export function ScanSweep({ height = 220 }: { height?: number }): React.JSX.Element {
  const x = useRef(new Animated.Value(-120)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 420, duration: 1800, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  return (
    <Animated.View
      style={[styles.sweep, { height: height * 1.6, transform: [{ translateX: x }, { rotate: '18deg' }] }]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** Staged analyzer readout: FOCUS -> CAPTURE -> MATCH -> REGISTER. */
export function AnalyzeSteps(): React.JSX.Element {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setStep((s) => (s < 3 ? s + 1 : s));
    }, 650);
    return () => clearInterval(t);
  }, []);
  const steps = ['FOCUS', 'CAPTURE', 'MATCH', 'REGISTER'];
  return (
    <View style={styles.analyze}>
      {steps.map((s, i) => (
        <Text
          key={s}
          style={[styles.analyzeRow, i < step && styles.analyzeDone, i === step && styles.analyzeLive]}
        >
          {i < step ? `✓ ${s}` : i === step ? `▶ ${s}…` : `· ${s}`}
        </Text>
      ))}
    </View>
  );
}
/** CRT power-off: picture squeezes to a bright line, then dark. One-shot. */
export function PowerOff(): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.in(Easing.ease), useNativeDriver: false }).start();
  }, [v]);
  const dark = v.interpolate({ inputRange: [0.45, 1], outputRange: [0, 1] });
  const lineH = v.interpolate({ inputRange: [0, 0.72], outputRange: ['100%', '0.8%'] });
  const lineOp = v.interpolate({ inputRange: [0.72, 1], outputRange: [1, 0] });
  return (
    <Animated.View style={[styles.offDark, { opacity: dark }]} pointerEvents="none">
      <Animated.View style={[styles.offLine, { height: lineH, opacity: lineOp }]} />
    </Animated.View>
  );
}

/** Slide-in wrapper: content glides in from dir ONLY when playKey changes.
 *  Mount and unrelated re-renders stay perfectly static. */
export function SlideIn({
  dir = 1, dist = 70, dur = 220, playKey = 0, children,
}: {
  dir?: 1 | -1; dist?: number; dur?: number; playKey?: number; children: ReactNode;
}): React.JSX.Element {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  const last = useRef(playKey);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      last.current = playKey;
      return;
    }
    if (playKey === last.current) return;
    last.current = playKey;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [playKey, dur, v]);
  const x = v.interpolate({ inputRange: [0, 1], outputRange: [dir * dist, 0] });
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateX: x }], alignItems: 'center' }}>
      {children}
    </Animated.View>
  );
}

/** One-shot gloss sweep. Remount (key) to replay. */
export function Sheen(): React.JSX.Element {
  const x = useRef(new Animated.Value(-120)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: 420, duration: 380, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [x]);
  return (
    <Animated.View
      style={[styles.sweep, { height: 352, transform: [{ translateX: x }, { rotate: '18deg' }] }]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}
/** Rubber-stamp slam: drops in big, tilted, then settles. Remount (key) to replay. */
export function StampSlam({ label = 'NEW!' }: { label?: string }): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, friction: 6, tension: 160, useNativeDriver: true }).start();
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [3, 1] });
  return (
    <Animated.View
      style={[styles.stamp, { opacity: v, transform: [{ scale }, { rotate: '-12deg' }] }]}
      pointerEvents="none"
    >
      <Text style={styles.stampLabel}>{label}</Text>
    </Animated.View>
  );
}

const SPARKS: { left: `${number}%`; top: `${number}%` }[] = [
  { left: '12%', top: '18%' }, { left: '78%', top: '12%' }, { left: '64%', top: '66%' },
  { left: '22%', top: '72%' }, { left: '46%', top: '8%' }, { left: '86%', top: '46%' },
];

/** Floating shiny sparkles. Pointer-transparent overlay for gallery art. */
export function Sparkles(): React.JSX.Element {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {SPARKS.map((p, i) => {
        const off = i / SPARKS.length;
        const op = t.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [off < 0.5 ? 0 : 1, 1, off < 0.5 ? 1 : 0],
        });
        const sc = t.interpolate({ inputRange: [0, 1], outputRange: [0.5 + off * 0.5, 1.2 - off * 0.4] });
        return (
          <Animated.View
            key={i}
            style={[styles.spark, { left: p.left, top: p.top, opacity: op, transform: [{ scale: sc }] }]}
          >
            <Text style={styles.sparkGlyph}>✦</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sweep: { position: 'absolute', top: -80, left: 0, width: 70 },
  wailWrap: { alignItems: 'center', justifyContent: 'center' },
  wailRings: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  wailRingOff: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  offDark: { ...StyleSheet.absoluteFill, backgroundColor: '#000', zIndex: 6, alignItems: 'center', justifyContent: 'center' },
  offLine: {
    width: '100%', backgroundColor: '#f4fdff',
    shadowColor: '#00f0ff', shadowOpacity: 0.9, shadowRadius: 12, elevation: 4,
  },
  stamp: {
    position: 'absolute', top: 8, right: 8, zIndex: 5,
    borderWidth: 3, borderColor: '#ef4444', borderRadius: 6,
    backgroundColor: 'rgba(127,29,29,0.85)', paddingHorizontal: 10, paddingVertical: 4,
  },
  stampLabel: { fontFamily: FONTS.pixel, fontSize: 14, color: '#fecaca' },
  spark: { position: 'absolute' },
  sparkGlyph: { color: '#fef9c3', fontSize: 16, textShadowColor: '#facc15', textShadowRadius: 6 },
  analyze: { alignItems: 'center', gap: 2, marginTop: 8 },
  analyzeRow: { fontFamily: FONTS.pixel, fontSize: 8, color: '#475569' },
  analyzeDone: { color: '#31e368' },
  analyzeLive: { color: '#e0feff' },
  lcdFlash: {
    ...StyleSheet.absoluteFill, zIndex: 4,
    borderWidth: 2, borderColor: '#00f0ff', borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  lcdFlashWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,240,255,0.15)', borderRadius: 4,
  },
  crtFlash: { ...StyleSheet.absoluteFill, backgroundColor: '#eafcff', zIndex: 3 },
});

/** CRT power-on pop when its key changes (remount to replay). */
export function MountPop({ children }: { children: ReactNode }): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(v, { toValue: 1, duration: 280, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, [v]);
  const scaleY = v.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] });
  return (
    <Animated.View
      style={{ opacity: v, transform: [{ scaleY }], width: '100%', flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </Animated.View>
  );
}

/** Game-style typewriter text. Remount (key) to replay. */
export function TypeText({
  text,
  speed = 16,
  style,
}: {
  text: string;
  speed?: number;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (text.length === 0) return;
    const t = setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          clearInterval(t);
          return v;
        }
        return v + 1;
      });
    }, speed);
    return () => clearInterval(t);
  }, [text, speed]);
  return (
    <Text style={style}>
      {text.slice(0, n)}
      {n < text.length ? '▌' : ''}
    </Text>
  );
}

/** Gentle attention pulse for idle CTAs. */
export function IdlePulse({ active, children }: { active: boolean; children: ReactNode }): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });
  return <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>{children}</Animated.View>;
}

/** Staggered grid-cell entrance: pop scale + fade. Pass index for delay. Remount (key) to replay. */
export function CellPop({ index = 0, children }: { index?: number; children: ReactNode }): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    // Cap stagger: was 20*40=800ms (151 springs = jank). Now 9*30=270ms max.
    Animated.spring(v, {
      toValue: 1, friction: 7, tension: 140,
      delay: Math.min(Math.max(0, index), 9) * 30, useNativeDriver: true,
    }).start();
  }, [index, v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <Animated.View style={{ opacity: v, transform: [{ scale }], flex: 1 }}>
      {children}
    </Animated.View>
  );
}

/** Cascade chip entrance: fade + rise. pulse=true loops scale (x4 weakness). Remount (key) to replay. */
export function ChipPop({
  index = 0, pulse = false, children,
}: {
  index?: number; pulse?: boolean; children: ReactNode;
}): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, {
      toValue: 1, duration: 250, delay: Math.min(Math.max(0, index), 20) * 50,
      easing: Easing.out(Easing.ease), useNativeDriver: true,
    }).start();
  }, [index, v]);
  useEffect(() => {
    if (!pulse) {
      p.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(p, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, p]);
  const y = v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const pulseScale = p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateY: y }, { scale: pulseScale }] }}>
      {children}
    </Animated.View>
  );
}

/** One-shot expanding ring ping (CRY waves, lens flash). Remount (key) to replay. */
export function Ping({
  size = 40, color = '#00f0ff', duration = 400, delay = 0,
}: {
  size?: number; color?: string; duration?: number; delay?: number;
}): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [v, duration, delay]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] });
  const op = v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 2, borderColor: color, opacity: op, transform: [{ scale }],
      }}
    />
  );
}

/** One-shot fade-in on mount. Remount (key) to replay. */
export function FadeIn({ dur = 300, children }: { dur?: number; children: ReactNode }): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [v, dur]);
  return <Animated.View style={{ opacity: v, alignItems: 'center' }}>{children}</Animated.View>;
}

/** CRY wail: the mon itself belts out the cry — crouch, stretch-shout with
 *  tremble, then settle, plus staggered voice rings. Replays when tick
 *  changes (tick 0 = idle, children render static). */
export function CryWail({ tick, children }: { tick: number; children: ReactNode }): React.JSX.Element {
  const s = useRef(new Animated.Value(0)).current;
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (tick <= 0) return;
    s.setValue(0);
    x.setValue(0);
    const a = Animated.parallel([
      Animated.sequence([
        Animated.timing(s, { toValue: 0.25, duration: 110, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(s, { toValue: 0.6, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(s, { toValue: 1, duration: 320, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
      ]),
      Animated.timing(x, { toValue: 1, duration: 630, easing: Easing.linear, useNativeDriver: true }),
    ]);
    a.start();
    return () => {
      a.stop();
    };
  }, [tick, s, x]);
  const scaleY = s.interpolate({ inputRange: [0, 0.25, 0.6, 1], outputRange: [1, 0.88, 1.14, 1] });
  const scaleX = s.interpolate({ inputRange: [0, 0.25, 0.6, 1], outputRange: [1, 1.06, 0.96, 1] });
  const hop = s.interpolate({ inputRange: [0, 0.25, 0.6, 1], outputRange: [0, 4, -6, 0] });
  const tremble = x.interpolate({
    inputRange: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 1],
    outputRange: [0, -5, 5, -3, 3, -1, 0],
  });
  return (
    <View style={styles.wailWrap}>
      {tick > 0 && (
        <View key={`wail-${tick}`} style={styles.wailRings} pointerEvents="none">
          <Ping size={170} color="#e0feff" duration={500} delay={60} />
          <View style={styles.wailRingOff} pointerEvents="none">
            <Ping size={210} color="#e0feff" duration={650} delay={180} />
          </View>
          <View style={styles.wailRingOff} pointerEvents="none">
            <Ping size={250} color="#7df4ff" duration={800} delay={300} />
          </View>
        </View>
      )}
      <Animated.View style={{ transform: [{ translateX: tremble }, { translateY: hop }, { scaleX }, { scaleY }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

/** One-shot LCD edge flash (CRY feedback). Mount inside lcdBody. Remount (key) to replay. */
export function LcdFlash({ duration = 400 }: { duration?: number }): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [v, duration]);
  const op = v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] });
  return (
    <Animated.View pointerEvents="none" style={[styles.lcdFlash, { opacity: op }]}>
      <View style={styles.lcdFlashWash} pointerEvents="none" />
    </Animated.View>
  );
}

/** CRT flicker overlay on phase change: 3 quick frames ~360ms. Remount (key) to replay. */
export function CrtFlicker(): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 0.4, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.6, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 180, easing: Easing.linear, useNativeDriver: true }),
    ]).start();
  }, [v]);
  const op = v.interpolate({
    inputRange: [0, 0.4, 0.6, 1],
    outputRange: [0.28, 0, 0.16, 0],
  });
  return <Animated.View pointerEvents="none" style={[styles.crtFlash, { opacity: op }]} />;
}
