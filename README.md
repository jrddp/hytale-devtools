# Hytale Devtools

## Getting Started

### Install the Extension

1. Install [Visual Studio Code](https://code.visualstudio.com/).
2. Open the Extensions view in VS Code.
3. Search for "Hytale Devtools" and install it.
4. Install the [Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) so VS Code can build and run Hytale mods.

### Create a New Hytale Mod

1. Open the command palette with `Ctrl+Shift+P` on Windows/Linux or `Cmd+Shift+P` on macOS.
   - You can also press `Ctrl+P` or `Cmd+P`, type `>`, then search for the command.
2. Search for and run "Hytale Devtools: Create New Hytale Mod".
3. Choose where to create the mod workspace and follow the prompts.

### Run Your Mod

1. Open the generated mod workspace in VS Code.
2. Open the Run and Debug view.
3. Select "Run Hytale Server" if it is not already selected, then click the green run arrow.
4. Read the server terminal instructions to authenticate with Hytale the first time you run it.
5. In Hytale, connect to `localhost:5520`.

The generated launch config uses Hytale's default server port, `5520`. If you later customize the server `--bind` argument, connect to that custom port instead.

### Create or Copy Assets

1. Open the command palette with `Ctrl+Shift+P` on Windows/Linux or `Cmd+Shift+P` on macOS.
2. Search for and run "Hytale Devtools: Copy Base Game Asset".
3. Pick the base game asset you want to copy, then choose the destination for your mod.

Use these asset types to open the specialized editors:

- **NPC Editor:** copy an `NPCRole` asset.
- **Worldgen Editor:** copy a `Biome` asset.
- **Asset Editor:** create or copy any other supported asset.

## Instantly Create New Mods

Instantly create new fully-configured mods using the "Create New Hytale Mod" command.

## Easily Copy/Create Any Asset

Easily create new assets in their respective folders, override existing assets, or copy existing assets as templates.

![Copy Asset Demo](media/demo_images/copy-asset-demo.gif)

## Built-in Worldgen and NPC Node Editor

This extension includes a custom node editor for modifying World Generation, Scriptable Brush, and NPC Role files, including several improvements and new features over the original editors.

### Fully Cross-Platform

macOS, Windows, and Linux users can now participate in Worldgen and NPC development with full cross-platform support!

### Autocomplete, Documentation Tooltips, and Color Picker

Autocompletion values are generated based on the Server code itself, and are updated automatically by using a light-weight companion mod built into the extension, automatically set up to be included when you run your mod's server in VSCode.

![Autocomplete Demo](media/demo_images/autocomplete-demo.gif)
![Color Picker Demo](media/demo_images/color-picker.gif)

### Optimized Control Schemes for Mouse AND Trackpad

Clicking and dragging to move through the workspace can get tedious on a trackpad, so I added a Trackpad-specific control scheme that allows you to freely scroll through the workspace and pinch to zoom!

![Mouse vs Trackpad Demo](media/demo_images/mouse-vs-trackpad-demo.gif)

### Styling Updates

Field alignments and node sizes are now more compact and aligned to be more readable.

![Original Styling](media/demo_images/style-example-original.png)
![Our Styling](media/demo_images/style-example-ours.png)

### Works with any color theme

![Color Theme Demo](media/demo_images/group-zooming.gif)

### Customizable Keybinds

Keybindable actions such as searching and auto-layout can be fully customized.

![Keybinding Demo](media/demo_images/keyboard-customization.gif)

### Improved search + Keyboard-only control

- Search for a field to automatically focus it for keyboard editing - no mouse required.
- Searched nodes are sorted by distance, so you can quickly jump to any node you see by typing.
- Scrolling through the search selections will preview them in real-time, and cancelling the search will return you to your original position.

![Search Demo](media/demo_images/search-demo.gif)


### Always-Visible Group Titles

Managing large workspaces becomes easy when organizing with groups. No matter how far you zoom out, you can tell which groups are which without them blocking your vision close-up.

![Group Zooming Demo](media/demo_images/group-zooming.gif)

## Future Planned Features

- Custom key-value editor similar to the base game's asset editor to show and edit the full list of available properties and inherited values of an asset.

## Attribution
- The base template used for creating new mods is based on Build-9's [Hytale Example Project](https://github.com/Build-9/Hytale-Example-Project).
