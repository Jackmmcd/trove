import axios from 'axios';

/**
 * Voyage embeddings.
 *
 * Anthropic publishes no embeddings endpoint, so semantic search needs a second
 * provider. Voyage is the one Anthropic recommends, and the whole surface used
 * here is a single POST.
 */

const ENDPOINT = 'https://api.voyageai.com/v1/embeddings';

interface VoyageEmbedding {
  embedding: number[];
  index: number;
}

// Pinned deliberately. Vectors from two different models are not comparable, so
// changing this silently poisons every stored row — a query embedded with one
// model ranks documents embedded with another as near-random. Change it only
// alongside a full re-run of scripts/build-embeddings.js.
export const EMBED_MODEL = 'voyage-4';
export const EMBED_DIMS = 1024;

// Voyage accepts 1,000 texts per request; 128 keeps any single failure cheap to
// retry and stays well inside the per-request token ceiling.
const BATCH = 128;

/**
 * `document` for the things being indexed, `query` for what the user typed.
 * The distinction is not cosmetic — Voyage embeds the two asymmetrically, and
 * indexing everything as a query measurably degrades ranking.
 */
export async function embed(
  texts: string[],
  inputType: 'document' | 'query',
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY is not set');
  if (!texts.length) return [];

  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH);
    const res = await axios.post(
      ENDPOINT,
      {
        input: chunk,
        model: EMBED_MODEL,
        input_type: inputType,
        output_dimension: EMBED_DIMS,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      },
    );

    // Sorted by `index` rather than trusted in arrival order. The field only
    // exists because the response is not promised to come back ordered, and a
    // silently shuffled batch would misattribute every embedding to the wrong
    // company — a failure that looks like nothing at all until a search answers
    // with the wrong names.
    const returned: VoyageEmbedding[] = res.data?.data ?? [];
    const vectors: number[][] = returned
      .slice()
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
    if (vectors.length !== chunk.length) {
      throw new Error(`Voyage returned ${vectors.length} embeddings for ${chunk.length} inputs`);
    }
    out.push(...vectors);
  }

  return out;
}

/** One string in, one vector out — the shape every search call actually wants. */
export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embed([text], 'query');
  return v;
}
