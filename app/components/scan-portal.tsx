import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

/** Anime-style scan portal: counter-rotating cyan energy arcs over a
 *  breathing white-blue core. Shown while the backend identifies. */
export function ScanPortal(): React.JSX.Element {
  const spinA = useRef(new Animated.Value(0)).current;
  const spinB = useRef(new Animated.Value(0)).current;
  const core = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(spinA, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }),
    );
    const b = Animated.loop(
      Animated.timing(spinB, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true }),
    );
    const c = Animated.loop(
      Animated.sequence([
        Animated.timing(core, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(core, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    a.start();
    b.start();
    c.start();
    return () => {
      a.stop();
      b.stop();
      c.stop();
    };
  }, [spinA, spinB, core]);

  const rotA = spinA.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotB = spinB.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const coreOp = core.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const coreScale = core.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });

  return (
    <View style={styles.stage}>
      <View style={styles.haze} pointerEvents="none" />
      <Animated.View style={[styles.arcA, { transform: [{ rotate: rotA }] }]} pointerEvents="none" />
      <Animated.View style={[styles.arcB, { transform: [{ rotate: rotB }] }]} pointerEvents="none" />
      <Animated.View
        style={[styles.core, { opacity: coreOp, transform: [{ scale: coreScale }] }]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: 190, height: 170, alignItems: 'center', justifyContent: 'center' },
  haze: {
    position: 'absolute', width: 190, height: 170, borderRadius: 85,
    backgroundColor: 'rgba(224,254,255,0.22)',
  },
  arcA: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 11,
    borderTopColor: '#e0feff', borderRightColor: 'rgba(0,240,255,0.75)',
    borderBottomColor: 'transparent', borderLeftColor: 'transparent',
    shadowColor: '#00f0ff', shadowOpacity: 0.9, shadowRadius: 12,
  },
  arcB: {
    position: 'absolute', width: 108, height: 108, borderRadius: 54, borderWidth: 8,
    borderBottomColor: '#ffffff', borderLeftColor: 'rgba(125,244,255,0.8)',
    borderTopColor: 'transparent', borderRightColor: 'transparent',
    shadowColor: '#ffffff', shadowOpacity: 0.8, shadowRadius: 10,
  },
  core: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#eafcff' },
});
