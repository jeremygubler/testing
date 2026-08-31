import { request } from './client';
import type { Route, Stop, TripStats, WaypointBatchResult, WaypointInput } from './types';

export async function getRoute(tripId: string, simplifyM = 0): Promise<Route> {
  const query = simplifyM > 0 ? `?simplify_m=${simplifyM}` : '';
  return request<Route>(`/trips/${tripId}/route${query}`);
}

export async function getStats(tripId: string): Promise<TripStats> {
  return request<TripStats>(`/trips/${tripId}/stats`);
}

export async function listStops(tripId: string): Promise<Stop[]> {
  return request<Stop[]>(`/trips/${tripId}/stops`);
}

export async function createStop(
  tripId: string,
  input: { name: string; lat: number; lon: number; notes?: string; arrivedAt?: string },
): Promise<Stop> {
  return request<Stop>(`/trips/${tripId}/stops`, {
    method: 'POST',
    body: {
      name: input.name,
      lat: input.lat,
      lon: input.lon,
      notes: input.notes || null,
      arrived_at: input.arrivedAt ?? new Date().toISOString(),
    },
  });
}

export async function deleteStop(tripId: string, stopId: string): Promise<void> {
  await request<void>(`/trips/${tripId}/stops/${stopId}`, { method: 'DELETE' });
}

/** Throws away the recorded track and keeps the trip, its stops and its photos. */
export async function clearTrack(tripId: string): Promise<{ removed: number }> {
  return request<{ removed: number }>(`/trips/${tripId}/waypoints`, { method: 'DELETE' });
}

/** Batch upload. The backend deduplicates on id, so retrying a batch is safe. */
export async function uploadWaypoints(
  tripId: string,
  waypoints: WaypointInput[],
): Promise<WaypointBatchResult> {
  return request<WaypointBatchResult>(`/trips/${tripId}/waypoints`, {
    method: 'POST',
    body: { waypoints },
  });
}
