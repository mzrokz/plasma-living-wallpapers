#!/bin/sh
# Install (or upgrade) wallpapers for the current user: ./install.sh [name...]
# With no names, installs every wallpaper in wallpapers/.
set -e
cd "$(dirname "$0")"
[ $# -gt 0 ] || set -- $(ls wallpapers)
for name in "$@"; do
    if [ ! -x "wallpapers/$name/install.sh" ]; then
        echo "no wallpaper called '$name'; available: $(ls wallpapers | tr '\n' ' ')" >&2
        exit 1
    fi
    echo "== $name"
    "wallpapers/$name/install.sh"
done
