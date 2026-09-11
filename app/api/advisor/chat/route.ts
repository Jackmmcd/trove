import Anthropic from '@anthropic-ai/sdk';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';
import { getActiveDigest } from '@/lib/advisor/corpus';
import { ANALYST_INSTRUCTIONS } from '@/lib/advisor/system';
import { ANALYST_TOOLS, runTool } from '@/lib/advisor/tools';
import { getProfile, renderProfileBlock } from '@/lib/advisor/profile';
import { recordUsage } from '@/lib/advisor/usage';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MODEL = 'claude-opus-5';
const MAX_TOOL_ROUNDS = 4;

// Fast mode runs the same model at up to ~2.5x output tokens/sec, at premium
// pricing ($10/$50 per MTok vs $5/$25). Off unless ANALYST_FAST_MODE=1.
const FAST = process.env.ANALYST_FAST_MODE === '1';

/**
 * Most questions are lookups against positions already in context and do not
 * need deep reasoning. Reserve the expensive setting for genuine analysis —
 * effort drives both thinking depth and how long the user waits.
 */
function effortFor(message: string): 'low' | 'medium' | 'high' {
  const m = message.toLowerCase();
  if (/\b(review|analyi?[sz]e|compare|should i|worth|overlap|concentrat|risk|diversif|portfolio)\b/.test(m)) {
    return 'medium';
  }
  return 'low';
}

export async function POST(req: Request) {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 });

  const { message, conversationId } = await req.json();
  if (!message?.trim()) return Response.json({ error: 'Empty message' }, { status: 400 });

  const snapshot = await getActiveDigest();
  if (!snapshot) {
    return Response.json(
      { error: 'No corpus snapshot yet. Run: node scripts/build-corpus.js' },
      { status: 503 }
    );
  }

  // --- conversation ---------------------------------------------------------
  // Everything below is independent, so it runs concurrently. Done sequentially
  // this was eight Supabase round trips of dead air before the first token.
  const existingConv = conversationId as string | undefined;

  const [convId, history, profileBlock] = await Promise.all([
    // New conversations: create the row. Existing: nothing to do.
    existingConv
      ? Promise.resolve(existingConv)
      : db.from('advisor_conversations')
          .insert({ user_id: user.id, title: message.slice(0, 80) })
          .select('id').single()
          .then(r => r.data?.id as string),

    // A brand-new conversation has no history — skip the query entirely.
    existingConv
      ? db.from('advisor_messages')
          .select('role, content')
          .eq('conversation_id', existingConv)
          .order('created_at')
          .then(r => (r.data ?? []).map(row => ({
            role: row.role as 'user' | 'assistant',
            // Replay stored blocks verbatim — thinking and tool_use blocks must
            // come back exactly as they were or the next turn is rejected.
            content: row.content as Anthropic.Beta.BetaContentBlockParam[],
          })) as Anthropic.Beta.BetaMessageParam[])
      : Promise.resolve([] as Anthropic.Beta.BetaMessageParam[]),

    // Profile + watchlist, themselves parallel internally.
    (async () => {
      const [{ declared, derived }, watched] = await Promise.all([
        getProfile(user.id, user.email),
        db.from('user_watched_funds').select('fund_id').eq('user_id', user.id)
          .then(async r => {
            const ids = (r.data ?? []).map(w => w.fund_id);
            if (!ids.length) return [] as string[];
            const { data } = await db.from('funds').select('name').in('id', ids);
            return (data ?? []).map(f => f.name as string);
          }),
      ]);
      return renderProfileBlock(declared, derived, watched);
    })(),
  ]);

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history,
    { role: 'user', content: `${profileBlock}\n\n${message}` },
  ];

  // Fire-and-forget: persisting the user's own message must not delay the model.
  const userMessageWrite = db.from('advisor_messages').insert({
    conversation_id: convId,
    role: 'user',
    content: [{ type: 'text', text: message }],
  });

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      const evidence: string[] = [];
      let finalUsage: Anthropic.Beta.BetaUsage | null = null;
      // Signed-in turns are metered but never blocked — the cap exists to contain
      // the public demo, not to lock the owner out of their own app.
      const totals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

      try {
        send('meta', { conversationId: convId, fundCount: snapshot.fundCount });

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const turn = client.beta.messages.stream({
            model: MODEL,
            // Answers are short by instruction; a huge ceiling only invites
            // the model to fill it.
            max_tokens: 4096,
            ...(FAST ? { speed: 'fast' as const, betas: ['fast-mode-2026-02-01'] } : {}),
            thinking: { type: 'adaptive', display: 'summarized' },
            output_config: { effort: effortFor(message) },
            tools: ANALYST_TOOLS,
            // Cache breakpoint sits on the digest: instructions + digest are the
            // stable prefix, everything in `messages` is per-turn.
            system: [
              { type: 'text', text: ANALYST_INSTRUCTIONS },
              {
                type: 'text',
                text: snapshot.digest,
                cache_control: { type: 'ephemeral', ttl: '1h' },
              },
            ],
            messages,
          });

          turn.on('text', text => send('text', { text }));
          turn.on('thinking', thinking => send('thinking', { thinking }));

          const response = await turn.finalMessage();
          finalUsage = response.usage;
          totals.input_tokens += response.usage.input_tokens ?? 0;
          totals.output_tokens += response.usage.output_tokens ?? 0;
          totals.cache_read_input_tokens += response.usage.cache_read_input_tokens ?? 0;
          totals.cache_creation_input_tokens += response.usage.cache_creation_input_tokens ?? 0;
          messages.push({ role: 'assistant', content: response.content });

          const toolUses = response.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use'
          );
          if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
            await db.from('advisor_messages').insert({
              conversation_id: convId,
              role: 'assistant',
              content: response.content,
              evidence,
              usage: response.usage,
            });
            break;
          }

          // All tool results go back in ONE user message — splitting them trains
          // the model out of making parallel calls.
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const use of toolUses) {
            send('tool', { name: use.name, input: use.input });
            try {
              const out = await runTool(use.name, use.input, user.id, user.email);
              if (use.name === 'get_ticker_holders' && (use.input as any)?.ticker) {
                evidence.push(String((use.input as any).ticker).toUpperCase());
              }
              results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(out) });
            } catch (e: any) {
              results.push({
                type: 'tool_result', tool_use_id: use.id,
                content: `Tool failed: ${e.message}`, is_error: true,
              });
            }
          }
          messages.push({ role: 'user', content: results });
        }

        send('done', {
          conversationId: convId,
          cacheRead: finalUsage?.cache_read_input_tokens ?? 0,
          cacheWrite: finalUsage?.cache_creation_input_tokens ?? 0,
          input: finalUsage?.input_tokens ?? 0,
          output: finalUsage?.output_tokens ?? 0,
        });
      } catch (e: any) {
        send('error', { message: e?.message ?? 'Analyst hit an error' });
      } finally {
        // Settle the fire-and-forget write so a failure surfaces in logs rather
        // than as an unhandled rejection.
        await userMessageWrite.then(
          r => r.error && console.error('advisor_messages insert:', r.error.message),
          e => console.error('advisor_messages insert:', e),
        );
        controller.close();
        void recordUsage(totals);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
