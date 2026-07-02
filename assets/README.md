# Brand assets

Source-of-truth artwork for **madr-lint**. The SVGs are authored by hand;
raster files are exported from them. Palette: indigo `#4f46e5` + green
`#22c55e` on a dark `#0b1120 → #111a33` gradient.

| File | Purpose |
|---|---|
| `logo.svg` | Docs-site + README mark (document + check glyph) |
| `banner.svg` | README hero banner |
| `demo.svg` | Terminal-output demo shown in the README |
| `social-preview.svg` | Source for the GitHub social-preview card (1280×640) |
| `social-preview.png` | Rasterized card — RGBA, kept as an intermediate |
| `social-preview.jpg` | **Flat JPEG uploaded to GitHub → Settings → Social preview** |

## Regenerating the social preview

GitHub's social-preview uploader **rejects PNGs that carry an alpha channel**
— it returns *"Something went really wrong and we can't process that
picture."* even when nothing is actually transparent. Upload a flat JPEG
(no alpha) instead.

```sh
# from the repo root — RGBA PNG → opaque JPEG (macOS `sips`, always present)
sips -s format jpeg -s formatOptions 92 \
  assets/social-preview.png --out assets/social-preview.jpg
```

If the SVG source changed, rasterize it first with any SVG renderer, e.g.:

```sh
rsvg-convert -w 1280 -h 640 assets/social-preview.svg -o assets/social-preview.png
# or: resvg assets/social-preview.svg assets/social-preview.png
```

Then upload `assets/social-preview.jpg` at
GitHub → repo **Settings → General → Social preview**.

Requirements: 1280×640 px (min 640×320), under 1 MB, **no alpha channel**.
