## PIN Lock

Locks Companion surfaces behind a PIN code. Each surface has its own session: entering a PIN on one satellite only unlocks that satellite.

> **Work in progress.** The actions, feedbacks and variables below are planned and not yet implemented — see ROADMAP.md in the repository.

### How it works

The module keeps track of who is logged in on each surface. It cannot change pages itself, so it publishes navigation requests as variables (`$(pinlock:nav_surface)`, `$(pinlock:nav_page)`, `$(pinlock:nav_seq)`) and a single Companion trigger carries them out.

### Setup

1. Add users (`name, pin, landingPage` per line) and satellites (`surfaceId, lockPage` per line) in the connection config.
2. Build a lock page with the keypad presets. Give it a page variable `surface_id` holding the satellite's surface ID, and copy it once per satellite.
3. In the Surfaces tab, set each satellite's startup page to its lock page.
4. Create a trigger: **Event:** variable `$(pinlock:nav_seq)` changed. **Action:** _Surface: Set to page_, with Surface set to the expression `$(pinlock:nav_surface)` and Page set to the expression `$(pinlock:nav_page)`.
5. Add **pinlock: Touch** to every button on protected pages so activity keeps the session alive, and add a Logout button.
6. Remove page up/down/jump buttons from lock pages, and make sure page navigation on protected pages only reaches other protected pages.

This is a convenience lock. Anyone with access to the Companion web UI or emulator can bypass it, so set an admin password on Companion.
