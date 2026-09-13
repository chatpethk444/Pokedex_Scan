import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

const BALL = 110;

export function PokeBall({ size = BALL }: { size?: number }): React.JSX.Element {
  const band = Math.max(6, size * 0.11);
  const btn = size * 0.3;
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2, overflow: 'hidden',
        borderWidth: 3, borderColor: '#111', backgroundColor: '#f0f0f0',
      }}
    >
      <View style={{ height: '50%', backgroundColor: '#ee1515' }} />
      <View
        style={{
          position: 'absolute', top: '50%', marginTop: -band / 2,
          left: 0, right: 0, height: band, backgroundColor: '#111',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: btn, height: btn, borderRadius: btn / 2, backgroundColor: '#f8f8f8',
            borderWidth: 3, borderColor: '#111',
          }}
        />
      </View>
    </View>
  );
}

/** Blue-light spirit reveal: the mon gathers as a breathing blue silhouette,
 *  holds, then dissolves (the real image takes over via onDone).
 *  Remount (key) to replay. */
export function Reveal({ imageUri, onDone }: { imageUri: string; onDone?: () => void }): React.JSX.Element {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: true })
      .start(() => onDone?.());
  }, [v, onDone]);

  const silOp = v.interpolate({ inputRange: [0, 0.08, 0.8, 1], outputRange: [0, 1, 1, 0] });
  const silScale = v.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0.94, 1.05, 1, 1.05, 1.02] });

  return (
    <View style={styles.stage}>
      <Animated.View
        style={[styles.mon, { opacity: silOp, transform: [{ scale: silScale }] }]}
        pointerEvents="none"
      >
        <Image source={{ uri: imageUri }} style={[styles.img, styles.silhouette]} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: 190, height: 160, alignItems: 'center', justifyContent: 'center' },
  mon: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  img: { width: 190, height: 160 },
  silhouette: {
    tintColor: '#38e1ff',
    shadowColor: '#00f0ff', shadowOpacity: 0.95, shadowRadius: 18, elevation: 6,
  },
});
