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
  response validation.
- `src/preview/`: Live Preview pane backed by resolved manifest metadata.
- `scripts/`: build, version synchronization, and release-file validation.
- `test/`: Node standard-runner tests for observable settings, lifecycle, and
  release contracts.

## Boundaries

`main.ts` is the only composition root and imports the Obsidian SDK. Settings
validation is framework-independent. The settings tab owns UI rendering and
delegates persistence to the plugin. The lifecycle registry owns only manually
added resources; Obsidian owns registrations made through its Plugin API.

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

The initial UI is desktop-prioritized because the intended future target is a
local development server. `isDesktopOnly` remains `false`: this foundation uses
no Electron, Node, or desktop-only API, so Obsidian mobile can load it safely.
That value must become `true` before introducing a desktop-only dependency.

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
