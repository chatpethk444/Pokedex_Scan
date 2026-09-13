import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const SIZE = 200;

/** Energy-portal backdrop (anime scan style): counter-rotating cyan/white
 *  arcs over a breathing core, pokemon image floating in front.
 *  color = type aura: tints arcs, core glow, haze + rising particles. */
export function MonBackdrop({ children, color }: { color?: string; children: ReactNode }): React.JSX.Element {
  const aura = color ?? '#00f0ff';
  const spinA = useRef(new Animated.Value(0)).current;
  const spinB = useRef(new Animated.Value(0)).current;
  const core = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(spinA, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }),
    );
    const b = Animated.loop(
      Animated.timing(spinB, { toValue: 1, duration: 6500, easing: Easing.linear, useNativeDriver: true }),
    );
    const c = Animated.loop(
      Animated.sequence([
        Animated.timing(core, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(core, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const d = Animated.loop(
      Animated.timing(drift, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true }),
    );
    a.start();
    b.start();
    c.start();
    d.start();
    return () => {
      a.stop();
      b.stop();
      c.stop();
      d.stop();
    };
  }, [spinA, spinB, core, drift]);

  const rotA = spinA.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotB = spinB.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const coreOp = core.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.85] });
  const coreScale = core.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.05] });
  const auraOp = core.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.4] });
  const rise = drift.interpolate({ inputRange: [0, 1], outputRange: [8, -8] });
  const twinkle = drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.25, 0.9, 0.25] });

  return (
    <View style={styles.stage}>
      <View style={styles.haze} pointerEvents="none" />
      <Animated.View
        style={[styles.aura, { backgroundColor: aura, opacity: auraOp }]}
        pointerEvents="none"
      />
      <Animated.View
        style={[styles.arcA, { borderRightColor: aura, shadowColor: aura, transform: [{ rotate: rotA }] }]}
        pointerEvents="none"
      />
      <Animated.View style={[styles.arcB, { transform: [{ rotate: rotB }] }]} pointerEvents="none" />
      <Animated.View
        style={[styles.core, { opacity: coreOp, transform: [{ scale: coreScale }], shadowColor: aura }]}
        pointerEvents="none"
      />
      {DOTS.map((p, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.dot,
            {
              left: p.left, top: p.top,
              width: p.size, height: p.size, borderRadius: p.size / 2,
              shadowColor: aura, opacity: twinkle, transform: [{ translateY: rise }],
            },
          ]}
        />
      ))}
      <View style={styles.front}>{children}</View>
    </View>
  );
}

const DOTS: { left: `${number}%`; top: `${number}%`; size: number }[] = [
  { left: '18%', top: '20%', size: 5 },
  { left: '76%', top: '16%', size: 4 },
  { left: '66%', top: '70%', size: 5 },
  { left: '26%', top: '74%', size: 3 },
  { left: '46%', top: '10%', size: 4 },
  { left: '84%', top: '48%', size: 3 },
];

const styles = StyleSheet.create({
  stage: { width: SIZE, height: 170, alignItems: 'center', justifyContent: 'center' },
  haze: {
    position: 'absolute', width: 190, height: 170, borderRadius: 85,
    backgroundColor: 'rgba(224,254,255,0.20)',
  },
  arcA: {
    position: 'absolute', width: 168, height: 168, borderRadius: 84, borderWidth: 12,
    borderTopColor: '#e0feff', borderRightColor: 'rgba(0,240,255,0.7)',
    borderBottomColor: 'transparent', borderLeftColor: 'transparent',
    shadowColor: '#00f0ff', shadowOpacity: 0.9, shadowRadius: 12,
  },
  arcB: {
    position: 'absolute', width: 122, height: 122, borderRadius: 61, borderWidth: 9,
    borderBottomColor: '#ffffff', borderLeftColor: 'rgba(125,244,255,0.75)',
    borderTopColor: 'transparent', borderRightColor: 'transparent',
    shadowColor: '#ffffff', shadowOpacity: 0.8, shadowRadius: 10,
  },
  core: {
    position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: '#eafcff',
    shadowOpacity: 0.9, shadowRadius: 14, elevation: 4,
  },
  aura: { position: 'absolute', width: 190, height: 170, borderRadius: 85 },
  dot: {
    position: 'absolute', backgroundColor: '#ffffff',
    shadowOpacity: 0.9, shadowRadius: 6, elevation: 2,
  },
  front: { zIndex: 2 },
});
