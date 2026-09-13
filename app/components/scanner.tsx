import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { DEX, FONTS } from '../lib/theme';
import { Press3D } from './fx';

const SCAN_H = 210;

/** Web only: expo-camera doesn't set focusMode, so drive the video track directly. */
function webFocus(mode: 'continuous' | 'single-shot'): void {
  if (Platform.OS !== 'web') return;
  try {
    const g = globalThis as unknown as Record<string, any>;
    const vids: any[] = g.document ? Array.from(g.document.querySelectorAll('video')) : [];
    for (const v of vids) {
      const tracks: any[] = v.srcObject?.getVideoTracks?.() ?? [];
      for (const t of tracks) {
        const supported: string[] = t.getCapabilities?.()?.focusMode ?? [];
        if (supported.includes(mode)) {
          void t.applyConstraints({ advanced: [{ focusMode: mode }] })?.catch?.(() => {});
        }
      }
    }
  } catch {
    /* browser without track support */
  }
}

export interface ScannerHandle {
  snap: () => void;
}

export const Scanner = forwardRef<ScannerHandle, {
  onCapture: (uri: string) => void;
  onCancel: () => void;
  onShutter?: () => void;
}>(function Scanner({ onCapture, onCancel, onShutter }, ref): React.JSX.Element {
  const [perm, requestPerm] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState(false);
  const scan = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;
  const flashV = useRef(new Animated.Value(0)).current;
  const irisV = useRef(new Animated.Value(1)).current;
  const [irisOn, setIrisOn] = useState(false);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; k: number } | null>(null);

  useEffect(() => {
    const sweep = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 0.25, duration: 700, useNativeDriver: true }),
      ]),
    );
    sweep.start();
    pulse.start();
    return () => {
      sweep.stop();
      pulse.stop();
    };
  }, [scan, blink]);

  function irisClose(): Promise<void> {
    setIrisOn(true);
    irisV.setValue(1);
    return new Promise((resolve) => {
      Animated.timing(irisV, { toValue: 0, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }).start(() => resolve());
    });
  }

  async function capture(): Promise<void> {
    if (!ready || shot) return;
    onShutter?.();
    await irisClose();
    flashV.setValue(1);
    Animated.timing(flashV, { toValue: 0, duration: 280, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    setIrisOn(false);
    setShot(true);
    try {
      const pic = await camRef.current?.takePictureAsync({ quality: 0.9 });
      if (pic?.uri) {
        onCapture(pic.uri);
      } else {
        setShot(false);
      }
    } catch {
      setShot(false);
    }
  }

  useImperativeHandle(ref, () => ({ snap: () => void capture() }), [ready, shot]);

  if (!perm) return <View style={styles.box} />;
  if (!perm.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>CAMERA LOCKED</Text>
        <Press3D onPress={requestPerm} style={styles.allow}>
          <Text style={styles.allowText}>ALLOW ACCESS</Text>
        </Press3D>
        <Press3D onPress={onCancel}>
          <Text style={styles.cancel}>CANCEL</Text>
        </Press3D>
      </View>
    );
  }

  const lineY = scan.interpolate({ inputRange: [0, 1], outputRange: [0, SCAN_H] });

  return (
    <View style={styles.box}>
      <CameraView ref={camRef} style={styles.cam} facing="back" autofocus="on" animateShutter={false} onCameraReady={() => { setReady(true); webFocus('continuous'); }} />
      {Platform.OS === 'web' && (
        <Pressable
          style={styles.tapZone}
          onPress={(e) => {
            const n = e.nativeEvent as unknown as Record<string, number | undefined>;
            const x = n.locationX ?? n.offsetX ?? 105;
            const y = n.locationY ?? n.offsetY ?? 105;
            webFocus('single-shot');
            setFocusRing({ x, y, k: Date.now() });
            setTimeout(() => setFocusRing(null), 900);
            // back to tracking so the next subject stays sharp
            setTimeout(() => webFocus('continuous'), 1500);
          }}
        />
      )}
      {focusRing !== null && (
        <View key={focusRing.k} pointerEvents="none" style={[styles.ring, { left: focusRing.x - 35, top: focusRing.y - 35 }]} />
      )}
      {/* grid */}
      <View style={styles.grid} pointerEvents="none">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.gridLine} />
        ))}
      </View>
      {/* corner brackets */}
      <View style={[styles.corner, styles.tl]} pointerEvents="none" />
      <View style={[styles.corner, styles.tr]} pointerEvents="none" />
      <View style={[styles.corner, styles.bl]} pointerEvents="none" />
      <View style={[styles.corner, styles.br]} pointerEvents="none" />
      {/* sweeping scanline */}
      <Animated.View style={[styles.scanline, { transform: [{ translateY: lineY }] }]} pointerEvents="none" />
      <Animated.Text style={[styles.tag, { opacity: blink }]}>◉ SCANNING</Animated.Text>
      {irisOn && (
        <View style={styles.irisWrap} pointerEvents="none">
          <Animated.View style={[styles.irisDark, { opacity: irisV }]} />
          <Animated.View style={[styles.irisRing, { transform: [{ scale: irisV }] }]} />
        </View>
      )}
      <Animated.View style={[styles.flash, { opacity: flashV }]} pointerEvents="none" />
      <Press3D onPress={onCancel} style={styles.closeBtn}>
        <Text style={styles.cancel}>✕</Text>
      </Press3D>
    </View>
  );
});

