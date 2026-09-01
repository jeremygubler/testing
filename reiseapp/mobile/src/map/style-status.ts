import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a style may take before we stop believing it is on its way. */
export const STYLE_TIMEOUT_MS = 12_000;

export type StyleStatus = 'loading' | 'loaded' | 'failed';

export function styleHost(url: string): string {
  const match = /^[a-z]+:\/\/([^/]+)/i.exec(url);
  return match?.[1] ?? url;
}

/**
 * Whether the map style actually arrived.
 *
 * A style URL that never answers leaves MapLibre rendering a plain black
 * rectangle and reporting nothing — the map looks broken in a way that gives the
 * user no idea whether the problem is the network, the server or the app. The
 * timeout is what makes the silent case visible: onDidFailLoadingMap fires for a
 * refused connection but not for one that simply hangs.
 */
export function useStyleStatus(): {
  status: StyleStatus;
  onDidFinishLoadingStyle: () => void;
  onDidFailLoadingMap: () => void;
} {
  const [status, setStatus] = useState<StyleStatus>('loading');
  const settled = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!settled.current) setStatus('failed');
    }, STYLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const onDidFinishLoadingStyle = useCallback(() => {
    settled.current = true;
    setStatus('loaded');
  }, []);

  const onDidFailLoadingMap = useCallback(() => {
    settled.current = true;
    setStatus('failed');
  }, []);

  return { status, onDidFinishLoadingStyle, onDidFailLoadingMap };
}
