#!/usr/bin/env bash
# Regenerates the PWA / home-screen icons in apps/web/public.
# Requires rsvg-convert and ImageMagick (brew install librsvg imagemagick).
set -euo pipefail

WEB="$(cd "$(dirname "$0")/../apps/web" && pwd)"
ROUNDED="$WEB/public/favicon.svg"
# iOS fills transparent corners with black and Android masks into its own shape, so those need a square, edge-to-edge icon.
FULL_BLEED="$WEB/icons/icon-full-bleed.svg"
OUT="$WEB/public"

rsvg-convert -w 192 -h 192 "$ROUNDED" -o "$OUT/pwa-192x192.png"
rsvg-convert -w 512 -h 512 "$ROUNDED" -o "$OUT/pwa-512x512.png"
rsvg-convert -w 512 -h 512 "$FULL_BLEED" -o "$OUT/maskable-icon-512x512.png"
rsvg-convert -w 180 -h 180 "$FULL_BLEED" -o "$OUT/apple-touch-icon-180x180.png"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
for size in 16 32 48; do
  rsvg-convert -w "$size" -h "$size" "$ROUNDED" -o "$TMP/$size.png"
done
magick "$TMP/16.png" "$TMP/32.png" "$TMP/48.png" "$OUT/favicon.ico"

echo "Icons written to $OUT"
