import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { artUrl } from './dex-chrome';
import { DEX151, dexRank, normDexKey, type DexEntry } from '../lib/dex151';
import { DEX, FONTS } from '../lib/theme';
import { CellPop, Press3D } from './fx';

type Filter = 'all' | 'seen' | 'missing';

function DexCellInner({
  entry,
  seen,
  index,
  onOpen,
  onLocked,
}: {
  entry: DexEntry;
  seen: boolean;
  index: number;
  onOpen: (e: DexEntry) => void;
  onLocked: () => void;
}): React.JSX.Element {
  const shake = useRef(new Animated.Value(0)).current;

  function doLockedShake(): void {
    Animated.sequence([
      Animated.timing(shake, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -4, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 4, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }

  return (
    <CellPop index={index}>
      <Animated.View style={{ transform: [{ translateX: shake }], flex: 1 }}>
        <Press3D
          onPress={() => {
            if (seen) onOpen(entry);
            else {
              doLockedShake();
              onLocked();
            }
          }}
          style={({ pressed }) => [
            styles.cell,
            seen ? styles.cellSeen : styles.cellHidden,
            pressed && styles.cellPressed,
          ]}
        >
          <Text style={styles.cellNo}>No. {entry.id}</Text>
          <Image
            source={{ uri: artUrl(entry.id) }}
            style={styles.cellImg}
            resizeMode="contain"
            {...(seen ? {} : { tintColor: '#05070c' })}
          />
          <Text style={[styles.cellName, seen && styles.cellNameSeen]} numberOfLines={1}>
            {seen ? entry.display : '???'}
          </Text>
        </Press3D>
      </Animated.View>
    </CellPop>
  );
}

const DexCell = memo(DexCellInner);

export function DexGrid({
  seen,
  onBack,
  onOpen,
  onLocked,
  onTap,
}: {
  seen: Set<string>;
  onBack: () => void;
  onOpen: (e: DexEntry) => void;
  onLocked: () => void;
  onTap: () => void;
}): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all');
  const { width: winW } = useWindowDimensions();
  // Columns grow with screen: phones 3, large phones 4, tablets 5.
  const numCols = winW >= 700 ? 5 : winW >= 500 ? 4 : 3;
  const isSeen = useCallback(
    (e: DexEntry): boolean =>
      e.cls !== null ? seen.has(normDexKey(e.cls)) : seen.has(normDexKey(e.api)),
    [seen],
  );
  const data = useMemo(
    () => DEX151.filter((e) => (filter === 'all' ? true : filter === 'seen' ? isSeen(e) : !isSeen(e))),
    [filter, isSeen],
  );
  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: 'ALL' },
    { key: 'seen', label: 'SEEN' },
    { key: 'missing', label: '???' },
  ];
  const renderItem = useCallback(
    ({ item, index }: { item: DexEntry; index: number }) => (
      <DexCell
        entry={item}
        seen={isSeen(item)}
        // Animate only first screen; rest appear instantly (was 800ms stagger jank)
        index={index < 12 ? index : 0}
        onOpen={onOpen}
        onLocked={onLocked}
      />
    ),
    [isSeen, onOpen, onLocked],
  );
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
        <View style={styles.headMid}>
          <Text style={styles.title}>POKEDEX</Text>
          <Text style={styles.rank}>{dexRank(seen.size)}</Text>
        </View>
        <Text style={styles.count}>
          {seen.size}/151
        </Text>
      </View>
      <View style={styles.tabs}>
        {tabs.map((t) => (
          <Press3D
            key={t.key}
            pressScale={0.97}
            onPress={() => {
              onTap();
              setFilter(t.key);
            }}
            style={[styles.tab, filter === t.key && styles.tabLive]}
          >
            <Text style={[styles.tabLabel, filter === t.key && styles.tabLabelLive]}>
              {t.label}
            </Text>
          </Press3D>
        ))}
      </View>
      <FlatList
        key={`cols-${numCols}`}
        data={data}
        keyExtractor={(e) => String(e.id)}
        numColumns={numCols}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        renderItem={renderItem}
        initialNumToRender={21}
        maxToRenderPerBatch={21}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
      />
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
  rank: { fontFamily: FONTS.pixel, fontSize: 7, color: '#f1fa8c', marginTop: 2 },
  headMid: { alignItems: 'center' },
  count: { fontFamily: FONTS.pixel, fontSize: 10, color: '#31e368' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 8, paddingTop: 8 },
  tab: {
    flex: 1, borderRadius: 6, paddingVertical: 7, alignItems: 'center',
    borderWidth: 1, borderColor: '#3f3f46', backgroundColor: 'rgba(255,255,255,0.03)',
  },
  tabLive: { borderColor: DEX.cyan, backgroundColor: 'rgba(0,240,255,0.08)' },
  tabLabel: { fontFamily: FONTS.pixel, fontSize: 8, color: '#71717a' },
  tabLabelLive: { color: DEX.cyan },
  list: { padding: 8, gap: 8 },
  row: { gap: 8 },
  cell: {
    flex: 1, borderRadius: 8, padding: 6, alignItems: 'center',
    borderWidth: 1, marginBottom: 8,
  },
  cellSeen: { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: '#31e368' },
  cellHidden: { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: '#3f3f46' },
  cellPressed: { opacity: 0.6 },
  cellNo: { fontFamily: FONTS.pixel, fontSize: 6, color: '#71717a' },
  cellImg: { width: '100%', aspectRatio: 1, marginVertical: 2 },
  cellName: { fontFamily: FONTS.pixel, fontSize: 6, color: '#52525b', textAlign: 'center' },
  cellNameSeen: { color: '#f4f4f5' },
});
