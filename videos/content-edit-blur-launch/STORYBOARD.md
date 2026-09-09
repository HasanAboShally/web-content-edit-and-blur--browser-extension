# Content Edit & Blur — launch film storyboard

- Format: 1920×1080
- Frame rate: 30fps
- Duration: 96 beats / 1416 frames / 47.21s
- Music: House Vibez, trimmed to fitted beat zero at source 7.935632s
- Mode: autonomous free creation

| # | Beat / frame range | Scene | Main action | Product information | Caption | Transition / SFX |
|---|---|---|---|---|---|---|
| 1 | b0–8 / f0–118 | The problem and promise | Crosshair draws, “Take the screenshot.” letterpresses in; a black bar covers “secrets,” then orange edge reveals “Leave the”. | Sharing a page should not expose private details. | “Take the screenshot. Leave the secrets.” | Soft air zoom at wordmark lock; low music fade-in. |
| 2 | b8–20 / f118–295 | Product reveal | One real toolbar capture enters a pool of light, rises with restrained depth, receives two orange contour passes, then settles back onto a webpage. | One focused toolbar contains the complete workflow. | “Meet Content Edit & Blur.” / “The page becomes your canvas.” | Deep whoosh on rise, short switch click on settle. |
| 3 | b20–32 / f295–472 | Edit in place | Real capture shows headline selection and human-speed replacement; camera eases toward the changed text and holds. | Rewrite copy without rebuilding the interface. | “Rewrite the copy. Keep the layout.” | Typewriter texture trimmed to the typing span; light shutter click on confirmation. |
| 4 | b32–36 / f472–531 | Privacy lead | One sentence presses onto warm paper; “private” is the sole orange italic accent. | Blur and redaction serve different jobs. | “De-emphasize noise. Redact what’s private.” | Short sweep only. |
| 5 | b36–48 / f531–708 | Blur versus Redact | Identical before/after product frames share a divider. Fast fling declares the change; slow return shows blur on distractions and opaque replacement over the API key. | Blur is visual de-emphasis; Redact is for sensitive information. | “Blur distractions.” / “Replace sensitive pixels.” | Fast sweep on fling, lock click when Redact lands. |
| 6 | b48–60 / f708–885 | Annotate clearly | Real annotated page sits front-facing; a linear scan passes through the screenshot and orange focus brackets name Arrow, Highlight, Note, and Step after each crossing. | Mark exactly what needs attention. | “Point. Highlight. Explain.” | Marker stroke under first reveal; four restrained physical taps. |
| 7 | b60–72 / f885–1062 | Capture and trust | Camera button pulses; a circular shutter iris closes and opens onto the finished clean screenshot. Three concise trust statements resolve around it. | Screenshot excludes transient controls; no account, tracking, or backend. | “Capture a clean PNG.” / “No account. No tracking. No backend.” | Camera shutter at iris, soft air exit. |
| 8 | b72–96 / f1062–1416 | Launch finale | Edit, Blur, Redact, Annotate, and Capture surfaces fly from distinct directions and settle around the icon; stage light rises; product name stamps in; browser marks and CTA resolve. | Free, open-source desktop extension for Chrome, Firefox, and Edge. | “Content Edit & Blur” / “Free · Open source · Chrome · Firefox · Edge” | Riser from scene start, cinematic impact at wordmark, sparkle on browser marks. Final 42f are still. |

## Frame-level source map

| Shot | From | Duration | Source file | QA frames |
|---|---:|---:|---|---|
| hook | 0 | 118 | `src/scenes/HookScene.tsx` | 36, 94 |
| hero | 118 | 177 | `src/scenes/HeroScene.tsx` | 160, 260 |
| edit | 295 | 177 | `src/scenes/EditScene.tsx` | 335, 445 |
| privacy-title | 472 | 59 | `src/scenes/PrivacyTitleScene.tsx` | 492, 520 |
| privacy | 531 | 177 | `src/scenes/PrivacyScene.tsx` | 565, 675 |
| annotate | 708 | 177 | `src/scenes/AnnotateScene.tsx` | 755, 850 |
| capture-trust | 885 | 177 | `src/scenes/CaptureScene.tsx` | 925, 1035 |
| finale | 1062 | 354 | `src/scenes/FinaleScene.tsx` | 1100, 1280, 1380 |

## Consistency gate

- Every required capability appears once as the principal idea of a scene.
- Blur and Redact are explicitly distinguished.
- Every product surface is a repository-generated capture containing fictional data.
- Each selected recipe’s critical timing rule is preserved.
- Repeated tagline is avoided: the hook owns the screenshot promise; the finale owns product name and install availability.
