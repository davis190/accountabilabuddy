import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

interface Preview {
  groupName: string;
  ownerDisplayName: string;
  memberCount: number;
  expiresAt: string;
  privacyDisclosure: string;
}

export function JoinPage() {
  const { token = '' } = useParams();
  const { user, signInDev, refreshMe, setActiveGroupId } = useAuth();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Preview>(`/v1/invitations/${encodeURIComponent(token)}/preview`)
      .then(setPreview)
      .catch((e) => setError(e instanceof Error ? e.message : 'Invitation not found'));
  }, [token]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      if (!user) await signInDev('Guest Buddy');
      const result = await api<{ group: { groupId: string } }>(
        `/v1/invitations/${encodeURIComponent(token)}/accept`,
        { method: 'POST' },
      );
      await refreshMe();
      setActiveGroupId(result.group.groupId);
      navigate('/app/settings');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell stack-gap" style={{ paddingTop: '2rem' }}>
      <h1 className="hero-brand" style={{ fontSize: '2rem' }}>
        Accountabilabuddy
      </h1>
      {error && <div className="error-banner">{error}</div>}
      {preview && (
        <div className="panel stack-gap">
          <h2 className="section-title" style={{ margin: 0 }}>
            Join {preview.groupName}
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Owned by {preview.ownerDisplayName} · {preview.memberCount} member
            {preview.memberCount === 1 ? '' : 's'}
          </p>
          <p>
            <strong>{preview.privacyDisclosure}</strong>
          </p>
          <button className="btn btn-coral" type="button" disabled={busy} onClick={() => void accept()}>
            {busy ? 'Joining…' : user ? 'Accept invitation' : 'Sign in and accept'}
          </button>
          <Link to="/">Cancel</Link>
        </div>
      )}
    </div>
  );
}
