# Steer Protocol MultiPositionSushi vaults on Avalanche

Retrieves all Steer Protocol ERC-20 liquidity vault receipt contracts registered with the MultiPositionSushi implementation category on Avalanche. This is the Sushi adapter type; other Steer implementations are outside this module's category.

Official SDK1.22.0 documents the Avalanche subgraph ID GZotTj3rQJ8ZqVyodtK8TcnKcUxMgeF7mCJHGPYbu8dA in steerSubgraphConfig. Pinned deployment: Qme7ccBjopspNz1hRApn2msfJmGhp5EhnERniAfsr6jchs.
https://www.npmjs.com/package/@steerprotocol/sdk/v/1.22.0

The query selects the complete registered beaconName MultiPositionSushi category and pages all vaults with a strictly increasing ID cursor at one block hash. Vault IDs are unique addresses without a sequential field. Only metadata that cannot produce valid plain text is omitted, as explained in code. No address allowlist, supply, status, activity or output-count filters are used.

Names are the official indexed ERC-20 names (or symbols if a name is invalid), with only the ATQ-permitted ellipsis for names above 50 characters. Each note identifies Steer Protocol, the Sushi adapter and the underlying pool address. No current deposit, reward or operator affiliation is asserted.

Official vault interface: https://docs.steer.finance/flagship-apps/smart-pools/developing-with-smart-pools/contract-side/
Official registry: https://docs.steer.finance/contracts/API/VaultRegistry/
Build with Yarn and call the sole async export returnTags(chainId, apiKey). All logic is in src/main.mts. Preparation only; no filing authority.
