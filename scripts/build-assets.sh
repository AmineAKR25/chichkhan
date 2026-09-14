#!/usr/bin/env bash
# Regenerates the image derivatives in src/assets/ from the supplied originals
# in assets-source/. Needs ImageMagick and cwebp, so it is deliberately NOT part
# of `npm run build`: Vercel's builder has neither, so the derivatives are
# committed as source and the build only copies them. Run it when an original
# changes.
set -euo pipefail
cd "$(dirname "$0")/.."
for w in 480 729; do
  magick assets-source/entrance.jpg -resize "${w}x" -strip -quality 82 "src/assets/entrance-${w}.jpg"
  cwebp -q 78 -quiet "src/assets/entrance-${w}.jpg" -o "src/assets/entrance-${w}.webp"
done
magick assets-source/logo.jpg -resize 96x96 -strip -quality 90 src/assets/logo-96.png
cwebp -q 85 -quiet src/assets/logo-96.png -o src/assets/logo-96.webp
ls -la src/assets
