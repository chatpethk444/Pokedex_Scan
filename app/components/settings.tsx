import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DEX, FONTS } from '../lib/theme';
import { checkBackend } from '../lib/api';
import { testStorage } from '../lib/seen';
import type { SoundPrefs } from '../lib/sound';
import { Press3D } from './fx';

function PrefToggle({
  label,
  on,
  onFlip,
}: {
  label: string;
  on: boolean;
  onFlip: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.prefRow}>
      <Text style={styles.prefLabel}>{label}</Text>
      <Press3D
        onPress={onFlip}
        android_ripple={{ color: 'rgba(49,227,104,0.25)' }}
        style={({ pressed }) => [styles.toggle, on && styles.toggleOn, pressed && styles.togglePressed]}
      >
        <Text style={[styles.toggleLabel, on && styles.toggleLabelOn]}>{on ? 'ON' : 'OFF'}</Text>
      </Press3D>
    </View>
  );
}

export function Settings({
  baseUrl,
  seenCount,
  seenList,
  onResetDex,
  onImportSeen,
  prefs,
  onPrefs,
  onBack,
}: {
  baseUrl: string;
  seenCount: number;
  seenList: string[];
  onResetDex: () => void;
  onImportSeen: (keys: string[]) => void;
  prefs: SoundPrefs;
  onPrefs: (patch: Partial<SoundPrefs>) => void;
  onBack: () => void;
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [bkText, setBkText] = useState('');
  const [bkMsg, setBkMsg] = useState<string | null>(null);
  const [storeMsg, setStoreMsg] = useState('CHECKING…');
  const [linkOk, setLinkOk] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    async function ping(): Promise<void> {
      try {
        const r = await checkBackend(baseUrl);
        if (!live) return;
        if (r.ok) {
          setLinkOk(true);
          return;
        }
        throw new Error(r.message);
      } catch {
        if (!live) return;
        attempt += 1;
        if (attempt >= 2) setLinkOk(false);
        else timer = setTimeout(() => void ping(), 2000);
      }
    }
    void ping();
    return () => {
      live = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    void testStorage().then((r) => {
      setStoreMsg(
        r.ok
          ? `${r.message} — SAVED ${r.savedCount} / MEMORY ${seenCount}`
          : `FAIL: ${r.message} — MEMORY ${seenCount}`,
      );
    });
  }, []);

  function onShowCode(): void {
    const code = JSON.stringify([...seenList].sort());
    setBkText(code);
    setBkMsg(`${seenList.length} ENTRIES — COPY ALL BEFORE RELOAD`);
  }

  function onApplyCode(): void {
    try {
      const arr = JSON.parse(bkText) as unknown;
      if (!Array.isArray(arr)) {
        setBkMsg('BAD CODE — NOT A LIST');
        return;
      }
      onImportSeen(arr);
      setBkMsg('RESTORED — REOPEN POKEDEX TO CHECK');
    } catch {
      setBkMsg('BAD CODE — PASTE FAILED');
    }
  }

  function onResetPress(): void {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    setConfirming(false);
    onResetDex();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Press3D
          onPress={onBack}
          android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        >
          <Text style={styles.backLabel}>‹ BACK</Text>
        </Press3D>
        <Text style={styles.title}>SETTINGS</Text>
        <View style={styles.headSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sect}>LINK</Text>
        <View style={styles.linkStatRow}>
          <View style={[
            styles.linkDot,
            linkOk === true && styles.linkDotOk,
            linkOk === false && styles.linkDotBad,
          ]} />
          <Text style={styles.linkStat}>
            {linkOk === null ? 'CHECKING…' : linkOk ? 'CONNECTED' : 'NO LINK'}
          </Text>
        </View>
        <Text style={styles.hint}>AUTO-CHECKED ON OPEN. FIXED BY BUILD.</Text>

        <Text style={styles.sect}>SOUND</Text>
        <PrefToggle label="SOUND" on={!prefs.muted} onFlip={() => onPrefs({ muted: !prefs.muted })} />
        <PrefToggle label="AUTO CRY" on={prefs.autoCry} onFlip={() => onPrefs({ autoCry: !prefs.autoCry })} />
        <PrefToggle
          label="AUTO NARRATE"
          on={prefs.autoNarrate}
          onFlip={() => onPrefs({ autoNarrate: !prefs.autoNarrate })}
        />
        <View style={styles.prefRow}>
          <Text style={styles.prefLabel}>
            VOLUME {prefs.muted ? 'MUTED' : Math.round(prefs.volume * 10)}
          </Text>
          <View style={styles.volRow}>
            <Press3D
              onPress={() => onPrefs({ volume: Math.max(0, Math.round(prefs.volume * 10) - 1) / 10 })}
              android_ripple={{ color: 'rgba(0,240,255,0.25)' }}
              style={({ pressed }) => [styles.volBtn, pressed && styles.volBtnPressed]}
            >
              <Text style={styles.volBtnLabel}>-</Text>
            </Press3D>
            <View style={styles.volBar}>
              {Array.from({ length: 10 }, (_, i) => (
                <View key={i} style={[styles.volSeg, i < Math.round(prefs.volume * 10) && styles.volSegOn]} />
              ))}
            </View>
            <Press3D
              onPress={() => onPrefs({
                volume: Math.min(10, Math.round(prefs.volume * 10) + 1) / 10,
                muted: false,
              })}
              android_ripple={{ color: 'rgba(0,240,255,0.25)' }}
              style={({ pressed }) => [styles.volBtn, pressed && styles.volBtnPressed]}
            >
              <Text style={styles.volBtnLabel}>+</Text>
            </Press3D>
          </View>
        </View>
        <Text style={styles.hint}>AUTO CRY/NARRATE PLAY AFTER EACH SCAN. BUTTONS STILL WORK BY HAND.</Text>

        <Text style={styles.sect}>POKEDEX — {seenCount}/151 SEEN</Text>
        <Press3D
          onPress={onResetPress}
          style={[styles.resetBtn, confirming && styles.resetBtnArmed]}
        >
          <Text style={styles.resetLabel}>
            {confirming ? 'TAP AGAIN TO CONFIRM' : 'RESET POKEDEX'}
          </Text>
        </Press3D>
        <Text style={styles.hint}>
          {confirming
            ? 'ALL 151 GO BACK TO ???. THIS CANNOT BE UNDONE.'
            : 'WIPES SEEN DATA BACK TO 0/151.'}
        </Text>

        <Text style={styles.sect}>BACKUP — SEEN CODE</Text>
        <Text style={styles.hint}>RELOAD WIPED PROGRESS? SHOW CODE, COPY IT, PASTE + APPLY TO RESTORE.</Text>
        <TextInput
          style={styles.urlInput}
          value={bkText}
          onChangeText={setBkText}
          placeholder='["pikachu","eevee",...]'
          placeholderTextColor="#3f6212"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <View style={styles.bkRow}>
          <Press3D
            onPress={onShowCode}
            android_ripple={{ color: 'rgba(0,240,255,0.25)' }}
            style={({ pressed }) => [styles.bkBtn, pressed && styles.testBtnPressed]}
          >
            <Text style={styles.testLabel}>SHOW CODE</Text>
          </Press3D>
          <Press3D
            onPress={onApplyCode}
            android_ripple={{ color: 'rgba(49,227,104,0.25)' }}
            style={({ pressed }) => [styles.bkBtn, styles.bkBtnGo, pressed && styles.testBtnPressed]}
          >
            <Text style={styles.bkGoLabel}>APPLY</Text>
          </Press3D>
        </View>
        {bkMsg !== null && <Text style={styles.testMsg}>{bkMsg}</Text>}

        <Text style={styles.sect}>STORAGE</Text>
        <Text style={styles.testMsg}>{storeMsg}</Text>
        <Text style={styles.hint}>SAVED = IN DEVICE. MEMORY = THIS SESSION. MUST MATCH AFTER SCAN.</Text>

        <Text style={styles.sect}>ABOUT</Text>
        <Text style={styles.hint}>POKT POKEDEX 1.0 — GEN 1 KANTO — 149-CLASS SCANNER</Text>

        <Text style={styles.sect}>HELP — BEST RESULTS</Text>
        <Text style={styles.helpHead}>1. LINK FIRST</Text>
        <Text style={styles.hint}>BACKEND URL IS FIXED. CHECK THE GREEN LCD FOR LIVE HOST, THEN SCAN.</Text>
        <Text style={styles.helpHead}>2. FILL THE FRAME</Text>
        <Text style={styles.hint}>MOVE CLOSE UNTIL THE POKEMON FILLS THE LCD. SMALL/DISTANT SUBJECTS SCORE LOW.</Text>
        <Text style={styles.helpHead}>3. STRAIGHT + STEADY</Text>
        <Text style={styles.hint}>SHOOT STRAIGHT-ON, NOT TILTED. HOLD STILL 1S. BLUR AND ANGLES DROP CONFIDENCE.</Text>
        <Text style={styles.helpHead}>4. KILL THE GLARE</Text>
        <Text style={styles.hint}>NO SCREEN REFLECTION, NO HARSH SHADOW. SOFT EVEN LIGHT WORKS BEST.</Text>
        <Text style={styles.helpHead}>5. READ THE CONF</Text>
        <Text style={styles.hint}>CONF 70%+ = ACCEPTED. BELOW = RETRY CLOSER. ◀ ▶ FLIPS GALLERY ART.</Text>
        <Text style={styles.helpHead}>6. KEEP PROGRESS</Text>
        <Text style={styles.hint}>SEEN SAVES ON DEVICE. BEFORE REINSTALL: BACKUP -{'>'} SHOW CODE, COPY IT.</Text>
        <Text style={styles.helpHead}>7. BROWSE SEEN MONS</Text>
        <Text style={styles.hint}>‹ › ON THE LCD JUMPS TO PREV/NEXT SEEN POKEMON. ◀ ▶ FLIPS GALLERY ART.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#12131a' },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#27272a',
  },
  backBtn: {
    backgroundColor: '#c52028', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#7d0d13', borderBottomWidth: 3,
  },
  backBtnPressed: { opacity: 0.7 },
  backLabel: { fontFamily: FONTS.pixel, fontSize: 9, color: '#fff' },
  title: { fontFamily: FONTS.pixel, fontSize: 12, color: DEX.cyan },
  headSpacer: { width: 72 },
  body: { padding: 14, gap: 6 },
  sect: { fontFamily: FONTS.pixel, fontSize: 8, color: DEX.cyan, marginTop: 12 },
  urlInput: {
    fontFamily: FONTS.tech, fontSize: 18, color: '#4ade80',
    backgroundColor: '#0b0c0e', borderRadius: 6, padding: 10,
    borderWidth: 1, borderColor: '#164e63',
  },
  linkStatRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  linkDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#3f3f46' },
  linkDotOk: { backgroundColor: '#31e368' },
  linkDotBad: { backgroundColor: '#ef4444' },
  linkStat: { fontFamily: FONTS.pixel, fontSize: 10, color: '#f4f4f5' },
  hint: { fontFamily: FONTS.tech, fontSize: 15, color: '#71717a' },
  helpHead: { fontFamily: FONTS.pixel, fontSize: 8, color: '#f1fa8c', marginTop: 8 },
  testBtnPressed: { opacity: 0.7 },
  testLabel: { fontFamily: FONTS.pixel, fontSize: 9, color: DEX.cyan },
  testMsg: { fontFamily: FONTS.tech, fontSize: 16, color: '#f1fa8c', marginTop: 4 },
  prefRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0b0c0e', borderRadius: 6, padding: 10, marginTop: 8,
    borderWidth: 1, borderColor: '#27272a',
  },
  prefLabel: { fontFamily: FONTS.pixel, fontSize: 8, color: '#f4f4f5' },
  toggle: {
    minWidth: 64, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center',
    backgroundColor: '#27272a', borderWidth: 1, borderColor: '#3f3f46', borderBottomWidth: 3,
  },
  toggleOn: { borderColor: '#31e368', backgroundColor: 'rgba(49,227,104,0.12)' },
  togglePressed: { opacity: 0.7 },
  toggleLabel: { fontFamily: FONTS.pixel, fontSize: 9, color: '#71717a' },
  toggleLabelOn: { color: '#31e368' },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginLeft: 12 },
  volBtn: {
    width: 36, borderRadius: 6, paddingVertical: 6, alignItems: 'center',
    backgroundColor: '#164e63', borderWidth: 1, borderColor: DEX.cyan, borderBottomWidth: 3,
  },
  volBtnPressed: { opacity: 0.7 },
  volBtnLabel: { fontFamily: FONTS.pixel, fontSize: 10, color: DEX.cyan },
  volBar: { flex: 1, flexDirection: 'row', gap: 3 },
  volSeg: { flex: 1, height: 10, borderRadius: 2, backgroundColor: '#27272a' },
  volSegOn: { backgroundColor: '#31e368' },
  resetBtn: {
    backgroundColor: '#7d0d13', borderRadius: 6, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#ef4444', borderBottomWidth: 4,
  },
  resetBtnArmed: { backgroundColor: '#dc2626' },
  resetLabel: { fontFamily: FONTS.pixel, fontSize: 10, color: '#fff' },
  bkRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  bkBtn: {
    flex: 1, borderRadius: 6, padding: 10, alignItems: 'center',
    backgroundColor: '#164e63', borderWidth: 1, borderColor: DEX.cyan, borderBottomWidth: 4,
  },
  bkBtnGo: { borderColor: '#31e368', backgroundColor: 'rgba(49,227,104,0.12)' },
  bkGoLabel: { fontFamily: FONTS.pixel, fontSize: 9, color: '#31e368' },
});
