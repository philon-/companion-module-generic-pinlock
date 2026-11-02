# Roadmap

Status, design decisions and verification for the module. User-facing setup and limitations live in [README.md](./README.md). Keep the checklists in sync as work lands.

Targets Companion v5.1.1 and `@companion-module/base` ~2.1 (current as of 2026-11-02).

## Goal

- Multiple independent satellites, each locked with a PIN. A correct PIN opens that user's landing page.
- After a configurable number of seconds without activity, the satellite locks again.
- Multiple users, each with their own PIN.
- A session is active only on the satellite where the PIN was entered.

## Status

Everything below has been exercised offline only, by running the built module against a faked Companion context. None of it has run in a live Companion install yet.

- [x] **Core.** Users and satellites config, PIN sessions per satellite, idle timeout, navigation requests, logging.
- [x] **Buttons.** PIN display and satellite state feedbacks, per-satellite variables, lock page and logout presets.
- [x] **Hardening.** Wrong-PIN lockout, Lock all satellites, re-lock when a locked satellite presses Touch.
- [ ] **Live verification.** See [Live verification](#live-verification).
- [ ] **Before the first release.**
  - [ ] Remove the `spike_*` actions and feedback, and their mentions in README.md and HELP.md.
  - [ ] Remove the "not yet tested" notes from README.md and HELP.md.
  - [ ] No upgrade scripts are needed for the first release. After it, add one whenever a shipped option or config shape changes.

## Live verification

Needs Companion v5.1.1 with at least one satellite, and two for the burst and isolation checks.

### Navigation spike (run first)

Trigger batching and the satellite surface ID format were answered from Companion's source (see [Companion facts](#companion-facts-relied-on-v511-source)). The rest needs a live install:

- [ ] Does the trigger move a satellite when `nav_surface` holds its surface ID (expression mode on both fields)?
- [ ] Does `$(page:surface_id)` resolve inside a module feedback option on that page?
- [ ] Does a burst of requests to two satellites move both (does the 100ms spacing hold up)?
- [ ] Does the ID shown by `$(pinlock:last_surface_id)` match the Surfaces tab, and survive a Satellite reconnect?

Procedure, using the temporary `spike_*` items:

1. `yarn build`, load the module as a developer module in Companion and add a **PIN Lock** connection with the label `pinlock`.
2. Create the navigation trigger: event _On variable change_ watching `$(pinlock:nav_seq)`; action _Surface: Set to page_ with Surface in expression mode `$(pinlock:nav_surface)` and Page in expression mode `$(pinlock:nav_page)`.
3. On a page shown on a satellite, add a button with **Spike: Navigate this surface to page** (e.g. page 2). Pressing it on the satellite should land on page 2, and `$(pinlock:last_surface_id)` should show its ID.
4. On that page, add a page variable `surface_id` with any value, and a button with the **Spike: Show surface option** feedback. The button should show the page variable's value.
5. With two satellites, put **Spike: Navigate several surfaces at once** on a button with one `surfaceId=page` line per satellite. One press should move both.
6. Restart Satellite and check `$(pinlock:last_surface_id)` is unchanged after the next press.

### Full module

Set up the README's two-desk example, then check:

- [ ] Each lock page's display shows `Enter PIN`, dots, `Wrong PIN` and the lockout countdown for its own satellite only.
- [ ] A correct PIN moves only that satellite to the user's landing page; the other stays locked.
- [ ] The idle timeout returns the satellite to its lock page, and Touch presses extend it.
- [ ] Log out and Lock all satellites both lock and navigate correctly.
- [ ] The lockout starts after the configured number of wrong PINs, and a Log out press doesn't clear it.
- [ ] A locked satellite that presses a Touch button on a protected page goes back to its lock page. To set this up, disable the trigger, let a session idle out, enable the trigger again, then press.
- [ ] Saving the connection config locks every satellite.
- [ ] Find where Companion's UI adds a page variable, and make README step 3 name it.

## Design

### Architecture

The module owns all state. Companion does the one thing a module can't: change a surface's page.

```
press on satellite ──► pinlock action (event.surfaceId) ──► module state
                                                               │
                                     nav_surface / nav_page / nav_seq++
                                                               │
                      Companion trigger: "On variable change" (nav_seq)
                                                               │
                  Surface: Set to page (surface = $(pinlock:nav_surface),
                                         page    = $(pinlock:nav_page))
```

Alternatives considered:

- **An Enter button with a follow-up "Set to page" action.** There's no `$(this:surface_id)` local variable in v5.1.1 (`this:` covers page, column, row, location, step and so on), so a shared expression can't pick the landing page for the pressing surface.
- **The module calling Companion's TCP remote API** (`SURFACE <id> PAGE-SET <n>`). It works without a trigger, but it loops back into Companion and needs the TCP listener enabled. Fallback only.
- **Companion's built-in PIN lockout.** One global PIN, no users, no landing page, and a fixed keypad. Leave it disabled to avoid two locks.

### Decisions

| Question                      | Decision                                     | Why                                                                                                                                    |
| ----------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Lock page layout              | One lock page per satellite                  | Buttons render per page location, not per surface, so only a per-satellite page can show that satellite's PIN dots and error feedback. |
| Inactivity source             | `pinlock: touch` action on protected buttons | Modules only see presses on their own actions. Accurate and fully in our control; costs one extra action per protected button.         |
| Landing page                  | Per user                                     | Each user lands on the same page on every satellite.                                                                                   |
| User storage                  | Multiline `textinput` in module config       | Any number of users, edited in Companion. `secret-text` can't be multiline, so PINs are plain text in the config (and in exports).     |
| User identification           | The PIN alone; PINs must be unique           | No username entry on a keypad. Duplicates are rejected in config.                                                                      |
| Config change                 | Lock every satellite and reset lockouts      | Sessions were opened against the old user list. Locking is predictable and never leaves a removed user logged in.                      |
| Bad config lines              | Skip the line, report it, keep the rest      | A skipped user simply can't log in, which is safe. Reported as `BadConfig` so it's visible in the connections list.                    |
| Lockout state                 | Kept per satellite, outside the session      | Sessions are dropped on every lock, so a Log out press on the lock page would otherwise reset the lockout.                             |
| Touch from a locked satellite | Send it back to its lock page                | It means a lock navigation never landed (satellite offline, last page restored, trigger disabled).                                     |
| Countdown preset              | Dropped; `sat_<id>_remaining` variable kept  | Landing pages are shared between satellites, so a preset there can't know whose countdown to show.                                     |

### Companion facts relied on (v5.1.1 source)

- Module action events carry `surfaceId`; feedback events only carry `controlId` (`@companion-module/base` `module-api/action.d.ts`, `feedback.d.ts`).
- Internal **Surface: Set to page** takes a `surfaceId` option (default `self`) that accepts expressions. `self` resolves to the pressing surface; any other value is used as the surface ID directly (`companion/lib/Internal/Surface.ts` `#fetchSurfaceId`).
- **Surface: Set to page** moves the surface's group. Satellites in the same surface group share a page, so each pinlock satellite must be in its own group (the default auto-group).
- Triggers have an _On variable change_ event (`Controls/ControlTypes/Triggers/Events/Variable.ts`). It's throttled to one run per 50ms (`VARIABLE_TRIGGER_THROTTLE_MS`); changes inside the window merge into one trailing run that reads the variables' values at that moment. That's why the module spaces navigation requests 100ms apart (`NAV_SPACING_MS` in `main.ts`).
- The _On any button press_ trigger event drops the surface ID (`Events/Misc.ts` `#onControlPress`), so it can't drive per-surface idle timers.
- Page variables (`$(page:<name>)`) exist since v5.1.0 (`Controls/ControlTypes/Page.ts`). Page controls have no press hooks.
- A satellite's surface ID is the `SERIAL` (or `DEVICEID`) the Satellite client sends in `ADD-DEVICE`, usually the hardware serial, so it should be stable across reconnects (`Service/Satellite/SatelliteApi.ts`, `Surface/Controller.ts` `addSatelliteDevice`).
- Config fields support `textinput` with `multiline`, and `secret-text` (single line only). Advanced feedbacks can set button text and must declare `affectedProperties` in base 2.1.
