/**
 * DynamoDB store adapter (production).
 *
 * Tables and GSIs are defined in infra/template.yaml matching the access patterns
 * in spec §12. Wire this store when TABLE_PREFIX / table name env vars are set.
 *
 * MVP local/dev uses MemoryStore. Deployments should replace createStore() to return
 * DynamoDbStore once AWS credentials and tables are available.
 */
import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  completionSortKey,
  groupUserKey,
  groupUserWeekKey,
  groupWeekKey,
  weekStartDate,
  type Completion,
  type Goal,
  type Group,
  type Invitation,
  type Membership,
  type NotificationDelivery,
  type User,
  type Weekday,
  type WeeklySnapshot,
} from '@accountabilabuddy/shared';
import type { Store } from './types.js';

export interface DynamoTableNames {
  users: string;
  groups: string;
  memberships: string;
  goals: string;
  completions: string;
  weeklySnapshots: string;
  invitations: string;
  notificationDeliveries: string;
}

export function tablesFromEnv(env: NodeJS.ProcessEnv = process.env): DynamoTableNames {
  return {
    users: env.USERS_TABLE ?? `${env.TABLE_PREFIX}-users`,
    groups: env.GROUPS_TABLE ?? `${env.TABLE_PREFIX}-groups`,
    memberships: env.MEMBERSHIPS_TABLE ?? `${env.TABLE_PREFIX}-memberships`,
    goals: env.GOALS_TABLE ?? `${env.TABLE_PREFIX}-goals`,
    completions: env.COMPLETIONS_TABLE ?? `${env.TABLE_PREFIX}-completions`,
    weeklySnapshots: env.WEEKLY_SNAPSHOTS_TABLE ?? `${env.TABLE_PREFIX}-weekly-snapshots`,
    invitations: env.INVITATIONS_TABLE ?? `${env.TABLE_PREFIX}-invitations`,
    notificationDeliveries:
      env.NOTIFICATION_DELIVERIES_TABLE ?? `${env.TABLE_PREFIX}-notification-deliveries`,
  };
}

export class DynamoDbStore implements Store {
  private doc: DynamoDBDocumentClient;

