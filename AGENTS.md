# Project Core Persona & Guidelines

## UI & Aesthetics (Fluent Design Upgrade)
- **Aesthetic**: Modern Windows 11 Fluent inspired. Sleek, minimal spacing, dark deep-red accent palette.
- **Strict Emoji Prohibition**: Remove ALL decorative emojis (e.g., ??, ??, ??, ??) across all menus, text blocks, popups, and dictionary settings. Use clean typography or standard minimalist vector icons.
- **Window Minimalism**: Remove large internal window titles like "Music Widget" or "Statistics" within the panels themselves. The bottom OS taskbar button states make identity context obvious.

## Code Architecture Limits
- **Scope**: Keep changes isolated strictly inside the `src/` directory. Do not alter root project configurations (forge.config, vite.*.config, tsconfig.json).
- **Safety**: Do not break the functional desktop shortcut grid, window dragging layer, or taskbar shell. Patch services directly beneath them.
- **Performance**: Heavy datasets (large media, dictionary indices) must process asynchronously in the main thread or use virtual scrolling to eliminate window-dragging lag.
