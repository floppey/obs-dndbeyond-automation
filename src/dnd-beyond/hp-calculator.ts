/**
 * HP state calculation logic
 * Maps HP values to visual states (healthy, scratched, bloodied, dying, unconscious)
 */

import { HpState } from "../types.js";

/**
 * Calculate HP state based on current HP and max HP
 *
 * States:
 * - unconscious: 0 HP or death saves in progress or dead
 * - dying: > 0 but <= 25% of max HP
 * - bloodied: > 25% but <= 50% of max HP
 * - scratched: > 50% but <= 75% of max HP
 * - healthy: > 75% of max HP
 */
export function calculateHpState(
  currentHp: number,
  maxHp: number,
  isDead: boolean,
  deathSaves?: { successes: number; failures: number }
): HpState {
  // Check if character is unconscious/dead
  if (currentHp <= 0 || isDead) {
    return HpState.Unconscious;
  }

  // Check if death saves are in progress (either success or failure count > 0)
  if (deathSaves && (deathSaves.successes > 0 || deathSaves.failures > 0)) {
    return HpState.Unconscious;
  }

  // Calculate HP percentage
  const hpPercentage = maxHp > 0 ? (currentHp / maxHp) * 100 : 100;

  // Map to state based on percentage thresholds
  if (hpPercentage > 75) {
    return HpState.Healthy;
  } else if (hpPercentage > 50) {
    return HpState.Scratched;
  } else if (hpPercentage > 25) {
    return HpState.Bloodied;
  } else {
    // hpPercentage > 0 (already checked currentHp > 0 above)
    return HpState.Dying;
  }
}

/**
 * Format HP data for logging
 */
export function formatHpInfo(
  currentHp: number,
  maxHp: number,
  temporaryHp: number,
  state: HpState
): string {
  const hpPercentage = maxHp > 0 ? ((currentHp / maxHp) * 100).toFixed(0) : "0";
  const tempText = temporaryHp > 0 ? ` [+${temporaryHp} temp]` : "";
  return `HP ${currentHp}/${maxHp} (${hpPercentage}%)${tempText} → ${state}`;
}
