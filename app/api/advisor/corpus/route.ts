import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { refreshSnapshot, getActiveDigest } from '@/lib/advisor/corpus';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * This route sits outside the session gate (see utils/supabase/middleware.ts) so
 * scripts and scheduled jobs can reach it, which means it must authenticate
 * itself. When CRON_SECRET is unset the check is skipped — fine for local dev,
 * but set it before deploying.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

/** Inspect the active snapshot. */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const snap = await getActiveDigest();
  if (!snap) return NextResponse.json({ active: false });
  return NextResponse.json({
    active: true,
    fundCount: snap.fundCount,
    tokenCount: snap.tokenCount,
    preview: snap.digest.slice(0, 1200),
  });
}

/** Rebuild the digest and activate it. Run after a universe sync. */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 });

  const client = new Anthropic({ apiKey });
  const countTokens = async (text: string) => {
    const res = await client.messages.countTokens({
      model: 'claude-opus-5',
      messages: [{ role: 'user', content: text }],
    });
    return res.input_tokens;
  };

  try {
    const result = await refreshSnapshot(countTokens);
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
