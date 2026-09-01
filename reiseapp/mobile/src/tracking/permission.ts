export type PermissionOutcome = 'granted' | 'foreground-only' | 'denied';

export type StartPlan =
  | { start: true; background: boolean }
  | { start: false; reason: 'needs-permission' | 'app-not-foreground' };

/**
 * Why starting the recording is two steps on Android, not one.
 *
 * Since Android 11 the "always" location permission cannot be granted from an
 * in-app dialog at all — the system sends the user to the app's settings page,
 * which puts our app in the background. Since Android 12 an app in the
 * background may not start a foreground service. Asking for "always" and
 * starting the service in the same handler therefore lands the start in exactly
 * the moment the OS forbids it: the user sees the app disappear and nothing is
 * ever recorded.
 *
 * So: ask for the foreground permission (a real dialog, app stays in front),
 * start there, and treat "always" as a separate, explicit upgrade the user can
 * make later — after which we resume on the way back into the app.
 */
export function planStart(permission: PermissionOutcome, appState: string): StartPlan {
  if (permission === 'denied') return { start: false, reason: 'needs-permission' };
  if (appState !== 'active') return { start: false, reason: 'app-not-foreground' };
  return { start: true, background: permission === 'granted' };
}
