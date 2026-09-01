import type { Share } from '@/api/types';
import { exportFileName, isLive } from '../share-state';

const NOW = new Date('2026-08-31T18:00:00Z');

function share(fields: Partial<Share> = {}): Share {
  return {
    id: 'a',
    label: null,
    expires_at: null,
    revoked_at: null,
    include_photos: true,
    view_count: 0,
    last_viewed_at: null,
    created_at: '2026-08-01T00:00:00Z',
    ...fields,
  };
}

describe('isLive', () => {
  it('keeps a link without an expiry', () => {
    expect(isLive(share(), NOW)).toBe(true);
  });

  it('drops a revoked link even if it has not expired', () => {
    expect(isLive(share({ revoked_at: '2026-08-30T10:00:00Z' }), NOW)).toBe(false);
  });

  it('drops a link whose expiry has passed', () => {
    expect(isLive(share({ expires_at: '2026-08-31T17:59:59Z' }), NOW)).toBe(false);
  });

  it('keeps a link that expires later today', () => {
    expect(isLive(share({ expires_at: '2026-08-31T23:00:00Z' }), NOW)).toBe(true);
  });
});

describe('exportFileName', () => {
  it('keeps a readable name', () => {
    expect(exportFileName('Thailand 2026', 'pdf')).toBe('Thailand 2026.pdf');
  });

  it('keeps letters other alphabets use', () => {
    expect(exportFileName('Zürich – Süden', 'gpx')).toBe('Zürich _ Süden.gpx');
  });

  it('strips what a filesystem would choke on', () => {
    expect(exportFileName('A/B:C*?"<>|', 'json')).toBe('A_B_C______.json');
  });

  it('falls back rather than producing a nameless file', () => {
    expect(exportFileName('///', 'pdf')).toBe('reise.pdf');
  });
});
