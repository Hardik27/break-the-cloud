/** Today's incident: the same game for everyone on a given day. */
import { builtGames } from '../games/registry';
import { today } from '../lib/storage';

export function dailyGameId(day = today()): string {
  const games = builtGames();
  let h = 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return games[h % games.length].id;
}
