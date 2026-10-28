import { Animal, HealthEpisode, Treatment } from '../types/mais.ts';

export interface HealthRankingItem {
  animalId: string;
  currentTag: string;
  animalName: string;
  animalType: string;
  breed: string;
  status: string;
  metricValue: number;
  metricLabel: string;
  calculationExplanation: string;
  supportingDetails: string;
}

export interface HealthAnalyticsRankings {
  highestTreatmentExpenditure: HealthRankingItem[];
  mostTreatmentEvents: HealthRankingItem[];
  mostDistinctIllnessEpisodes: HealthRankingItem[];
  mostRecurringIllnesses: HealthRankingItem[];
  mostOverdueFollowUps: HealthRankingItem[];
  concerningHealthPatterns: HealthRankingItem[];
}

/**
 * Generates all 6 required Health Rankings separately with transparent calculation formulas.
 */
export function computeHealthRankings(
  animals: Animal[],
  episodes: HealthEpisode[],
  treatments: Treatment[],
  referenceDateStr: string = '2026-10-22'
): HealthAnalyticsRankings {
  const byAnimal = animals.map((animal) => {
    const animalEpisodes = episodes.filter((ep) => ep.animalId === animal.id);
    const animalTreatments = treatments.filter((tr) => tr.animalId === animal.id);

    const totalTreatmentSpend = animalTreatments.reduce((sum, t) => sum + t.totalCost, 0);
    const treatmentCount = animalTreatments.length;
    const distinctEpisodeCount = animalEpisodes.length;

    // Count recurring diagnosis categories (same diagnosisCategory occurring >= 2 times)
    const categoryCounts: Record<string, number> = {};
    for (const ep of animalEpisodes) {
      categoryCounts[ep.diagnosisCategory] = (categoryCounts[ep.diagnosisCategory] || 0) + 1;
    }
    const recurringCategories = Object.entries(categoryCounts).filter(([, count]) => count >= 2);
    const recurringEpisodesCount = recurringCategories.reduce((sum, [, count]) => sum + count, 0);

    // Overdue follow-ups: followUpDate < referenceDateStr AND outcome === 'Pending Follow-up'
    const overdueFollowUps = animalTreatments.filter(
      (t) =>
        t.followUpDate &&
        t.followUpDate < referenceDateStr &&
        t.outcome === 'Pending Follow-up'
    );

    // Biological vulnerability / concerning pattern index (distinct from pure expenditure!)
    // Combines: recurring same-category illnesses (+3 pts each), unresolved/chronic episodes (+2 pts),
    // high/critical severity episodes (+2 pts), relapsed treatment outcomes (+3 pts), overdue follow-ups (+2 pts)
    const unresolvedEpisodes = animalEpisodes.filter(
      (e) => e.status === 'Open' || e.status === 'Under Treatment' || e.status === 'Chronic'
    );
    const severeEpisodes = animalEpisodes.filter(
      (e) => e.severity === 'High' || e.severity === 'Critical'
    );
    const relapsedTreatments = animalTreatments.filter((t) => t.outcome === 'Relapsed');

    const vulnerabilityScore =
      recurringEpisodesCount * 3 +
      unresolvedEpisodes.length * 2 +
      severeEpisodes.length * 2 +
      relapsedTreatments.length * 3 +
      overdueFollowUps.length * 2;

    const patternReasons: string[] = [];
    if (recurringCategories.length > 0) {
      patternReasons.push(
        `Recurrent ${recurringCategories.map(([cat, c]) => `${cat} (${c}x)`).join(', ')}`
      );
    }
    if (unresolvedEpisodes.length > 0) {
      patternReasons.push(`${unresolvedEpisodes.length} active/chronic case(s)`);
    }
    if (relapsedTreatments.length > 0) {
      patternReasons.push(`${relapsedTreatments.length} treatment relapse(s)`);
    }
    if (overdueFollowUps.length > 0) {
      patternReasons.push(`${overdueFollowUps.length} overdue vet follow-up(s)`);
    }
    if (severeEpisodes.length > 0) {
      patternReasons.push(`${severeEpisodes.length} high/critical severity episode(s)`);
    }

    return {
      animal,
      totalTreatmentSpend,
      treatmentCount,
      distinctEpisodeCount,
      recurringEpisodesCount,
      recurringCategories,
      overdueFollowUpsCount: overdueFollowUps.length,
      overdueFollowUps,
      vulnerabilityScore,
      patternReasons,
    };
  });

  const highestTreatmentExpenditure: HealthRankingItem[] = byAnimal
    .filter((x) => x.totalTreatmentSpend > 0)
    .sort((a, b) => b.totalTreatmentSpend - a.totalTreatmentSpend)
    .map((x) => ({
      animalId: x.animal.id,
      currentTag: x.animal.currentTag,
      animalName: x.animal.name,
      animalType: x.animal.type,
      breed: x.animal.breed,
      status: x.animal.status,
      metricValue: x.totalTreatmentSpend,
      metricLabel: `NGN ${x.totalTreatmentSpend.toLocaleString()}`,
      calculationExplanation: `Sum of medicine + consultation + other costs across ${x.treatmentCount} treatment event(s).`,
      supportingDetails: `${x.distinctEpisodeCount} episode(s) · ${x.treatmentCount} treatment(s)`,
    }));

  const mostTreatmentEvents: HealthRankingItem[] = byAnimal
    .filter((x) => x.treatmentCount > 0)
    .sort((a, b) => b.treatmentCount - a.treatmentCount || b.totalTreatmentSpend - a.totalTreatmentSpend)
    .map((x) => ({
      animalId: x.animal.id,
      currentTag: x.animal.currentTag,
      animalName: x.animal.name,
      animalType: x.animal.type,
      breed: x.animal.breed,
      status: x.animal.status,
      metricValue: x.treatmentCount,
      metricLabel: `${x.treatmentCount} treatment${x.treatmentCount === 1 ? '' : 's'}`,
      calculationExplanation: `Count of logged veterinary treatment administrations linked to this animal ID.`,
      supportingDetails: `Across ${x.distinctEpisodeCount} distinct illness episode(s)`,
    }));

  const mostDistinctIllnessEpisodes: HealthRankingItem[] = byAnimal
    .filter((x) => x.distinctEpisodeCount > 0)
    .sort((a, b) => b.distinctEpisodeCount - a.distinctEpisodeCount || b.treatmentCount - a.treatmentCount)
    .map((x) => ({
      animalId: x.animal.id,
      currentTag: x.animal.currentTag,
      animalName: x.animal.name,
      animalType: x.animal.type,
      breed: x.animal.breed,
      status: x.animal.status,
      metricValue: x.distinctEpisodeCount,
      metricLabel: `${x.distinctEpisodeCount} episode${x.distinctEpisodeCount === 1 ? '' : 's'}`,
      calculationExplanation: `Count of separate clinical health episodes reported for permanent ID ${x.animal.id}.`,
      supportingDetails: `${x.treatmentCount} total clinical intervention(s)`,
    }));

  const mostRecurringIllnesses: HealthRankingItem[] = byAnimal
    .filter((x) => x.recurringEpisodesCount > 0)
    .sort((a, b) => b.recurringEpisodesCount - a.recurringEpisodesCount)
    .map((x) => ({
      animalId: x.animal.id,
      currentTag: x.animal.currentTag,
      animalName: x.animal.name,
      animalType: x.animal.type,
      breed: x.animal.breed,
      status: x.animal.status,
      metricValue: x.recurringEpisodesCount,
      metricLabel: `${x.recurringEpisodesCount} recurring cases`,
      calculationExplanation: `Episodes where the same diagnosis category occurred >= 2 times: ${x.recurringCategories
        .map(([cat, c]) => `${cat} (${c}x)`)
        .join(', ')}.`,
      supportingDetails: x.recurringCategories.map(([cat, c]) => `${cat}: ${c} episodes`).join(' · '),
    }));

  const mostOverdueFollowUps: HealthRankingItem[] = byAnimal
    .filter((x) => x.overdueFollowUpsCount > 0)
    .sort((a, b) => b.overdueFollowUpsCount - a.overdueFollowUpsCount)
    .map((x) => ({
      animalId: x.animal.id,
      currentTag: x.animal.currentTag,
      animalName: x.animal.name,
      animalType: x.animal.type,
      breed: x.animal.breed,
      status: x.animal.status,
      metricValue: x.overdueFollowUpsCount,
      metricLabel: `${x.overdueFollowUpsCount} overdue`,
      calculationExplanation: `Treatments with outcome "Pending Follow-up" and scheduled follow-up date prior to ${referenceDateStr}.`,
      supportingDetails: `Earliest due: ${x.overdueFollowUps[0]?.followUpDate || 'N/A'}`,
    }));

  const concerningHealthPatterns: HealthRankingItem[] = byAnimal
    .filter((x) => x.vulnerabilityScore >= 4)
    .sort((a, b) => b.vulnerabilityScore - a.vulnerabilityScore)
    .map((x) => ({
      animalId: x.animal.id,
      currentTag: x.animal.currentTag,
      animalName: x.animal.name,
      animalType: x.animal.type,
      breed: x.animal.breed,
      status: x.animal.status,
      metricValue: x.vulnerabilityScore,
      metricLabel: `Risk Index ${x.vulnerabilityScore}`,
      calculationExplanation: `Evidence-based clinical vulnerability index (recurrence ×3, relapses ×3, active/chronic ×2, high severity ×2, overdue follow-up ×2). Excludes raw medication cost.`,
      supportingDetails: x.patternReasons.join(' · '),
    }));

  return {
    highestTreatmentExpenditure,
    mostTreatmentEvents,
    mostDistinctIllnessEpisodes,
    mostRecurringIllnesses,
    mostOverdueFollowUps,
    concerningHealthPatterns,
  };
}
