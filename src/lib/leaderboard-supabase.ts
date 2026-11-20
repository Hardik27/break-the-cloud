/** Supabase backend for the leaderboard. Loaded only when the Supabase env vars are set. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { checkNickname } from './nickname';
import type { Backend, ClassReport, LbRow, Range } from './leaderboard';

const CLIENT_VERSION = 'web-1';
const weekAgo = () => new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

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
    async deleteMyData() {
      const uid = await userId();
      if (!uid) return true;
      const r1 = await sb.from('runs').delete().eq('user_id', uid);
      const r2 = await sb.from('profiles').delete().eq('user_id', uid);
      await sb.auth.signOut();
      session = null;
      return !r1.error && !r2.error;
    },
  };
}
