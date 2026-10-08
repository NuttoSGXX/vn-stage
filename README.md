# Grim VN Stage

Visual-novel style character portraits that float over the screen (not tied to any scene), controlled from a floating GM-only panel. Dark-fantasy styling that matches **Grim Almanac**. For Foundry VTT V14.

## Install

In Foundry: Install Module, then paste this Manifest URL:

```
https://github.com/NuttoSGXX/vn-stage/releases/latest/download/module.json
```

## Usage

The panel is visible to the GM only. Every player sees the portraits on screen, but not the panel.

Drag the panel by its header. Click a tab icon to open it (the tab name appears next to the icon); click the active tab again to collapse.

- **Scene**: saved stages (presets), each with ten slots in one long row.
  - The panel shows about 2.5 stages at a time (Setting > Stage rows shown, 1.5 to 3.5); scroll down for more. New stages are added at the bottom.
  - The top bar has a dropdown of all saved stages with a **Warp** button, so you can jump to any stage without scrolling. Each stage row also has its own Warp button. The stage marked **LIVE** is the one shown on screen.
  - **New stage** adds an empty stage; the copy button duplicates a stage; the X deletes one. Rename a stage in its title field. Characters can sit in several stages at once; only the live stage is visible.
  - Pick a character from each slot's dropdown. A lone character stands centred between slots 5 and 6.
  - Arrows move a character one slot; a neighbour in the way is pushed along, with an animated tween.
  - The round button toggles Active: filled red = visible, hollow = darkened to 50%.
  - Shake and Run off act on the screen, so they work on the live stage only. Run off leaves the slot empty.
  - Flip mirrors the portrait with an in-between animation.
  - The face button under a character lists its expressions (the first is always Default) and swaps the image.
  - **Hide all** hides every portrait temporarily without removing anything.
- **Characters**: press **+** to add a character image and give it a name. Click an image to replace it. Characters show up in the Scene dropdowns.
- **Detail**: a police line-up of full-body figures in front of a height ruler (Size 1 = 6'0").
  - Click a figure to open a popup with Size, Y offset and X offset (type numbers or use the sliders) and a Reset button.
  - Drag the popup by its title bar anywhere on screen, even outside the panel. Close it with the X button or Esc.
  - The popup also manages **Expressions**: press + to add an image and name it (Happy, Sad...). The first row is Default (the main image); rename it or replace its image if you like.
  - Long names are cut with an ellipsis instead of widening the layout.
- **Setting**: panel size, portrait height, bottom offset, move speed, inactive brightness, and the GM-only slot markers.

## Changelog

**0.3.0**
- Multiple saved stages with a Warp dropdown, per-stage Warp, New stage, duplicate, delete and rename. Existing single-stage data is migrated automatically.
- Expressions: add named images per character in Detail, switch them from the face button in Scene.
- The Detail popup can now be dragged outside the panel.
- New setting: Stage rows shown.

**0.2.2**
- The Detail popup can be dragged by its title bar, and now opens beside the figure instead of on top of it.
- README rewritten in English.

**0.2.1**
- Tabs are now icon buttons that look like real buttons (DM screen, person, stacked lines, gear). The name appears next to the icon when the tab is open.
- Detail is now a full-body line-up against a height ruler, with a popup editor for Size and offsets.
- Long names no longer stretch the layout.

**0.2.0**
- Renamed to Grim VN Stage and restyled to match Grim Almanac.
- Panel is about half the size, adjustable with Setting > Panel size.
- New Scene buttons: shake, run off screen, flip.
- Fixed Detail scrolling back to the start after editing a value.

**0.1.2**
- Scene slots in one row, round Active toggle, Hide all, typeable numbers, Reset button.

**0.1.0**
- First version.

## License

Code: MIT. Fonts Grenze and Cinzel: SIL Open Font License 1.1 (see `fonts/FONTS.txt`).
