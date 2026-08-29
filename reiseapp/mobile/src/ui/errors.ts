import { ApiError, NetworkError } from '@/api/client';

/** Turns anything thrown by the API layer into something worth showing a human. */
export function describeError(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Server nicht erreichbar. Läuft das Backend, und stimmt die API-URL?';
  }
  if (error instanceof ApiError) {
    switch (error.type) {
      case 'unauthenticated':
        return 'E-Mail oder Passwort stimmt nicht.';
      case 'registration_closed':
        return 'Registrierung nur mit gültigem Einladungscode.';
      case 'conflict':
        return error.message;
      default:
        return error.message;
    }
  }
  return 'Unerwarteter Fehler.';
}
