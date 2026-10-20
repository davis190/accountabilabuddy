import type { Group, Membership } from '@accountabilabuddy/shared';
import { forbidden, notFound } from '../errors.js';
import type { Store } from '../store/types.js';

export async function requireActiveMembership(
  store: Store,
  groupId: string,
  userId: string,
): Promise<{ group: Group; membership: Membership }> {
  const group = await store.getGroup(groupId);
  if (!group || group.status !== 'active') {
    throw notFound('Group not found');
  }
  const membership = await store.getMembership(groupId, userId);
  if (!membership || membership.status !== 'active') {
    throw forbidden('Not a member of this group');
  }
  return { group, membership };
}

export async function requireOwner(
  store: Store,
  groupId: string,
  userId: string,
): Promise<{ group: Group; membership: Membership }> {
  const result = await requireActiveMembership(store, groupId, userId);
  if (result.membership.role !== 'owner') {
    throw forbidden('Owner role required');
  }
  return result;
}
