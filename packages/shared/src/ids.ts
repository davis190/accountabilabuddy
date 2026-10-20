import { randomBytes, createHash } from 'node:crypto';

export function createId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

export function createInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function groupUserKey(groupId: string, userId: string): string {
  return `${groupId}#${userId}`;
}

export function groupUserWeekKey(
  groupId: string,
  userId: string,
  weekStartDate: string,
): string {
  return `${groupId}#${userId}#${weekStartDate}`;
}

export function completionSortKey(localDate: string, goalId: string): string {
  return `${localDate}#${goalId}`;
}

export function groupWeekKey(groupId: string, weekStartDate: string): string {
  return `${groupId}#${weekStartDate}`;
}

export function deliveryKey(
  groupId: string,
  userId: string,
  type: 'daily' | 'weekly',
  scheduledOccurrence: string,
): string {
  return `${groupId}#${userId}#${type}#${scheduledOccurrence}`;
}
