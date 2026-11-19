/** Routes: #/  ·  #/play/<id>[?seed=N]  ·  #/privacy  ·  #/deck  ·  #/join/<CODE>  ·  #/classes/new  ·  #/class/<CODE>?key=<KEY> */
export function parseHash(hash: string): { page: 'home' | 'play' | 'privacy' | 'deck' | 'join' | 'newclass' | 'class'; id?: string; seed: number | null; key?: string } {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const seedMatch = /(?:^|&)seed=(\d+)/.exec(query);
  const seed = seedMatch ? Number(seedMatch[1]) : null;
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'privacy') return { page: 'privacy', seed };
  if (parts[0] === 'deck') return { page: 'deck', seed };
  if (parts[0] === 'join' && parts[1]) return { page: 'join', id: parts[1].toUpperCase(), seed };
  if (parts[0] === 'classes' && parts[1] === 'new') return { page: 'newclass', seed };
  if (parts[0] === 'class' && parts[1]) {
    const k = /(?:^|&)key=([A-Za-z0-9]+)/.exec(query);
    return { page: 'class', id: parts[1].toUpperCase(), seed, key: k ? k[1] : undefined };
  }
  if (parts[0] === 'play' && parts[1]) return { page: 'play', id: parts[1], seed };
  return { page: 'home', seed };
}
