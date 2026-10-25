import {
  addDays,
  todayInTimezone,
  weekStartDate,
} from '@accountabilabuddy/shared';
import { loadConfig } from '../config.js';
import { createApp } from '../app.js';
import { MemoryStore } from '../store/memory.js';

function auth(userId = 'user_a', name = 'Ada') {
  return { Authorization: `Bearer dev:${userId}|${userId}@example.com|${name}` };
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe('API acceptance paths', () => {
  const store = new MemoryStore();
  const config = loadConfig({
    AUTH_MODE: 'dev',
    APP_ORIGIN: 'http://localhost:5173',
    CORS_ORIGINS: 'http://localhost:5173',
  });
  const app = createApp(store, config);

  beforeEach(async () => {
    await store.reset();
  });

  it('creates isolated groups and scores uncapped completions', async () => {
    const createA = await app.request('/v1/groups', {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Run Club' }),
    });
    expect(createA.status).toBe(201);
    const groupA = (await json(createA)).group as { groupId: string };

    const createB = await app.request('/v1/groups', {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Household' }),
    });
    const groupB = (await json(createB)).group as { groupId: string };

    const goalRes = await app.request(`/v1/groups/${groupA.groupId}/goals`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Run',
        targetDaysPerWeek: 2,
        activeFrom: '2026-10-01',
      }),
    });
    const goal = (await json(goalRes)).goal as { goalId: string };

    // Use a fully past week so future-date validation does not reject logs
    const dates = ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11'];
    for (const d of dates) {
      const res = await app.request(
        `/v1/groups/${groupA.groupId}/completions/${d}/${goal.goalId}`,
        { method: 'PUT', headers: auth() },
      );
      expect(res.status).toBe(200);
    }

    // Idempotent replay
    const replay = await app.request(
      `/v1/groups/${groupA.groupId}/completions/2026-10-05/${goal.goalId}`,
      { method: 'PUT', headers: auth() },
    );
    const replayBody = await json(replay);
    expect((replayBody.week as { pointsEarned: number }).pointsEarned).toBe(4);

    const week = weekStartDate('2026-10-05', 'monday');
    const day = await app.request(`/v1/groups/${groupA.groupId}/days/2026-10-11/me`, {
      headers: auth(),
    });
    const dayBody = await json(day);
    expect(dayBody.pointsEarned).toBe(4);
    const goals = dayBody.goals as Array<{ completedDaysThisWeek: number }>;
    expect(goals[0]?.completedDaysThisWeek).toBe(4);

    // Isolation: Group B day is empty / no shared goals
    const dayB = await app.request(`/v1/groups/${groupB.groupId}/days/2026-10-11/me`, {
      headers: auth(),
    });
    const dayBBody = await json(dayB);
    expect(dayBBody.pointsEarned).toBe(0);
    expect((dayBBody.goals as unknown[]).length).toBe(0);

    // Week comparison
    const cmp = await app.request(`/v1/groups/${groupA.groupId}/weeks/${week}`, {
      headers: auth(),
    });
    const cmpBody = await json(cmp);
    const members = cmpBody.members as Array<{ pointsEarned: number; progressPercent: number }>;
    expect(members[0]?.pointsEarned).toBe(4);
  });

  it('rejects cross-user completion writes and cross-group history', async () => {
    const create = await app.request('/v1/groups', {
      method: 'POST',
      headers: { ...auth('user_a', 'Ada'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Pair' }),
    });
    const group = (await json(create)).group as { groupId: string };

    const inv = await app.request(`/v1/groups/${group.groupId}/invitations`, {
      method: 'POST',
      headers: { ...auth('user_a', 'Ada'), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const token = (await json(inv)).token as string;

    const preview = await app.request(`/v1/invitations/${token}/preview`);
    const previewBody = await json(preview);
    expect(String(previewBody.privacyDisclosure)).toMatch(/full daily check-off history/i);

    await app.request(`/v1/invitations/${token}/accept`, {
      method: 'POST',
      headers: auth('user_b', 'Bea'),
    });

    const goalRes = await app.request(`/v1/groups/${group.groupId}/goals`, {
      method: 'POST',
      headers: { ...auth('user_a', 'Ada'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Lift',
        targetDaysPerWeek: 2,
        activeFrom: '2026-10-01',
      }),
    });
    const goal = (await json(goalRes)).goal as { goalId: string };

    const steal = await app.request(
      `/v1/groups/${group.groupId}/completions/2026-10-05/${goal.goalId}`,
      { method: 'PUT', headers: auth('user_b', 'Bea') },
    );
    expect(steal.status).toBe(404);

    const logged = await app.request(
      `/v1/groups/${group.groupId}/completions/2026-10-05/${goal.goalId}`,
      { method: 'PUT', headers: auth('user_a', 'Ada') },
    );
    expect(logged.status).toBe(200);

    const history = await app.request(
      `/v1/groups/${group.groupId}/members/user_a/history?from=2026-10-05&to=2026-10-11`,
      { headers: auth('user_b', 'Bea') },
    );
    expect(history.status).toBe(200);
    const histBody = await json(history);
    expect((histBody.days as unknown[]).length).toBe(1);

    // Other group denial
    const other = await app.request('/v1/groups', {
      method: 'POST',
      headers: { ...auth('user_c', 'Cal'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Secret' }),
    });
    const secret = (await json(other)).group as { groupId: string };
    const denied = await app.request(
      `/v1/groups/${secret.groupId}/members/user_c/history?from=2026-10-05&to=2026-10-11`,
      { headers: auth('user_a', 'Ada') },
    );
    expect([403, 404]).toContain(denied.status);
  });

  it('labels ties without hidden tie-breakers', async () => {
    const create = await app.request('/v1/groups', {
      method: 'POST',
      headers: { ...auth('user_a', 'Ada'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Tie Club' }),
    });
    const group = (await json(create)).group as { groupId: string };
    const inv = await app.request(`/v1/groups/${group.groupId}/invitations`, {
      method: 'POST',
      headers: { ...auth('user_a'), 'Content-Type': 'application/json' },
      body: '{}',
    });
    const token = (await json(inv)).token as string;
    await app.request(`/v1/invitations/${token}/accept`, {
      method: 'POST',
      headers: auth('user_b', 'Bea'),
    });

    for (const [user, name] of [
      ['user_a', 'Ada'],
      ['user_b', 'Bea'],
    ] as const) {
      await app.request(`/v1/groups/${group.groupId}/membership/me`, {
        method: 'PATCH',
        headers: { ...auth(user, name), 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyPointTarget: 5 }),
      });
      const g = await app.request(`/v1/groups/${group.groupId}/goals`, {
        method: 'POST',
        headers: { ...auth(user, name), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Walk',
          targetDaysPerWeek: 3,
          activeFrom: '2026-10-01',
        }),
      });
      const goalId = ((await json(g)).goal as { goalId: string }).goalId;
      const logged = await app.request(
        `/v1/groups/${group.groupId}/completions/2026-10-05/${goalId}`,
        { method: 'PUT', headers: auth(user, name) },
      );
      expect(logged.status).toBe(200);
    }

    const week = weekStartDate('2026-10-05', 'monday');
    const cmp = await app.request(`/v1/groups/${group.groupId}/weeks/${week}`, {
      headers: auth('user_a'),
    });
    const members = (await json(cmp)).members as Array<{ position: number; tied: boolean }>;
    expect(members.every((m) => m.position === 1 && m.tied)).toBe(true);
  });

  it('keeps the current-week point target in sync when goals change', async () => {
    const today = todayInTimezone('UTC');
    const currentWeekStart = weekStartDate(today, 'monday');
    const pastDate = addDays(currentWeekStart, -7);

    const create = await app.request('/v1/groups', {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Target Sync' }),
    });
    const group = (await json(create)).group as { groupId: string };

    const first = await app.request(`/v1/groups/${group.groupId}/goals`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Run',
        targetDaysPerWeek: 2,
        activeFrom: pastDate,
      }),
    });
    const goal = (await json(first)).goal as { goalId: string };
    // First goal syncs default membership target 1 → recommended 2.
    expect(
      (
        await json(
          await app.request(`/v1/groups/${group.groupId}`, { headers: auth() }),
        )
      ).roster as Array<{ userId: string; weeklyPointTarget: number }>,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ weeklyPointTarget: 2 })]));

    // Snapshot the current week with a completion using the old target.
    const logged = await app.request(
      `/v1/groups/${group.groupId}/completions/${today}/${goal.goalId}`,
      { method: 'PUT', headers: auth() },
    );
    expect(logged.status).toBe(200);
    expect((await json(logged)).week as { weeklyPointTarget: number }).toMatchObject({
      weeklyPointTarget: 2,
    });

    // Adding another goal while still on the recommended target should bump it.
    await app.request(`/v1/groups/${group.groupId}/goals`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Lift',
        targetDaysPerWeek: 3,
        activeFrom: pastDate,
      }),
    });

    const day = await app.request(`/v1/groups/${group.groupId}/days/${today}/me`, {
      headers: auth(),
    });
    expect((await json(day)).weeklyPointTarget).toBe(5);

    // Past weeks keep the frozen snapshot target.
    await app.request(`/v1/groups/${group.groupId}/completions/${pastDate}/${goal.goalId}`, {
      method: 'PUT',
      headers: auth(),
    });
    await app.request(`/v1/groups/${group.groupId}/membership/me`, {
      method: 'PATCH',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyPointTarget: 9 }),
    });
    const pastDay = await app.request(`/v1/groups/${group.groupId}/days/${pastDate}/me`, {
      headers: auth(),
    });
    expect((await json(pastDay)).weeklyPointTarget).toBe(5);

    const currentDay = await app.request(`/v1/groups/${group.groupId}/days/${today}/me`, {
      headers: auth(),
    });
    expect((await json(currentDay)).weeklyPointTarget).toBe(9);
  });

  it('shows the live membership target on Today after changing it mid-week', async () => {
    const today = todayInTimezone('UTC');
    const create = await app.request('/v1/groups', {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Midweek Target' }),
    });
    const group = (await json(create)).group as { groupId: string };

    await app.request(`/v1/groups/${group.groupId}/membership/me`, {
      method: 'PATCH',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyPointTarget: 11 }),
    });

    const goalRes = await app.request(`/v1/groups/${group.groupId}/goals`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Walk',
        targetDaysPerWeek: 3,
        activeFrom: today,
      }),
    });
    const goalId = ((await json(goalRes)).goal as { goalId: string }).goalId;

    // First completion freezes a weekly snapshot at 11.
    const logged = await app.request(
      `/v1/groups/${group.groupId}/completions/${today}/${goalId}`,
      { method: 'PUT', headers: auth() },
    );
    expect((await json(logged)).week as { weeklyPointTarget: number }).toMatchObject({
      weeklyPointTarget: 11,
    });

    await app.request(`/v1/groups/${group.groupId}/membership/me`, {
      method: 'PATCH',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyPointTarget: 24 }),
    });

    const day = await app.request(`/v1/groups/${group.groupId}/days/${today}/me`, {
      headers: auth(),
    });
    expect((await json(day)).weeklyPointTarget).toBe(24);

    const week = weekStartDate(today, 'monday');
    const cmp = await app.request(`/v1/groups/${group.groupId}/weeks/${week}`, {
      headers: auth(),
    });
    const me = (
      (await json(cmp)).members as Array<{ userId: string; weeklyPointTarget: number }>
    ).find((m) => m.userId === 'user_a');
    expect(me?.weeklyPointTarget).toBe(24);
  });

  it('marks Away, clears check-offs, blocks new ones, and lowers targets', async () => {
    const today = todayInTimezone('UTC');
    const weekStart = weekStartDate(today, 'monday');
    const awayDate = addDays(weekStart, 2); // Wednesday of current week

    const create = await app.request('/v1/groups', {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Away Club' }),
    });
    const group = (await json(create)).group as { groupId: string };

    await app.request(`/v1/groups/${group.groupId}/membership/me`, {
      method: 'PATCH',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyPointTarget: 10 }),
    });

    const runRes = await app.request(`/v1/groups/${group.groupId}/goals`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Run',
        targetDaysPerWeek: 2,
        activeFrom: weekStart,
      }),
    });
    const run = (await json(runRes)).goal as { goalId: string };

    await app.request(`/v1/groups/${group.groupId}/goals`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Lift',
        targetDaysPerWeek: 3,
        activeFrom: weekStart,
      }),
    });
    await app.request(`/v1/groups/${group.groupId}/goals`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Stretch',
        targetDaysPerWeek: 2,
        activeFrom: weekStart,
      }),
    });

    // Only log a completion if Away day is not in the future.
    if (awayDate <= today) {
      const logged = await app.request(
        `/v1/groups/${group.groupId}/completions/${awayDate}/${run.goalId}`,
        { method: 'PUT', headers: auth() },
      );
      expect(logged.status).toBe(200);
    }

    const marked = await app.request(`/v1/me/away-days/${awayDate}`, {
      method: 'PUT',
      headers: auth(),
    });
    expect(marked.status).toBe(200);

    // Completions on the Away day are cleared.
    const day = await app.request(`/v1/groups/${group.groupId}/days/${awayDate}/me`, {
      headers: auth(),
    });
    const dayBody = await json(day);
    expect(dayBody.away).toBe(true);
    // 1 Away → available 6: Run 2→2, Lift 3→3, Stretch 2→2; reduction 0; weekly stays 10
    // With 3 Away we'd drop more — mark two more days.
    expect((dayBody.goals as Array<{ checked: boolean }>).every((g) => !g.checked)).toBe(true);

    const blocked = await app.request(
      `/v1/groups/${group.groupId}/completions/${awayDate}/${run.goalId}`,
      { method: 'PUT', headers: auth() },
    );
    expect(blocked.status).toBe(400);

    // Mark enough Away days to reduce targets (3 Away → available 4).
    const extraAway = [addDays(weekStart, 3), addDays(weekStart, 4)];
    for (const d of extraAway) {
      const res = await app.request(`/v1/me/away-days/${d}`, {
        method: 'PUT',
        headers: auth(),
      });
      expect(res.status).toBe(200);
    }

    const adjusted = await app.request(`/v1/groups/${group.groupId}/days/${today}/me`, {
      headers: auth(),
    });
    const adjustedBody = await json(adjusted);
    // Run 2→1, Lift 3→2, Stretch 2→1; reduction 3; weekly 10→7
    expect(adjustedBody.weeklyPointTarget).toBe(7);
    const goals = adjustedBody.goals as Array<{
      name: string;
      targetDaysPerWeek: number;
    }>;
    expect(goals.find((g) => g.name === 'Run')?.targetDaysPerWeek).toBe(1);
    expect(goals.find((g) => g.name === 'Lift')?.targetDaysPerWeek).toBe(2);
    expect(goals.find((g) => g.name === 'Stretch')?.targetDaysPerWeek).toBe(1);

    const cmp = await app.request(`/v1/groups/${group.groupId}/weeks/${weekStart}`, {
      headers: auth(),
    });
    const me = (
      (await json(cmp)).members as Array<{
        userId: string;
        weeklyPointTarget: number;
        awayDates: string[];
      }>
    ).find((m) => m.userId === 'user_a');
    expect(me?.weeklyPointTarget).toBe(7);
    expect(me?.awayDates?.length).toBe(3);

    // Next week cannot be marked Away.
    const nextWeekDay = addDays(weekStart, 8);
    const tooFar = await app.request(`/v1/me/away-days/${nextWeekDay}`, {
      method: 'PUT',
      headers: auth(),
    });
    expect(tooFar.status).toBe(400);
  });
});
