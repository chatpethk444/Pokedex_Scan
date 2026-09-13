import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { DEX, FONTS } from '../lib/theme';
import { Led, Lens } from './dex-chrome';
import { TypeText } from './fx';

const STAGES = ['POKT BIOS v1.0', 'OPTICS ...... OK', 'AUDIO ...... OK'];

/** Power-on self test. Remount (key) to replay. Calls onDone when finished. */
export function Boot({ onDone, onStage }: { onDone: () => void; onStage?: (n: number) => void }): React.JSX.Element {
  const [stage, setStage] = useState(0);
  const cb = useRef({ onDone, onStage });
  cb.current = { onDone, onStage };
  // Icon entrance: spring pop on mount (synced with stage0 pika cry).
  const pop = useRef(new Animated.Value(0)).current;
  // Glow breathing behind icon until boot finishes.
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    breathing.start();
    return () => {
      breathing.stop();
    };
  }, [pop, glow]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    cb.current.onStage?.(0);
    timers.push(setTimeout(() => {
      setStage(1);
      cb.current.onStage?.(1);
    }, 650));
    timers.push(setTimeout(() => {
      setStage(2);
      cb.current.onStage?.(2);
    }, 1300));
    timers.push(setTimeout(() => {
      setStage(3);
      cb.current.onStage?.(3);
    }, 1950));
    timers.push(setTimeout(() => cb.current.onDone(), 2600));
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  const popScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const glowOp = glow.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.9] });

  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.iconGlow, { opacity: glowOp, transform: [{ scale: glowScale }] }]} pointerEvents="none" />
        <Animated.View style={{ opacity: pop, transform: [{ scale: popScale }] }}>
          <Image source={require('../assets/icon.png')} style={styles.icon} resizeMode="contain" />
        </Animated.View>
      </View>
      <View style={styles.row}>
        <Lens active={stage >= 1} />
        <View style={styles.leds}>
          <Led color="#dc2626" glow="#ef4444" />
          <Led color={DEX.amber} glow="#f59e0b" pulse={stage < 2} />
          <Led color={DEX.emerald} glow="#10b981" pulse={stage < 3} />
        </View>
      </View>
      <View style={styles.log}>
        {STAGES.slice(0, Math.min(stage + 1, 3)).map((s) => (
          <Text key={s} style={styles.line}>{s}</Text>
        ))}
        {stage >= 3 && (
          <TypeText key="ok" text="SYSTEM OK ▶" speed={30} style={styles.ok} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#12131a', alignItems: 'center', justifyContent: 'center', gap: 22 },
  iconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  iconGlow: {
    position: 'absolute', width: 200, height: 200, borderRadius: 28,
    backgroundColor: 'rgba(0,240,255,0.25)',
    shadowColor: '#00f0ff', shadowOpacity: 0.9, shadowRadius: 18, elevation: 6,
  },
  icon: { width: 180, height: 180, borderRadius: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  leds: { flexDirection: 'row', gap: 8 },
  log: { alignItems: 'center', gap: 4, minHeight: 90 },
  line: { fontFamily: FONTS.pixel, fontSize: 9, color: '#a1a1aa' },
  ok: { fontFamily: FONTS.pixel, fontSize: 11, color: '#31e368' },
});
