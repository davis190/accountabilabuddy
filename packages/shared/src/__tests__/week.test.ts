import {
  addDays,
  datesInWeek,
  isFutureLocalDate,
  todayInTimezone,
  weekEndDate,
  weekStartDate,
} from '../week.js';

describe('week boundaries', () => {
  it('starts Monday weeks on Monday', () => {
    expect(weekStartDate('2026-10-19', 'monday')).toBe('2026-10-19'); // Monday
    expect(weekStartDate('2026-10-21', 'monday')).toBe('2026-10-19'); // Wednesday
    expect(weekStartDate('2026-10-25', 'monday')).toBe('2026-10-19'); // Sunday
  });

  it('supports Sunday week start', () => {
    expect(weekStartDate('2026-10-19', 'sunday')).toBe('2026-10-18');
    expect(weekStartDate('2026-10-18', 'sunday')).toBe('2026-10-18');
  });

  it('computes week end and dates', () => {
    expect(weekEndDate('2026-10-19')).toBe('2026-10-25');
    expect(datesInWeek('2026-10-19')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('detects future dates', () => {
    expect(isFutureLocalDate('2026-10-20', '2026-10-19')).toBe(true);
    expect(isFutureLocalDate('2026-10-19', '2026-10-19')).toBe(false);
  });

  it('resolves today in a timezone', () => {
    const fixed = new Date('2026-10-19T18:00:00Z');
    expect(todayInTimezone('UTC', fixed)).toBe('2026-10-19');
    expect(todayInTimezone('America/Los_Angeles', fixed)).toBe('2026-10-19');
  });
});
