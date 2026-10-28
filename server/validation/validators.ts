import { normalizeTag } from '../../src/domain/farmRules.ts';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePositiveNumber(value: unknown, fieldName: string): ValidationResult {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return { valid: false, error: `${fieldName} must be a positive number greater than zero.` };
  }
  return { valid: true };
}

export function validateNonNegativeNumber(value: unknown, fieldName: string): ValidationResult {
  if (value === undefined || value === null || value === '') {
    return { valid: true };
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return { valid: false, error: `${fieldName} cannot be negative.` };
  }
  return { valid: true };
}

export function validateRequiredString(
  value: unknown,
  fieldName: string,
  minLength = 1
): ValidationResult {
  if (typeof value !== 'string' || value.trim().length < minLength) {
    return {
      valid: false,
      error:
        minLength > 1
          ? `${fieldName} is required (minimum ${minLength} characters).`
          : `${fieldName} is required.`,
    };
  }
  return { valid: true };
}

export function validateIsoDate(value: unknown, fieldName: string): ValidationResult {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
    return {
      valid: false,
      error: `${fieldName} must be a valid YYYY-MM-DD date.`,
    };
  }
  return { valid: true };
}

export function normalizeSearchTag(rawTag: unknown): string {
  return normalizeTag(String(rawTag || ''));
}
