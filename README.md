# Hytale Devtools

This extension provides tools to make Hytale modding easier.

## Features

### Create New Hytale Mod
- In the selected destination, creates a new mod project.
- Includes the generated companion mod artifact folder in launch `--mods` (`.../companion/HytaleDevtoolsCompanion/build/libs`).

## Companion Mod Generation

On extension activation, the extension generates and builds `HytaleDevtoolsCompanion` from `templates/companion-mod` into extension global storage and injects the schema export path dynamically.
Command registration is not blocked while this companion build runs.

The companion patchline can be configured with `hytale-devtools.companionPatchline` (`auto`, `release`, `pre-release`).
`auto` checks installed Hytale patchlines and falls back to `release`.

## Planned Features

- New Command: Hytale: Overwrite existing asset
    - Will prompt for type of asset, then dynamically use the list of available Vanilla assets to overwrite, then create the asset file in the correct directory.
- New Command: Hytale: Create new asset
    - Will prompt for type of asset, an existing asset to copy from, and a name of the asset, then create the asset file in the correct directory.
