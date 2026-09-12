#!/usr/bin/env bash
# Regenerates the published image derivatives from the supplied originals in
# assets-source/. Needs ImageMagick and cwebp, so it is deliberately NOT part of
# `npm run build`: Vercel's builder has neither, and the derivatives are
# committed. Run it only when an original changes.
set -euo pipefail
cd "$(dirname "$0")/.."
for w in 480 729; do
  magick assets-source/entrance.jpg -resize "${w}x" -strip -quality 82 "dist/assets/entrance-${w}.jpg"
  cwebp -q 78 -quiet "dist/assets/entrance-${w}.jpg" -o "dist/assets/entrance-${w}.webp"
done
magick assets-source/logo.jpg -resize 96x96 -strip -quality 90 dist/assets/logo-96.png
cwebp -q 85 -quiet dist/assets/logo-96.png -o dist/assets/logo-96.webp
ls -la dist/assets
