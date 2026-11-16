# Glyph Studio

A browser-based handwriting font maker. Draw characters in the workshop, preview
your typeface as you go, then download it as an OpenType (`.otf`) font.

## Run locally

```sh
npm install
npm run dev
```

Create a production build with `npm run build`.

## How it works

- Choose a character and draw it with a mouse, trackpad, or touchscreen, or
  print the guided sheet, fill it with dark ink, scan it straight-on, and use
  **Import scan** to trace the characters into font outlines.
- For scan import, crop the image to the portrait page edges and keep the page
  upright. Review imported letters in the workshop before exporting.
- Your font name and drawings are autosaved in this browser on this device.
- Export the characters you've drawn as an OpenType font. Undrawn characters
  remain blank.

Scan tracing detects the printed grid and aligns imported glyphs to the cap and
baseline guides. It works best with a clean, high-contrast scan; rotated, skewed,
or poorly cropped photos may need correction before import. Drafts are stored
locally in the browser and scans are processed on-device, not uploaded.
