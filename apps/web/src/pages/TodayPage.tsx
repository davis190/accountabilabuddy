import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { addDays, dayNum, localToday, shortDow, weekStartMonday } from '../lib/dates';

interface DayGoal {
  goalId: string;
  name: string;
  icon?: string;
  checked: boolean;
  completedDaysThisWeek: number;
  targetDaysPerWeek: number;
}

interface DayPayload {
  localDate: string;
  weekStartDate: string;
  pointsEarned: number;
  weeklyPointTarget: number;
  progressPercent: number;
  goals: DayGoal[];
}

export function TodayPage() {
  const { activeGroupId, user, memberships, refreshMe } = useAuth();
  const location = useLocation();
  const groupId = activeGroupId ?? memberships[0]?.groupId;
  const liveTarget = memberships.find((m) => m.groupId === groupId)?.weeklyPointTarget;
  const [date, setDate] = useState(() => localToday(user?.timezone));
  const [day, setDay] = useState<DayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const weekDates = useMemo(() => {
    const start = weekStartMonday(date);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [date]);

  const load = useCallback(async () => {
    if (!groupId) return;
    setError(null);
    try {
      const today = localToday(user?.timezone);
      // Jump to today when the stored day is in another week (stale tab / overnight).
      const viewDate =
        weekStartMonday(date) === weekStartMonday(today) ? date : today;
      if (viewDate !== date) setDate(viewDate);
      const data = await api<DayPayload>(`/v1/groups/${groupId}/days/${viewDate}/me`);
      // Prefer the live membership target from /v1/me so Settings changes show immediately.
      const target = liveTarget ?? data.weeklyPointTarget;
      setDay({
        ...data,
        weeklyPointTarget: target,
        progressPercent: Math.round((data.pointsEarned / Math.max(1, target)) * 1000) / 10,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load today');
    }
  }, [groupId, date, user?.timezone, liveTarget]);

  useEffect(() => {
    void refreshMe().catch(() => undefined);
  }, [location.key, refreshMe]);

  useEffect(() => {
    void load();
  }, [load, location.key]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshMe().catch(() => undefined);
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load, refreshMe]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function toggle(goal: DayGoal) {
    if (!groupId || pending) return;
    const previous = day;
    setPending(goal.goalId);
    setDay((cur) => {
      if (!cur) return cur;
      const nextGoals = cur.goals.map((g) =>
        g.goalId === goal.goalId
          ? {
              ...g,
              checked: !g.checked,
              completedDaysThisWeek: g.checked
                ? Math.max(0, g.completedDaysThisWeek - 1)
                : g.completedDaysThisWeek + 1,
            }
          : g,
      );
      const delta = goal.checked ? -1 : 1;
      const pointsEarned = cur.pointsEarned + delta;
      return {
        ...cur,
        goals: nextGoals,
        pointsEarned,
        progressPercent: Math.round((pointsEarned / cur.weeklyPointTarget) * 1000) / 10,
      };
    });

    try {
      if (goal.checked) {
        const res = await api<{
          week: { pointsEarned: number; weeklyPointTarget: number; progressPercent: number };
          goalProgress?: { completedDays: number; targetDays: number };
        }>(`/v1/groups/${groupId}/completions/${date}/${goal.goalId}`, {
          method: 'DELETE',
        });
        setDay((cur) =>
          cur
            ? {
                ...cur,
                pointsEarned: res.week.pointsEarned,
                weeklyPointTarget: res.week.weeklyPointTarget,
                progressPercent: res.week.progressPercent,
                goals: cur.goals.map((g) =>
                  g.goalId === goal.goalId
                    ? {
                        ...g,
                        checked: false,
                        completedDaysThisWeek: res.goalProgress?.completedDays ?? g.completedDaysThisWeek,
                      }
                    : g,
                ),
              }
            : cur,
        );
        setToast('Unchecked · Undo by tapping again');
      } else {
        const res = await api<{
          week: { pointsEarned: number; weeklyPointTarget: number; progressPercent: number };
          goalProgress: { completedDays: number; targetDays: number };
        }>(`/v1/groups/${groupId}/completions/${date}/${goal.goalId}`, { method: 'PUT' });
        setDay((cur) =>
          cur
            ? {
                ...cur,
                pointsEarned: res.week.pointsEarned,
                weeklyPointTarget: res.week.weeklyPointTarget,
                progressPercent: res.week.progressPercent,
                goals: cur.goals.map((g) =>
                  g.goalId === goal.goalId
                    ? {
                        ...g,
                        checked: true,
                        completedDaysThisWeek: res.goalProgress.completedDays,
                      }
                    : g,
                ),
              }
            : cur,
        );
      }
    } catch (e) {
      setDay(previous);
      setError(e instanceof Error ? e.message : 'Not saved');
    } finally {
      setPending(null);
    }
  }

  if (!groupId) {
    return (
      <div className="empty">
        <p>No group yet.</p>
        <Link to="/onboarding">Create or join</Link>
      </div>
    );
  }

  const displayTarget = liveTarget ?? day?.weeklyPointTarget ?? 1;
  const displayPercent = day
    ? Math.round((day.pointsEarned / Math.max(1, displayTarget)) * 1000) / 10
    : 0;
  const over = displayPercent > 100;

  return (
    <div className="stack-gap">
      <div>
        <p className="muted" style={{ margin: 0 }}>
          {date}
        </p>
        <h2 className="section-title">Today</h2>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {day && (
        <div className="panel">
          <div className="progress-row">
            <strong>
              {day.pointsEarned} / {displayTarget} points this week
            </strong>
            <span className="muted">{displayPercent}%</span>
          </div>
          <div className="progress-track" aria-hidden>
            <div
              className={`progress-fill${over ? ' over' : ''}`}
              style={{ width: `${Math.min(displayPercent, 140)}%` }}
            />
          </div>
        </div>
      )}

      <div className="week-strip" role="group" aria-label="Choose day this week">
        {weekDates.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === date}
            aria-label={d}
            onClick={() => setDate(d)}
          >
            <span className="dow">{shortDow(d)}</span>
            <span className="dom">{dayNum(d)}</span>
          </button>
        ))}
      </div>

      {!day?.goals.length ? (
        <div className="empty panel">
          <p>No active goals for this day.</p>
          <Link className="btn btn-secondary" to="/app/settings">
            Add a goal
          </Link>
        </div>
      ) : (
        <div className="goal-list">
          {day.goals.map((g) => (
            <button
              key={g.goalId}
              type="button"
              className={`goal-row${g.checked ? ' checked' : ''}`}
              aria-pressed={g.checked}
              disabled={pending === g.goalId}
              onClick={() => void toggle(g)}
            >
              <span className="check" aria-hidden>
                {g.checked ? '✓' : ''}
              </span>
              <span>
                <strong>{g.name}</strong>
                <div className="goal-meta">
                  {g.name} · {g.completedDaysThisWeek}/{g.targetDaysPerWeek} this week
                  {g.checked ? ' · done' : ' · not yet'}
                </div>
              </span>
              <span aria-hidden>{g.icon ? '◎' : ''}</span>
            </button>
          ))}
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
