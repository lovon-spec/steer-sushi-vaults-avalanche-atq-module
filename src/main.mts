import fetch from "node-fetch";
import type { ContractTag, ITagService } from "atq-types";

interface Chain { deployment: string; label: string }
const CHAINS: Readonly<Record<string, Chain>> = {
  "43114": { deployment: "Qme7ccBjopspNz1hRApn2msfJmGhp5EhnERniAfsr6jchs", label: "Avalanche C-Chain" },
};
const PAGE_SIZE = 1000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO = "0x0000000000000000000000000000000000000000";
interface Vault { id: string; name: string; symbol: string; token0Symbol: string; token1Symbol: string; beaconName: string; pool: string }
interface Meta { deployment: string; hasIndexingErrors: boolean; block: { number: number; hash: string } }
interface Envelope<T> { data?: T; errors?: { message?: string }[] }
const META = `{ _meta { deployment hasIndexingErrors block { number hash } } }`;
// Complete named implementation category; no activity, supply or address filters.
const VAULTS = `query Vaults($lastId: ID!, $blockHash: Bytes!) {
  vaults(first: 1000, orderBy: id, orderDirection: asc,
    where: { id_gt: $lastId, beaconName: "MultiPositionSushi" }, block: { hash: $blockHash }) {
    id name symbol token0Symbol token1Symbol beaconName pool
  }
}`;

async function query<T>(config: Chain, key: string, query: string, variables: Record<string, string> = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`https://gateway.thegraph.com/api/deployments/id/${config.deployment}`, {
      method: "POST", signal: controller.signal,
      headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error("Steer Protocol subgraph HTTP request failed.");
    const result = await response.json() as Envelope<T>;
    if (result.errors?.length || !result.data) throw new Error("Steer Protocol subgraph returned a GraphQL error or missing data.");
    return result.data;
  } finally { clearTimeout(timer); }
}

function text(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() ||
      /[\u0000-\u001f\u007f-\u009f]|\p{Cf}/u.test(value)) return null;
  const clean = value.replace(/\s+/g, " ").trim();
  if (/<[^>]*>|[<>`]|&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);|(?:https?|ftp|ipfs):\/\/|(?:javascript|data|vbscript):|\bwww\.|!?\[[^\]]*\]\([^)]*\)|\*(?=\S).*?\S\*|(?:^|[^\p{L}\p{N}_])_+(?=\S).*?\S_+(?=$|[^\p{L}\p{N}_])|~~[^~]+~~|\b(?:old|older|oldest|newer|newest|latest|better|best|worse|worst)\b/iu.test(clean)) return null;
  return clean;
}
function limit(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max - 3).join("").trimEnd() + "...";
}
function tag(vault: Vault, chainId: string, config: Chain): ContractTag | null {
  if (!ADDRESS.test(vault.id) || vault.id.toLowerCase() === ZERO) throw new Error("Malformed Steer vault source row.");
  if (vault.beaconName !== "MultiPositionSushi" || !ADDRESS.test(vault.pool) || vault.pool.toLowerCase() === ZERO) throw new Error("Unknown registered vault implementation or pool.");
  const name = text(vault.name) ?? text(vault.symbol), a = text(vault.token0Symbol), b = text(vault.token1Symbol);
  // Only metadata that cannot produce a valid plain-text tag is omitted.
  if (!name || !a || !b) return null;
  const publicName = limit(name, 50);
  const note = `Steer Protocol ERC-20 liquidity-vault receipt token for ${limit(a, 32)}/${limit(b, 32)} on ${config.label}. Type: MultiPositionSushi (Sushi adapter). Pool: ${vault.pool.toLowerCase()}.`;
  if (text(publicName) !== publicName || text(note) !== note || Array.from(note).length > 280) return null;
  return {
    "Contract Address": `eip155:${chainId}:${vault.id.toLowerCase()}`,
    "Public Name Tag": publicName, "Project Name": "Steer Protocol",
    "UI/Website Link": "https://steer.finance/",
    "Public Note": note,
  };
}

export const returnTags: ITagService["returnTags"] = async (chainId, apiKey) => {
  if (!Object.hasOwn(CHAINS, chainId)) throw new Error(`Unsupported Chain ID: ${chainId}. Only Avalanche (43114) is supported.`);
  const config = CHAINS[chainId];
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("A Graph gateway API key is required.");
  const key = apiKey.trim();
  const initial = (await query<{ _meta: Meta | null }>(config, key, META))._meta;
  if (!initial || initial.deployment !== config.deployment || initial.hasIndexingErrors !== false ||
      !Number.isSafeInteger(initial.block.number) || initial.block.number <= 0 ||
      !/^0x[0-9a-fA-F]{64}$/.test(initial.block.hash)) throw new Error("Steer Protocol source metadata is unavailable or inconsistent.");
  const vaults: Vault[] = [], addresses = new Set<string>();
  let cursor = "";
  for (;;) {
    const page = (await query<{ vaults: Vault[] }>(config, key, VAULTS, { lastId: cursor, blockHash: initial.block.hash })).vaults;
    if (!Array.isArray(page) || page.length > PAGE_SIZE) throw new Error("Invalid Steer Protocol vault page.");
    let previous = cursor;
    for (const vault of page) {
      if (!vault || typeof vault.id !== "string" || !ADDRESS.test(vault.id) || vault.id <= previous || addresses.has(vault.id.toLowerCase())) throw new Error("Invalid Steer Protocol cursor or duplicate vault.");
      previous = vault.id;
      addresses.add(vault.id.toLowerCase());
      vaults.push(vault);
    }
    if (page.length < PAGE_SIZE) break;
    cursor = previous;
  }
  const final = (await query<{ _meta: Meta | null }>(config, key,
    `query Snapshot($blockHash: Bytes!) { _meta(block: { hash: $blockHash }) { deployment hasIndexingErrors block { number hash } } }`,
    { blockHash: initial.block.hash }))._meta;
  if (!final || final.deployment !== config.deployment || final.hasIndexingErrors !== false ||
      final.block.number !== initial.block.number || final.block.hash !== initial.block.hash) throw new Error("Steer Protocol snapshot could not be re-established.");
  const tags = vaults.map(vault => tag(vault, chainId, config)).filter((value): value is ContractTag => value !== null);
  if (!tags.length) throw new Error("Steer Protocol source produced no valid tags.");
  return tags;
};
