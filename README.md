# companion-module-generic-pinlock

PIN code lock for Bitfocus Companion surfaces. Each surface (e.g. a Companion Satellite) locks and unlocks independently, supports multiple users with their own PIN and landing page, and locks again after a period of inactivity.

Requires **Companion v5.1 or later** (it relies on page variables).

> **Not yet tested in a live Companion install.** The logic has been exercised offline; see [ROADMAP.md](./ROADMAP.md) for what still needs verifying.

See also [HELP.md](./companion/HELP.md) (shown inside Companion), [ROADMAP.md](./ROADMAP.md) and [LICENSE](./LICENSE).

## How it fits together

A module can't change which page a surface shows, so the work is split:

- **The module** keeps track of who is logged in on each surface, checks PINs, runs the idle timers, and publishes "move surface X to page N" requests as variables.
- **One Companion trigger** watches those variables and runs the built-in _Surface: Set to page_ action.
- **Your pages** provide the keypad (lock pages) and the protected content (landing pages).

```
 satellite press ─► pinlock action ─► module state ─► nav_surface / nav_page / nav_seq
                                                                  │
                     trigger "nav_seq changed" ◄──────────────────┘
                                  │
                     Surface: Set to page ─► satellite shows lock page or landing page
```

## Example: two desks, two users

The rest of this README sets up this example end to end:

| Thing        | Value                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Satellites   | **Desk A** (surface ID `CL12345`) and **Desk B** (surface ID `CL67890`), 15-key Stream Decks   |
| Users        | **Alice**, PIN `4821`, lands on page 20 (audio). **Bob**, PIN `1397`, lands on page 30 (video) |
| Lock pages   | Page 10 for Desk A, page 11 for Desk B                                                         |
| Idle timeout | 2 minutes                                                                                      |

Alice can log in on either desk. If she logs in on Desk A, Desk B stays locked.

### 1. Find the surface IDs

Add a **PIN Lock** connection (keep the label `pinlock`; every variable below uses it). Put any pinlock button, e.g. the _Digit 1_ preset, on a page each satellite can reach, press it on the satellite and read `$(pinlock:last_surface_id)`. The surface ID also appears in Companion's Surfaces tab.

### 2. Configure the connection

**Users** (`name, pin, landing page`, one per line; `#` starts a comment):

```
# name,  pin,  landing page
Alice,   4821, 20
Bob,     1397, 30
```

**Satellites** (`surface ID, lock page[, label]`, one per line). Only surfaces listed here are locked:

```
CL12345, 10, Desk A
CL67890, 11, Desk B
```

| Setting                                   | Example | Notes                                                                     |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------- |
| Idle timeout (seconds)                    | `120`   | Counted from the last **Touch** on that satellite.                        |
| Auto-submit PIN length (0 = press Submit) | `4`     | When set, every PIN must have exactly this many digits; no OK key needed. |
| Wrong PINs before lockout (0 = no limit)  | `5`     | Counted per satellite. A correct PIN resets the count.                    |
| Lockout duration (seconds)                | `30`    | PIN entry is blocked on that satellite for this long.                     |

PINs are digits only and must be unique, because the PIN alone identifies the user. Invalid lines are skipped and the connection shows a config error naming the line. Saving the config locks every satellite.

### 3. Build the lock pages

Build page 10 from the **Lock page** presets. For a 15-key Stream Deck:

```
 ┌─────┬─────┬─────┬─────┬─────────┐
 │  7  │  8  │  9  │  ⌫  │ DISPLAY │
 ├─────┼─────┼─────┼─────┼─────────┤
 │  4  │  5  │  6  │ CLR │         │
 ├─────┼─────┼─────┼─────┼─────────┤
 │  1  │  2  │  3  │  0  │   OK    │
 └─────┴─────┴─────┴─────┴─────────┘
```

