interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'ab.install.dismissed';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

// Chromium fires this once, possibly before React mounts, so capture it at module load.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === 'accepted';
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports a desktop Mac user agent, so detect it by touch support.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function isInstallHintDismissed(): boolean {
  return localStorage.getItem(DISMISSED_KEY) === '1';
}

export function dismissInstallHint(): void {
  localStorage.setItem(DISMISSED_KEY, '1');
}
