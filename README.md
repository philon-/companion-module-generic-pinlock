# companion-module-generic-pinlock

PIN code lock for Bitfocus Companion surfaces. Each surface (e.g. a Companion Satellite) locks and unlocks independently, supports multiple users with their own PIN and landing page, and locks again after a period of inactivity.

See [HELP.md](./companion/HELP.md), [ROADMAP.md](./ROADMAP.md) and [LICENSE](./LICENSE).

## Getting started

Executing a `yarn` command should perform all necessary steps to develop the module, if it does not then follow the steps below.

The module can be built once with `yarn build`. This should be enough to get the module to be loadable by companion.

While developing the module, by using `yarn dev` the compiler will be run in watch mode to recompile the files on change.
