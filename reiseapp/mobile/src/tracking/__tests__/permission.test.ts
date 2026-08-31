import { planStart } from '../permission';

describe('planStart', () => {
  it('starts with full permission while the app is in front', () => {
    expect(planStart('granted', 'active')).toEqual({ start: true, background: true });
  });

  it('starts with foreground-only permission, knowing the trail will break', () => {
    // Recording while the app is open is worth having; refusing to start at all
    // would punish the user for a permission Android hides three menus deep.
    expect(planStart('foreground-only', 'active')).toEqual({ start: true, background: false });
  });

  it('never starts from the background, whatever the permission', () => {
    // Android 12+ throws ForegroundServiceStartNotAllowedException here, and the
    // settings page the "always" prompt opens is exactly this situation.
    for (const permission of ['granted', 'foreground-only'] as const) {
      expect(planStart(permission, 'background')).toEqual({
        start: false,
        reason: 'app-not-foreground',
      });
      expect(planStart(permission, 'inactive')).toEqual({
        start: false,
        reason: 'app-not-foreground',
      });
    }
  });

  it('asks for permission before worrying about the app state', () => {
    expect(planStart('denied', 'active')).toEqual({ start: false, reason: 'needs-permission' });
    expect(planStart('denied', 'background')).toEqual({ start: false, reason: 'needs-permission' });
  });
});
