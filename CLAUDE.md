# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run compile        # tsc compilation
npm run watch          # tsc watch mode (dev)
npm run postbuild      # copy src/template/ into out/template (required after compile)
npm run lint           # eslint src webview-ui/src
npm run format:check   # prettier check
npm run format:fix     # prettier fix
npm test               # compile + lint, then run tests via vscode-test (Extension Host)
npm run vsix:build     # package .vsix with vsce
```

## Architecture

**vssm-tool** is a VS Code extension (TypeScript, strict mode, ES2022, Node16 modules) providing project scaffolding (init-project templates), config generation, npm task running, a chat webview demo, and language features.

### Entry Point & Registration Pattern

`src/extension.ts` — `activate()` iterates a single `registrations` array of `Registration` objects (`{ id, enabled?, register }`), skipping entries with `enabled: false` and de-duplicating by `id`. Each feature module registers its own commands and each layer (`commands/`, `language/`, `webview/`) lists its own capabilities in its `index.ts`, so the entry point is a pure aggregator.

### Module Layers

- **`src/commands/`** — User-triggered capabilities, one directory (or file) per feature, each exporting a `Registration` (contract in `../shared/registration.ts`) that registers all of its own commands: `add-to-ignore/` (3 commands driven by a target table), `generate-configs/` (3 commands sharing `generate-config-file.ts`), `npm-run-task/` (task sources read in `task-sources.ts`), and `init-project/` (scaffolds from `src/template/`, including the npm-registry version refresh).
- **`src/language/`** — Document providers: `package-link.ts` makes dependency names in package.json clickable to open node_modules; `markdown-hover.ts` is currently disabled (`enabled: false` on its Registration).
- **`src/webview/`** — The chat webview host: `host.ts` is the `WebviewViewProvider` serving the React UI built by `webview-ui/`; `resources.ts` holds `getUri`/`getNonce`; `registry.ts` keeps the `SnapshottableProvider` contract and `treeViewRegistry` as a (currently unused) extension point.
- **`src/shared/`** — Cross-cutting utilities: `logger.ts` (the "VSSM-Tool" output channel, prefixing caller file:line from stack traces) and `fs.ts` (`withFileRetry`).
- **`src/template/`** — Static scaffolding templates (`c-vscode/`, `cnb/`, `npm-package/`) copied into user workspaces by `initProject.ts`; shared default configs live in `default/DefaultTemplate.*`.

### Webview UI (`webview-ui/`)

Separate Vite + React 18 workspace (an npm workspace of the root package) built to `webview-ui/dist/assets/` with **fixed filenames** (`index.js` / `index.css`, no hash) so the host can reference them by path via `asWebviewUri`. Its layering mirrors the extension side:

- **`src/lib/`** — `protocol.ts` (the bidirectional message contract, mirrored from `src/webview/host.ts`) and `vscode-api.ts` (the single `acquireVsCodeApi()` wrapper; falls back to `console.log` under the Vite dev server).
- **`src/hooks/`** — `use-extension-message.ts` is the **only** `message` listener; `use-views.ts` requests `viewList` and tracks the active view.
- **`src/components/`** — reusable primitives: `top-bar.tsx` (title + action slot), `tabs.tsx` (controlled horizontal tab bar), `welcome.tsx` (the fixed block shown while no tab is picked), `codicon.tsx` (icon library) and `icon-button.tsx`; they carry no styles of their own.
- **`src/views/`** — one directory per view; `index.tsx` maps `viewId → component` and is the single place to register a new view.
- **`src/style/`** — **all** CSS lives here (components carry no `.css`): `index.css` is the single entry (`@import` order = cascade order), `base.css` / `controls.css` hold the global reset, layout skeleton and base controls, and `components/` / `views/` mirror the source layers. Every class is namespaced `vssm-`, state classes use `is-`, and bare element selectors (other than the reset) are not allowed.

Import alias `@/` → `webview-ui/src`, kept in sync between `vite.config.ts` and `tsconfig.json`.

### Build-time Template Copy

`src/template/` must be copied into `out/template/` after compilation (shared `default/DefaultTemplate.*` included). This is handled by `npm run postbuild` using `shx`. The `vscode:prepublish` script chains compile + postbuild.

## Code Conventions

- Comments use Chinese JSDoc with `@brief`/`@details` tags
- ESLint rules are warnings (not errors): curly, eqeqeq, no-throw-literal, semi, naming-convention (camelCase/PascalCase)
- Prettier: 2-space indent, single quotes, trailing comma "none", 120 print width, LF line endings

## CI/CD

- Pushing to master with `[publish]` in the commit message triggers the all-in-one pipeline (`.github/workflows/publish-extension.yaml`): package VSIX → publish to VS Code Marketplace (`vsce publish --packagePath`) → create `v<version>` tag + GitHub Release attaching the VSIX
- `.cnb.yml` handles branch sync and cloud dev environment setup
