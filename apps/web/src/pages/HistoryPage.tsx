import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { addDays, localToday } from '../lib/dates';

interface RosterMember {
  userId: string;
  displayName: string;
  status: string;
}

interface HistoryDay {
  localDate: string;
  away?: boolean;
  completions: Array<{ goalId: string; name: string }>;
}

export function HistoryPage() {
  const { activeGroupId, memberships, user } = useAuth();
  const groupId = activeGroupId ?? memberships[0]?.groupId;
  const [params] = useSearchParams();
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [memberId, setMemberId] = useState(params.get('member') ?? user?.userId ?? '');
  const [days, setDays] = useState<HistoryDay[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const to = localToday(user?.timezone);
    const from = addDays(to, -27);
    return { from, to };
  }, [user?.timezone]);

  const calendar = useMemo(() => {
    const cells: string[] = [];
    let cursor = range.from;
    while (cursor <= range.to) {
      cells.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return cells;
  }, [range]);

  useEffect(() => {
    if (!groupId) return;
    api<{ roster: RosterMember[] }>(`/v1/groups/${groupId}`)
      .then((d) => {
        const active = d.roster.filter((m) => m.status === 'active');
        setRoster(active);
        if (!memberId && active[0]) setMemberId(active[0].userId);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load roster'));
  }, [groupId, memberId]);

  useEffect(() => {
    if (!groupId || !memberId) return;
    setError(null);
    api<{ days: HistoryDay[] }>(
      `/v1/groups/${groupId}/members/${memberId}/history?from=${range.from}&to=${range.to}`,
    )
      .then((d) => setDays(d.days))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load history'));
  }, [groupId, memberId, range.from, range.to]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of days) map.set(d.localDate, d.completions.length);
    return map;
  }, [days]);

  const awayDays = useMemo(() => {
    const set = new Set<string>();
    for (const d of days) if (d.away) set.add(d.localDate);
    return set;
  }, [days]);

  const detail = days.find((d) => d.localDate === selected);

  if (!groupId) return null;

  return (
    <div className="stack-gap">
      <h2 className="section-title">History</h2>
      <p className="muted" style={{ margin: 0 }}>
        Full daily check-offs in this group. Viewing others is read-only.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <label className="panel form-stack">
        Member
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {roster.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
      </label>

      <div className="panel">
        <div className="heat-grid" role="grid" aria-label="Activity calendar">
          {calendar.map((d) => {
            const n = counts.get(d) ?? 0;
            const level = n === 0 ? 0 : Math.min(4, n);
            const away = awayDays.has(d);
            return (
              <button
                key={d}
                type="button"
                className={`heat-cell level-${level}${selected === d ? ' selected' : ''}${away ? ' away' : ''}`}
                aria-label={
                  away ? `${d}: Away` : `${d}: ${n} completions`
                }
                onClick={() => setSelected(d)}
              />
            );
          })}
        </div>
        <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 0 }}>
          Last 28 days · darker means more goals checked · outlined = Away
        </p>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>{selected ?? 'Pick a day'}</h3>
        {!selected && <p className="muted">Select a day on the calendar.</p>}
        {selected && detail?.away && (
          <p className="muted">Away — no check-offs this day.</p>
        )}
        {selected && !detail && <p className="muted">No completions logged.</p>}
        {selected && detail && !detail.away && detail.completions.length === 0 && (
          <p className="muted">No completions logged.</p>
        )}
        {detail && detail.completions.length > 0 && (
          <ul>
            {detail.completions.map((c) => (
              <li key={c.goalId}>{c.name}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>List</h3>
        {days.length === 0 ? (
          <p className="muted">No history in this range yet.</p>
        ) : (
          <ul>
            {days.map((d) => (
              <li key={d.localDate}>
                <button
                  type="button"
                  onClick={() => setSelected(d.localDate)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    fontWeight: 600,
                    textDecoration: 'underline',
                  }}
                >
                  {d.localDate}
                </button>
                :{' '}
                {d.away
                  ? 'Away'
                  : d.completions.map((c) => c.name).join(', ') || '—'}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
