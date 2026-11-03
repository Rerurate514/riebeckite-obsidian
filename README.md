# Riebeckite for Obsidian

Riebeckite connects Obsidian to a local
[Riebeckite](https://github.com/Rerurate514/riebeckite) development server. It
only reads Bridge status; it does not publish notes or change vault data.

日本語版: [README_ja.md](./README_ja.md)

## Status

Bridge Protocol v1 is implemented for status inspection. Diagnostics, content
inspection, preview, and publication inspection are intentionally unavailable.

## Connect to Riebeckite

1. Start the site with an explicit, unique pairing token (at least 32 characters):
   `riebeckite dev --bridge-token <token>`.
2. In **Riebeckite** settings, enter the local server URL and the same token.
3. Select **Connect**, or run **Riebeckite: Connect to Riebeckite**.

Only `localhost`, `127.0.0.0/8`, and `::1` URLs are accepted. The Bridge is
disabled unless its token is supplied, binds to loopback only, and accepts no
cross-origin or forwarded requests. A rejected pairing usually means the token
is wrong or the server was not started with `--bridge-token`.

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
3. Set **Riebeckite Server URL** and **Bridge pairing token**, reopen the settings
   tab, and confirm both values persist.
4. Select **Connect** and confirm the status shows the Riebeckite and protocol
   versions plus `status` capability.
5. Select **Disconnect**, then disable and re-enable the plugin, and confirm the
   commands appear only once.

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
