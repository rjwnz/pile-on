# Benchmark fixtures

Six saved states for `pnpm bench`, from one pile type on a semi up to a rigid
towing its trailer. `bench.json` is the recorded baseline the run diffs against;
re-save it with `pnpm bench --save` whenever a fixture changes.

## Where the numbers come from

The catalogue in these files is real steel, not round numbers, so a truck count
here means something. Shafts are AS/NZS 1163 CHS sections; mass is the tube
annulus at 7850 kg/m³ over the pile's length, plus each helix as a plate annulus
of its own thickness:

```
shaft  kg/m = π/4 × (D² − (D − 2t)²) × 7850 × 1e-6
helix  kg   = π/4 × (Dplate² − D²) × tplate × 7850 × 1e-9
```

| Code  | Section     | kg/m | Plate | Length | Helices (Ø × axial)  | Mass   |
| ----- | ----------- | ---- | ----- | ------ | -------------------- | ------ |
| SP114 | 114.3 × 5.4 | 14.5 | 12 mm | 3.0 m  | 300 × 87             | 49 kg  |
| SP139 | 139.7 × 6.0 | 19.8 | 16 mm | 4.5 m  | 350 × 106            | 99 kg  |
| SP168 | 168.3 × 7.1 | 28.2 | 16 mm | 6.0 m  | 450 × 126, 350 × 106 | 196 kg |
| SP219 | 219.1 × 8.2 | 42.6 | 20 mm | 7.0 m  | 600 × 170, 500 × 145 | 362 kg |
| SP273 | 273.1 × 9.3 | 60.5 | 25 mm | 7.0 m  | 600 × 175, 500 × 150 | 495 kg |

A helix's axial length is the plate thickness plus the rise of one flight, taken
as a quarter of the plate diameter — a helix is a short fat cylinder, not a
disc, and the packer needs the cylinder.

Lengths stay in the 3–7 m band the sections actually ship in. Anything deeper is
made up on site: a starter carrying the plates, then plain-shaft extensions
joined to it, each shipping as its own piece.
