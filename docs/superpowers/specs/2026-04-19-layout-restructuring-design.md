# Layout Restructuring Design

## Problem

Current layout doesn't match the expected structure where:

- Traffic lights and `left-sidebar-header` are on the same horizontal line
- `left-rail` is below the header row, starting at left edge
- `left-sidebar-content` is right of `left-rail` and below the header

## Solution

**Structure:**

```
┌─────────────────────────────────────────────────────┐
│ ● ● ● left-sidebar-header (pl-12 for traffic lights)│ ← header-row
├────────┬────────────────────────────────────────────┤
│        │                                             │
│  LR    │  left-sidebar-content (VaultTree)          │ ← content-area
│ 48px   │                                             │
└────────┴────────────────────────────────────────────┘
```

## Changes

### Layout.tsx

1. Wrap header elements in a dedicated `header-row` div with `pl-12` offset for traffic lights
2. Create a `content-area` div below header-row
3. Move `LeftRail` from left of `left-sidebar` to top of `content-area`
4. `left-sidebar` becomes a flex-1 container for `VaultTree` (no header inside)
5. `left-sidebar-content` fills space right of `LeftRail`

### index.css

- Add `.header-row` with `pl-12` for traffic light offset
- `left-rail` stays `w-12` at x=0 of content area
- `left-sidebar` changes from `w-64 flex flex-col` to `flex-1`

## Implementation Notes

- Native traffic lights are at macOS window chrome level (titleBarStyle: 'hidden')
- Header row `pl-12` (~70px) avoids overlapping with traffic lights
- LeftRail `pt-12` removed since it's now below header, not beside it
