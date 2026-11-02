## PIN Lock

Locks Companion surfaces behind a PIN code. Each surface has its own session: entering a PIN on one satellite only unlocks that satellite.

> **Not yet tested in a live Companion install.** See ROADMAP.md in the repository.

### How it works

The module keeps track of who is logged in on each surface. It cannot change pages itself, so it publishes navigation requests as variables (`$(pinlock:nav_surface)`, `$(pinlock:nav_page)`, `$(pinlock:nav_seq)`) and a single Companion trigger carries them out.

### Setup

1. In the connection config, add users (`name, pin, landing page` per line) and satellites (`surface ID, lock page[, label]` per line). To find a satellite's ID, press any pinlock button on it and read `$(pinlock:last_surface_id)`.
2. Build a lock page from the **Lock page** presets (keypad and PIN display). Give the page a page variable `surface_id` holding the satellite's surface ID, then copy the page once per satellite and change only `surface_id`.
3. In the Surfaces tab, set each satellite's startup page to its lock page. Keep each satellite in its own surface group (the default).
4. Create a trigger: **Event:** variable `$(pinlock:nav_seq)` changed. **Action:** _Surface: Set to page_, with Surface set to the expression `$(pinlock:nav_surface)` and Page set to the expression `$(pinlock:nav_page)`.
5. Add the **Touch** action to every button on protected pages so activity keeps the session alive, and add a **Log out** button.
6. Remove page up/down/jump buttons from lock pages, and make sure page navigation on protected pages only reaches other protected pages. Leave Companion's built-in PIN lockout off.

Saving the connection config locks every satellite.

### Actions

- **Enter digit**, **Delete last digit**, **Clear entry**, **Submit PIN**: the lock page keypad. With _Auto-submit PIN length_ set, the PIN is checked as soon as enough digits are entered.
- **Touch (keep session alive)**: restarts the idle timer for the surface that pressed it.
- **Log out**: locks the surface that pressed it.

### Feedbacks

Both take a _Surface ID_ option that defaults to `$(page:surface_id)`.

- **PIN entry display**: button text showing PIN progress, "Wrong PIN", or the logged-in user.
- **Satellite state**: true when the satellite is locked, unlocked, or showing a wrong PIN.

### Variables

- `$(pinlock:last_surface_id)`: the last surface that pressed a pinlock button.
- `$(pinlock:sat_<id>_user)`, `$(pinlock:sat_<id>_locked)`, `$(pinlock:sat_<id>_remaining)`: per satellite, where `<id>` is the surface ID with characters other than letters, digits, `_` and `-` replaced by `_`.
- `$(pinlock:nav_surface)`, `$(pinlock:nav_page)`, `$(pinlock:nav_seq)`: used by the navigation trigger.

This is a convenience lock. Anyone with access to the Companion web UI or emulator can bypass it, so set an admin password on Companion.
