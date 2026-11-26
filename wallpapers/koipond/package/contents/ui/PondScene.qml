import QtQuick
import "code/sim.js" as Sim

// What one screen sees of a pond, independent of Plasma. Feed it pointer events through
// moveCursor(), leaveCursor() and tap().
Item {
    id: scene

    property PondHost sharedHost: null      // a pond to look into, instead of its own
    property point place: Qt.point(0, 0)    // this screen's corner on the desktop
    property bool ready: true
    property bool running: true
    property int fps: 60            // 0 follows the display
    property int koiCount: 12
    property real koiSize: 1
    property real swimSpeed: 1
    property int fryCount: 18
    property int padCount: 7
    property bool flowers: true
    property int petalCount: 9
    property bool fireflies: true
    property int cursorMode: 0
    property bool clickFeeds: true
    property real rippleStrength: 1
    property real causticStrength: 1
    property real rain: 0
    property int waterTheme: 0
    property real hour: 12          // 0..24, drives the light
    property int pixelSize: 1

    readonly property PondHost host: sharedHost ?? own
    readonly property real unit: host.unit
    // From this screen's corner to the pond's.
    readonly property real originX: place.x - host.originX
    readonly property real originY: place.y - host.originY
    readonly property bool present: ready && width >= 16 && height >= 16
    readonly property bool animating: running && visible && present
    readonly property var light: Sim.lightAt(hour)
    readonly property var water: Sim.WATERS[Math.max(0, Math.min(waterTheme, Sim.WATERS.length - 1))]
    readonly property vector4d lightVector: vec4(light.light)
    readonly property real night: light.night

    function vec4(a) { return Qt.vector4d(a[0], a[1], a[2], a[3]); }

    function moveCursor(x, y) { host.moveCursor(scene, x + originX, y + originY); }
    function leaveCursor() { host.leaveCursor(scene); }
    function tap(x, y) { host.tap(x + originX, y + originY); }

    // Called by the host.
    function advance(dt, drops) {
        internal.time = host.time;
        internal.pushWaves(dt, drops);
        internal.refresh();
    }
    function restart() {
        waveStep.reset = 1;
        bedSource.scheduleUpdate();
        internal.refresh();
    }

    onHostChanged: Qt.callLater(internal.seat)
    onPlaceChanged: Qt.callLater(internal.seat)
    onPresentChanged: Qt.callLater(internal.seat)
    onWidthChanged: Qt.callLater(internal.seat)
    onHeightChanged: Qt.callLater(internal.seat)
    onAnimatingChanged: host.stir()
    Component.onCompleted: internal.seat()
    Component.onDestruction: if (internal.seated) internal.seated.leave(scene)

    onFpsChanged: internal.option("fps", fps)
    onKoiCountChanged: internal.option("koiCount", koiCount)
    onKoiSizeChanged: internal.option("koiSize", koiSize)
    onSwimSpeedChanged: internal.option("speed", swimSpeed)
    onFryCountChanged: internal.option("fryCount", fryCount)
    onPadCountChanged: internal.option("padCount", padCount)
    onFlowersChanged: internal.option("flowers", flowers)
    onPetalCountChanged: internal.option("petalCount", petalCount)
    onCursorModeChanged: internal.option("cursorMode", cursorMode)
    onClickFeedsChanged: internal.option("clickFeeds", clickFeeds)
    onRainChanged: internal.option("rain", rain)

    PondHost { id: own }

    QtObject {
        id: internal

        property PondHost seated: null      // the host this scene has joined
        property real time: 0       // the host's, but standing still while this scene does
        property real pace: 1 / 60
        property bool foodShown: false
        readonly property int revision: scene.host.revision
        readonly property var pond: scene.host.pond

        function seat() {
            if (seated && (seated !== scene.host || !scene.present)) {
                seated.leave(scene);
                seated = null;
            }
            if (!scene.present)
                return;
            seated = scene.host;
            seated.join(scene, { x: scene.place.x, y: scene.place.y, width: scene.width, height: scene.height }, {
                fps: scene.fps, koiCount: scene.koiCount, koiSize: scene.koiSize, speed: scene.swimSpeed,
                fryCount: scene.fryCount, padCount: scene.padCount, flowers: scene.flowers,
                petalCount: scene.petalCount, cursorMode: scene.cursorMode,
                clickFeeds: scene.clickFeeds, rain: scene.rain
            });
        }

        function option(key, value) {
            if (seated)
                seated.option(key, value);
        }

        // Show an item only if it is near enough to this screen to matter.
        function cull(item, view, x, y, reach) {
            const seen = x > view.left - reach && x < view.right + reach && y > view.top - reach && y < view.bottom + reach;
            if (item.visible !== seen)
                item.visible = seen;
            return seen;
        }

        // Every scene runs the waves of the whole pond, so they carry on across screens.
        function pushWaves(dt, drops) {
            const cell = waveStep.cell;
            const gain = scene.rippleStrength;
            for (let i = 0; i < Sim.MAX_DROPS; ++i) {
                const d = drops[i];
                waveStep["d" + i] = d
                    ? Qt.vector4d(d.x / cell, d.y / cell, Math.max(d.radius / cell, 1.3), d.strength * gain)
                    : Qt.vector4d(0, 0, 1, 0);
            }
            const s = pond.stir;
            if (s) {
                waveStep.stir = Qt.vector4d(s.ax / cell, s.ay / cell, s.bx / cell, s.by / cell);
                waveStep.stirShape = Qt.vector2d(15 * scene.unit / cell, (0.03 + 0.17 * s.strength) * gain);
            } else {
                waveStep.stirShape = Qt.vector2d(1, 0);
            }
            // Same wave speed at any frame rate, held inside the stable range. Following uneven
            // frames one by one would pump energy into the waves, so follow their average.
            pace += (dt - pace) * 0.03;
            const cellsPerStep = 112 * scene.unit * pace / cell;
            waveStep.c2 = Math.min(cellsPerStep * cellsPerStep, 0.5);
            waveStep.damping = Math.exp(-pace * 0.95);
        }

        // Copy simulation state into the scene graph.
        function refresh() {
            if (!pond)
                return;
            const U = scene.unit;
            const view = { left: scene.originX, right: scene.originX + scene.width,
                           top: scene.originY, bottom: scene.originY + scene.height };
            for (let i = 0; i < pond.koi.length; ++i) {
                const k = pond.koi[i];
                const body = koiBodies.itemAt(i), shade = koiShadows.itemAt(i);
                if (!body || !shade)
                    continue;
                const seen = cull(body, view, k.x, k.y, k.length * 1.5);
                if (shade.visible !== seen)
                    shade.visible = seen;
                if (!seen)
                    continue;
                k.bend();
                const p = k.points;
                const fins = Qt.vector4d(k.sweepL, k.sweepR, Math.max(-1, Math.min(1, -k.turnRate)), k.phase);
                body.bodyLength = shade.bodyLength = k.length * (1 - 0.14 * k.depth);
                body.depth = shade.depth = k.depth;
                body.fins = shade.fins = fins;
                body.p0 = shade.p0 = Qt.vector4d(p[0], p[1], p[2], p[3]);
                body.p1 = shade.p1 = Qt.vector4d(p[4], p[5], p[6], p[7]);
                body.p2 = shade.p2 = Qt.vector4d(p[8], p[9], p[10], p[11]);
                body.p3 = shade.p3 = Qt.vector4d(p[12], p[13], p[14], p[15]);
                body.p4 = shade.p4 = Qt.vector4d(p[16], p[17], p[18], p[19]);
                body.p5 = shade.p5 = Qt.vector4d(p[20], p[21], p[22], p[23]);
                body.z = 1 - k.depth;
                const lift = (1.05 - k.depth) * 46 * U;
                shade.shift = Qt.vector2d(lift * 0.62, lift);
                shade.blur = 0.016 + (1 - k.depth) * 0.03;
            }
            for (let i = 0; i < pond.fry.length; ++i) {
                const f = pond.fry[i], item = fryItems.itemAt(i);
                if (!item)
                    continue;
                if (!cull(item, view, f.x, f.y, 80 * U))
                    continue;
                const c = Math.cos(f.angle), s = Math.sin(f.angle);
                item.x = f.x - item.width / 2;
                item.y = f.y - item.height / 2;
                item.rotation = f.angle * 180 / Math.PI;
                item.phase = f.phase;
                item.shadowShift = Qt.vector2d((0.3 * c + 0.46 * s), (-0.3 * s + 0.46 * c));
            }
            place(padItems, pond.pads, view);
            place(padShadows, pond.pads, view);
            place(flowerItems, pond.flowers, view);
            place(petalItems, pond.petals, view);
            // One extra pass after the last pellet goes, to hide it.
            for (let i = 0; (pond.foodLeft || foodShown) && i < pond.pellets.length; ++i) {
                const p = pond.pellets[i], item = pelletItems.itemAt(i);
                if (!item)
                    continue;
                if (item.visible !== p.alive)
                    item.visible = p.alive;
                if (!p.alive)
                    continue;
                item.x = p.x;
                item.y = p.y;
                item.z = p.depth > 0.3 ? 1 - p.depth : 2;
                item.opacity = p.opacity;
                item.shade = p.depth;
            }
            foodShown = pond.foodLeft;
            if (fireflyLayer.visible)
                for (let i = 0; i < pond.fireflies.length; ++i) {
                    const f = pond.fireflies[i], item = fireflyItems.itemAt(i);
                    if (!item || !cull(item, view, f.x, f.y, 40 * U))
                        continue;
                    item.x = f.x - item.width / 2;
                    item.y = f.y - item.height / 2;
                    item.opacity = f.glow * scene.night;
                }

            causticSource.scheduleUpdate();
            fishSource.scheduleUpdate();
            waveSource.scheduleUpdate();
        }

        function place(repeater, list, view) {
            for (let i = 0; i < list.length; ++i) {
                const item = repeater.itemAt(i);
                if (!item)
                    continue;
                // Generous, since shadows fall some way off.
                if (!cull(item, view, list[i].x, list[i].y, list[i].radius * 5))
                    continue;
                item.x = list[i].x - item.width / 2;
                item.y = list[i].y - item.height / 2;
                item.rotation = list[i].angle * 180 / Math.PI;
                item.angle = list[i].angle;
            }
        }
    }

    Rectangle {
        anchors.fill: parent
        color: Qt.rgba(scene.water.deep[0], scene.water.deep[1], scene.water.deep[2], 1)
    }

    Item {
        id: stage
        anchors.fill: parent
        layer.enabled: scene.pixelSize > 1
        layer.smooth: false
        layer.textureSize: Qt.size(Math.ceil(width / scene.pixelSize), Math.ceil(height / scene.pixelSize))

        // --- Offscreen passes -------------------------------------------------

        ShaderEffect {
            id: bed
            anchors.fill: parent
            property real unit: scene.unit
            property vector2d resolution: Qt.vector2d(width, height)
            property vector2d origin: Qt.vector2d(scene.originX, scene.originY)
            property color sandColor: scene.water.sand
            property color stoneColor: scene.water.stone
            property color mossColor: scene.water.moss
            onSandColorChanged: bedSource.scheduleUpdate()
            blending: false
            fragmentShader: "shaders/bed.frag.qsb"
        }
        ShaderEffectSource {
            id: bedSource
            sourceItem: bed
            hideSource: true
            live: false
            visible: false
            wrapMode: ShaderEffectSource.ClampToEdge
        }

        ShaderEffect {
            id: caustics
            width: Math.ceil(scene.width / 3)
            height: Math.ceil(scene.height / 3)
            property real time: internal.time
            property vector2d size: Qt.vector2d(scene.width / scene.unit, scene.height / scene.unit)
            property vector2d origin: Qt.vector2d(scene.originX / scene.unit, scene.originY / scene.unit)
            blending: false
            fragmentShader: "shaders/caustics.frag.qsb"
        }
        ShaderEffectSource {
            id: causticSource
            sourceItem: caustics
            hideSource: true
            live: false
            visible: false
            wrapMode: ShaderEffectSource.ClampToEdge
        }

        ShaderEffect {
            id: waveStep
            readonly property real cell: 4.5 * scene.unit
            width: cells.x
            height: cells.y
            property vector2d cells: Qt.vector2d(Math.max(8, Math.round(scene.host.spanWidth / cell)),
                                                 Math.max(8, Math.round(scene.host.spanHeight / cell)))
            property real c2: 0.1
            property real damping: 0.99
            property real reset: 1
            property vector4d d0
            property vector4d d1
            property vector4d d2
            property vector4d d3
            property vector4d d4
            property vector4d d5
            property vector4d d6
            property vector4d d7
            property vector4d d8
            property vector4d d9
            property vector4d d10
            property vector4d d11
            property vector4d stir
            property vector2d stirShape: Qt.vector2d(1, 0)
            property var waveTex: waveSource
            blending: false
            fragmentShader: "shaders/wave.frag.qsb"
        }
        ShaderEffectSource {
            id: waveSource
            sourceItem: waveStep
            hideSource: true
            live: false
            recursive: true
            visible: false
            format: ShaderEffectSource.RGBA16F
            textureSize: Qt.size(waveStep.width, waveStep.height)
            wrapMode: ShaderEffectSource.ClampToEdge
            onScheduledUpdateCompleted: waveStep.reset = 0
        }

        Item {
            id: underwater
            anchors.fill: parent

            // In pond coordinates.
            Item {
                x: -scene.originX
                y: -scene.originY
                width: parent.width
                height: parent.height

                Repeater {
                    id: padShadows
                    model: internal.revision >= 0 && internal.pond ? internal.pond.pads.length : 0
                    ShaderEffect {
                        required property int index
                        readonly property var pad: internal.revision >= 0 && internal.pond ? internal.pond.pads[index] ?? null : null
                        width: pad ? pad.radius * 2.5 : 0
                        height: width
                        transform: Translate { x: 30 * scene.unit; y: 46 * scene.unit }
                        property real radius: pad ? pad.radius : 1
                        property real seed: pad ? pad.seed : 0
                        property real angle: 0
                        property real mode: 1
                        property real wet: 0
                        property color leafColor: "black"
                        property vector4d lightColor: scene.lightVector
                        fragmentShader: "shaders/pad.frag.qsb"
                    }
                }

                Repeater {
                    id: koiShadows
                    model: internal.revision >= 0 && internal.pond ? internal.pond.koi.length : 0
                    KoiMesh {
                        anchors.fill: parent
                        isShadow: true
                    }
                }

                Repeater {
                    id: fryItems
                    model: internal.revision >= 0 && internal.pond ? internal.pond.fry.length : 0
                    ShaderEffect {
                        required property int index
                        readonly property var fry: internal.revision >= 0 && internal.pond ? internal.pond.fry[index] ?? null : null
                        width: (fry ? fry.size : 22) * scene.unit * 2
                        height: width
                        property real phase: 0
                        property real px: width / 2
                        property vector2d shadowShift
                        property color tint: fry && fry.tone > 0.5 ? "#5b6b58" : "#6f6a4c"
                        fragmentShader: "shaders/fry.frag.qsb"
                    }
                }

                Item {
                    anchors.fill: parent

                    Repeater {
                        id: koiBodies
                        model: internal.revision >= 0 && internal.pond ? internal.pond.koi.length : 0
                        KoiMesh {
                            required property int index
                            readonly property var koi: internal.revision >= 0 && internal.pond ? internal.pond.koi[index] ?? null : null
                            anchors.fill: parent
                            variety: koi ? koi.variety.style : 0
                            baseColor: koi ? koi.variety.base : "white"
                            patchA: koi ? koi.variety.patchA : "white"
                            patchB: koi ? koi.variety.patchB : "white"
                            marks: koi ? Qt.vector4d(koi.seed, koi.variety.a, koi.variety.b, koi.variety.metal) : Qt.vector4d(0, 0, 0, 0)
                            fogColor: {
                                const w = scene.water.water, d = scene.water.deep;
                                return Qt.vector4d((w[0] + d[0]) / 2, (w[1] + d[1]) / 2, (w[2] + d[2]) / 2, 0.35 + 0.6 * w[3]);
                            }
                        }
                    }

                    Repeater {
                        id: pelletItems
                        model: Sim.MAX_PELLETS
                        Item {
                            property real shade: 0
                            visible: false
                            Rectangle {
                                anchors.centerIn: parent
                                width: 8.5 * scene.unit
                                height: width
                                radius: width / 2
                                color: Qt.darker("#b9763a", 1 + parent.shade)
                                border.color: "#5e3416"
                                border.width: Math.max(1, scene.unit)
                                antialiasing: true
                            }
                            Rectangle {
                                x: -2.4 * scene.unit
                                y: -2.8 * scene.unit
                                width: 2.6 * scene.unit
                                height: width
                                radius: width / 2
                                color: "#e9b982"
                                opacity: 0.8 - parent.shade
                            }
                        }
                    }
                }
            }
        }
        ShaderEffectSource {
            id: fishSource
            sourceItem: underwater
            hideSource: true
            live: false
            visible: false
            wrapMode: ShaderEffectSource.ClampToEdge
        }

        // --- Visible ----------------------------------------------------------

        ShaderEffect {
            id: surface
            anchors.fill: parent
            property real time: internal.time
            property real unit: scene.unit
            property real causticStrength: scene.causticStrength * scene.light.caustic
            property vector2d resolution: Qt.vector2d(width, height)
            property vector2d origin: Qt.vector2d(scene.originX, scene.originY)
            property vector2d span: Qt.vector2d(scene.host.spanWidth, scene.host.spanHeight)
            property vector2d cells: waveStep.cells
            property vector4d waterColor: scene.vec4(scene.water.water)
            property vector4d deepColor: Qt.vector4d(scene.water.deep[0], scene.water.deep[1], scene.water.deep[2], 1)
            property vector4d lightColor: scene.lightVector
            property vector4d skyColor: scene.vec4(scene.light.sky)
            property var bedTex: bedSource
            property var fishTex: fishSource
            property var waveTex: waveSource
            property var causticTex: causticSource
            blending: false
            fragmentShader: "shaders/water.frag.qsb"
        }

        // In pond coordinates.
        Item {
            x: -scene.originX
            y: -scene.originY
            width: parent.width
            height: parent.height

            Repeater {
                id: padItems
                model: internal.revision >= 0 && internal.pond ? internal.pond.pads.length : 0
                ShaderEffect {
                    required property int index
                    readonly property var pad: internal.revision >= 0 && internal.pond ? internal.pond.pads[index] ?? null : null
                    width: pad ? pad.radius * 2.5 : 0
                    height: width
                    property real radius: pad ? pad.radius : 1
                    property real seed: pad ? pad.seed : 0
                    property real angle: 0
                    property real mode: 0
                    property real wet: 1
                    property color leafColor: Qt.hsla(0.27 + 0.1 * seed, 0.36, 0.27 + 0.06 * seed, 1)
                    property vector4d lightColor: scene.lightVector
                    fragmentShader: "shaders/pad.frag.qsb"
                }
            }

            Repeater {
                id: flowerItems
                model: internal.revision >= 0 && internal.pond ? internal.pond.flowers.length : 0
                ShaderEffect {
                    required property int index
                    readonly property var flower: internal.revision >= 0 && internal.pond ? internal.pond.flowers[index] ?? null : null
                    width: flower ? flower.radius * 2.4 : 0
                    height: width
                    property real radius: flower ? flower.radius : 1
                    property real seed: flower ? flower.seed : 0
                    property real angle: 0
                    // Water lilies fold up at night.
                    property real bloom: 1 - 0.75 * scene.night
                    property color petalColor: seed < 0.6 ? "#fbe3ea" : "#fdf8ee"
                    property color tipColor: seed < 0.6 ? "#e8799f" : "#f6e7d2"
                    property vector4d lightColor: scene.lightVector
                    fragmentShader: "shaders/lotus.frag.qsb"
                }
            }

            Repeater {
                id: petalItems
                model: internal.revision >= 0 && internal.pond ? internal.pond.petals.length : 0
                ShaderEffect {
                    required property int index
                    readonly property var petal: internal.revision >= 0 && internal.pond ? internal.pond.petals[index] ?? null : null
                    width: petal ? petal.radius * 2.6 : 0
                    height: width
                    property real angle: 0
                    property real radius: petal ? petal.radius : 1
                    property real curl: petal ? petal.seed * 2 - 1 : 0
                    property color petalColor: petal && petal.seed > 0.5 ? "#fbd3de" : "#fde6ec"
                    property vector4d lightColor: scene.lightVector
                    fragmentShader: "shaders/petal.frag.qsb"
                }
            }

            Item {
                id: fireflyLayer
                anchors.fill: parent
                visible: scene.fireflies && scene.night > 0.05

                Repeater {
                    id: fireflyItems
                    model: internal.revision >= 0 && internal.pond ? internal.pond.fireflies.length : 0
                    ShaderEffect {
                        width: 74 * scene.unit
                        height: width
                        opacity: 0
                        property color tint: "#e8ff9a"
                        fragmentShader: "shaders/glow.frag.qsb"
                    }
                }
            }
        }
    }
}
