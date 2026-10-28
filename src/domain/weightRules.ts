import { WeightRecord, WeightWithADG } from '../types/mais.ts';

export type ComputedWeightWithADG = WeightWithADG;

/**
 * Calculates chronologically ordered weight measurements and Average Daily Gain (ADG):
 * ADG = (Current Weight - Previous Weight) / Days Between Measurements
 */
export function calculateWeightHistoryWithADG(records: WeightRecord[]): WeightWithADG[] {
  const sorted = [...records].sort(
    (a, b) => new Date(a.measurementDate).getTime() - new Date(b.measurementDate).getTime()
  );

  return sorted.map((record, index) => {
    if (index === 0) {
      return {
        ...record,
        previousWeightKg: null,
        daysBetween: null,
        adgKgPerDay: null,
      };
    }

    const prev = sorted[index - 1];
    const msDiff =
      new Date(record.measurementDate).getTime() - new Date(prev.measurementDate).getTime();
    const daysBetween = Math.round(msDiff / (1000 * 60 * 60 * 24));

    if (daysBetween <= 0) {
      return {
        ...record,
        previousWeightKg: prev.weightKg,
        daysBetween: 0,
        adgKgPerDay: null,
      };
    }

    const adg = (record.weightKg - prev.weightKg) / daysBetween;
    return {
      ...record,
      previousWeightKg: prev.weightKg,
      daysBetween,
      adgKgPerDay: Number(adg.toFixed(3)),
    };
  });
}
