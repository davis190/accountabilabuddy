import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { localToday } from '../lib/dates';

interface Goal {
  goalId: string;
  name: string;
  targetDaysPerWeek: number;
  archivedAt?: string;
}

export function SettingsPage() {
  const { activeGroupId, memberships, user, refreshMe, signOut, setActiveGroupId } = useAuth();
  const groupId = activeGroupId ?? memberships[0]?.groupId;
  const navigate = useNavigate();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [recommended, setRecommended] = useState(1);
  const [target, setTarget] = useState(1);
  const [newGoal, setNewGoal] = useState({ name: '', targetDaysPerWeek: 2 });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [dailyEnabled, setDailyEnabled] = useState(false);
  const [dailyTime, setDailyTime] = useState('20:00');
  const [weeklyEnabled, setWeeklyEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);

  async function reload() {
    if (!groupId) return;
    const goalsRes = await api<{ goals: Goal[]; recommendedWeeklyTarget: number }>(
      `/v1/groups/${groupId}/goals/me`,
    );
    setGoals(goalsRes.goals.filter((g) => !g.archivedAt));
    setRecommended(goalsRes.recommendedWeeklyTarget);
    const detail = await api<{
      roster: Array<{ userId: string; weeklyPointTarget: number }>;
      group: { groupId: string };
    }>(`/v1/groups/${groupId}`);
    const me = detail.roster.find((r) => r.userId === user?.userId);
    if (me) setTarget(me.weeklyPointTarget);
  }

  useEffect(() => {
    reload().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, user?.userId]);

  if (!groupId) return null;

  async function addGoal() {
    setError(null);
    try {
      await api(`/v1/groups/${groupId}/goals`, {
        method: 'POST',
        body: JSON.stringify({
          ...newGoal,
          activeFrom: localToday(user?.timezone),
        }),
      });
      setNewGoal({ name: '', targetDaysPerWeek: 2 });
      await reload();
      await refreshMe();
      setMessage('Goal added — it will show on Today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add goal');
    }
  }

  async function saveGoal(goal: Goal) {
    setError(null);
    setSavingGoalId(goal.goalId);
    try {
      await api(`/v1/groups/${groupId}/goals/${goal.goalId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: goal.name.trim(),
          targetDaysPerWeek: goal.targetDaysPerWeek,
        }),
      });
      await reload();
      await refreshMe();
      setMessage('Goal updated — check Today for the change');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update goal');
    } finally {
      setSavingGoalId(null);
    }
  }

  async function removeGoal(goal: Goal) {
    if (!confirm(`Remove “${goal.name}”? Past check-offs stay in history.`)) return;
    setError(null);
    setSavingGoalId(goal.goalId);
    try {
      await api(`/v1/groups/${groupId}/goals/${goal.goalId}`, { method: 'DELETE' });
      await reload();
      await refreshMe();
      setMessage('Goal removed from Today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove goal');
    } finally {
      setSavingGoalId(null);
    }
  }

  async function saveTarget() {
    await api(`/v1/groups/${groupId}/membership/me`, {
      method: 'PATCH',
      body: JSON.stringify({ weeklyPointTarget: target }),
    });
    await refreshMe();
    setMessage('Weekly target saved — Today will show the new number');
  }

  async function saveReminders() {
    await api(`/v1/groups/${groupId}/membership/me`, {
      method: 'PATCH',
      body: JSON.stringify({
        dailyReminderEnabled: dailyEnabled,
        dailyReminderLocalTime: dailyTime,
        weeklyCheckInEnabled: weeklyEnabled,
        weeklyCheckInDay: 'sunday',
        weeklyCheckInLocalTime: '18:00',
      }),
    });
    setMessage('Reminder preferences saved');
  }

  async function createInvite() {
    const res = await api<{ url: string }>(`/v1/groups/${groupId}/invitations`, {
      method: 'POST',
      body: '{}',
    });
    setInviteUrl(res.url);
  }

  async function leave() {
    if (!confirm('Leave this group? You will lose access to its history.')) return;
    await api(`/v1/groups/${groupId}/members/me`, { method: 'DELETE' });
    await refreshMe();
    const remaining = memberships.filter((m) => m.groupId !== groupId);
    if (remaining[0]) setActiveGroupId(remaining[0].groupId);
    navigate(remaining.length ? '/app/today' : '/onboarding');
  }

  return (
    <div className="stack-gap">
      <h2 className="section-title">Settings</h2>
      {error && <div className="error-banner">{error}</div>}
      {message && <p className="pill">{message}</p>}

      <section className="panel stack-gap">
        <h3 style={{ margin: 0 }}>Your goals</h3>
        <p className="muted" style={{ margin: 0 }}>
          Frequency is a planning target — extra days still earn points. Edits apply on Today
          right away.
        </p>
        {goals.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No goals yet — add one below.
          </p>
        ) : (
          <div className="stack-gap">
            {goals.map((g) => (
              <div key={g.goalId} className="form-stack" style={{ gap: '0.5rem' }}>
                <label>
                  Name
                  <input
                    value={g.name}
                    maxLength={60}
                    onChange={(e) =>
                      setGoals((list) =>
                        list.map((x) =>
                          x.goalId === g.goalId ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Days / week
                  <input
                    type="number"
                    min={1}
                    max={7}
                    value={g.targetDaysPerWeek}
                    onChange={(e) =>
                      setGoals((list) =>
                        list.map((x) =>
                          x.goalId === g.goalId
                            ? { ...x, targetDaysPerWeek: Number(e.target.value) }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={savingGoalId === g.goalId || !g.name.trim()}
                    onClick={() => void saveGoal(g)}
                  >
                    {savingGoalId === g.goalId ? 'Saving…' : 'Save goal'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={savingGoalId === g.goalId}
                    onClick={() => void removeGoal(g)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="form-stack">
          <label>
            New goal
            <input
              value={newGoal.name}
              onChange={(e) => setNewGoal((g) => ({ ...g, name: e.target.value }))}
              maxLength={60}
            />
          </label>
          <label>
            Days / week
            <input
              type="number"
              min={1}
              max={7}
              value={newGoal.targetDaysPerWeek}
              onChange={(e) =>
                setNewGoal((g) => ({ ...g, targetDaysPerWeek: Number(e.target.value) }))
              }
            />
          </label>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!newGoal.name.trim()}
            onClick={() => void addGoal()}
          >
            Add goal
          </button>
        </div>
      </section>

      <section className="panel form-stack">
        <h3 style={{ margin: 0 }}>Weekly point target</h3>
        <p className="muted" style={{ margin: 0 }}>
          Suggested from your goals: {recommended}
        </p>
        <label>
          Target (1–100)
          <input
            type="number"
            min={1}
            max={100}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          />
        </label>
        <button className="btn btn-secondary" type="button" onClick={() => void saveTarget()}>
          Save target
        </button>
      </section>

      <section className="panel form-stack">
        <h3 style={{ margin: 0 }}>Reminders</h3>
        <p className="muted" style={{ margin: 0 }}>
          Optional email nudges for this group only. Off until you opt in.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={dailyEnabled}
            onChange={(e) => setDailyEnabled(e.target.checked)}
          />
          Daily reminder
        </label>
        <label>
          Daily time
          <input type="time" value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={weeklyEnabled}
            onChange={(e) => setWeeklyEnabled(e.target.checked)}
          />
          Weekly check-in (Sunday evening)
        </label>
        <button className="btn btn-secondary" type="button" onClick={() => void saveReminders()}>
          Save reminders
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() =>
            void api(`/v1/groups/${groupId}/notifications/test`, { method: 'POST' })
              .then(() => setMessage('Test email queued (check API logs in dev)'))
              .catch((e) => setError(e instanceof Error ? e.message : 'Test failed'))
          }
        >
          Send test notification
        </button>
      </section>

      <section className="panel stack-gap">
        <h3 style={{ margin: 0 }}>Invite</h3>
        <p className="muted" style={{ margin: 0 }}>
          Before someone joins, they see that members can view full daily history in this group.
        </p>
        <button className="btn btn-primary" type="button" onClick={() => void createInvite()}>
          Create invitation link
        </button>
        {inviteUrl && (
          <p style={{ wordBreak: 'break-all', margin: 0 }}>
            <code>{inviteUrl}</code>
          </p>
        )}
      </section>

      <section className="panel stack-gap">
        <h3 style={{ margin: 0 }}>Privacy</h3>
        <p className="muted" style={{ margin: 0 }}>
          Members of <strong>this</strong> group can see your goals and full daily check-off history
          here. Nothing from other groups is shared.
        </p>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/onboarding')}>
          Create or join another group
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => void leave()}>
          Leave this group
        </button>
        <button className="btn btn-secondary" type="button" onClick={signOut}>
          Sign out
        </button>
      </section>
    </div>
  );
}
