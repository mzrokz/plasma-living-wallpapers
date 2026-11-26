#!/bin/sh
# Re-record media/demo.webp and media/pond.jpg. Runs the pond in a headless nested KWin,
# so nothing appears on screen. Needs kwin_wayland, qml6 and ffmpeg (with libwebp).
set -e
cd "$(dirname "$0")/.."
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/frames" "$work/run" && chmod 700 "$work/run"
env -u WAYLAND_DISPLAY -u DISPLAY XDG_RUNTIME_DIR="$work/run" QT_LOGGING_RULES="kwin*=false" \
    dbus-run-session kwin_wayland --virtual --width 1920 --height 1080 --no-lockscreen \
    --exit-with-session "qml6 $PWD/dev/capture.qml $work/frames" > "$work/kwin.log" 2>&1
# The window loses a title bar's height; crop to 16:9.
crop=crop=1870:1052
ffmpeg -v error -y -framerate 30 -start_number 30 -t 9.5 -i "$work/frames/f%04d.png" \
    -vf "fps=15,$crop,scale=800:-2:flags=lanczos" \
    -c:v libwebp_anim -quality 85 -compression_level 4 -loop 0 media/demo.webp
ffmpeg -v error -y -i "$work/frames/f0330.png" -vf "$crop" -q:v 3 media/pond.jpg
ls -l media
