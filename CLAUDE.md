# CLAUDE.md

Guardrails for agent work on this Bitfocus Companion module (per-surface PIN lock). Structure and conventions come from the Bitfocus module template and [Bitfocus's module-development guidelines](https://companion.free/for-developers/module-development/) — don't deviate without a clear reason.

## Scope

Locks Companion surfaces (typically Companion Satellites) behind a PIN, with multiple users, a landing page per user, sessions scoped to the surface where the PIN was entered, and an idle timeout. Target is Companion v5.1.1.

A module can't change a surface's page. The module publishes navigation requests as variables (`nav_surface`, `nav_page`, `nav_seq`) and a user-created Companion trigger runs **Surface: Set to page**. Keep that contract stable — it's wired by hand in every install. Read [ROADMAP.md](./ROADMAP.md) (architecture, decisions, verified Companion facts) before changing behaviour.

## Conventions

- **ESM.** Relative imports use `.js` extensions (`verbatimModuleSyntax` requires it).
- **`Update*(self)` delegates.** `actions.ts`, `feedbacks.ts`, `variables.ts`, `presets.ts` each export one `Update*(self: ModuleInstance)` called from `main.ts`. Add new items inside these — no per-item files or registries.
- **Thin actions, fat instance methods.** Action callbacks parse options and call one method on `ModuleInstance`; state, timers and variable/feedback updates live in `main.ts`.
- **All session state is keyed by `event.surfaceId`.** Ignore presses with no surface ID (triggers) or from surfaces not listed in config.
- **No new runtime dependencies** without a real reason — `.yarnrc.yml`'s `npmPreapprovedPackages` is scoped to `@companion-module/*`.
- **ESLint/Prettier configs are centrally maintained** by `@companion-module/tools`. No local overrides; run `yarn format`.
- **`companion/manifest.json`'s `version` and `runtime.apiVersion` stay `"0.0.0"`** — they're set at package time.
- **`src/upgrades.ts` is append-only.** Never edit or remove an entry; add one only when a shipped option shape changes.

## Before considering a change done

- `yarn build` and `yarn lint` pass with zero errors and no suppressions.
- Never commit with `--no-verify`.
- Update ROADMAP.md's checklists when work lands, and keep changes scoped to the phase being worked on.
