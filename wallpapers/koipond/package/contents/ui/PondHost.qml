import QtQuick
import "code/sim.js" as Sim

// A pond and the clock that drives it. Scenes join to look into it, one per screen.
Item {
    id: host

    property var pond: null
    property int revision: 0        // bumped when the cast changes, so delegates rebind
    property real time: 0
    property int steps: 0           // for tests and profiling
    property int fps: 60

    // The pond's place on the desktop.
    property real originX: 0
    property real originY: 0
    property real spanWidth: 0
    property real spanHeight: 0
    property real unit: 1

    property var members: []        // { scene, rect }
    property bool awake: false
    property var pointer: null      // the scene the cursor is over
    property double last: 0

    function join(scene, rect, options) {
        members = members.filter(m => m.scene !== scene).concat({ scene: scene, rect: rect });
        for (const key in options)
            option(key, options[key]);
        reshape(options);
        stir();
    }

    function leave(scene) {
        leaveCursor(scene);
        members = members.filter(m => m.scene !== scene);
        if (members.length)
            reshape();
        stir();
    }

    function stir() {
        const watching = members.filter(m => m.scene.animating);
        awake = watching.length > 0;
        if (pond)
            pond.watch(watching.map(m => m.rect));
    }

    function reshape(options) {
        const screens = [];
        for (const m of members)
            if (!screens.some(r => r.x === m.rect.x && r.y === m.rect.y && r.width === m.rect.width && r.height === m.rect.height))
                screens.push(m.rect);
        const before = pond ? pond.screens.length : 0;
        if (pond)
            pond.reshape(screens);
        else
            pond = new Sim.Pond(screens, options);
        // Let new fish settle into natural poses before anyone sees them.
        for (let i = 0; i < 90 && pond.screens.length > before; ++i)
            pond.step(1 / 30);
        pond.takeDrops();
        originX = pond.left;
        originY = pond.top;
        spanWidth = pond.width;
        spanHeight = pond.height;
        unit = pond.unit;
        revision++;
        for (const m of members)
            m.scene.restart();
    }

    function option(key, value) {
        if (key === "fps")
            fps = value;
        if (!pond || pond.options[key] === value)
            return;
        pond.options[key] = value;
        const sync = { koiCount: "syncKoi", fryCount: "syncFry", padCount: "plant", flowers: "plant", petalCount: "syncPetals" }[key];
        if (sync)
            pond[sync]();
        if (key === "koiSize")
            pond.koi.forEach(k => k.resize(pond));
        revision++;
    }

    function moveCursor(scene, x, y) {
        if (!pond)
            return;
        pointer = scene;
        pond.moveCursor(x, y);
    }

    // The next screen may already have the cursor by the time this one loses it.
    function leaveCursor(scene) {
        if (!pond || pointer !== scene)
            return;
        pointer = null;
        pond.leaveCursor();
    }

    function tap(x, y) {
        if (pond)
            pond.tap(x, y);
    }

    function tick(elapsed) {
        if (!pond)
            return;
        const dt = Math.max(0.002, Math.min(elapsed, 0.05));
        time += dt;
        steps++;
        pond.step(dt);
        const drops = pond.takeDrops();
        for (let i = 0; i < members.length; ++i)
            if (members[i].scene.animating)
                members[i].scene.advance(dt, drops);
    }

    Timer {
        interval: Math.max(4, Math.floor(1000 / Math.max(host.fps, 1)))
        repeat: true
        running: host.awake && host.fps > 0
        onRunningChanged: host.last = 0
        onTriggered: {
            const now = Date.now();
            host.tick(host.last ? (now - host.last) / 1000 : 1 / host.fps);
            host.last = now;
        }
    }
    FrameAnimation {
        running: host.awake && host.fps === 0
        onTriggered: host.tick(frameTime)
    }
}
