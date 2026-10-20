import {
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
});
