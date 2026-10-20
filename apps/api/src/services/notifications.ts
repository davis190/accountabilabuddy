import {
  deliveryKey,
  todayInTimezone,
  weekStartDate,
  type NotificationDelivery,
} from '@accountabilabuddy/shared';
import type { AppConfig } from '../config.js';
import { badRequest, forbidden } from '../errors.js';
import type { Store } from '../store/types.js';
import { requireActiveMembership } from './authz.js';
import { getWeekComparison } from './completions.js';

export async function sendTestNotification(
  store: Store,
  config: AppConfig,
  groupId: string,
  userId: string,
) {
  const { group, membership } = await requireActiveMembership(store, groupId, userId);
  if (!membership.dailyReminderEnabled && !membership.weeklyCheckInEnabled) {
    throw badRequest('Enable a reminder before sending a test');
  }
  const user = await store.getUser(userId);
  if (!user?.email) throw badRequest('No email on account');

  const subject = `Accountabilabuddy test · ${group.name}`;
  const body = `This is a test reminder for ${group.name}. Open ${config.appOrigin}/g/${groupId}/today`;
  await deliverEmail(config, user.email, subject, body);
  return { sent: true, channel: 'email' as const };
}

export async function processDailyReminders(store: Store, config: AppConfig, now = new Date()) {
  // MVP dispatcher: iterate memberships (memory/local). Production uses EventBridge per-membership schedules.
  const sent: string[] = [];
  // Access memory store memberships via list - for DynamoDB production this is invoked per schedule
  const all = await listAllActiveMemberships(store);
  for (const m of all) {
    if (!m.dailyReminderEnabled || !m.dailyReminderLocalTime) continue;
    const localToday = todayInTimezone(m.timezone, now);
    const occurrence = `${localToday}T${m.dailyReminderLocalTime}`;
    const key = deliveryKey(m.groupId, m.userId, 'daily', occurrence);
    const lock: NotificationDelivery = {
      deliveryKey: key,
      attempt: 1,
      status: 'pending',
      scheduledFor: occurrence,
      createdAt: now.toISOString(),
      ttl: Math.floor(now.getTime() / 1000) + 90 * 24 * 60 * 60,
    };
    const { created } = await store.putNotificationDelivery(lock);
    if (!created) continue;

    const group = await store.getGroup(m.groupId);
    const user = await store.getUser(m.userId);
    if (!group || group.status !== 'active' || !user?.email) continue;

    const day = await import('./completions.js').then((mod) =>
      mod.getMyDay(store, m.groupId, m.userId, localToday),
    );
    const unchecked = day.goals.filter((g) => !g.checked).length;
    const subject = `Daily nudge · ${group.name}`;
    const text = unchecked
      ? `You have ${unchecked} goal${unchecked === 1 ? '' : 's'} left today in ${group.name}. ${config.appOrigin}/g/${m.groupId}/today`
      : `Nice work — today's goals in ${group.name} look complete. ${config.appOrigin}/g/${m.groupId}/today`;
    await deliverEmail(config, user.email, subject, text);
    await store.putNotificationDelivery({
      ...lock,
      status: 'sent',
      sentAt: new Date().toISOString(),
    });
    sent.push(key);
  }
  return { sent: sent.length };
}

export async function processWeeklyCheckIns(store: Store, config: AppConfig, now = new Date()) {
  const sent: string[] = [];
  const all = await listAllActiveMemberships(store);
  for (const m of all) {
    if (!m.weeklyCheckInEnabled) continue;
    const localToday = todayInTimezone(m.timezone, now);
    const group = await store.getGroup(m.groupId);
    if (!group || group.status !== 'active') continue;
    const weekStart = weekStartDate(localToday, group.weekStartsOn);
    const occurrence = `${weekStart}#weekly`;
    const key = deliveryKey(m.groupId, m.userId, 'weekly', occurrence);
    const lock: NotificationDelivery = {
      deliveryKey: key,
      attempt: 1,
      status: 'pending',
      scheduledFor: occurrence,
      createdAt: now.toISOString(),
    };
    const { created } = await store.putNotificationDelivery(lock);
    if (!created) continue;

    const user = await store.getUser(m.userId);
    if (!user?.email) continue;

    const comparison = await getWeekComparison(store, m.groupId, m.userId, weekStart);
    const me = comparison.members.find((x) => x.userId === m.userId);
    const overTarget = me?.goalProgress.filter((g) => g.completedDays > g.targetDays).length ?? 0;
    const position = me
      ? me.tied
        ? `${me.position} (tied)`
        : String(me.position)
      : '—';
    const subject = `Weekly check-in · ${group.name}`;
    const text = [
      `This week in ${group.name}: ${me?.pointsEarned ?? 0} / ${me?.weeklyPointTarget ?? m.weeklyPointTarget} points.`,
      overTarget ? `${overTarget} goal${overTarget === 1 ? '' : 's'} above target frequency.` : null,
      `Friendly standing: ${position}.`,
      `${config.appOrigin}/g/${m.groupId}/week`,
    ]
      .filter(Boolean)
      .join(' ');
    await deliverEmail(config, user.email, subject, text);
    await store.putNotificationDelivery({
      ...lock,
      status: 'sent',
      sentAt: new Date().toISOString(),
    });
    sent.push(key);
  }
  return { sent: sent.length };
}

async function listAllActiveMemberships(store: Store) {
  // Memory store exposes memberships map; DynamoDB path uses EventBridge per schedule.
  const maybe = store as { memberships?: Map<string, import('@accountabilabuddy/shared').Membership> };
  if (maybe.memberships) {
    return [...maybe.memberships.values()].filter((m) => m.status === 'active');
  }
  return [];
}

async function deliverEmail(
  config: AppConfig,
  to: string,
  subject: string,
  text: string,
): Promise<void> {
  if (!config.sesFromEmail) {
    console.info('[email:dev]', { to, subject, text });
    return;
  }
  const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
  const client = new SESClient({ region: config.awsRegion });
  await client.send(
    new SendEmailCommand({
      Source: config.sesFromEmail,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject },
        Body: {
          Text: {
            Data: `${text}\n\nManage reminders: ${config.appOrigin}/settings`,
          },
        },
      },
    }),
  );
}

export function assertInternalCaller(header: string | undefined, expected?: string) {
  if (!expected) return;
  if (header !== expected) throw forbidden('Internal only');
}
