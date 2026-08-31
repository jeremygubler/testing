import { ApiError, NetworkError } from '@/api/client';
import { describeError } from '../errors';

describe('describeError', () => {
  it('blames the backend only when the cause says nothing else', () => {
    expect(describeError(new NetworkError(new Error('Network request failed')))).toContain(
      'Server nicht erreichbar',
    );
    expect(describeError(new NetworkError(undefined))).toContain('Server nicht erreichbar');
  });

  it('shows a cause that points somewhere else entirely', () => {
    // A multipart upload of a file the runtime cannot open throws here too, and
    // sending the user to check a healthy backend wastes their evening.
    const message = describeError(
      new NetworkError(new Error('Could not retrieve file for uri content://media/42')),
    );
    expect(message).toContain('content://media/42');
    expect(message).not.toContain('Server nicht erreichbar');
  });

  it('passes an API error through with the server-supplied text', () => {
    expect(describeError(new ApiError(409, 'conflict', 'Foto existiert bereits'))).toBe(
      'Foto existiert bereits',
    );
  });
});
