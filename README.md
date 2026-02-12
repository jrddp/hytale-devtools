# Hytale Devtools

This extension provides tools to make Hytale modding easier.

## Features

### Command: Create New Hytale Mod
- Select a parent folder and a fully-configured basic mod template will be generated that you can immediately start working on.
- Automatically respects the author, group, and mod title in the template.

## Command: Copy Base Game Asset
- Select an asset type to search or search all assets, then automatically copy it to the correct destination.

### Command: Add Listener
- Easily select from all available base game event listeners and generate a function to handle it in your code.

### Auto-Completion and Hints
- When editing asset JSON files, full auto-completion and description tooltips are now provided for all assets types.
- Dynamically generated using the same in-game data that the asset editor gets its information from, so it is always up to date.
- More advanced completion than the base game's asset editor, including dynamically populated auto-completion of other asset IDs.

## Planned Features

- Asset JSON auto-completion support for Common Asset paths such as setting texture pngs or blockymodels.
- Improve the experience of opening blockymodels/animations in blockbench from VSCode.
- Custom node editor for world generation and behavior tree configuration.
- Custom key-value editor similar to the base game's asset editor to show and edit the full list of available properties and inherited values of an asset.

## Attribution
- The base template used for creating new mods is based on Build-9's [Hytale Example Project](https://github.com/Build-9/Hytale-Example-Project).
