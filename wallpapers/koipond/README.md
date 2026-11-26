# Koi Pond

A live, interactive koi pond wallpaper for KDE Plasma 6. Native QML and GPU shaders, with
no browser engine and nothing to compile except shaders.

## Install

```sh
./install.sh        # needs qt6-shadertools for qsb
```

Then right-click the desktop, choose **Desktop and Wallpaper**, and set the wallpaper type
to **Koi Pond** on each monitor. Monitors share one pond, which fish, food and ripples cross
freely, and share its settings. Untick **One pond across all monitors** to separate one.

Remove it with `kpackagetool6 -t Plasma/Wallpaper -r com.github.mzrokz.koipond`.

## Playing with it

| Do this | And |
|---|---|
| Move the cursor | it stirs the water, pushing pads and petals |
| Hold still | bold koi come to look |
| Sweep fast | nearby koi bolt; minnows always scatter |
| Click | drops food; word spreads and they race for it |

Icons, rubber-band selection and the context menu work as usual.

## How it works

- `package/contents/ui/code/sim.js`: all behaviour, no drawing. Each koi steers, then a
  12-point spine trails its head and carries the swimming wave.
- `shaders/koi.vert`: bends a grid along that spine; `koi.frag` paints the fish on it.
- `shaders/wave.frag`: the 2D wave equation, fed back into itself each frame. Cursor, clicks,
  rain and tails push on it.
- `shaders/water.frag`: looks through those waves at the floor (`bed.frag`, drawn once and
  cached), the fish and the caustics.
- `package/contents/ui/PondHost.qml`: owns a pond and its clock. `PondScene.qml` draws the part
  of it one monitor sees. `SharedPond.qml` is the host all monitors join; it works because
  Plasma runs every wallpaper in one QML engine.
- `package/contents/ui/main.qml`: the Plasma side. Passive pointer handlers over the desktop,
  settings, and pausing while a window covers the screen.

## Working on it

```sh
./build.sh && qml6 dev/preview.qml   # run in a window
node dev/soak.mjs                    # an hour of simulated pond per layout, checks for trouble
```
