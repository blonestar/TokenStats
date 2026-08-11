#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
icons_dir="$repo_root/assets/icons"
output="$icons_dir/TokenStats.icns"

command -v iconutil >/dev/null 2>&1 || {
  echo "iconutil is required to create the macOS icon." >&2
  exit 1
}

iconset_dir="$(mktemp -d "${TMPDIR:-/tmp}/TokenStats.iconset.XXXXXX")"
trap 'rm -r -- "$iconset_dir"' EXIT

copy_icon() {
  cp "$icons_dir/${1}x${1}.png" "$iconset_dir/$2"
}

copy_icon 16 icon_16x16.png
copy_icon 32 icon_16x16@2x.png
copy_icon 32 icon_32x32.png
copy_icon 64 icon_32x32@2x.png
copy_icon 128 icon_128x128.png
copy_icon 256 icon_128x128@2x.png
copy_icon 256 icon_256x256.png
copy_icon 512 icon_256x256@2x.png
copy_icon 512 icon_512x512.png
copy_icon 1024 icon_512x512@2x.png

iconutil -c icns "$iconset_dir" -o "$output"
