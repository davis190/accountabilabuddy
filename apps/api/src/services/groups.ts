import {
  createId,
  createInvitationToken,
  hashToken,
  requireBoolean,
  requireInt,
  requireLocalTime,
  requireString,
  requireWeekday,
  type Group,
  type Invitation,
  type Membership,
  type User,
  type Weekday,
} from '@accountabilabuddy/shared';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import type { Store } from '../store/types.js';
import { requireActiveMembership, requireOwner } from './authz.js';

const MAX_MEMBERSHIPS = 20;

export async function listGroups(store: Store, userId: string) {
  const memberships = (await store.listMembershipsByUser(userId)).filter(
    (m) => m.status === 'active',
  );
  const groups = await Promise.all(
    memberships.map(async (m) => {
      const group = await store.getGroup(m.groupId);
      return group && group.status === 'active'
        ? { group, membership: m }
        : null;
    }),
  );
  return groups
    .filter((g): g is { group: Group; membership: Membership } => g !== null)
    .sort((a, b) => {
      const aUsed = a.membership.lastUsedAt ?? a.membership.joinedAt;
      const bUsed = b.membership.lastUsedAt ?? b.membership.joinedAt;
      return bUsed.localeCompare(aUsed);
    });
}

export async function createGroup(
  store: Store,
  user: User,
  body: Record<string, unknown>,
) {
  const activeCount = (await store.listMembershipsByUser(user.userId)).filter(
    (m) => m.status === 'active',
  ).length;
  if (activeCount >= MAX_MEMBERSHIPS) {
    throw badRequest(`Membership limit of ${MAX_MEMBERSHIPS} reached`);
  }

  const name = requireString(body.name, 'name', 1, 60);
  const weekStartsOn = (body.weekStartsOn
    ? requireWeekday(body.weekStartsOn, 'weekStartsOn')
    : 'monday') as Weekday;
  const memberInviteEnabled =
    body.memberInviteEnabled === undefined
      ? true
      : requireBoolean(body.memberInviteEnabled, 'memberInviteEnabled');

  const now = new Date().toISOString();
  const groupId = createId('grp');
  const group: Group = {
    groupId,
    name,
    ownerUserId: user.userId,
    weekStartsOn,
    memberInviteEnabled,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  const membership: Membership = {
    groupId,
    userId: user.userId,
    role: 'owner',
    status: 'active',
    joinedAt: now,
    weeklyPointTarget: 1,
    targetEffectiveAt: now,
    dailyReminderEnabled: false,
    weeklyCheckInEnabled: false,
    weeklyCheckInDay: 'sunday',
    weeklyCheckInLocalTime: '18:00',
    timezone: user.timezone,
    lastUsedAt: now,
    version: 1,
  };
  await store.putGroup(group);
  await store.putMembership(membership);
  return { group, membership };
}

export async function getGroupDetail(store: Store, groupId: string, userId: string) {
  const { group } = await requireActiveMembership(store, groupId, userId);
  const memberships = (await store.listMembershipsByGroup(groupId)).filter(
    (m) => m.status === 'active' || m.status === 'left' || m.status === 'removed',
  );
  const roster = await Promise.all(
    memberships.map(async (m) => {
      const u = await store.getUser(m.userId);
      return {
        userId: m.userId,
        role: m.role,
        status: m.status,
        displayName:
          m.status === 'active'
            ? u?.displayName ?? 'Member'
            : 'Former member',
        avatarUrl: m.status === 'active' ? u?.avatarUrl : undefined,
        weeklyPointTarget: m.weeklyPointTarget,
        joinedAt: m.joinedAt,
      };
    }),
  );
  await touchLastUsed(store, groupId, userId);
  return { group, roster };
}

async function touchLastUsed(store: Store, groupId: string, userId: string) {
  const m = await store.getMembership(groupId, userId);
  if (!m || m.status !== 'active') return;
  await store.putMembership({
    ...m,
    lastUsedAt: new Date().toISOString(),
  });
}

export async function updateGroup(
  store: Store,
  groupId: string,
  userId: string,
  body: Record<string, unknown>,
) {
  const { group } = await requireOwner(store, groupId, userId);
  const next = { ...group, updatedAt: new Date().toISOString(), version: group.version + 1 };
  if (body.name !== undefined) next.name = requireString(body.name, 'name', 1, 60);
  if (body.memberInviteEnabled !== undefined) {
    next.memberInviteEnabled = requireBoolean(body.memberInviteEnabled, 'memberInviteEnabled');
  }
  await store.putGroup(next);
  return next;
}

export async function deleteGroup(store: Store, groupId: string, userId: string) {
  const { group } = await requireOwner(store, groupId, userId);
  await store.putGroup({
    ...group,
    status: 'deleted',
    updatedAt: new Date().toISOString(),
    version: group.version + 1,
  });
  const memberships = await store.listMembershipsByGroup(groupId);
  const now = new Date().toISOString();
  for (const m of memberships.filter((x) => x.status === 'active')) {
    await store.putMembership({ ...m, status: 'removed', leftAt: now });
  }
}

export async function leaveGroup(store: Store, groupId: string, userId: string) {
  const { membership } = await requireActiveMembership(store, groupId, userId);
  if (membership.role === 'owner') {
    const active = (await store.listMembershipsByGroup(groupId)).filter(
      (m) => m.status === 'active',
    );
    if (active.length > 1) {
      throw conflict('Transfer ownership before leaving');
    }
    await deleteGroup(store, groupId, userId);
    return;
  }
  await store.putMembership({
    ...membership,
    status: 'left',
    leftAt: new Date().toISOString(),
  });
}

export async function removeMember(
  store: Store,
  groupId: string,
  ownerId: string,
  targetUserId: string,
) {
  await requireOwner(store, groupId, ownerId);
  if (ownerId === targetUserId) {
    throw badRequest('Cannot remove yourself; leave or transfer ownership');
  }
  const membership = await store.getMembership(groupId, targetUserId);
  if (!membership || membership.status !== 'active') {
    throw notFound('Member not found');
  }
  await store.putMembership({
    ...membership,
    status: 'removed',
    leftAt: new Date().toISOString(),
  });
}

export async function transferOwnership(
  store: Store,
  groupId: string,
  ownerId: string,
  newOwnerId: string,
) {
  const { group, membership: ownerMembership } = await requireOwner(
    store,
    groupId,
    ownerId,
  );
  const newOwner = await store.getMembership(groupId, newOwnerId);
  if (!newOwner || newOwner.status !== 'active') {
    throw notFound('New owner must be an active member');
  }
  const now = new Date().toISOString();
  await store.putGroup({
    ...group,
    ownerUserId: newOwnerId,
    updatedAt: now,
    version: group.version + 1,
  });
  await store.putMembership({
    ...ownerMembership,
    role: 'member',
    version: ownerMembership.version + 1,
  });
  await store.putMembership({
    ...newOwner,
    role: 'owner',
    version: newOwner.version + 1,
  });
}

export async function updateMyMembership(
  store: Store,
  groupId: string,
  userId: string,
  body: Record<string, unknown>,
) {
  const { membership } = await requireActiveMembership(store, groupId, userId);
  const next = {
    ...membership,
    version: membership.version + 1,
  };
  let targetChanged = false;
  if (body.weeklyPointTarget !== undefined) {
    next.weeklyPointTarget = requireInt(body.weeklyPointTarget, 'weeklyPointTarget', 1, 100);
    next.targetEffectiveAt = new Date().toISOString();
    targetChanged = next.weeklyPointTarget !== membership.weeklyPointTarget;
  }
  if (body.timezone !== undefined) {
    const { requireTimezone } = await import('@accountabilabuddy/shared');
    next.timezone = requireTimezone(body.timezone);
  }
  if (body.dailyReminderEnabled !== undefined) {
    next.dailyReminderEnabled = requireBoolean(
      body.dailyReminderEnabled,
      'dailyReminderEnabled',
    );
  }
  if (body.dailyReminderLocalTime !== undefined) {
    next.dailyReminderLocalTime = requireLocalTime(
      body.dailyReminderLocalTime,
      'dailyReminderLocalTime',
    );
  }
  if (body.weeklyCheckInEnabled !== undefined) {
    next.weeklyCheckInEnabled = requireBoolean(
      body.weeklyCheckInEnabled,
      'weeklyCheckInEnabled',
    );
  }
  if (body.weeklyCheckInDay !== undefined) {
    next.weeklyCheckInDay = requireWeekday(body.weeklyCheckInDay, 'weeklyCheckInDay');
  }
  if (body.weeklyCheckInLocalTime !== undefined) {
    next.weeklyCheckInLocalTime = requireLocalTime(
      body.weeklyCheckInLocalTime,
      'weeklyCheckInLocalTime',
    );
  }
  await store.putMembership(next);
  if (targetChanged) {
    const { refreshCurrentWeekTargetSnapshot } = await import('./completions.js');
    await refreshCurrentWeekTargetSnapshot(store, groupId, next);
  }
  return next;
}

export async function createInvitation(
  store: Store,
  groupId: string,
  userId: string,
  body: Record<string, unknown>,
) {
  const { group, membership } = await requireActiveMembership(store, groupId, userId);
  if (membership.role !== 'owner' && !group.memberInviteEnabled) {
    throw forbidden('Invitations are disabled for members');
  }
  const maxUses = body.maxUses === undefined ? 10 : requireInt(body.maxUses, 'maxUses', 1, 100);
  const expiresInDays =
    body.expiresInDays === undefined
      ? 7
      : requireInt(body.expiresInDays, 'expiresInDays', 1, 30);
  const rawToken = createInvitationToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
  const invitation: Invitation = {
    invitationId: createId('inv'),
    groupId,
    tokenHash: hashToken(rawToken),
    createdBy: userId,
    expiresAt: expiresAt.toISOString(),
    maxUses,
    useCount: 0,
    createdAt: now.toISOString(),
    ttl: Math.floor(expiresAt.getTime() / 1000) + 90 * 24 * 60 * 60,
  };
  await store.putInvitation(invitation);
  return { invitation, rawToken };
}

export async function previewInvitation(store: Store, rawToken: string) {
  const invitation = await store.getInvitationByTokenHash(hashToken(rawToken));
  if (!invitation || invitation.revokedAt || invitation.expiresAt < new Date().toISOString()) {
    throw notFound('Invitation not found');
  }
  if (invitation.useCount >= invitation.maxUses) {
    throw notFound('Invitation not found');
  }
  const group = await store.getGroup(invitation.groupId);
  if (!group || group.status !== 'active') throw notFound('Invitation not found');
  const owner = await store.getUser(group.ownerUserId);
  const memberCount = (await store.listMembershipsByGroup(group.groupId)).filter(
    (m) => m.status === 'active',
  ).length;
  return {
    groupId: group.groupId,
    groupName: group.name,
    ownerDisplayName: owner?.displayName ?? 'Owner',
    memberCount,
    expiresAt: invitation.expiresAt,
    privacyDisclosure:
      'Members of this group can see your goals and full daily check-off history in this group.',
  };
}

export async function acceptInvitation(
  store: Store,
  rawToken: string,
  user: User,
) {
  const invitation = await store.getInvitationByTokenHash(hashToken(rawToken));
  if (!invitation || invitation.revokedAt || invitation.expiresAt < new Date().toISOString()) {
    throw notFound('Invitation not found');
  }
  if (invitation.useCount >= invitation.maxUses) {
    throw conflict('Invitation has reached its maximum uses');
  }
  const group = await store.getGroup(invitation.groupId);
  if (!group || group.status !== 'active') throw notFound('Invitation not found');

  const existing = await store.getMembership(group.groupId, user.userId);
  if (existing?.status === 'active') {
    return { group, membership: existing, alreadyMember: true };
  }

  const activeCount = (await store.listMembershipsByUser(user.userId)).filter(
    (m) => m.status === 'active',
  ).length;
  if (activeCount >= MAX_MEMBERSHIPS) {
    throw badRequest(`Membership limit of ${MAX_MEMBERSHIPS} reached`);
  }

  const now = new Date().toISOString();
  const membership: Membership = {
    groupId: group.groupId,
    userId: user.userId,
    role: 'member',
    status: 'active',
    joinedAt: now,
    weeklyPointTarget: 1,
    targetEffectiveAt: now,
    dailyReminderEnabled: false,
    weeklyCheckInEnabled: false,
    weeklyCheckInDay: 'sunday',
    weeklyCheckInLocalTime: '18:00',
    timezone: user.timezone,
    lastUsedAt: now,
    version: 1,
  };
  await store.putMembership(membership);
  await store.putInvitation({
    ...invitation,
    useCount: invitation.useCount + 1,
  });
  return { group, membership, alreadyMember: false };
}

export async function revokeInvitation(
  store: Store,
  groupId: string,
  userId: string,
  invitationId: string,
) {
  await requireActiveMembership(store, groupId, userId);
  const invitation = await store.getInvitation(invitationId);
  if (!invitation || invitation.groupId !== groupId) {
    throw notFound('Invitation not found');
  }
  if (invitation.createdBy !== userId) {
    await requireOwner(store, groupId, userId);
  }
  await store.putInvitation({
    ...invitation,
    revokedAt: new Date().toISOString(),
  });
}
