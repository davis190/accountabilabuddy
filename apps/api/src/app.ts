import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ValidationError } from '@accountabilabuddy/shared';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from './config.js';
import { createAuthMiddleware, type AppVariables } from './auth.js';
import { AppError } from './errors.js';
import type { Store } from './store/types.js';
import * as users from './services/users.js';
import * as groups from './services/groups.js';
import * as goals from './services/goals.js';
import * as completions from './services/completions.js';
import * as away from './services/away.js';
import * as notifications from './services/notifications.js';
import { recommendedWeeklyTarget } from '@accountabilabuddy/shared';

export function createApp(store: Store, config: AppConfig) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use('*', async (c, next) => {
    c.set('requestId', c.req.header('x-request-id') ?? randomUUID());
    await next();
  });

  app.use(
    '*',
    cors({
      origin: config.corsOrigins,
      allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
      exposeHeaders: ['X-Request-Id'],
    }),
  );

  app.get('/health', (c) => c.json({ ok: true, service: 'accountabilabuddy-api' }));

  const v1 = new Hono<{ Variables: AppVariables }>();
  const auth = createAuthMiddleware(config);

  const errorBody = (c: { get: (k: 'requestId') => string }, err: AppError | ValidationError) => {
    if (err instanceof ValidationError) {
      return {
        code: 'bad_request',
        message: err.message,
        requestId: c.get('requestId'),
        fields: err.fields,
      };
    }
    return {
      code: err.code,
      message: err.message,
      requestId: c.get('requestId'),
      fields: err.fields,
    };
  };

  v1.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(errorBody(c, err), err.status as 400);
    }
    if (err instanceof ValidationError) {
      return c.json(errorBody(c, err), 400);
    }
    console.error(err);
    return c.json(
      {
        code: 'internal_error',
        message: 'Something went wrong',
        requestId: c.get('requestId'),
      },
      500,
    );
  });

  // Public invitation preview
  v1.get('/invitations/:rawToken/preview', async (c) => {
    const preview = await groups.previewInvitation(store, c.req.param('rawToken'));
    return c.json(preview);
  });

  // Authenticated routes
  v1.use('*', auth);

  v1.get('/me', async (c) => {
    const user = await users.ensureUser(store, c.get('user'));
    const memberships = await groups.listGroups(store, user.userId);
    return c.json({
      user,
      memberships: memberships.map(({ group, membership }) => ({
        groupId: group.groupId,
        name: group.name,
        role: membership.role,
        weeklyPointTarget: membership.weeklyPointTarget,
        lastUsedAt: membership.lastUsedAt,
      })),
    });
  });

  v1.patch('/me', async (c) => {
    await users.ensureUser(store, c.get('user'));
    const body = await c.req.json();
    const user = await users.updateMe(store, c.get('user').userId, body);
    return c.json({ user });
  });

  v1.put('/me/away-days/:localDate', async (c) => {
    await users.ensureUser(store, c.get('user'));
    const result = await away.markAway(store, c.get('user').userId, c.req.param('localDate'));
    return c.json(result);
  });

  v1.delete('/me/away-days/:localDate', async (c) => {
    await users.ensureUser(store, c.get('user'));
    const result = await away.unmarkAway(store, c.get('user').userId, c.req.param('localDate'));
    return c.json(result);
  });

  v1.delete('/me', async (c) => {
    try {
      await users.beginAccountDeletion(store, c.get('user').userId);
      return c.json({ status: 'deleted' });
    } catch (e) {
      const err = e as { status?: number; code?: string; message?: string };
      if (err.status === 409) {
        throw new AppError(409, err.code ?? 'conflict', err.message ?? 'Conflict');
      }
      throw e;
    }
  });

  v1.get('/groups', async (c) => {
    await users.ensureUser(store, c.get('user'));
    const list = await groups.listGroups(store, c.get('user').userId);
    return c.json({
      groups: list.map(({ group, membership }) => ({ ...group, membership })),
    });
  });

  v1.post('/groups', async (c) => {
    const user = await users.ensureUser(store, c.get('user'));
    const body = await c.req.json();
    const created = await groups.createGroup(store, user, body);
    return c.json(created, 201);
  });

  v1.get('/groups/:groupId', async (c) => {
    await users.ensureUser(store, c.get('user'));
    const detail = await groups.getGroupDetail(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
    );
    return c.json(detail);
  });

  v1.patch('/groups/:groupId', async (c) => {
    const body = await c.req.json();
    const group = await groups.updateGroup(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      body,
    );
    return c.json({ group });
  });

  v1.delete('/groups/:groupId', async (c) => {
    await groups.deleteGroup(store, c.req.param('groupId'), c.get('user').userId);
    return c.json({ deleted: true });
  });

  v1.delete('/groups/:groupId/members/me', async (c) => {
    await groups.leaveGroup(store, c.req.param('groupId'), c.get('user').userId);
    return c.json({ left: true });
  });

  v1.delete('/groups/:groupId/members/:userId', async (c) => {
    await groups.removeMember(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      c.req.param('userId'),
    );
    return c.json({ removed: true });
  });

  v1.post('/groups/:groupId/owner-transfer', async (c) => {
    const body = await c.req.json();
    await groups.transferOwnership(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      String(body.newOwnerUserId),
    );
    return c.json({ transferred: true });
  });

  v1.patch('/groups/:groupId/membership/me', async (c) => {
    const body = await c.req.json();
    const membership = await groups.updateMyMembership(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      body,
    );
    return c.json({ membership });
  });

  v1.post('/groups/:groupId/invitations', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = await groups.createInvitation(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      body,
    );
    return c.json(
      {
        invitationId: result.invitation.invitationId,
        expiresAt: result.invitation.expiresAt,
        maxUses: result.invitation.maxUses,
        token: result.rawToken,
        url: `${config.appOrigin}/join/${result.rawToken}`,
      },
      201,
    );
  });

  v1.delete('/groups/:groupId/invitations/:invitationId', async (c) => {
    await groups.revokeInvitation(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      c.req.param('invitationId'),
    );
    return c.json({ revoked: true });
  });

  v1.post('/invitations/:rawToken/accept', async (c) => {
    const user = await users.ensureUser(store, c.get('user'));
    const result = await groups.acceptInvitation(store, c.req.param('rawToken'), user);
    return c.json(result);
  });

  v1.get('/groups/:groupId/goals/me', async (c) => {
    const list = await goals.listMyGoals(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
    );
    return c.json({
      goals: list,
      recommendedWeeklyTarget: recommendedWeeklyTarget(list),
    });
  });

  v1.post('/groups/:groupId/goals', async (c) => {
    const body = await c.req.json();
    const goal = await goals.createGoal(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      body,
    );
    return c.json({ goal }, 201);
  });

  v1.patch('/groups/:groupId/goals/:goalId', async (c) => {
    const body = await c.req.json();
    const goal = await goals.updateGoal(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      c.req.param('goalId'),
      body,
    );
    return c.json({ goal });
  });

  v1.delete('/groups/:groupId/goals/:goalId', async (c) => {
    const result = await goals.deleteOrArchiveGoal(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      c.req.param('goalId'),
    );
    return c.json(result);
  });

  v1.get('/groups/:groupId/members/:userId/goals', async (c) => {
    const list = await goals.listMemberGoals(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      c.req.param('userId'),
    );
    return c.json({ goals: list });
  });

  v1.put('/groups/:groupId/completions/:localDate/:goalId', async (c) => {
    const result = await completions.putCompletion(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      c.req.param('localDate'),
      c.req.param('goalId'),
    );
    return c.json(result);
  });

  v1.delete('/groups/:groupId/completions/:localDate/:goalId', async (c) => {
    const result = await completions.deleteCompletion(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      c.req.param('localDate'),
      c.req.param('goalId'),
    );
    return c.json(result);
  });

  v1.get('/groups/:groupId/days/:localDate/me', async (c) => {
    const result = await completions.getMyDay(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      c.req.param('localDate'),
    );
    return c.json(result);
  });

  v1.get('/groups/:groupId/weeks/:weekStartDate', async (c) => {
    const result = await completions.getWeekComparison(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      c.req.param('weekStartDate'),
    );
    return c.json(result);
  });

  v1.get('/groups/:groupId/members/:userId/history', async (c) => {
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!from || !to) {
      throw new AppError(400, 'bad_request', 'from and to query params required');
    }
    const result = await completions.getMemberHistory(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      c.req.param('userId'),
      from,
      to,
    );
    return c.json(result);
  });

  v1.get('/groups/:groupId/members/:userId/weeks/:weekStartDate', async (c) => {
    const result = await completions.getMemberWeekDetail(
      store,
      c.req.param('groupId'),
      c.get('user').userId,
      c.req.param('userId'),
      c.req.param('weekStartDate'),
    );
    return c.json(result);
  });

  v1.post('/groups/:groupId/notifications/test', async (c) => {
    const result = await notifications.sendTestNotification(
      store,
      config,
      c.req.param('groupId'),
      c.get('user').userId,
    );
    return c.json(result);
  });

  // Internal scheduler targets — protected by shared secret in non-IAM local mode
  const internal = new Hono<{ Variables: AppVariables }>();
  internal.post('/notifications/daily', async (c) => {
    notifications.assertInternalCaller(
      c.req.header('x-internal-key'),
      process.env.INTERNAL_API_KEY,
    );
    const result = await notifications.processDailyReminders(store, config);
    return c.json(result);
  });
  internal.post('/notifications/weekly', async (c) => {
    notifications.assertInternalCaller(
      c.req.header('x-internal-key'),
      process.env.INTERNAL_API_KEY,
    );
    const result = await notifications.processWeeklyCheckIns(store, config);
    return c.json(result);
  });

  app.route('/v1', v1);
  app.route('/internal', internal);

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        {
          code: err.code,
          message: err.message,
          requestId: c.get('requestId') ?? 'unknown',
          fields: err.fields,
        },
        err.status as 400,
      );
    }
    if (err instanceof ValidationError) {
      return c.json(
        {
          code: 'bad_request',
          message: err.message,
          requestId: c.get('requestId') ?? 'unknown',
          fields: err.fields,
        },
        400,
      );
    }
    console.error(err);
    return c.json(
      {
        code: 'internal_error',
        message: 'Something went wrong',
        requestId: c.get('requestId') ?? 'unknown',
      },
      500,
    );
  });

  return app;
}
