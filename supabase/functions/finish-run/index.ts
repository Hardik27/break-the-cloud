// finish-run: validates a finished run and records its time and points.
// The client cannot write ms or points (no UPDATE grant); only this function, using the service role, can.
// Deploy: supabase functions deploy finish-run
import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateRun, type FinishPayload } from '../_shared/validate.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, reason: 'POST only' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Who is calling? (anonymous users have a normal JWT)
    const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: auth } = await userClient.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ ok: false, reason: 'not signed in' }, 401);

    const body = (await req.json()) as FinishPayload & { runId?: string };
    if (!body?.runId || typeof body.runId !== 'string') return json({ ok: false, reason: 'missing runId' }, 400);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: run } = await admin.from('runs').select('id, user_id, game_id, status, started_at').eq('id', body.runId).maybeSingle();
    if (!run || run.user_id !== user.id) return json({ ok: false, reason: 'run not found' }, 404);
    if (run.status !== 'started') return json({ ok: false, reason: 'run already finished' }, 409);

    const serverMs = Date.now() - new Date(run.started_at).getTime();
    const v = validateRun(run.game_id, serverMs, body);
    const now = new Date().toISOString();
    if (!v.ok) {
      await admin.from('runs').update({ status: 'rejected', finished_at: now, reject_reason: v.reason }).eq('id', run.id).eq('status', 'started');
      return json(v, 422);
    }
    const { error } = await admin
      .from('runs')
      .update({
        status: 'finished',
        finished_at: now,
        ms: Math.round(v.ms),
        moves: body.moves,
        mistakes: body.mistakes.reduce((a, b) => a + b, 0),
        points: v.total,
        stars: v.stars,
        task_ms: body.taskMs.map((x) => Math.round(x)),
      })
      .eq('id', run.id)
      .eq('status', 'started');
    if (error) return json({ ok: false, reason: 'could not save the run' }, 500);
    return json({ ok: true, points: v.total, stars: v.stars, grades: v.grades });
  } catch {
    return json({ ok: false, reason: 'server error' }, 500);
  }
});
