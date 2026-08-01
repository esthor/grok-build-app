/**
 * Winamp Skin Museum client (skins.webamp.org) — 100k+ archived classic
 * skins, searchable. All requests are user-initiated and client-side; skins
 * stream straight from the museum's public API/CDN into the wear pipeline
 * and are never bundled with Grokamp. Be a good guest: fetch on demand only.
 */

const GRAPHQL_URL = "https://skins.webamp.org/graphql";

export interface MuseumSkin {
  readonly md5: string;
  readonly filename: string;
  readonly nsfw: boolean;
  readonly downloadUrl: string;
}

export function museumPageUrl(md5: string): string {
  return `https://skins.webamp.org/skin/${md5}`;
}

/** strip extension + underscores for display */
export function displayName(filename: string): string {
  return filename.replace(/\.(wsz|zip)$/i, "").replaceAll("_", " ");
}

export function filterSafe(skins: readonly MuseumSkin[]): MuseumSkin[] {
  return skins.filter((s) => !s.nsfw);
}

interface GqlSkinNode {
  readonly md5?: unknown;
  readonly filename?: unknown;
  readonly nsfw?: unknown;
  readonly download_url?: unknown;
}

export function decodeNodes(nodes: readonly unknown[]): MuseumSkin[] {
  const out: MuseumSkin[] = [];
  for (const raw of nodes) {
    const node = raw as GqlSkinNode | null;
    if (
      node !== null &&
      typeof node.md5 === "string" &&
      typeof node.filename === "string" &&
      typeof node.download_url === "string"
    ) {
      out.push({
        md5: node.md5,
        filename: node.filename,
        nsfw: node.nsfw === true,
        downloadUrl: node.download_url,
      });
    }
  }
  return out;
}

async function gql(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`museum responded ${res.status}`);
  }
  return (await res.json()) as unknown;
}

const NODE_FIELDS = "md5 filename nsfw download_url";

/** the museum loads 100 at a time; so do we */
export const PAGE_SIZE = 100;

export interface MuseumPage {
  readonly skins: readonly MuseumSkin[];
  /** total in the museum for this query, when the API reports it */
  readonly total: number | null;
  readonly nextOffset: number | null;
}

/**
 * Free-text search across the whole archive. `search_skins` takes an offset,
 * so search results paginate exactly like browsing does.
 */
export async function searchMuseum(query: string, offset = 0): Promise<MuseumPage> {
  const data = (await gql(
    `query S($q: String!, $first: Int!, $offset: Int!) {
       search_skins(query: $q, first: $first, offset: $offset) {
         ... on ClassicSkin { ${NODE_FIELDS} }
       }
     }`,
    { q: query, first: PAGE_SIZE, offset },
  )) as { data?: { search_skins?: unknown[] } };
  const raw = data.data?.search_skins ?? [];
  return {
    skins: filterSafe(decodeNodes(raw)),
    total: null, // search doesn't report a count; we page until it runs dry
    nextOffset: raw.length < PAGE_SIZE ? null : offset + PAGE_SIZE,
  };
}

/**
 * Browse in the museum's own order — `sort: MUSEUM` is the curated
 * most-popular-first ordering the site itself uses (base-2.91 and the
 * Classified classics lead). Offsets are stable, so infinite scroll walks
 * all ~102k without repeats.
 */
export async function browseMuseum(offset = 0): Promise<MuseumPage> {
  const data = (await gql(
    `query B($first: Int!, $offset: Int!) {
       skins(first: $first, offset: $offset, sort: MUSEUM) {
         count
         nodes { ... on ClassicSkin { ${NODE_FIELDS} } }
       }
     }`,
    { first: PAGE_SIZE, offset },
  )) as { data?: { skins?: { count?: unknown; nodes?: unknown[] } } };
  const raw = data.data?.skins?.nodes ?? [];
  const total = typeof data.data?.skins?.count === "number" ? data.data.skins.count : null;
  const consumed = offset + raw.length;
  return {
    skins: filterSafe(decodeNodes(raw)),
    total,
    nextOffset:
      raw.length < PAGE_SIZE || (total !== null && consumed >= total) ? null : consumed,
  };
}

export async function downloadSkin(skin: MuseumSkin): Promise<Uint8Array> {
  const res = await fetch(skin.downloadUrl);
  if (!res.ok) {
    throw new Error(`download failed (${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
