/** Routes: #/  ·  #/play/<id>[?seed=N]  ·  #/privacy  ·  #/deck */
export function parseHash(hash: string): { page: 'home' | 'play' | 'privacy' | 'deck'; id?: string; seed: number | null } {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const seedMatch = /(?:^|&)seed=(\d+)/.exec(query);
  const seed = seedMatch ? Number(seedMatch[1]) : null;
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'privacy') return { page: 'privacy', seed };
  if (parts[0] === 'deck') return { page: 'deck', seed };
  if (parts[0] === 'play' && parts[1]) return { page: 'play', id: parts[1], seed };
  return { page: 'home', seed };
}
