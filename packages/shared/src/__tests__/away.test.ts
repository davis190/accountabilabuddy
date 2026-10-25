import {
  adjustedGoalTarget,
  adjustedWeeklyPointTarget,
  availableDaysInWeek,
} from '../scoring.js';

describe('away target adjustment', () => {
  it('scales a 7x goal by available days', () => {
    expect(adjustedGoalTarget(7, 6)).toBe(6);
    expect(adjustedGoalTarget(7, 4)).toBe(4);
  });

  it('rounds half up and floors at 1 when any day remains', () => {
    expect(adjustedGoalTarget(2, 6)).toBe(2); // 1.71 → 2
    expect(adjustedGoalTarget(2, 4)).toBe(1); // 1.14 → 1
    expect(adjustedGoalTarget(3, 6)).toBe(3); // 2.57 → 3
    expect(adjustedGoalTarget(1, 6)).toBe(1); // 0.86 → 1 (floor)
    expect(adjustedGoalTarget(1, 3)).toBe(1); // 0.43 → 0 → floor 1
  });

  it('returns 0 when the whole week is Away', () => {
    expect(adjustedGoalTarget(7, 0)).toBe(0);
    expect(adjustedGoalTarget(1, 0)).toBe(0);
  });

  it('leaves targets unchanged with no Away days', () => {
    expect(adjustedGoalTarget(3, 7)).toBe(3);
    expect(adjustedWeeklyPointTarget(10, [2, 3, 2], 7)).toBe(10);
  });

  it('drops weekly target by the sum of goal reductions', () => {
    // available 4 (3 Away): Run 2→1, Lift 3→2, Stretch 2→1; reduction 3
    expect(adjustedWeeklyPointTarget(10, [2, 3, 2], 4)).toBe(7);
  });

  it('floors weekly target at 1 unless fully Away', () => {
    expect(adjustedWeeklyPointTarget(2, [2, 3, 2], 4)).toBe(1);
    expect(adjustedWeeklyPointTarget(10, [2, 3, 2], 0)).toBe(0);
  });

  it('clamps available days', () => {
    expect(availableDaysInWeek(0)).toBe(7);
    expect(availableDaysInWeek(3)).toBe(4);
    expect(availableDaysInWeek(7)).toBe(0);
    expect(availableDaysInWeek(9)).toBe(0);
  });
});
