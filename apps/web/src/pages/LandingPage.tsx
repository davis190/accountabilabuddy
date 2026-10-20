import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function LandingPage() {
  const { cognitoEnabled, signInWithGoogle, signInDev } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueWithGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
      setBusy(false);
    }
  }

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
        {cognitoEnabled ? (
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={() => void continueWithGoogle()}
          >
            {busy ? 'Redirecting…' : 'Continue with Google'}
          </button>
        ) : (
          <>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() => void continueDev()}
            >
              {busy ? 'Signing in…' : 'Continue (dev sign-in)'}
            </button>
            <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
              Cognito is not configured in this build. Deployed builds use Google sign-in.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
