import { request } from './client';
import type { Trip, TripMember, TripVisibility, WorldOverview } from './types';

export async function listTrips(): Promise<Trip[]> {
  return request<Trip[]>('/trips');
}

export async function getTrip(id: string): Promise<Trip> {
  return request<Trip>(`/trips/${id}`);
}

export async function createTrip(input: {
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  visibility?: TripVisibility;
}): Promise<Trip> {
  return request<Trip>('/trips', {
    method: 'POST',
    body: {
      title: input.title,
      description: input.description || null,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      visibility: input.visibility ?? 'private',
    },
  });
}

/** Soft delete on the server: the rows stay, the trip stops being listed. */
export async function deleteTrip(id: string): Promise<void> {
  await request<void>(`/trips/${id}`, { method: 'DELETE' });
}

export async function listMembers(tripId: string): Promise<TripMember[]> {
  return request<TripMember[]>(`/trips/${tripId}/members`);
}

export async function getWorldOverview(): Promise<WorldOverview> {
  return request<WorldOverview>('/trips/overview');
}
