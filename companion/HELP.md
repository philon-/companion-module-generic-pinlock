## PIN Lock

Locks Companion surfaces behind a PIN code. Each surface has its own session: entering a PIN on one satellite only unlocks that satellite. Multiple users each have their own PIN and landing page, and a satellite locks again after a period without activity.

> **Not yet tested in a live Companion install.** The repository's README has a full worked example.

### How it works

The module keeps track of who is logged in on each satellite. It can't change pages itself, so it publishes navigation requests as variables and one Companion trigger carries them out.

### Setup

1. **Connection config.** Add users (`name, pin, landing page` per line) and satellites (`surface ID, lock page[, label]` per line). To find a satellite's ID, press any pinlock button on it and read `$(pinlock:last_surface_id)`.
2. **Lock pages.** Build a lock page from the _Lock page_ presets (keypad and PIN display). Add a page variable `surface_id` holding the satellite's surface ID. Copy the page once per satellite and change only `surface_id`.
3. **Surfaces tab.** For each satellite, turn off _Use Last Page At Startup_ and set _Startup Page_ to its lock page. Keep each satellite in its own surface group (the default).
4. **Navigation trigger.** Event: _On variable change_ watching `$(pinlock:nav_seq)`. Action: _Surface: Set to page_, with Surface in expression mode `$(pinlock:nav_surface)` and Page in expression mode `$(pinlock:nav_page)`.
5. **Protected pages.** Add the **Touch** action to every button so activity keeps the session alive, and add a **Log out** button.
6. **Close the gaps.** Remove page up/down/jump buttons from lock pages, and make sure page navigation on protected pages only reaches other protected pages. Leave Companion's built-in PIN lockout off.

### Settings

- **Idle timeout**: seconds without a Touch before a satellite locks.
- **Auto-submit PIN length**: when set, the PIN is checked as soon as that many digits are entered, and every PIN must have that length. 0 means press Submit.
- **Wrong PINs before lockout** and **Lockout duration**: after that many wrong PINs on a satellite, PIN entry there is blocked for that long. A correct PIN resets the count. 0 attempts means no limit.

Saving the connection config locks every satellite and resets any lockouts.

### Actions

- **Enter digit**, **Delete last digit**, **Clear entry**, **Submit PIN**: the lock page keypad.
- **Touch (keep session alive)**: restarts the idle timer for the surface that pressed it. A locked surface that presses it is sent back to its lock page.
- **Log out**: locks the surface that pressed it.
- **Lock all satellites**: locks every satellite. Can be run from a trigger, e.g. at a fixed time of day.

The **Spike** actions and feedback are temporary test tools and will be removed.

### Feedbacks

Both take a _Surface ID_ option that defaults to `$(page:surface_id)`.

- **PIN entry display**: button text showing PIN progress, "Wrong PIN", the lockout countdown, or the logged-in user.
- **Satellite state**: true when the satellite is locked, unlocked, showing a wrong PIN, or locked out.

### Variables

- `$(pinlock:sat_<id>_user)`, `$(pinlock:sat_<id>_locked)`, `$(pinlock:sat_<id>_remaining)`: per satellite, where `<id>` is the surface ID with characters other than letters, digits, `_` and `-` replaced by `_`.
- `$(pinlock:last_surface_id)`: the last surface that pressed a pinlock button.
- `$(pinlock:nav_surface)`, `$(pinlock:nav_page)`, `$(pinlock:nav_seq)`: read by the navigation trigger.

This is a convenience lock. Anyone with access to the Companion web UI or emulator can bypass it, so set an admin password on Companion. PINs are stored in plain text in the connection config.
