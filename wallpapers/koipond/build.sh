#!/bin/sh
# Compile shaders/*.vert|frag to the .qsb files Qt Quick loads.
set -e
cd "$(dirname "$0")"
qsb=${QSB:-$(command -v qsb || echo /usr/lib/qt6/bin/qsb)}
out=package/contents/ui/shaders
mkdir -p "$out"
for f in shaders/*.vert shaders/*.frag; do
    batch=
    case $f in *.vert) batch=-b ;; esac
    # Headers are spliced in here so qsb never has to resolve include paths.
    tmp=$(mktemp -d)
    awk '/^#include "/ { gsub(/"/, "", $2); while ((getline line < ("shaders/" $2)) > 0) print line; next } { print }' \
        "$f" > "$tmp/$(basename "$f")"
    "$qsb" $batch --glsl "300 es,330" --hlsl 50 --msl 12 -o "$out/$(basename "$f").qsb" "$tmp/$(basename "$f")"
    rm -r "$tmp"
done
echo "built $(ls "$out" | wc -l) shaders"
