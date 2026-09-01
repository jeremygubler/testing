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

export type PositionSource = 'exif' | 'interpolated' | 'manual' | 'stop' | 'none';

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
  /** Calendar day (YYYY-MM-DD) and 1-based day of the journey, both from the server. */
  date: string;
  day: number;
  stop: Stop | null;
  entry: JournalEntry | null;
  photos: Photo[];
}

export interface Timeline {
  items: TimelineItem[];
}

export interface TripStats {
  distance_m: number;
  walking_m: number;
  cycling_m: number;
  vehicle_m: number;
  unknown_m: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  moving_seconds: number;
  tracked_seconds: number;
  first_point_at: string | null;
  last_point_at: string | null;
  waypoint_count: number;
  stop_count: number;
  photo_count: number;
  journal_entry_count: number;
  countries: string[];
}

export interface TripOverview {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  role: MemberRole;
  countries: string[];
  point_count: number;
  distance_m: number;
  /** [lon, lat] pairs, already simplified for a world-scale view. */
  coordinates: [number, number][];
  bounds: Bounds | null;
}

export interface WorldOverview {
  trips: TripOverview[];
  countries: string[];
  total_distance_m: number;
}

export interface Share {
  id: string;
  label: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  include_photos: boolean;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
}

export interface ShareCreated extends Share {
  /** Returned exactly once – the server keeps only a hash of it. */
  token: string;
  url_path: string;
}
