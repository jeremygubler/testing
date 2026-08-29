export interface BufferedWaypoint {
  id: string;
  tripId: string;
  lat: number;
  lon: number;
  altitudeM: number | null;
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  recordedAt: string;
  deviceId: string | null;
}

export interface QueueStats {
  pending: number;
  oldestRecordedAt: string | null;
}
