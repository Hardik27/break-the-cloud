/** Supabase backend for the leaderboard. Loaded only when the Supabase env vars are set. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { checkNickname } from './nickname';
import type { Backend, ClassReport, CompAdmin, CompMe, CompRow, JoinTarget, LbRow, Range } from './leaderboard';

const CLIENT_VERSION = 'web-1';
const weekAgo = () => new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

/** Server messages (raise exception …) → what we tell the player. */
function explain(msg: string | undefined, fallback: string): string {
  const m = msg ?? '';
  if (/nickname/i.test(m)) return 'Pick a nickname first.';
  if (/wrong competition code/i.test(m)) return 'That join code is not right for this competition. Check it with the organiser.';
  if (/has ended/i.test(m)) return 'This competition has ended.';
  if (/wrong class code/i.test(m)) return 'No class with that code. Check it with your instructor.';
  if (/do not match/i.test(m)) return 'The nickname and claim code do not match.';
  if (/organiser key/i.test(m)) return 'Wrong competition link or organiser key.';
  if (/join the competition first/i.test(m)) return 'Join the competition first.';
  return fallback;
}

export function supabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  let session: Promise<string | null> | null = null;
  let authError = '';

  /** Anonymous sign-in: no email, no password. The session lives in localStorage (disclosed on the privacy page). */
  function userId(): Promise<string | null> {
    if (session) return session;
    session = (async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) return data.session.user.id;
      const { data: d, error } = await sb.auth.signInAnonymously();
      if (error || !d.user) {
        authError = error?.message ?? '';
        session = null; // try again next time (e.g. after the setting is switched on)
        return null;
      }
      return d.user.id;
    })().catch(() => {
      session = null;
      return null;
    });
    return session;
  }

  return {
    kind: 'supabase',
    async startRun(gameId, classCode) {
      if (!(await userId())) return null;
      const row: { game_id: string; client_version: string; class_code?: string } = { game_id: gameId, client_version: CLIENT_VERSION };
      if (classCode) row.class_code = classCode;
      let { data, error } = await sb.from('runs').insert(row).select('id').single();
      // A class that no longer exists must not stop the learner from playing.
      if (error && classCode) ({ data, error } = await sb.from('runs').insert({ game_id: gameId, client_version: CLIENT_VERSION }).select('id').single());
      return error || !data ? null : (data.id as string);
    },
    async createClass(name, city, course) {
      if (!(await userId()))
        return {
          ok: false,
          reason: /anonymous/i.test(authError)
            ? 'Anonymous sign-ins are switched off in Supabase. Turn them on: Authentication → Sign In / Providers → Allow anonymous sign-ins.'
            : 'Could not reach the server. Try again.',
        };
      const { data, error } = await sb.rpc('create_class', { p_name: name, p_city: city, p_course: course || null });
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) return { ok: false, reason: error?.message?.includes('too many') ? 'Too many classes created today. Try tomorrow.' : 'Could not create the class. Check the name (3–80 characters) and city.' };
      return { ok: true, code: row.code as string, key: row.admin_key as string };
    },
    async classInfo(code) {
      const { data, error } = await sb.rpc('class_info', { p_code: code });
      const row = Array.isArray(data) ? data[0] : null;
      return error || !row ? null : { code: row.code, name: row.name, city: row.city, course: row.course };
    },
    async classReport(code, key) {
      const { data, error } = await sb.rpc('class_report', { p_code: code, p_key: key });
      if (error || !data) return { ok: false, reason: error?.message?.includes('wrong') ? 'Wrong class code or instructor key.' : 'Could not load the report.' };
      return { ok: true, report: data as ClassReport };
    },
    async finishRun(runId, payload) {
      if (!(await userId())) return { ok: false, reason: 'not signed in' };
      const { data, error } = await sb.functions.invoke('finish-run', { body: { runId, ...payload } });
      if (error) {
        let reason = 'could not reach the leaderboard';
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.reason) reason = body.reason;
        } catch {
          /* ignore */
        }
        return { ok: false, reason };
      }
      return { ok: !!data?.ok, points: data?.points, stars: data?.stars, reason: data?.reason };
    },
    async top(gameId, range: Range, classCode) {
      await userId();
      const { data, error } = await sb.rpc('leaderboard', { p_game: gameId, p_since: range === 'week' ? weekAgo() : null, p_limit: 20, p_class: range === 'class' ? classCode ?? null : null });
      if (error || !data) return null;
      return (data as { rank: number; nickname: string; points: number; ms: number; stars: number; is_me: boolean }[]).map(
        (r): LbRow => ({ rank: Number(r.rank), nickname: r.nickname, points: r.points, ms: r.ms, stars: r.stars, me: r.is_me }),
      );
    },
    async myRank(gameId, range: Range, classCode) {
      if (!(await userId())) return null;
      const { data, error } = await sb.rpc('my_rank', { p_game: gameId, p_since: range === 'week' ? weekAgo() : null, p_class: range === 'class' ? classCode ?? null : null });
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) return null;
      return { rank: Number(row.rank), points: row.points, of: Number(row.total) };
    },
    async nickname() {
      const uid = await userId();
      if (!uid) return null;
      const { data } = await sb.from('profiles').select('nickname').eq('user_id', uid).maybeSingle();
      return (data?.nickname as string | undefined) ?? null;
    },
    async setNickname(n) {
      const c = checkNickname(n);
      if (!c.ok) return { ok: false, reason: c.reason };
      const uid = await userId();
      if (!uid) return { ok: false, reason: 'The shared leaderboard is not available right now.' };
      const { error } = await sb.from('profiles').upsert({ user_id: uid, nickname: c.value }, { onConflict: 'user_id' });
      if (!error) return { ok: true };
      if (error.code === '23505') return { ok: false, reason: 'That nickname is taken.' };
      if (error.code === '23514') return { ok: false, reason: 'Please pick a different nickname.' };
      return { ok: false, reason: 'Could not save the nickname. Try again.' };
    },
    async stats() {
      const { data, error } = await sb.rpc('play_counts');
      if (error || !Array.isArray(data)) return null;
      return data.reduce((a, r) => ({ started: a.started + Number(r.started), finished: a.finished + Number(r.finished) }), { started: 0, finished: 0 });
    },
    async createCompetition(id, name, starts, ends) {
      if (!(await userId())) return { ok: false, reason: 'Could not reach the server. Try again.' };
      const { data, error } = await sb.rpc('create_competition', { p_id: id, p_name: name, p_starts: starts, p_ends: ends });
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) return { ok: false, reason: error?.message?.includes('taken') ? 'That competition link is taken.' : error?.message?.includes('too many') ? 'Too many competitions created today.' : 'Could not create the competition. Check the name, link and dates.' };
      return { ok: true, key: row.admin_key as string, joinCode: row.join_code as string };
    },
    async joinCompetition(id, code) {
      if (!(await userId())) return { ok: false, reason: 'Could not reach the server. Try again.' };
      const { data, error } = await sb.rpc('join_competition', { p_comp: id, p_code: code });
      if (error || typeof data !== 'string') return { ok: false, reason: explain(error?.message, 'Could not join. Try again.') };
      return { ok: true, claim: data };
    },
    async competitionNewClaim(id) {
      if (!(await userId())) return null;
      const { data, error } = await sb.rpc('competition_new_claim', { p_comp: id });
      return error || typeof data !== 'string' ? null : data;
    },
    async classJoin(code) {
      if (!(await userId())) return { ok: false, reason: 'Could not reach the server. Try again.' };
      const { data, error } = await sb.rpc('join_class', { p_code: code });
      if (error || typeof data !== 'string') return { ok: false, reason: explain(error?.message, 'Could not join the class. Try again.') };
      return { ok: true, claim: data };
    },
    async findJoinCode(code) {
      const { data, error } = await sb.rpc('find_join_code', { p_code: code });
      const row = Array.isArray(data) ? data[0] : null;
      return error || !row ? null : (row as JoinTarget);
    },
    async restoreProgress(kind, id, nickname, code) {
      if (!(await userId())) return { ok: false, reason: 'Could not reach the server. Try again.' };
      const { data, error } = await sb.rpc('restore_progress', { p_kind: kind, p_id: id, p_nickname: nickname, p_code: code });
      if (error || typeof data !== 'string') return { ok: false, reason: explain(error?.message, 'Could not restore. Try again.') };
      return { ok: true, nickname: data };
    },
    async disqualify(id, key, nickname, reason) {
      const { data, error } = await sb.rpc('competition_disqualify', { p_comp: id, p_key: key, p_nickname: nickname, p_reason: reason });
      if (error || !data) return { ok: false, reason: explain(error?.message, 'Could not disqualify. Try again.') };
      return data.ok ? { ok: true } : { ok: false, reason: 'No member with that nickname.' };
    },
    async reinstate(id, key, nickname) {
      const { data, error } = await sb.rpc('competition_reinstate', { p_comp: id, p_key: key, p_nickname: nickname });
      if (error || !data) return { ok: false, reason: explain(error?.message, 'Could not reinstate. Try again.') };
      return data.ok ? { ok: true } : { ok: false, reason: 'No member with that nickname.' };
    },
    async logEvents(rows) {
      if (!rows.length || !(await userId())) return;
      await sb.from('events').insert(rows);
    },
    async competitionInfo(id) {
      const { data, error } = await sb.rpc('competition_info', { p_comp: id });
      const row = Array.isArray(data) ? data[0] : null;
      return error || !row ? null : row;
    },
    async activeCompetitions() {
      const { data, error } = await sb.rpc('active_competitions');
      return error || !Array.isArray(data) ? [] : data;
    },
    async competitionBoard(id, level) {
      await userId();
      const { data, error } = await sb.rpc('competition_board', { p_comp: id, p_level: level, p_limit: 50 });
      if (error || !Array.isArray(data)) return null;
      return data.map((r): CompRow => ({ rank: Number(r.rank), nickname: r.nickname, points: r.points, games: r.games, stars: r.stars, reached_at: r.reached_at, me: r.is_me }));
    },
    async competitionMe(id) {
      if (!(await userId())) return null;
      const { data, error } = await sb.rpc('competition_me', { p_comp: id });
      return error || !data ? null : (data as CompMe);
    },
    async competitionAdmin(id, key) {
      const { data, error } = await sb.rpc('competition_admin', { p_comp: id, p_key: key, p_top: 20 });
      if (error || !data) return { ok: false, reason: error?.message?.includes('wrong') ? 'Wrong competition link or organiser key.' : 'Could not load the standings.' };
      return { ok: true, data: data as CompAdmin };
    },
    async verifyClaim(id, key, nickname, code) {
      const { data, error } = await sb.rpc('verify_claim', { p_comp: id, p_key: key, p_nickname: nickname, p_code: code });
      if (error || !data) return { ok: false, reason: error?.message?.includes('wrong') ? 'Wrong competition link or organiser key.' : 'Could not check the claim.' };
      return { ok: true, ...(data as { valid: boolean; reason?: string; rank?: number; points?: number }) };
    },
    async deleteMyData() {
      const uid = await userId();
      if (!uid) return true;
      // One call removes runs, nickname, class and competition memberships and learning activity.
      const { data, error } = await sb.rpc('delete_my_data');
      let ok = !error && data === true;
      if (error) {
        // Older database without the function: remove what the client may delete itself.
        const r1 = await sb.from('runs').delete().eq('user_id', uid);
        const r2 = await sb.from('profiles').delete().eq('user_id', uid);
        ok = !r1.error && !r2.error;
      }
      await sb.auth.signOut();
      session = null;
      return ok;
    },
  };
}
