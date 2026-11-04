# Riebeckite for Obsidian

Riebeckite connects Obsidian to a local
[Riebeckite](https://github.com/Rerurate514/riebeckite) development server. It
reads Bridge data and can submit explicitly reviewed, server-approved frontmatter edits.

日本語版: [README_ja.md](./README_ja.md)

## Status

Bridge Protocol v1 provides connection status, resolved page status, a Live
Preview side pane, Publication Manager, and Document Diagnostics. Connection
profiles support integrated and separately mapped content roots. The preview
pane displays the actual local HonoX development page; Obsidian does not render
Markdown itself. Publication data refreshes when the Bridge revision changes.
Status polling starts when the plugin loads and checks every five seconds;
temporary connection failures retry after 5, 10, 20, 40, then at most 60
seconds, and a successful connection resets the interval to five seconds. A
rejected pairing does not retry automatically. Revision updates refresh the
plugin views only, so they do not change the active editor text, cursor, or
selection, and do not apply mutations automatically.
Publication Manager also displays the SEO title, description, canonical URL,
indexability, and issues reported by the Bridge.

## Managed development (Desktop)

Run **Riebeckite: Open**, select a profile, set its **Site project directory**,
then select **Start Dev**. The plugin runs only that project's local
`node_modules/.bin/riebeckite` executable with `dev`; it never runs an npm
script. The first start asks for confirmation.

Each managed process receives a temporary, read-only Bridge pairing token through
its environment. The token is not saved, passed as a command-line argument, put
in a URL, or written to the plugin log. Processes running as the same user can
inspect each other's environment, so use a dedicated local development account
where that is a concern. Start Dev does not grant Mutation access.

Stop and Restart affect only the process started by this plugin (and its Windows
PID tree). The site directory is independent of Integrated, Separate, and Custom
Vault mappings. The tabs show the active note's preview, publication,
diagnostics, build impact, and SEO data.

## Connect to an external Riebeckite server

1. Start the site with an explicit, unique pairing token (at least 32 characters):
   `riebeckite dev --bridge-token <token>`.
2. In **Riebeckite** settings, add or select a connection profile, then enter the
   local server URL and the same token.
3. Select **Test connection** to verify the current values without saving a test
   result. It shows the site name and a shortened site ID on success, or explains
   unreachable, rejected pairing, incompatible protocol, and loopback failures.
4. Select **Connect**, or run **Riebeckite: Connect to Riebeckite**.
5. Run **Riebeckite: Open Live Preview**. It follows the active Markdown note;
   use Refresh or Open Current Preview in Browser when needed.
6. Run **Riebeckite: Open Publication Manager** to inspect the active note, or
   choose **Refresh vault** to explicitly scan Markdown notes. Filtering and
   search operate on that local result set and do not issue requests per key.
7. Run **Riebeckite: Open Document Diagnostics** to inspect the active note.
   `No issues` is shown only after a successful empty response; unavailable
   server data is shown separately.
8. To edit publication frontmatter, set the separate **Bridge mutation token**
   in the active profile. In Publication Manager, create and review a plan, have
   it approved by the server-side approval workflow, then select **Apply approved
    plan**. Obsidian cannot approve plans and never receives the approval secret.
   Build Impact lists each changed, unchanged, or removed output with its producer,
   reason, and content dependencies. If a mutation conflicts, make a new plan; if
   approval expires, create a new plan and obtain approval again; if its target is
   missing, reload before trying again. Obsidian never retries, replans, or approves
   a mutation automatically.

Integrated profiles require only the server URL and pairing token. Separate local
and Git profiles additionally configure one Vault folder and content root. Custom
mapping profiles can configure multiple folder-to-content-root mappings. Missing
Vault folders and duplicate mappings are shown in settings but do not block saving.
When a saved site ID differs from the connected Bridge identity, the plugin warns
that the profile may point at a different site and retains the saved ID. Older
Bridges without identity remain supported.

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
2. Enable the plugin, run **Riebeckite: Open settings**, and confirm its tab
   opens.
3. Set the active profile's **Riebeckite Server URL** and **Bridge pairing token**,
   reopen the settings tab, and confirm both values persist. Select **Test
   connection** and confirm its site identity result.
4. Select **Connect**, open a Markdown note, then run **Riebeckite: Open Live
   Preview**. Confirm the actual development page, preview URL, visibility, and
   public URL (when `site.baseUrl` is configured) appear.
5. Select **Disconnect**, then disable and re-enable the plugin, and confirm the
   commands appear only once.
6. On a server advertising `publication` and `diagnostics`, open both views and
   confirm Public, Draft, Scheduled, and Unlisted data agrees with Riebeckite.
   Confirm a non-routable note has no development-preview action, filters and
   search do not trigger new requests, diagnostics mark valid source positions
   in the editor, and a diagnostic opens only a vault file.

## Bridge capabilities and limits

Publication Manager requires the optional `publication` capability and
Diagnostics View requires `diagnostics`. Older v1 servers remain compatible:
the corresponding pane reports that the server does not support it. The
implementation uses the server's `visibility`, routing, discovery, public
location, reasons, revision, and SEO data directly; it never derives a URL from
a file name or computes SEO results.

Diagnostics with valid 1-based source positions mark the editor and open the
verified vault file at that location. Markers show severity and message on
hover, rebuild when their contents change, and clamp grapheme-based columns to
their source line. The diagnostics list replaces its DOM on each refresh and
ignores responses that arrive after a newer refresh or close; Preview and
Publication Manager also discard responses that arrive after a newer request
or after their view closes. Decoration construction is linear apart from one
position sort and is verified against 10,000 diagnostics; very large result
sets still render one control per diagnostic. The plugin polls Bridge status from startup and every five seconds
thereafter, and refreshes views when its revision changes. Temporary failures
retry with a 5-to-60-second exponential backoff; a successful connection resets
the interval, and rejected pairing stops automatic retries. These refreshes do
not alter editor input, cursor, or selection, and do not automatically apply
mutations. Vault scans use four
workers and render the first 100 notes at a time. Safe Mutation is limited to
frontmatter visibility and publish-time edits, requires both Bridge tokens, and
still requires a separate, short-lived server-side approval. Real Obsidian E2E
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