| Button    | Preset            | Wiring                                                                                     |
| --------- | ----------------- | ------------------------------------------------------------------------------------------ |
| `0`–`9`   | Digit 0–9         | Press: `pinlock: Enter digit` (digit = the key's number)                                   |
| `⌫`       | Delete last digit | Press: `pinlock: Delete last digit`                                                        |
| `CLR`     | Clear entry       | Press: `pinlock: Clear entry`                                                              |
| `OK`      | Submit PIN        | Press: `pinlock: Submit PIN` (not needed with auto-submit)                                 |
| `DISPLAY` | PIN display       | Feedbacks: `pinlock: PIN entry display` and `pinlock: Satellite state` = _Wrong PIN_ (red) |

Then give page 10 a **page variable** named `surface_id` with the value `CL12345`. The display button's feedbacks have a _Surface ID_ option that defaults to `$(page:surface_id)`, so this is how the button knows which satellite it belongs to. Every action works out the pressing surface by itself and needs no setting.

Copy page 10 to page 11 and change only the page variable: `surface_id` = `CL67890`.

The display shows `Enter PIN`, then `●●○○` while typing, `Wrong PIN` on a red background for 2 seconds after a miss, and `Too many attempts / Wait 30s` during a lockout.

> Each satellite needs its own lock page. Companion draws a button once per page, not once per surface, so a shared lock page would show both desks the same dots.

### 4. Create the navigation trigger

This is the only trigger you need, however many satellites you have.

| Trigger part | Setting                                                       |
| ------------ | ------------------------------------------------------------- |
| Event        | _On variable change_, variable to watch: `$(pinlock:nav_seq)` |
| Action       | _Surface: Set to page_                                        |
| ↳ Surface    | Switch to expression mode and enter `$(pinlock:nav_surface)`  |
| ↳ Page       | Switch to expression mode and enter `$(pinlock:nav_page)`     |

### 5. Set the surfaces' startup pages

In the Surfaces tab, turn off _Use Last Page At Startup_ for both satellites and set their _Startup Page_ to 10 (Desk A) and 11 (Desk B), so a restarted satellite comes back locked. Keep each satellite in its own surface group (the default): satellites in a shared group share a page, so they would lock and unlock together.

### 6. Wire the protected pages

On every button of pages 20 and 30, add **`pinlock: Touch (keep session alive)`** to the press actions, after the button's own actions. A button without Touch still works but doesn't count as activity, so the satellite can lock while someone is using it.

Example: a "Mic 1 mute" button on page 20:

| Step  | Action                                   |
| ----- | ---------------------------------------- |
| Press | `audio-mixer: Mute channel 1` (your own) |
| Press | `pinlock: Touch (keep session alive)`    |

Add a **Log out** button (preset under _Protected pages_) to each landing page. It locks the satellite that pressed it and sends it back to that satellite's lock page.

Page navigation can bypass the lock: remove page up/down/jump buttons from the lock pages, and make sure any page buttons on protected pages only lead to other protected pages. Leave Companion's built-in PIN lockout off so there aren't two locks.

## Variables

Variables for each satellite use its surface ID with every character other than letters, digits, `_` and `-` replaced by `_`. So `CL12345` gives `sat_CL12345_*`, and a local `streamdeck:CL1` gives `sat_streamdeck_CL1_*`.

| Variable                                        | Example (Desk A)                   | Value                                                    |
| ----------------------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| `$(pinlock:sat_<id>_user)`                      | `$(pinlock:sat_CL12345_user)`      | Logged-in user's name; empty when locked                 |
| `$(pinlock:sat_<id>_locked)`                    | `$(pinlock:sat_CL12345_locked)`    | `true` / `false`                                         |
| `$(pinlock:sat_<id>_remaining)`                 | `$(pinlock:sat_CL12345_remaining)` | Seconds until the idle lock; `0` when locked             |
| `$(pinlock:last_surface_id)`                    |                                    | Last surface that pressed any pinlock button (setup aid) |
| `$(pinlock:nav_surface)`, `nav_page`, `nav_seq` |                                    | Navigation request, read by the trigger only             |

Ways to use them:

- **Show who is logged in** on a button of a page only Desk A uses: text `$(pinlock:sat_CL12345_user)`.
- **Countdown before the idle lock** on that same button: text `$(pinlock:sat_CL12345_remaining)s`. This only makes sense on a page that belongs to one satellite. Landing pages are shared between satellites, so a button there can't know whose countdown to show.
- **Colour a status button** with the internal _Variable: Check value_ feedback on `$(pinlock:sat_CL12345_locked)` = `true`.
- **Lock everything at night**: a trigger with a _Time of Day_ event at 23:00 and the action `pinlock: Lock all satellites`.

## Actions and feedbacks

| Action                                                     | Use on                  | Effect                                                                        |
| ---------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| Enter digit / Delete last digit / Clear entry / Submit PIN | Lock pages              | PIN entry on the pressing surface. Ignored while it's unlocked or locked out. |
| Touch (keep session alive)                                 | Every protected button  | Restarts the pressing surface's idle timer                                    |
| Log out                                                    | Landing pages           | Locks the pressing surface                                                    |
| Lock all satellites                                        | Admin button or trigger | Locks every listed satellite                                                  |

| Feedback          | Options                                                       | Shows                                                                                |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| PIN entry display | Surface ID (default `$(page:surface_id)`)                     | Button text: `Enter PIN`, `●●○○`, `Wrong PIN`, lockout countdown, or the user's name |
| Satellite state   | Surface ID; state: Locked / Unlocked / Wrong PIN / Locked out | True in that state. _Locked_ also covers Wrong PIN and Locked out.                   |

The `Spike:` actions and feedback are temporary test tools and will be removed before the first release.

## Limitations

- **A convenience lock, not access control.** Anyone with access to the Companion web UI or emulator can get past it. Set an admin password on Companion and keep the emulator off untrusted networks.
- **PINs are stored in plain text** in the connection config, and are included in Companion exports.
- **Reconnects aren't detected.** A satellite that drops while unlocked comes back on its lock page (its startup page), but the session stays open until the idle timer runs out. Entering a PIN just starts a new session.

## Development

Executing a `yarn` command should perform all necessary steps to develop the module, if it does not then follow the steps below.

The module can be built once with `yarn build`. This should be enough to get the module to be loadable by companion.

While developing the module, by using `yarn dev` the compiler will be run in watch mode to recompile the files on change.
