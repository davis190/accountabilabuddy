import { useState, useSyncExternalStore } from 'react';
import {
  canPromptInstall,
  dismissInstallHint,
  isInstallHintDismissed,
  isIos,
  isStandalone,
  promptInstall,
  subscribeInstall,
} from '../lib/install';

export function InstallHint() {
  const canPrompt = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const [dismissed, setDismissed] = useState(isInstallHintDismissed);

  if (dismissed || isStandalone()) return null;
  const ios = isIos();
  if (!canPrompt && !ios) return null;

  function dismiss() {
    dismissInstallHint();
    setDismissed(true);
  }

  return (
    <aside className="install-hint panel" aria-label="Install app">
      <div>
        <strong>Add Buddy to your home screen</strong>
        <p className="muted">
          {ios ? (
            <>
              Tap <ShareGlyph /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
            </>
          ) : (
            'Open it like an app, full screen, in one tap.'
          )}
        </p>
      </div>
      <div className="install-hint-actions">
        {canPrompt && (
          <button className="btn btn-primary" type="button" onClick={() => void promptInstall()}>
            Install
          </button>
        )}
        <button className="install-hint-close" type="button" onClick={dismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    </aside>
  );
}

function ShareGlyph() {
  return (
    <svg
      className="share-glyph"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
