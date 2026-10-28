import { Animal, AnimalIdentifier } from '../types/mais.ts';

/**
 * Normalizes any livestock tag string so searches and uniqueness checks are deterministic.
 * e.g. "mais 014 " -> "MAIS-014", "mais-014" -> "MAIS-014"
 */
export function normalizeTag(rawTag: string): string {
  return rawTag
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export interface TagResolutionResult {
  animal: Animal;
  matchedIdentifier: AnimalIdentifier;
  isHistoricalMatch: boolean;
  historicalTags: string[];
}

/**
 * Resolves a tag number (either current OR previously retired) to the single permanent Animal record.
 */
export function resolveAnimalByTag(
  tagQuery: string,
  animals: Animal[],
  identifiers: AnimalIdentifier[]
): TagResolutionResult | null {
  const normalized = normalizeTag(tagQuery);
  if (!normalized) return null;

  const matchedIdentifier = identifiers.find(
    (idObj) => normalizeTag(idObj.tagNumber) === normalized || idObj.normalizedTag === normalized
  );

  if (matchedIdentifier) {
    const animal = animals.find((a) => a.id === matchedIdentifier.animalId);
    if (!animal) return null;
    const historicalTags = identifiers
      .filter((i) => i.animalId === animal.id && !i.isCurrent)
      .map((i) => i.tagNumber);

    return {
      animal,
      matchedIdentifier,
      isHistoricalMatch: !matchedIdentifier.isCurrent,
      historicalTags,
    };
  }

  // Fallback direct check on animal.currentTag
  const directAnimal = animals.find((a) => normalizeTag(a.currentTag) === normalized);
  if (directAnimal) {
    const historicalTags = identifiers
      .filter((i) => i.animalId === directAnimal.id && !i.isCurrent)
      .map((i) => i.tagNumber);
    return {
      animal: directAnimal,
      matchedIdentifier: {
        id: `FALLBACK-${directAnimal.id}`,
        animalId: directAnimal.id,
        tagNumber: directAnimal.currentTag,
        normalizedTag: normalized,
        isCurrent: true,
        assignedAt: directAnimal.registeredAt,
        retiredAt: null,
        retiredReason: null,
        assignedBy: directAnimal.registeredBy,
      },
      isHistoricalMatch: false,
      historicalTags,
    };
  }

  return null;
}

/**
 * Validates that a candidate tag is not currently assigned AND was never retired on any animal.
 * "If an animal's tag changes, the old tag remains searchable as a historical identifier.
 * A retired tag must not silently be assigned to a different animal."
 */
export function validateNewTagCandidate(
  tagCandidate: string,
  animals: Animal[],
  identifiers: AnimalIdentifier[]
): { valid: boolean; error?: string; conflictingAnimalId?: string } {
  const normalized = normalizeTag(tagCandidate);
  if (!normalized || normalized.length < 2) {
    return { valid: false, error: 'Tag number is required and must be at least 2 characters.' };
  }

  const existingIdentifier = identifiers.find(
    (idObj) => normalizeTag(idObj.tagNumber) === normalized || idObj.normalizedTag === normalized
  );

  if (existingIdentifier) {
    const owner = animals.find((a) => a.id === existingIdentifier.animalId);
    if (existingIdentifier.isCurrent) {
      return {
        valid: false,
        error: `Duplicate tag rejected: Tag "${normalized}" is currently assigned to animal ${owner?.currentTag || existingIdentifier.animalId} (ID: ${existingIdentifier.animalId}).`,
        conflictingAnimalId: existingIdentifier.animalId,
      };
    } else {
      return {
        valid: false,
        error: `Retired tag conflict: Tag "${normalized}" is a historical identifier retired from animal ${owner?.currentTag || existingIdentifier.animalId} (ID: ${existingIdentifier.animalId}) and cannot be reassigned.`,
        conflictingAnimalId: existingIdentifier.animalId,
      };
    }
  }

  const directConflict = animals.find((a) => normalizeTag(a.currentTag) === normalized);
  if (directConflict) {
    return {
      valid: false,
      error: `Duplicate tag rejected: Tag "${normalized}" is already in use by animal ID ${directConflict.id}.`,
      conflictingAnimalId: directConflict.id,
    };
  }

  return { valid: true };
}
