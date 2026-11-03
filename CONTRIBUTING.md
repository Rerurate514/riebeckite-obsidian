# Contributing

Read the [Riebeckite design philosophy](https://riebeckite.dev/docs/philosophy)
before proposing a public contract or a connection feature.

## Development rules

- Keep the core small. Do not add a Riebeckite client, transport abstraction, or
  Obsidian integration until a concrete feature needs one.
- Keep Obsidian SDK usage in the UI and plugin lifecycle boundary.
- Validate persisted data at load boundaries. Do not silently change vault data.
- Follow the repository's Biome configuration and strict TypeScript settings.
- Keep `package.json`, `manifest.json`, and `versions.json` aligned through
  `pnpm version` when changing a release version.

## Tests

Run the smallest applicable check first. Before a pull request, run:

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm build
pnpm test:release
```

Add deterministic tests for settings validation, lifecycle/resource behavior,
or release metadata whenever those contracts change. Mocking does not replace
the manual Obsidian checks in the README.

## Pull requests

Describe user impact, design decision, and executed checks. Keep changes scoped.
Public contract, architecture-boundary, security, or release-policy changes need
an ADR explaining the decision and alternatives.

## Commits

Write concise Japanese commit messages without prefixes such as `feat:` or
`fix:`. Example: `Obsidianプラグインの設定保存を追加`.
