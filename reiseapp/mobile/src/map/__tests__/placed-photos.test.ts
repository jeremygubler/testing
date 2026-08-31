import type { Photo } from '@/api/types';
import { placedPhotos } from '../photo-pins';

function photo(fields: Partial<Photo>): Photo {
  return {
    id: 'p',
    trip_id: 't',
    stop_id: null,
    taken_at: null,
    lat: null,
    lon: null,
    altitude_m: null,
    position_source: 'none',
    width: null,
    height: null,
    byte_size: 1,
    content_type: 'image/jpeg',
    original_filename: null,
    caption: null,
    has_thumbnail: true,
    created_at: '2026-08-31T18:00:00Z',
    ...fields,
  };
}

describe('placedPhotos', () => {
  it('keeps a photo that knows where it was taken', () => {
    expect(placedPhotos([photo({ lat: 47.24, lon: 7.97 })])).toHaveLength(1);
  });

  it('drops a photo without a position rather than drawing it at null island', () => {
    expect(placedPhotos([photo({})])).toHaveLength(0);
  });

  it('treats a coordinate of zero as a real place, not as missing', () => {
    // 0/0 is in the Gulf of Guinea, but a falsy check would also throw away
    // Greenwich, the equator and everything on them.
    expect(placedPhotos([photo({ lat: 0, lon: 0 })])).toHaveLength(1);
  });

  it('drops a half-positioned photo', () => {
    expect(placedPhotos([photo({ lat: 47.24, lon: null })])).toHaveLength(0);
  });
});
