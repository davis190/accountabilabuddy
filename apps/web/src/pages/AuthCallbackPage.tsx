import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { exchangeCodeForTokens } from '../lib/cognito';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { completeOAuthSignIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const oauthError = params.get('error_description') || params.get('error');

    if (oauthError) {
      setError(oauthError);
      return;
    }
    if (!code || !state) {
      setError('Missing authorization code');
      return;
    }

    void (async () => {
      try {
        const tokens = await exchangeCodeForTokens(code, state);
        await completeOAuthSignIn(tokens.accessToken);
        const next = sessionStorage.getItem('ab.postLoginPath') || '/app';
        sessionStorage.removeItem('ab.postLoginPath');
        navigate(next, { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Sign-in failed');
      }
    })();
  }, [completeOAuthSignIn, navigate]);

  return (
    <div className="app-shell stack-gap" style={{ paddingTop: '3rem' }}>
      <h1 className="section-title">Signing you in…</h1>
      {error ? (
        <>
          <div className="error-banner">{error}</div>
          <a className="btn btn-secondary" href="/">
            Back to sign in
          </a>
        </>
      ) : (
        <p className="muted">Finishing Google sign-in with Accountabilabuddy.</p>
      )}
    </div>
  );
}