const styles = StyleSheet.create({
  box: { width: '100%', height: SCAN_H, borderRadius: 4, overflow: 'hidden', backgroundColor: '#000' },
  cam: { ...StyleSheet.absoluteFill },
  tapZone: { ...StyleSheet.absoluteFill, zIndex: 1 },
  ring: {
    position: 'absolute', width: 70, height: 70, borderRadius: 4,
    borderWidth: 2, borderColor: DEX.cyan,
    shadowColor: DEX.cyan, shadowOpacity: 0.9, shadowRadius: 6,
  },
  center: { width: '100%', height: SCAN_H, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#0b0c0e' },
  msg: { fontFamily: FONTS.pixel, fontSize: 10, color: DEX.crimson },
  allow: { backgroundColor: DEX.cyan, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 8 },
  allowText: { fontFamily: FONTS.pixel, fontSize: 9, color: '#06283d' },
  cancel: { fontFamily: FONTS.pixel, fontSize: 12, color: '#f4f4f5', padding: 8 },
  grid: { ...StyleSheet.absoluteFill, justifyContent: 'space-evenly', opacity: 0.25 },
  gridLine: { height: 1, backgroundColor: DEX.cyan },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: DEX.cyan, zIndex: 2 },
  tl: { top: 8, left: 8, borderTopWidth: 3, borderLeftWidth: 3 },
  tr: { top: 8, right: 8, borderTopWidth: 3, borderRightWidth: 3 },
  bl: { bottom: 8, left: 8, borderBottomWidth: 3, borderLeftWidth: 3 },
  br: { bottom: 8, right: 8, borderBottomWidth: 3, borderRightWidth: 3 },
  scanline: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
    backgroundColor: DEX.cyan, shadowColor: DEX.cyan, shadowOpacity: 0.9, shadowRadius: 8,
  },
  tag: {
    position: 'absolute', top: 10, alignSelf: 'center',
    fontFamily: FONTS.pixel, fontSize: 8, color: DEX.cyan,
  },
  flash: { ...StyleSheet.absoluteFill, backgroundColor: '#fff', zIndex: 3 },
  irisWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  irisDark: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  irisRing: {
    width: 130, height: 130, borderRadius: 65, borderWidth: 9,
    borderColor: 'rgba(224,254,255,0.9)',
    shadowColor: '#00f0ff', shadowOpacity: 0.8, shadowRadius: 10,
  },
  closeBtn: {
    position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
  },
});
