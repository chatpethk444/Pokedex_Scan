/** Full Gen 1 (RBY) chart, attacking -> defending -> multiplier (only non-1x listed).
 *  Cartridge quirks baked in: bug<>poison both ways, psychic IMMUNE to ghost
 *  (intended 2x but a game bug zeroes it), no dark/steel/fairy yet. */
const CHART: Record<string, Record<string, number>> = {
  normal: { rock: 0.5, ghost: 0 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5 },
  ice: { water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, bug: 2, rock: 0.5, ghost: 0.5 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 2, flying: 0.5, psychic: 2, ghost: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2 },
  ghost: { normal: 0, psychic: 0, ghost: 2 },
  dragon: { dragon: 2 },
};

export interface Matchup {
  type: string;
  mult: number;
}

/** True damage multipliers vs a defender (1-2 types). Only mult > 1, x4 first. */
export function gen1Matchups(defenderTypes: string[]): Matchup[] {
  const defs = defenderTypes.map((t) => t.toLowerCase());
  const out: Matchup[] = [];
  for (const atk of Object.keys(CHART)) {
    let mult = 1;
    for (const d of defs) mult *= CHART[atk][d] ?? 1;
    if (mult > 1) out.push({ type: atk, mult });
  }
  out.sort((a, b) => b.mult - a.mult || (a.type < b.type ? -1 : 1));
  return out;
}

/** Weakness names only (mult > 1). */
export function gen1Weakness(defenderTypes: string[]): string[] {
  return gen1Matchups(defenderTypes).map((m) => m.type);
}
