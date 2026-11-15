# Architecture

## Scope

This repository is an independently buildable Obsidian plugin. It does not use
`workspace:*` dependencies and does not require the Riebeckite monorepo.

## Directory responsibilities

- `src/main.ts`: Obsidian plugin composition root, lifecycle, command, and
  settings-tab registration.
- `src/settings/`: persisted settings model, validation, and Obsidian settings
  UI.
- `src/lifecycle/`: explicit disposal of resources that are not managed by
  Obsidian's `Plugin.register` lifecycle.
- `src/bridge/`: authenticated, local-only Riebeckite Bridge client and its
  response validation, plus the editor-facing read adapter.
- `src/dev/`: managed local Riebeckite process lifecycle and temporary pairing token.
- `src/workspace/`: unified Riebeckite workspace pane.
- `src/preview/`: legacy Live Preview pane backed by resolved manifest metadata.
- `src/publication/`: read-only Publication Manager pane and local filtering.
- `src/diagnostics/`: read-only active-document diagnostic pane.
- `scripts/`: build, version synchronization, and release-file validation.
- `test/`: Node standard-runner tests for observable settings, lifecycle, and
  release contracts.

## Boundaries

`main.ts` is the composition root and wires Obsidian registrations. Views and
settings import Obsidian SDK types for rendering, while settings validation and
Bridge response parsing remain framework-independent. The settings tab owns UI
rendering and delegates persistence to the plugin. The lifecycle registry owns
only manually added resources; Obsidian owns registrations made through its
Plugin API.

Errors are logged for diagnosis and shown to users as non-technical notices.
Persisted settings are treated as untrusted input and fall back to defaults.

## Riebeckite Bridge connection

The Bridge client bootstraps from the configured loopback server, then uses the
authenticated private endpoint returned by that server. It validates responses,
makes connection state visible through commands and the preview pane, and drops
late responses after disconnect or unload. It never reads vault content or sends
content to a remote service.

Live Preview resolves the active note through the content manifest. It renders
only routable pages in a sandboxed iframe; drafts and scheduled notes expose
their publication state without a preview route. Production URLs are shown only
when Riebeckite supplies a configured public origin.

Publication and diagnostics use optional Bridge v1 capabilities. The editor
adapter reuses the single authenticated Bridge client and validates every
response before a view uses it. Publication scans are explicit, bounded to four
concurrent path requests, and filters/searches run locally. There is no
all-vault Bridge endpoint and no polling. Views discard superseded active-file
requests and refresh with the existing workspace and vault lifecycle events.

Diagnostics navigation resolves a path through Obsidian's vault before opening
it. Valid 1-based Bridge positions set the cursor and create CodeMirror markers;
grapheme-aware columns are clamped to the source line, and stale responses never
replace the active diagnostic set. The workspace and legacy diagnostics views
share that set. Mutation uses Bridge's separate mutation token and server-side
approval only when the user provides the token in Obsidian's startup
environment. The plugin never creates credentials, approves plans, or uses the
Vault API as a mutation substitute.

The managed local development server uses Node's process APIs, so
`isDesktopOnly` is `true`. It runs only the configured project's local
Riebeckite executable with a runtime-only Bridge token and stops only its owned
process. Mobile does not load this plugin.

## Platform decisions

The plugin bundles to CommonJS `main.js`, externalizing Obsidian, Electron,
CodeMirror, Lezer, and Node built-ins because Obsidian provides them at runtime.
`minAppVersion` is `1.0.0`, which covers the Plugin, command, notice, and
settings APIs used by the foundation. Raise it when a future API requires it.

Riebeckite's Content First, Own Your Web, Standards over Invention, Explicit
over Implicit, and Small Core principles apply here as: preserve vault content,
avoid platform lock-in beyond Obsidian's public API, use native settings and
manifest formats, make connection state explicit, and defer abstractions until
they are needed.
