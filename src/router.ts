import { useEffect, useState } from 'react';

export interface Route {
  path: string[];
  params: URLSearchParams;
  raw: string;
}

function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [p, q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean), params: new URLSearchParams(q), raw };
}

export function useRoute(): Route {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return parseHash(hash);
}

export function navigate(to: string) {
  location.hash = to.startsWith('#') ? to : `#${to}`;
}
