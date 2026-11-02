# Roadmap

What's built, what's deliberately out of scope, and what still needs verifying. Keep the checklists in sync as work lands.

Target: **Companion v5.1.1** (latest at time of planning, 2026-11-02), `@companion-module/base` ~2.1.

## Goal

- Multiple independent satellites, each locked with a PIN. A correct PIN opens that user's landing page.
- After a configurable number of seconds without activity, the satellite locks again.
- Multiple users, each with their own PIN.
- A session is active only on the satellite where the PIN was entered.

## Phases

- [x] **Planning.** Companion v5.1.1 source survey, architecture, decisions below.
- [x] **Scaffold.** Repo from `bitfocus/companion-module-template-ts`, manifest/package identity, docs.
- [ ] **Phase 0 — Spike.** Answer the [open questions](#open-questions-phase-0-spike) on a real Companion v5.1.1 install with at least one satellite.
- [x] **Phase 1 — Core.** Exercised offline (faked Companion context); not yet run in Companion.
  - [x] Config: `users` (multiline `name, pin, landingPage`), `satellites` (multiline `surfaceId, lockPage[, label]`), `idleTimeout`, `pinLength`. Bad lines, duplicate PINs/satellites and PINs of the wrong auto-submit length are skipped and reported via connection status (`BadConfig`) and the log.
  - [x] Per-surface state: entry buffer, current user, idle timer.
  - [x] Actions: `digit` (0–9), `backspace`, `clear`, `submit` (or auto-submit at `pinLength`), `touch`, `logout`. Presses with no surface ID or from unlisted surfaces are ignored.
  - [x] Navigation channel: `nav_surface`, `nav_page`, `nav_seq`, with queued, spaced requests.
  - [x] Idle timeout: clear session and navigate to the lock page. Lock all satellites on startup and on every config change.
  - [x] Log every lock, unlock and failed attempt with user and surface.
- [x] **Phase 2 — Buttons.** Exercised offline (faked Companion context); not yet run in Companion.
  - [x] Feedbacks: `entry_display` (advanced: `●●○○` / `●●` / "Enter PIN", "Wrong PIN" for 2s, user name when unlocked) and `state` (boolean: locked / unlocked / wrong PIN), both with a `surface` option defaulting to `$(page:surface_id)`. Cooldown display moves to Phase 3 with the cooldown itself.
  - [x] Variables per satellite: `sat_<id>_user`, `sat_<id>_locked`, `sat_<id>_remaining` (ticks each second while unlocked); global `last_surface_id`. `<id>` is the surface ID with characters outside `A-Za-z0-9_-` replaced by `_`; IDs that collide are rejected in config.
  - [x] Presets: keypad (0–9, ⌫, CLR, OK), PIN display (with red wrong-PIN state), logout.
  - Dropped: countdown preset. Landing pages are per user and shared between satellites, so a button there can't know which satellite's countdown to show. `sat_<id>_remaining` stays for anyone who builds per-satellite pages.
- [ ] **Phase 3 — Hardening.**
  - [ ] Attempt limit and cooldown: `maxAttempts` and `cooldown` config, per-surface attempt counter.
  - [ ] `lock_all` admin action.
  - [ ] Upgrade scripts once option shapes have shipped.

## Decisions

| Question          | Decision                                     | Why                                                                                                                                    |
| ----------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Lock page layout  | One lock page per satellite                  | Buttons render per page location, not per surface, so only a per-satellite page can show that satellite's PIN dots and error feedback. |
| Inactivity source | `pinlock: touch` action on protected buttons | Modules only see presses on their own actions. Accurate and fully in our control; costs one extra action per protected button.         |
| Landing page      | Per user                                     | Each user lands on the same page on every satellite.                                                                                   |
| User storage      | Multiline `textinput` in module config       | Any number of users, edited in Companion. `secret-text` can't be multiline, so PINs are plain text in the config (and in exports).     |
| Config change     | Lock every satellite                         | Sessions were opened against the old user list. Locking is predictable and never leaves a removed user logged in.                      |
| Bad config lines  | Skip the line, report it, keep the rest      | A skipped user simply can't log in, which is safe. Reported as `BadConfig` so it's visible in the connections list.                    |

## Architecture

The module owns all state. Companion does the one thing a module can't: change a surface's page.

```
press on satellite ──► pinlock action (event.surfaceId) ──► module state
                                                               │
                                     nav_surface / nav_page / nav_seq++
                                                               │
                         Companion trigger: "variable nav_seq changed"
                                                               │
                  Surface: Set to page (surface = $(pinlock:nav_surface),
                                         page    = $(pinlock:nav_page))
```

Why not alternatives:

- **Enter button with a follow-up "Set to page" action** — there's no `$(this:surface_id)` local variable in v5.1.1 (`this:` covers page/column/row/location/step/…), so a shared expression can't pick the per-surface landing page.
- **Module calling Companion's TCP remote API** (`SURFACE <id> PAGE-SET <n>`) — works without a trigger but loops back into Companion and needs the TCP listener enabled. Fallback only.
- **Companion's built-in PIN lockout** — one global PIN, no users, no landing page, and its keypad is fixed. Leave it disabled to avoid two locks.

## Companion facts relied on (v5.1.1 source)

- ✅ Module action events carry `surfaceId`; feedback events only carry `controlId` (`@companion-module/base` `module-api/action.d.ts`, `feedback.d.ts`).
- ✅ Internal **Surface: Set to page** takes a `surfaceId` option (default `self`) that accepts expressions; `self` resolves to the pressing surface, any other value is used as the surface ID directly (`companion/lib/Internal/Surface.ts` `#fetchSurfaceId`).
- ✅ Triggers have a "variable changed" event (`Controls/ControlTypes/Triggers/Events/Variable.ts`).
- ✅ The "any button press" trigger event drops the surface ID (`Events/Misc.ts` `#onControlPress`), so it can't drive per-surface idle timers.
- ✅ Page variables (`$(page:<name>)`) exist since v5.1.0 (`Controls/ControlTypes/Page.ts`). Page controls have no press hooks.
- ✅ Internal variables `$(internal:surface_<id>_page)` and `_locked` exist per connected surface (`:` in IDs replaced by `_`).
- ✅ Config field types include `textinput` with `multiline` and `secret-text`; feedback types include `advanced` (can set button text, must declare `affectedProperties` in base 2.1).
- ✅ Variable-change triggers are throttled to one run per 50ms (`VARIABLE_TRIGGER_THROTTLE_MS` in `Events/Variable.ts`). Changes inside the window are merged into one trailing run that reads the variables' values at that moment, so the module spaces navigation requests 100ms apart (`NAV_SPACING_MS` in `main.ts`).
- ✅ A satellite's surface ID is the `SERIAL` (or `DEVICEID`) the Satellite client sends in `ADD-DEVICE`, usually the hardware serial, so it should be stable across reconnects (`Service/Satellite/SatelliteApi.ts`, `Surface/Controller.ts` `addSatelliteDevice`).
- ✅ **Surface: Set to page** moves the surface's group. Satellites in the same surface group share a page, so each pinlock satellite must be in its own group (the default auto-group).

## Open questions (Phase 0 spike)

Answered from source: trigger batching and satellite surface ID format (see above). Still needs a live Companion v5.1.1 with at least one satellite (two for the burst test):

- [ ] Does the trigger move a satellite when `nav_surface` holds its surface ID (expression mode on both fields)?
- [ ] Does `$(page:surface_id)` resolve inside a module feedback option on that page?
- [ ] Does a burst of requests to two satellites move both (100ms spacing holds up)?
- [ ] Confirm the satellite ID shown by `$(pinlock:last_surface_id)` matches the Surfaces tab and survives a Satellite reconnect.

### Spike test procedure

The `spike_*` actions and feedback are temporary and get removed in Phase 1.

1. `yarn build`, then load the module as a developer module in Companion and add a **PIN Lock** connection (label `pinlock`).
2. Create the navigation trigger: **Event:** variable `$(pinlock:nav_seq)` changed. **Action:** _Surface: Set to page_, Surface in expression mode `$(pinlock:nav_surface)`, Page in expression mode `$(pinlock:nav_page)`.
3. On a page shown on a satellite, add a button with **Spike: Navigate this surface to page** (e.g. page 2). Press it on the satellite → it should land on page 2; `$(pinlock:last_surface_id)` shows its ID.
4. On that page, add a page variable `surface_id` with any value, and a button with the **Spike: Show surface option** feedback (default `$(page:surface_id)`). The button should show the page variable's value.
5. With two satellites, put **Spike: Navigate several surfaces at once** on a button with both `surfaceId=page` lines. One press should move both.
6. Restart Satellite and check `$(pinlock:last_surface_id)` is unchanged after the next press.

## Companion setup the user does by hand

1. Add the connection; fill users, satellites, timeout. Use `$(pinlock:last_surface_id)` to discover satellite IDs.
2. Build the lock page template from presets and give it a page variable `surface_id`.
3. Copy the lock page once per satellite; change only `surface_id`.
4. Surfaces tab: set each satellite's startup page to its lock page.
5. Create the navigation trigger (see [Architecture](#architecture)).
6. Add `pinlock: touch` to every button on protected pages; add a Logout button.
7. Remove page up/down/jump buttons from lock pages; on protected pages, keep navigation within protected pages. Leave Companion's built-in PIN lockout off.
8. Set a Companion admin password and keep the emulator off untrusted networks.

### Known limitations (accepted)

- **Convenience lock, not access control.** Anyone with the Companion web UI or emulator can bypass it.
- **Reconnects aren't observed.** A satellite that drops while unlocked comes back on its lock page (startup page), but the module's session stays open until the idle timer expires. A new PIN entry just starts a fresh session, so nothing is exposed.
- **Activity outside `touch`** (e.g. a button without the touch action) doesn't extend the session.
