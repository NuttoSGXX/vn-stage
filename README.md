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

- **Scene**: ten slots in one long row.
  - Pick a character from each slot's dropdown. A lone character stands centred between slots 5 and 6.
  - ◀ ▶ move a character one slot; a neighbour in the way is pushed along, with an animated tween.
  - The round button toggles Active: filled red = visible, hollow = darkened to 50%.
  - Shake: the portrait shakes visual-novel style on every screen.
  - Run off: the character runs off the screen edge and the slot is left empty.
  - Flip: mirrors the portrait with an in-between animation.
  - **Hide all** hides every portrait temporarily without removing anything. **Show all** brings them back.
- **Characters**: press **+** to add a character image and give it a name. Click an image to replace it. Characters show up in the Scene dropdowns.
- **Detail**: a police line-up of full-body figures in front of a height ruler (Size 1 = 6'0").
  - Click a figure to open a popup with Size, Y offset and X offset (type numbers or use the sliders) and a Reset button.
  - Drag the popup by its title bar to move it out of the way. Close it with the X button or Esc.
  - Long names are cut with an ellipsis instead of widening the layout.
- **Setting**: panel size, portrait height, bottom offset, move speed, inactive brightness, and the GM-only slot markers.

## Changelog

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
