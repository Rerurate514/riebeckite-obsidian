# Riebeckite for Obsidian

Riebeckite manages a local [Riebeckite](https://github.com/Rerurate514/riebeckite)
development server for one selected site project. It reads Bridge data for that
managed process; it does not connect to arbitrary servers.

日本語版: [README_ja.md](./README_ja.md)

## Status

Bridge Protocol v1 provides connection status, resolved page status, a Live
Preview side pane, Publication Manager, and Document Diagnostics. The preview
pane displays the actual local HonoX development page; Obsidian does not render
Markdown itself. A site is selected once in settings, maps the whole vault by
default, and is identity-checked when managed development connects. An optional
vault folder narrows that mapping. Revision updates refresh plugin views only;
they never change editor text, cursor, selection, or files.

## Managed development (Desktop)

Open **Riebeckite: Open**, choose **Site project** in settings, then select
**Start Dev**. On desktop, choosing a project opens a folder dialog (with a
text fallback). The plugin accepts only a project with a local Riebeckite CLI
and configuration, then runs its `node_modules/@riebeckite/cli/bin/riebeckite.mjs`
with `dev`. It never runs an npm script. The first start asks for confirmation.

The plugin and CLI use a versioned JSONL control channel on a private inherited
file descriptor. The CLI emits `ready` only after it verifies the loopback
Bridge bootstrap endpoint. Each managed process receives a temporary Bridge
token through its environment. The token is not saved, passed as a command-line
argument, put in a URL, or written to the plugin log. Processes running as the
same user can inspect each other's environment, so use a dedicated local
development account where that is a concern. Start Dev does not grant Mutation
access.

Stop and Restart affect only the process started by this plugin (and its Windows
PID tree). The tabs show the active note's preview, publication, diagnostics,
build impact, and SEO data. Safe Mutation remains server-side protected, but
this managed integration does not supply mutation credentials or write files.

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

### Performance

`pnpm test` includes the performance checks. Measured on Node.js 24.22.1,
Windows 10.0.26200, AMD Ryzen 7 7730U:

| Workload | 1,000 | 5,000 | 10,000 |
| --- | --- | --- | --- |
| Diagnostic positions | 0.5 ms | 1.7 ms | 4.0 ms |
| Diagnostic decorations | 0.7 ms | 2.4 ms | 6.3 ms |
| Publication list filter | 0.06 ms | 0.22 ms | 0.37 ms |

Twelve refreshes of 10,000 diagnostics kept the heap floor at about 18 MiB in
the same environment. The tests cover position and decoration construction plus
list filtering, not Obsidian DOM rendering. Timings vary by machine; run
`pnpm test` to reproduce.

## Manual Obsidian verification

1. Install the build into a test vault as described above.
2. Enable the plugin, run **Riebeckite: Open settings**, and choose a compatible
   site project. Confirm no URL, token, connection mode, or Connect button is
   displayed or persisted.
3. Select **Start Dev**, then open a Markdown note and run **Riebeckite: Open
   Live Preview**. Confirm the actual development page, preview URL, visibility,
   and public URL (when `site.baseUrl` is configured) appear.
4. Select **Restart Dev**, then disable and re-enable the plugin, and confirm the
   commands appear only once and the process is stopped on unload.
6. On a server advertising `publication` and `diagnostics`, open both views and
   confirm Public, Draft, Scheduled, and Unlisted data agrees with Riebeckite.
   Confirm a non-routable note has no development-preview action, filters and
   search do not trigger new requests, diagnostics mark valid source positions
   in the editor, and a diagnostic opens only a vault file.

## Bridge capabilities and limits

Publication Manager requires the optional `publication` capability and
Diagnostics View requires `diagnostics`. The implementation uses the server's
`visibility`, routing, discovery, public location, reasons, revision, and SEO
data directly; it never derives a URL from a file name or computes SEO results.

Diagnostics with valid 1-based source positions mark the editor and open the
verified vault file at that location. Markers show severity and message on
hover, rebuild when their contents change, and clamp grapheme-based columns to
their source line. The diagnostics list replaces its DOM on each refresh and
ignores responses that arrive after a newer refresh or close; Preview and
Publication Manager also discard responses that arrive after a newer request
or after their view closes. Decoration construction is linear apart from one
position sort and is verified against 10,000 diagnostics; very large result
sets still render one control per diagnostic. The plugin polls Bridge status only
after managed development has connected and refreshes views when its revision
changes. These refreshes do not alter editor input, cursor, selection, or files.
Vault scans use four workers and render the first 100 notes at a time. Safe
Mutation remains independently protected by Bridge credentials and a short-lived
server-side approval, but is unavailable in this integration. Real Obsidian E2E
verification remains required before release.

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
