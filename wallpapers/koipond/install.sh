#!/bin/sh
# Build and install (or upgrade) the wallpaper for the current user.
set -e
cd "$(dirname "$0")"
./build.sh
kpackagetool6 -t Plasma/Wallpaper -u package 2>/dev/null || kpackagetool6 -t Plasma/Wallpaper -i package
echo
echo "Right-click the desktop > Configure Desktop and Wallpaper > Wallpaper type: Koi Pond"
echo "After an upgrade, restart the shell to load the new version: systemctl --user restart plasma-plasmashell"