  constructor(
    private tables: DynamoTableNames,
    client = new DynamoDBClient({}),
  ) {
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async getUser(userId: string): Promise<User | null> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.tables.users, Key: { userId } }),
    );
    return (res.Item as User) ?? null;
  }

  async putUser(user: User): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.tables.users, Item: user }));
  }

  async deleteUser(userId: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({ TableName: this.tables.users, Key: { userId } }),
    );
  }

  async getGroup(groupId: string): Promise<Group | null> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.tables.groups, Key: { groupId } }),
    );
    return (res.Item as Group) ?? null;
  }

  async putGroup(group: Group): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.tables.groups, Item: group }));
  }

  async deleteGroup(groupId: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({ TableName: this.tables.groups, Key: { groupId } }),
    );
  }

  async getMembership(groupId: string, userId: string): Promise<Membership | null> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.tables.memberships, Key: { groupId, userId } }),
    );
    return (res.Item as Membership) ?? null;
  }

  async putMembership(membership: Membership): Promise<void> {
    await this.doc.send(
      new PutCommand({ TableName: this.tables.memberships, Item: membership }),
    );
  }

  async listMembershipsByUser(userId: string): Promise<Membership[]> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.tables.memberships,
        IndexName: 'MembershipsByUser',
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
      }),
    );
    return (res.Items as Membership[]) ?? [];
  }

  async listMembershipsByGroup(groupId: string): Promise<Membership[]> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.tables.memberships,
        KeyConditionExpression: 'groupId = :g',
        ExpressionAttributeValues: { ':g': groupId },
      }),
    );
    return (res.Items as Membership[]) ?? [];
  }

  async getGoal(groupId: string, userId: string, goalId: string): Promise<Goal | null> {
    const res = await this.doc.send(
      new GetCommand({
        TableName: this.tables.goals,
        Key: { groupUserKey: groupUserKey(groupId, userId), goalId },
      }),
    );
    return (res.Item as Goal) ?? null;
  }

  async putGoal(goal: Goal): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tables.goals,
        Item: { ...goal, groupUserKey: groupUserKey(goal.groupId, goal.userId) },
      }),
    );
  }

  async deleteGoal(groupId: string, userId: string, goalId: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tables.goals,
        Key: { groupUserKey: groupUserKey(groupId, userId), goalId },
      }),
    );
  }

  async listGoals(groupId: string, userId: string): Promise<Goal[]> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.tables.goals,
        KeyConditionExpression: 'groupUserKey = :k',
        ExpressionAttributeValues: { ':k': groupUserKey(groupId, userId) },
      }),
    );
    return ((res.Items as Goal[]) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getCompletion(
    groupId: string,
    userId: string,
    weekStartDateValue: string,
    localDate: string,
    goalId: string,
  ): Promise<Completion | null> {
    const res = await this.doc.send(
      new GetCommand({
        TableName: this.tables.completions,
        Key: {
          groupUserWeek: groupUserWeekKey(groupId, userId, weekStartDateValue),
          localDateGoalId: completionSortKey(localDate, goalId),
        },
      }),
    );
    return (res.Item as Completion) ?? null;
  }

  async putCompletion(
    completion: Completion,
  ): Promise<{ created: boolean; completion: Completion }> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tables.completions,
          Item: {
            ...completion,
            groupUserWeek: groupUserWeekKey(
              completion.groupId,
              completion.userId,
              completion.weekStartDate,
            ),
            localDateGoalId: completionSortKey(completion.localDate, completion.goalId),
            groupUserGoal: `${completion.groupId}#${completion.userId}#${completion.goalId}`,
          },
          ConditionExpression:
            'attribute_not_exists(groupUserWeek) AND attribute_not_exists(localDateGoalId)',
        }),
      );
      return { created: true, completion };
    } catch (e) {
      const name = (e as { name?: string }).name;
      if (name === 'ConditionalCheckFailedException') {
        const existing = await this.getCompletion(
          completion.groupId,
          completion.userId,
          completion.weekStartDate,
          completion.localDate,
          completion.goalId,
        );
        return { created: false, completion: existing ?? completion };
      }
      throw e;
    }
  }

  async deleteCompletion(
    groupId: string,
    userId: string,
    weekStartDateValue: string,
    localDate: string,
    goalId: string,
  ): Promise<boolean> {
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tables.completions,
        Key: {
          groupUserWeek: groupUserWeekKey(groupId, userId, weekStartDateValue),
          localDateGoalId: completionSortKey(localDate, goalId),
        },
      }),
    );
    return true;
  }

  async listCompletionsForWeek(
    groupId: string,
    userId: string,
    weekStartDateValue: string,
  ): Promise<Completion[]> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.tables.completions,
        KeyConditionExpression: 'groupUserWeek = :k',
        ExpressionAttributeValues: {
          ':k': groupUserWeekKey(groupId, userId, weekStartDateValue),
        },
      }),
    );
    return (res.Items as Completion[]) ?? [];
  }

  async listCompletionsInRange(
    groupId: string,
    userId: string,
    from: string,
    to: string,
    weekStartsOn: Weekday,
  ): Promise<Completion[]> {
    const weeks = new Set<string>();
    let cursor = from;
    while (cursor <= to) {
      weeks.add(weekStartDate(cursor, weekStartsOn));
      const [y, m, d] = cursor.split('-').map(Number);
      cursor = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
    }
    const all: Completion[] = [];
    for (const week of weeks) {
      const rows = await this.listCompletionsForWeek(groupId, userId, week);
      all.push(...rows.filter((c) => c.localDate >= from && c.localDate <= to));
    }
    return all.sort(
      (a, b) => a.localDate.localeCompare(b.localDate) || a.goalId.localeCompare(b.goalId),
    );
  }

  async getWeeklySnapshot(
    groupId: string,
    weekStartDateValue: string,
    userId: string,
  ): Promise<WeeklySnapshot | null> {
    const res = await this.doc.send(
      new GetCommand({
        TableName: this.tables.weeklySnapshots,
        Key: { groupWeek: groupWeekKey(groupId, weekStartDateValue), userId },
      }),
    );
    return (res.Item as WeeklySnapshot) ?? null;
  }

  async putWeeklySnapshot(snapshot: WeeklySnapshot): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tables.weeklySnapshots,
        Item: {
          ...snapshot,
          groupWeek: groupWeekKey(snapshot.groupId, snapshot.weekStartDate),
        },
      }),
    );
  }

  async getInvitation(invitationId: string): Promise<Invitation | null> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.tables.invitations, Key: { invitationId } }),
    );
    return (res.Item as Invitation) ?? null;
  }

  async getInvitationByTokenHash(tokenHash: string): Promise<Invitation | null> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.tables.invitations,
        IndexName: 'InvitationsByTokenHash',
        KeyConditionExpression: 'tokenHash = :t',
        ExpressionAttributeValues: { ':t': tokenHash },
        Limit: 1,
      }),
    );
    return ((res.Items as Invitation[]) ?? [])[0] ?? null;
  }

  async putInvitation(invitation: Invitation): Promise<void> {
    await this.doc.send(
      new PutCommand({ TableName: this.tables.invitations, Item: invitation }),
    );
  }

  async putNotificationDelivery(
    delivery: NotificationDelivery,
  ): Promise<{ created: boolean }> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tables.notificationDeliveries,
          Item: delivery,
          ConditionExpression: 'attribute_not_exists(deliveryKey)',
        }),
      );
      return { created: true };
    } catch (e) {
      if ((e as { name?: string }).name === 'ConditionalCheckFailedException') {
        return { created: false };
      }
      throw e;
    }
  }
}
