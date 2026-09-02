import Anthropic from '@anthropic-ai/sdk';
import { cookies } from 'next/headers';
import { getActiveDigest } from '@/lib/advisor/corpus';
import { ANALYST_INSTRUCTIONS } from '@/lib/advisor/system';
import { ANALYST_TOOLS, runTool } from '@/lib/advisor/tools';
import { ACCESS_COOKIE, verifyAccessToken } from '@/lib/advisor/access';
import { checkDailyCap, recordUsage } from '@/lib/advisor/usage';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MODEL = 'claude-opus-5';
const MAX_TOOL_ROUNDS = 4;

// No signed-in user, so anything portfolio-shaped is unavailable. Dropping the
// tool entirely is better than letting Analyst call it and get an empty result —
// a tool that always returns nothing teaches it to stop trusting its tools.
const PUBLIC_TOOLS = ANALYST_TOOLS.filter(t => t.name !== 'get_user_portfolio');

const PUBLIC_CONTEXT = `<session_context>
This person is not signed in. They are trying Analyst from the Trove landing page.

You know nothing about their holdings, risk tolerance, or goals — do not guess,
and do not ask them to describe their portfolio. Answer from what the funds have
filed. If they ask about their own positions or want advice specific to their
situation, tell them that lives in the app behind a login, and answer the general
version of their question instead.
</session_context>`;

export async function POST(req: Request) {
  const email = verifyAccessToken((await cookies()).get(ACCESS_COOKIE)?.value);
  if (!email) {
    return Response.json({ error: 'Enter your email to use Analyst.' }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 });

  const { message, history } = await req.json();
  if (!message?.trim()) return Response.json({ error: 'Empty message' }, { status: 400 });

  // Both reads issued together; the cap check resolves inside the corpus fetch,
  // so enforcing it costs no wall-clock time.
  const [snapshot, cap] = await Promise.all([getActiveDigest(), checkDailyCap()]);
  if (!snapshot) return Response.json({ error: 'Analyst is warming up. Try again shortly.' }, { status: 503 });

  if (!cap.allowed) {
    return Response.json(
      { error: "Analyst has hit today's usage limit. It resets at midnight UTC." },
      { status: 429 }
    );
  }

  // Anonymous sessions are not persisted — the client replays its own history,
  // capped so a long tab cannot grow the request without bound.
  const prior: Anthropic.Beta.BetaMessageParam[] = Array.isArray(history)
    ? history.slice(-8).filter(
        (m: { role?: string; text?: string }) =>
          (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim()
      ).map((m: { role: string; text: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.text.slice(0, 4000),
      }))
    : [];

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...prior,
    { role: 'user', content: `${PUBLIC_CONTEXT}\n\n${message}` },
  ];

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      const totals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

      try {
        send('meta', { fundCount: snapshot.fundCount });

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const turn = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 4096,
            thinking: { type: 'adaptive', display: 'summarized' },
            output_config: { effort: 'low' },
            tools: PUBLIC_TOOLS,
            system: [
              { type: 'text', text: ANALYST_INSTRUCTIONS },
              { type: 'text', text: snapshot.digest, cache_control: { type: 'ephemeral', ttl: '1h' } },
            ],
            messages,
          });

          turn.on('text', text => send('text', { text }));
          turn.on('thinking', thinking => send('thinking', { thinking }));

          const response = await turn.finalMessage();
          totals.input_tokens += response.usage.input_tokens ?? 0;
          totals.output_tokens += response.usage.output_tokens ?? 0;
          totals.cache_read_input_tokens += response.usage.cache_read_input_tokens ?? 0;
          totals.cache_creation_input_tokens += response.usage.cache_creation_input_tokens ?? 0;
          messages.push({ role: 'assistant', content: response.content });

          const toolUses = response.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use'
          );
          if (response.stop_reason !== 'tool_use' || toolUses.length === 0) break;

          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const use of toolUses) {
            try {
              const out = await runTool(use.name, use.input, '');
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

        send('done', {});
      } catch (e: any) {
        send('error', { message: e?.message ?? 'Analyst hit an error' });
      } finally {
        controller.close();
        // After the response is closed — never on the critical path.
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
