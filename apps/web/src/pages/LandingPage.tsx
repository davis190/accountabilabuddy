import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function LandingPage() {
  const { signInDev } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueDev() {
    setBusy(true);
    setError(null);
    try {
      await signInDev('Dev User');
      navigate('/app');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero-landing app-shell">
      <p className="pill">Habits · not calories</p>
      <h1 className="hero-brand">Accountabilabuddy</h1>
      <p className="hero-copy">
        Check off the good stuff with your people. One point per goal per day — extras still count.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <div style={{ display: 'grid', gap: '0.65rem', maxWidth: 320 }}>
        <button className="btn btn-primary" type="button" disabled={busy} onClick={continueDev}>
          {busy ? 'Signing in…' : 'Continue (dev sign-in)'}
        </button>
        <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
          Production uses Google via Cognito. Local/dev mode signs you in without OAuth.
        </p>
      </div>
    </div>
  );
}
