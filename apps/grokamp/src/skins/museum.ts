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

/** free-text search (museum's Algolia via its GraphQL) */
export async function searchMuseum(query: string, first = 30): Promise<MuseumSkin[]> {
  const data = (await gql(
    `query S($q: String!, $first: Int!) {
       search_skins(query: $q, first: $first) {
         ... on ClassicSkin { ${NODE_FIELDS} }
       }
     }`,
    { q: query, first },
  )) as { data?: { search_skins?: unknown[] } };
  return filterSafe(decodeNodes(data.data?.search_skins ?? []));
}

/** curated firehose: the museum's default ordering (approved classics first) */
export async function browseMuseum(offset = 0, first = 30): Promise<MuseumSkin[]> {
  const data = (await gql(
    `query B($first: Int!, $offset: Int!) {
       skins(first: $first, offset: $offset) {
         nodes { ... on ClassicSkin { ${NODE_FIELDS} } }
       }
     }`,
    { first, offset },
  )) as { data?: { skins?: { nodes?: unknown[] } } };
  return filterSafe(decodeNodes(data.data?.skins?.nodes ?? []));
}

export async function downloadSkin(skin: MuseumSkin): Promise<Uint8Array> {
  const res = await fetch(skin.downloadUrl);
  if (!res.ok) {
    throw new Error(`download failed (${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
