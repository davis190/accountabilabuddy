import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { addDays, formatRange, localToday, weekStartMonday } from '../lib/dates';

interface MemberRow {
  userId: string;
  displayName: string;
  pointsEarned: number;
  weeklyPointTarget: number;
  progressPercent: number;
  position: number;
  tied: boolean;
  statusLabel: string;
  awayDates?: string[];
  goalProgress: Array<{
    goalId: string;
    name: string;
    completedDays: number;
    targetDays: number;
  }>;
}

interface WeekPayload {
  weekStartDate: string;
  disclaimer: string;
  members: MemberRow[];
}

export function WeekPage() {
  const { activeGroupId, memberships, user } = useAuth();
  const groupId = activeGroupId ?? memberships[0]?.groupId;
  const [weekStart, setWeekStart] = useState(() => weekStartMonday(localToday(user?.timezone)));
  const [data, setData] = useState<WeekPayload | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    setError(null);
    api<WeekPayload>(`/v1/groups/${groupId}/weeks/${weekStart}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load week'));
  }, [groupId, weekStart]);

  if (!groupId) return null;

  return (
    <div className="stack-gap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="section-title">Week</h2>
          <p className="muted" style={{ margin: 0 }}>
            {formatRange(weekStart)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            className="btn btn-secondary"
            type="button"
            style={{ minHeight: 40, padding: '0.4rem 0.8rem' }}
            onClick={() => setWeekStart(addDays(weekStart, -7))}
          >
            Prev
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            style={{ minHeight: 40, padding: '0.4rem 0.8rem' }}
            onClick={() => setWeekStart(weekStartMonday(localToday(user?.timezone)))}
          >
            Now
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {data && (
        <>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            {data.disclaimer}
          </p>
          <div className="panel">
            {data.members.map((m) => {
              const label = m.tied
                ? `${ordinal(m.position)} (tied)`
                : ordinal(m.position);
              return (
                <div key={m.userId} className="member-row">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <strong>{m.displayName}</strong>
                    <span className="pill">{label}</span>
                  </div>
                  <div className="muted">
                    {m.pointsEarned} / {m.weeklyPointTarget} pts · {m.progressPercent}% ·{' '}
                    {m.statusLabel}
                    {m.awayDates && m.awayDates.length > 0
                      ? ` · ${m.awayDates.length} Away`
                      : ''}
                  </div>
                  <div className="progress-track" aria-hidden>
                    <div
                      className={`progress-fill${m.progressPercent > 100 ? ' over' : ''}`}
                      style={{ width: `${Math.min(m.progressPercent, 140)}%` }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ minHeight: 36, padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                      onClick={() =>
                        setExpanded((id) => (id === m.userId ? null : m.userId))
                      }
                    >
                      {expanded === m.userId ? 'Hide goals' : 'Goals'}
                    </button>
                    <Link
                      to={`/app/history?member=${m.userId}`}
                      className="btn btn-secondary"
                      style={{ minHeight: 36, padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                    >
                      Full history
                    </Link>
                  </div>
                  {expanded === m.userId && (
                    <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
                      {m.goalProgress.map((g) => (
                        <li key={g.goalId}>
                          {g.name} · {g.completedDays}/{g.targetDays}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
