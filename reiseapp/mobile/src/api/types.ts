export type MemberRole = 'owner' | 'editor' | 'viewer';
export type TripVisibility = 'private' | 'link' | 'public';

export interface User {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: string;
}

export interface Trip {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  cover_photo_id: string | null;
  start_date: string | null;
  end_date: string | null;
  visibility: TripVisibility;
  role: MemberRole;
  created_at: string;
  updated_at: string;
}

export interface TripMember {
  user_id: string;
  email: string;
  display_name: string;
  role: MemberRole;
}

export interface ApiErrorBody {
  error: {
    code: number;
    type: string;
    message: string;
    details?: unknown;
  };
}

export interface Stop {
  id: string;
  trip_id: string;
  name: string;
  lat: number;
  lon: number;
  altitude_m: number | null;
  arrived_at: string | null;
  left_at: string | null;
  country: string | null;
  locality: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** [west, south, east, north] – the order MapLibre's fitBounds expects. */
export type Bounds = [number, number, number, number];

export interface Route {
  type: 'LineString';
  /** GeoJSON order: [longitude, latitude]. */
  coordinates: [number, number][];
  point_count: number;
  distance_m: number;
  bounds: Bounds | null;
}

export interface WaypointInput {
  id?: string;
  lat: number;
  lon: number;
  altitude_m?: number | null;
  accuracy_m?: number | null;
  speed_mps?: number | null;
  heading_deg?: number | null;
  recorded_at: string;
  source?: 'gps' | 'import' | 'manual';
  device_id?: string | null;
}

export interface WaypointBatchResult {
  received: number;
  stored: number;
  duplicates: number;
}

export type PositionSource = 'exif' | 'interpolated' | 'manual' | 'none';

export interface Photo {
  id: string;
  trip_id: string;
  stop_id: string | null;
  taken_at: string | null;
  lat: number | null;
  lon: number | null;
  altitude_m: number | null;
  position_source: PositionSource;
  width: number | null;
  height: number | null;
  byte_size: number | null;
  content_type: string;
  original_filename: string | null;
  caption: string | null;
  has_thumbnail: boolean;
  created_at: string;
}

export interface PhotoUploadResult {
  photo: Photo;
  duplicate: boolean;
}

export interface JournalEntry {
  id: string;
  trip_id: string;
  stop_id: string | null;
  author_id: string | null;
  title: string | null;
  text: string;
  timestamp: string;
  photos: Photo[];
  created_at: string;
  updated_at: string;
}

export type TimelineKind = 'stop' | 'journal' | 'photos';

export interface TimelineItem {
  kind: TimelineKind;
  at: string;
  stop: Stop | null;
  entry: JournalEntry | null;
  photos: Photo[];
}

export interface Timeline {
  items: TimelineItem[];
}
