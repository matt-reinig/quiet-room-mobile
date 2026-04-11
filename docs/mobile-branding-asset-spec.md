# Mobile Branding Asset Spec

This doc is the first-pass source of truth for the Quiet Room mobile launcher and store branding assets.

Scope:

- launcher icon
- Android adaptive icon
- splash symbol
- favicon / lightweight web icon
- optional store-marketing art

Current first-pass source files:

- square icon master: `assets/branding/quiet-room-door-crossmark-icon-master.svg`
- transparent foreground master: `assets/branding/quiet-room-door-crossmark-foreground.svg`
- named larger-surface variant: `assets/branding/quiet-room-door-wordmark-marketing.svg`

Out of scope:

- changes to main in-app devotional functionality
- replacing the current in-app crucifix imagery
- redesigning the app UI around the launcher mark

## Brand Intent

The launcher/store identity should feel:

- quiet
- reverent
- simple
- warm rather than clinical
- legible at very small sizes

The symbol system for this first pass is:

- a single centered door mark
- a cross integrated into the door itself
- subtle inset framing can be used to make the silhouette read more clearly as a door
- a small handle is acceptable if it remains simple and legible
- no text inside small launcher assets
- no photorealistic church imagery
- no decorative scenery, rays, hands, or background illustrations

## First-Pass Visual Direction

Primary concept:

- use a simple square door silhouette as the core shape
- place a centered slim black cross in the upper third of the door
- use light interior framing details only if they improve door legibility at small size
- keep the mark flat and graphic rather than shaded or textured
- use generous empty space around the door so the icon reads clearly on a phone home screen

Recommended visual language:

- background: white
- wall: dark brown
- door: warm brown
- cross: black inset within the door rather than a cutout

Why this direction:

- it stays distinct from the in-app crucifix imagery
- it reads as a product mark rather than devotional illustration
- it is more likely to survive App Store and Android launcher reduction cleanly than a detailed drawing

## Color Spec

Use the existing mobile palette as the starting point so the launcher identity still feels related to the product.

Primary colors:

- white background: `#FFFFFF`
- dark brown wall: `#5E3D2B`
- brown door: `#936447`
- black cross: `#000000`

Optional accent for larger marketing-only variants:

- warm gold accent: `#B7922F`
- darker gold accent: `#8F6F17`

Color rules:

- launcher icon should use three tones maximum in the first pass
- keep the wall and door visibly distinct from the white background
- keep the core icon readable in grayscale

## Geometry And Composition

Use a 1024 x 1024 artboard for the master export comps.

Primary icon composition:

- centered symbol
- background fills the full square
- outer wall shape should land around 56 to 62 percent of the canvas width
- outer wall shape should land around 62 to 68 percent of the canvas height
- the actual door should sit lower within the wall shape, with less room below it than above it
- keep at least 18 percent padding from the outer edge of the canvas to the widest point of the mark

Door shape guidance:

- square overall silhouette
- clean vertical sides
- lightly rounded corners are acceptable, but no arch
- a small simple handle is acceptable on the right side of the door
- keep any framing or inner panel lines subtle and low-count
- the door should not be vertically centered inside its container; it should sit lower, closer to the floor line

Cross guidance:

- centered horizontally within the door
- positioned in the upper third of the door
- vertical stem longer than the horizontal arm
- simple Latin cross proportions
- thick enough to remain visible after reduction

Small-size safety rules:

- avoid hairline strokes
- avoid interior details thinner than roughly 7 percent of the door width
- if any detail disappears at favicon size, remove it rather than sharpening it

## Asset-By-Asset Spec

### `assets/icon.png`

Purpose:

- iOS launcher icon
- default Expo app icon source

Spec:

- 1024 x 1024 PNG
- full white background
- centered wall-and-door mark
- slimmer black cross inset within the door
- no text
- no drop shadow in the first pass

### `assets/adaptive-icon.png`

Purpose:

- Android adaptive icon foreground art

Spec:

- 1024 x 1024 PNG
- transparent background
- centered wall-and-door mark with black cross
- keep the visible symbol inside a conservative safe area of about 640 x 640
- do not let the door edges approach the outer bounds of the safe area

Implementation note:

- when this asset is adopted, the Android adaptive icon background color in `app.json` should use white `#FFFFFF`

### `assets/splash-icon.png`

Purpose:

- centered splash symbol used with `resizeMode: contain`

Spec:

- 1024 x 1024 PNG
- transparent background preferred
- centered wall-and-door mark with black cross
- symbol may be slightly larger than the adaptive-icon foreground, but still leave generous padding
- use the same simplified square silhouette as the launcher icon

Implementation note:

- when this asset is adopted, the splash background color in `app.json` should use white `#FFFFFF`

### `assets/favicon.png`

Purpose:

- lightweight web icon and small browser-facing surface

Spec:

- export from the same master composition
- keep the shape as simple as possible
- test at 16 px, 32 px, and 48 px equivalent sizes
- if the square silhouette becomes muddy, simplify the shape rather than adding detail

## Optional Marketing Variant

If a larger branded image is needed for store listings or TestFlight-facing materials, use:

- the same door mark
- the same white background
- optional warm gold accent
- optional wordmark `Quiet Room`

Current recommended named variant:

- `assets/branding/quiet-room-door-wordmark-marketing.svg`

Rules:

- wordmark should stay outside the small launcher icon set
- marketing variants should feel like an extension of the icon system, not a different art direction

## Export Workflow

1. Create a source-of-truth master file outside the generated app assets.
2. Build the square launcher composition first.
3. Derive the adaptive foreground and splash symbol from that same master.
4. Export `icon.png`, `adaptive-icon.png`, `splash-icon.png`, and `favicon.png`.
5. Verify the icon at small size before treating the set as final.

Preferred source-of-truth format:

- SVG
- Figma component
- layered PSD

Do not treat the generated PNG files as the long-term design source.

## Review Checklist

Approve the first pass only if all of these are true:

- the symbol still reads as a door at small size
- the cross is visible without becoming fussy
- the icon does not read as a generic church app clip-art mark
- the background feels warm and calm rather than stark
- the Android adaptive version does not get clipped by masked launcher shapes
- the splash symbol looks centered and intentional on both iPhone and Android
- the mark feels distinct from, but compatible with, the in-app crucifix imagery

## Handoff Notes For Asset Creation

If this is handed to a designer or used for image generation, the brief should be:

"Create a minimal mobile app icon for Quiet Room using a simple square door with a centered slim black cross inset. Keep it flat, reverent, and highly legible at small size. Use a black background and a warm brown door. No text, no photorealism, no scenery, no ornamental church illustration."
