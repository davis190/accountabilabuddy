import {
  type User,
  requireString,
  requireTimezone,
} from '@accountabilabuddy/shared';
import type { AuthUser } from '../auth.js';
import type { Store } from '../store/types.js';

export async function ensureUser(store: Store, auth: AuthUser): Promise<User> {
  const existing = await store.getUser(auth.userId);
  if (existing && existing.accountStatus === 'active') {
    return existing;
  }
  const now = new Date().toISOString();
  const user: User = {
    userId: auth.userId,
    email: auth.email ?? '',
    displayName: auth.name?.trim() || auth.email?.split('@')[0] || 'Member',
    timezone: 'UTC',
    createdAt: now,
    updatedAt: now,
    accountStatus: 'active',
    termsAcceptedAt: now,
  };
  await store.putUser(user);
  return user;
}

export async function updateMe(
  store: Store,
  userId: string,
  body: Record<string, unknown>,
): Promise<User> {
  const user = await store.getUser(userId);
  if (!user || user.accountStatus !== 'active') {
    throw new Error('User not found');
  }
  const now = new Date().toISOString();
  const next: User = { ...user, updatedAt: now };
  if (body.displayName !== undefined) {
    next.displayName = requireString(body.displayName, 'displayName', 1, 80);
  }
  if (body.timezone !== undefined) {
    next.timezone = requireTimezone(body.timezone);
  }
  await store.putUser(next);
  return next;
}

export async function beginAccountDeletion(store: Store, userId: string): Promise<void> {
  const user = await store.getUser(userId);
  if (!user) return;
  const memberships = await store.listMembershipsByUser(userId);
  for (const m of memberships.filter((x) => x.status === 'active')) {
    if (m.role === 'owner') {
      const groupMembers = (await store.listMembershipsByGroup(m.groupId)).filter(
        (x) => x.status === 'active',
      );
      if (groupMembers.length === 1) {
        const group = await store.getGroup(m.groupId);
        if (group) {
          await store.putGroup({
            ...group,
            status: 'deleted',
            updatedAt: new Date().toISOString(),
          });
        }
      } else {
        throw Object.assign(new Error('Transfer ownership before deleting account'), {
          status: 409,
          code: 'owner_must_transfer',
        });
      }
    }
    await store.putMembership({
      ...m,
      status: 'left',
      leftAt: new Date().toISOString(),
    });
  }
  await store.putUser({
    ...user,
    accountStatus: 'deleted',
    displayName: 'Deleted user',
    email: '',
    avatarUrl: undefined,
    updatedAt: new Date().toISOString(),
  });
}
