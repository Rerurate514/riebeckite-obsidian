# Riebeckite for Obsidian

Riebeckite is an Obsidian Community Plugin foundation for a future local
connection to [Riebeckite](https://github.com/Rerurate514/riebeckite). It
currently registers a settings tab and an **Open settings** command. It does
not connect to a server, publish notes, or change vault data.

日本語版: [README_ja.md](./README_ja.md)

## Status

The plugin foundation is implemented. Local server communication and every
Riebeckite feature are intentionally unimplemented.

## Install manually

1. Build the plugin with `pnpm build`.
2. Create `<vault>/.obsidian/plugins/riebeckite/`.
3. Copy `main.js` and `manifest.json` into that directory.
4. In Obsidian, enable **Riebeckite** under **Community plugins**.

## Development

Requires Node.js 24.22.0 and Corepack. `packageManager` pins pnpm 11.5.3.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` watches `src/main.ts` and writes `main.js`. Link or copy the two
manual-install files into a development vault, then reload the plugin in
Obsidian after a rebuild.

### Commands

```bash
pnpm check
pnpm check:fix
pnpm lint
pnpm format
pnpm typecheck
pnpm test
pnpm build
pnpm check:manifest
pnpm test:release
pnpm build:release
```

`build:release` builds and verifies the files required by Obsidian releases.

## Manual Obsidian verification

1. Install the build into a test vault as described above.
2. Enable the plugin, run **Riebeckite: Open settings**, and confirm its tab
   opens.
3. Change **Local server URL**, reopen the settings tab, and confirm the value
   persists.
4. Confirm the notice says the local integration is not connected.
5. Disable the plugin, re-enable it, and confirm the command appears only once.

## Release

1. Update `package.json` to the intended semantic version.
2. Run `pnpm sync:version`, then commit `package.json`, `manifest.json`, and
   `versions.json` together.
3. Run `pnpm build:release`.
4. Create and push the matching `v<version>` tag. The release workflow verifies
   the tag, then uploads `main.js` and `manifest.json` to the GitHub Release.
5. Submit the repository to Obsidian Community Plugins only after a manual
   Obsidian verification and review of the current submission requirements.

The workflow never publishes npm packages or submits to the Obsidian directory.

## License

[Apache-2.0](./LICENSE)
