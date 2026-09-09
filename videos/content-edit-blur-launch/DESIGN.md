# Video direction — Editorial precision

Status: approved autonomously from repository evidence.

## Direction choice

Three directions were considered:

1. **Editorial precision — selected.** Product-native paper, ink, orange markup, restrained depth, and decisive redaction transitions.
2. Ink Press adaptation — compatible warmth, rejected because analog texture would overpower the clean browser UI.
3. Neon utility — rejected because it conflicts with the calm, privacy-first public identity.

The film should feel **precise, assured, and useful**. Cinematic quality comes from camera choreography, hierarchy, rhythm, and sound—not ornamental effects.

## Visual tokens

| Role | Value |
|---|---|
| Paper | `#f7f5f0` |
| Surface | `#fffefb` |
| Ink | `#17171a` |
| Muted ink | `#5f5e58` |
| Brand orange | `#ff5c16` |
| Accessible orange ink | `#c2410c` |
| Dark field | `#0a0a0b` |
| Dark text | `#ece9e2` |
| UI interaction blue | `#2563eb` |
| Display face | Instrument Serif 400 / italic |
| Interface face | Instrument Sans 400 / 500 / 600 |
| Technical face | JetBrains Mono 400 / 500 |
| Corners | 12–18px on browser and product surfaces; redaction bars 3–5px |

## Motion personality

- Energy: medium; rise to high only in the final 10 seconds.
- Tone: serious-helpful rather than playful.
- Main entrance: 18–24 frames, `bezier(0.16, 1, 0.3, 1)`.
- Physical landings may use one controlled overshoot; ordinary typography never bounces.
- Product interactions run at believable human speed.
- Every scene reserves at least 15 frames of rest; final brand lockup holds at least 30 frames.
- No handheld shake, persistent glow, generic particle fields, or per-beat full-frame pumping.
- One orange redaction bar acts as a recurring transition seam.

## Composition

- 1920×1080, 30fps, generous 120px horizontal and 100px vertical safe area.
- Real UI appears as sharp 1920×1080 capture inside a browser plate, never hand-recreated.
- Primary captions are 72–112px. Supporting copy is 34–46px.
- One visible idea per scene. Interface details that are not meant to be read are treated as texture.
- Product capture stays front-facing for explanation. Perspective is reserved for the hero and finale.

## Selected motion grammar

| Scene | Shot recipe / style key | Adaptation and non-negotiables |
|---|---|---|
| Hook | `brand-ink-open` | Crosshair becomes a redaction cursor; wordmark/tagline settles for ≥30f. |
| Product reveal | `spotlight-hero-card` | One toolbar is the hero; slow complete action arc; two contour passes; no multi-card opening. |
| Edit | `type-and-filter` | Human-speed edit interaction, pause after typing, then camera settles on changed copy. |
| Privacy lead | `paper-title-card` | One concrete sentence, exactly one orange accent, low-energy breathing beat. |
| Blur → Redact | `before-after-slider-scrub` | Identical source frame; 5:1 fast/slow scrub ratio; divider and reveal stay pixel-aligned. |
| Annotate | `scanline-annotate-focus` | Scan remains linear; focus brackets appear only after the scan crosses each target. |
| Capture | `circle-match-iris` | Camera shutter is the semantic round anchor; iris resolves to the finished PNG. |
| Finale | `outro-group-photo-launch` | Every demonstrated capability returns once; landing overshoot uses y1 > 1; final wordmark holds ≥30f. |

## Styleframe record

The static styleframe contains three key compositions:

- Hook: tagline plus redaction-bar reveal.
- Product: real extension screenshot in an editorial browser plate.
- Finale: product icon and feature surfaces arranged as a launch-stage group portrait.

Rendered references live in `analysis/styleframes/`.

## Deliberate restraint

- No voiceover: store visitors often autoplay muted, and the product is simple enough for visual explanation.
- No adoption statistics: counts age quickly and weaken the reusable master.
- No paper grain: warm surfaces carry the brand without turning the interface into an analog prop.
- No decorative blur: blur appears only when it explains the product.
