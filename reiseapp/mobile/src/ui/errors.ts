import { ApiError, NetworkError } from '@/api/client';

/**
 * A failed fetch is not proof that the server is down.
 *
 * The request can die before it leaves the phone — an unreadable file handed to
 * a multipart upload throws exactly like an unreachable host, and the old
 * message then sent people to check a backend that was answering every other
 * request perfectly. So the underlying reason is shown when there is one.
 */
function describeNetworkError(error: NetworkError): string {
  const cause = error.cause;
  const detail = cause instanceof Error ? cause.message.trim() : '';
  if (!detail || /network request failed/i.test(detail)) {
    return 'Server nicht erreichbar. Läuft das Backend, und stimmt die API-URL?';
  }
  return `Anfrage fehlgeschlagen: ${detail}`;
}

/** Turns anything thrown by the API layer into something worth showing a human. */
export function describeError(error: unknown): string {
  if (error instanceof NetworkError) {
    return describeNetworkError(error);
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
