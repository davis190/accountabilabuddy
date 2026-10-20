import { SAFE_GOAL_ICONS, type SafeGoalIcon, type Weekday } from './types.js';
import { assertIanaTimezone, isValidLocalDate } from './week.js';

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

const WEEKDAYS: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export function requireString(
  value: unknown,
  field: string,
  min: number,
  max: number,
): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`Invalid ${field}`, { [field]: 'must be a string' });
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new ValidationError(`Invalid ${field}`, {
      [field]: `must be ${min}–${max} characters`,
    });
  }
  return trimmed;
}

export function optionalString(
  value: unknown,
  field: string,
  max: number,
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireString(value, field, 1, max);
}

export function requireInt(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(`Invalid ${field}`, { [field]: 'must be an integer' });
  }
  if (value < min || value > max) {
    throw new ValidationError(`Invalid ${field}`, {
      [field]: `must be between ${min} and ${max}`,
    });
  }
  return value;
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`Invalid ${field}`, { [field]: 'must be a boolean' });
  }
  return value;
}

export function requireLocalDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !isValidLocalDate(value)) {
    throw new ValidationError(`Invalid ${field}`, { [field]: 'must be YYYY-MM-DD' });
  }
  return value;
}

export function requireTimezone(value: unknown, field = 'timezone'): string {
  const tz = requireString(value, field, 1, 64);
  if (!assertIanaTimezone(tz)) {
    throw new ValidationError(`Invalid ${field}`, { [field]: 'must be an IANA timezone' });
  }
  return tz;
}

export function requireWeekday(value: unknown, field: string): Weekday {
  if (typeof value !== 'string' || !WEEKDAYS.includes(value as Weekday)) {
    throw new ValidationError(`Invalid ${field}`, {
      [field]: `must be one of ${WEEKDAYS.join(', ')}`,
    });
  }
  return value as Weekday;
}

export function requireLocalTime(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    throw new ValidationError(`Invalid ${field}`, { [field]: 'must be HH:MM' });
  }
  const [h, m] = value.split(':').map(Number);
  if (h === undefined || m === undefined || h > 23 || m > 59) {
    throw new ValidationError(`Invalid ${field}`, { [field]: 'must be a valid time' });
  }
  return value;
}

export function requireGoalIcon(value: unknown): SafeGoalIcon | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !(SAFE_GOAL_ICONS as readonly string[]).includes(value)) {
    throw new ValidationError('Invalid icon', {
      icon: 'must be a built-in safe icon',
    });
  }
  return value as SafeGoalIcon;
}

export function stripHtml(text: string): string {
  return text.replace(/[<>&]/g, '');
}
