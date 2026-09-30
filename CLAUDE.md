# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run compile        # tsc compilation
npm run watch          # tsc watch mode (dev)
npm run postbuild      # copy src/template/ into out/template (required after compile)
npm run lint           # eslint src
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

### Build-time Template Copy

`src/template/` must be copied into `out/template/` after compilation (shared `default/DefaultTemplate.*` included). This is handled by `npm run postbuild` using `shx`. The `vscode:prepublish` script chains compile + postbuild.

## Code Conventions

- Comments use Chinese JSDoc with `@brief`/`@details` tags
- ESLint rules are warnings (not errors): curly, eqeqeq, no-throw-literal, semi, naming-convention (camelCase/PascalCase)
- Prettier: 2-space indent, single quotes, trailing comma "none", 120 print width, LF line endings

## CI/CD

- Pushing to master with `[publish]` in the commit message triggers the all-in-one pipeline (`.github/workflows/publish-extension.yaml`): package VSIX → publish to VS Code Marketplace (`vsce publish --packagePath`) → create `v<version>` tag + GitHub Release attaching the VSIX
- `.cnb.yml` handles branch sync and cloud dev environment setup
