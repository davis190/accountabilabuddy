import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { localToday } from '../lib/dates';

const EXAMPLES = [
  { name: 'Run', targetDaysPerWeek: 2, icon: 'run' },
  { name: 'Lift', targetDaysPerWeek: 2, icon: 'lift' },
  { name: 'Stretch 10+ minutes', targetDaysPerWeek: 3, icon: 'stretch' },
  { name: 'Vegetable-heavy lunch', targetDaysPerWeek: 4, icon: 'veggie' },
];

export function OnboardingPage() {
  const { user, refreshMe, setActiveGroupId } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [groupName, setGroupName] = useState('');
  const [token, setToken] = useState('');
  const [timezone, setTimezone] = useState(
    user?.timezone && user.timezone !== 'UTC'
      ? user.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [selected, setSelected] = useState<string[]>(['Run', 'Lift']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveProfile() {
    await api('/v1/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName, timezone }),
    });
  }

  async function createGroup() {
    setBusy(true);
    setError(null);
    try {
      await saveProfile();
      const created = await api<{ group: { groupId: string } }>('/v1/groups', {
        method: 'POST',
        body: JSON.stringify({ name: groupName }),
      });
      const groupId = created.group.groupId;
      let target = 0;
      for (const ex of EXAMPLES.filter((e) => selected.includes(e.name))) {
        await api(`/v1/groups/${groupId}/goals`, {
          method: 'POST',
          body: JSON.stringify({
            name: ex.name,
            targetDaysPerWeek: ex.targetDaysPerWeek,
            icon: ex.icon,
            activeFrom: localToday(timezone),
          }),
        });
        target += ex.targetDaysPerWeek;
      }
      await api(`/v1/groups/${groupId}/membership/me`, {
        method: 'PATCH',
        body: JSON.stringify({
          weeklyPointTarget: Math.max(1, target),
          timezone,
        }),
      });
      await refreshMe();
      setActiveGroupId(groupId);
      navigate('/app/today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create group');
    } finally {
      setBusy(false);
    }
  }

  async function joinGroup() {
    setBusy(true);
    setError(null);
    try {
      await saveProfile();
      const result = await api<{ group: { groupId: string } }>(
        `/v1/invitations/${encodeURIComponent(token.trim())}/accept`,
        { method: 'POST' },
      );
      await refreshMe();
      setActiveGroupId(result.group.groupId);
      navigate('/app/settings');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell stack-gap" style={{ paddingTop: '1.5rem' }}>
      <h1 className="section-title">Welcome</h1>
      <p className="muted">Confirm who you are, then create or join a group.</p>
      {error && <div className="error-banner">{error}</div>}

      <div className="panel form-stack">
        <label>
          Display name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label>
          Timezone
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </label>
      </div>

      {mode === 'choose' && (
        <div className="stack-gap">
          <button className="btn btn-primary" type="button" onClick={() => setMode('create')}>
            Create a group
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setMode('join')}>
            Join with invitation
          </button>
        </div>
      )}

      {mode === 'create' && (
        <div className="stack-gap">
          <div className="panel form-stack">
            <label>
              Group name
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Morning crew"
              />
            </label>
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Starter goals</legend>
              {EXAMPLES.map((ex) => (
                <label
                  key={ex.name}
                  style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 500 }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(ex.name)}
                    onChange={(e) => {
                      setSelected((prev) =>
                        e.target.checked
                          ? [...prev, ex.name]
                          : prev.filter((n) => n !== ex.name),
                      );
                    }}
                  />
                  {ex.name} · {ex.targetDaysPerWeek}x/week
                </label>
              ))}
            </fieldset>
          </div>
          <button
            className="btn btn-coral"
            type="button"
            disabled={busy || !groupName.trim()}
            onClick={createGroup}
          >
            {busy ? 'Creating…' : 'Create and go to Today'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setMode('choose')}>
            Back
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div className="stack-gap">
          <div className="panel form-stack">
            <p>
              Members of this group can see your goals and full daily check-off history in this
              group.
            </p>
            <label>
              Invitation token
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token from invite link"
              />
            </label>
          </div>
          <button
            className="btn btn-coral"
            type="button"
            disabled={busy || !token.trim()}
            onClick={joinGroup}
          >
            {busy ? 'Joining…' : 'Accept invitation'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setMode('choose')}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}
