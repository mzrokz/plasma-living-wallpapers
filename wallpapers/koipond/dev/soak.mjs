// Simulate an hour of pond life without a screen:  node dev/soak.mjs
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../package/contents/ui/code/sim.js", import.meta.url), "utf8")
    .replace(".pragma library", "");
const { Pond, Cursor } = new Function(src + "; return { Pond, Cursor };")();

const rect = (x, y, width, height) => ({ x, y, width, height });
const layouts = {
    single: [rect(0, 0, 1920, 1080)],
    pair: [rect(0, 0, 1920, 1080), rect(1920, 0, 1920, 1080)],
    // Different sizes, not lined up, with a dead corner.
    uneven: [rect(0, 300, 1920, 1080), rect(1920, 0, 2560, 1440)]
};

let failed = false;
for (const [layout, screens] of Object.entries(layouts))
for (const [name, mode] of Object.entries(Cursor)) {
    const pond = new Pond(screens, { cursorMode: mode, koiCount: 14, rain: 0.5 });
    const gapTo = k => Math.min(...pond.screens.map(r => Math.hypot(
        Math.max(r.x - k.x, 0, k.x - r.x - r.width), Math.max(r.y - k.y, 0, k.y - r.y - r.height))));
    const anywhere = () => {
        const r = pond.screens[Math.floor(Math.random() * pond.screens.length)];
        return [r.x + Math.random() * r.width, r.y + Math.random() * r.height];
    };
    let outside = 0, samples = 0, eaten = 0, dropped = 0, gap = 0, spin = 0, crossings = 0;
    const eat = pond.eat;
    pond.eat = function (k, p) { eaten++; eat.call(this, k, p); };
    const feed = pond.feed;
    pond.feed = function (x, y) { dropped++; feed.call(this, x, y); };
    const homes = new Map();
    const spread = pond.screens.map(() => 0);
    let [cx, cy] = anywhere();
    for (let i = 0; i < 3600 * 60; ++i) {
        const s = i % 3600;
        if (s === 0) [cx, cy] = anywhere();
        if (s < 900) {
            const r = pond.screenAt(cx += (Math.random() - 0.5) * 60, cy += (Math.random() - 0.5) * 60);
            cx = Math.min(r.x + r.width, Math.max(r.x, cx));
            cy = Math.min(r.y + r.height, Math.max(r.y, cy));
            pond.moveCursor(cx, cy);
        }
        else if (s < 1800) pond.moveCursor(cx, cy);
        else pond.leaveCursor();
        if (i % 1500 === 0) pond.tap(...anywhere());
        if (i === 60000 && screens.length > 1) pond.reshape(screens.slice(0, 1));     // unplug, replug
        if (i === 80000 && screens.length > 1) pond.reshape(screens);
        if (i === 100000) pond.reshape(screens.map(r => rect(r.x * 4 / 3, r.y * 4 / 3, r.width * 4 / 3, r.height * 4 / 3)));
        if (i === 120000) pond.reshape(screens);
        if (i === 140000) pond.watch(screens.slice(0, 1));                            // one screen covered
        if (i === 170000) pond.watch(screens);
        pond.step(1 / 60);
        pond.takeDrops();
        if (i % 30) continue;
        for (const k of pond.koi) {
            samples++;
            if (![k.x, k.y, k.heading, k.speed, k.depth, k.thrust, ...k.points].every(Number.isFinite)) throw new Error(name + ": NaN koi");
            if (gapTo(k) > k.length) outside++;
            const home = pond.screens.indexOf(pond.screenAt(k.x, k.y));
            spread[home]++;
            if (homes.has(k) && homes.get(k) !== home) crossings++;
            homes.set(k, home);
            spin += Math.abs(k.turnRate);
            for (const o of pond.koi) if (o !== k) gap += Math.hypot(k.x - o.x, k.y - o.y) < 60 ? 1 : 0;
        }
        for (const f of pond.fry) if (!Number.isFinite(f.x + f.y + f.angle)) throw new Error(name + ": NaN fry");
        for (const p of pond.pads) if (!Number.isFinite(p.x + p.y)) throw new Error(name + ": NaN pad");
    }
    if (pond.koi.length !== 14 * screens.length) failed = true;
    const strayPads = pond.pads.filter(p => Math.hypot(p.x - p.homeX, p.y - p.homeY) > 250).length;
    console.log(layout.padEnd(6), name.padEnd(9), "off-screen", (100 * outside / samples).toFixed(2) + "%", "eaten", eaten + "/" + dropped,
        "mean turn", (spin / samples).toFixed(2), "touching", (100 * gap / samples).toFixed(1) + "%", "stray pads", strayPads,
        "crossings/min", (crossings / 60).toFixed(1), "spread", spread.map(n => (100 * n / samples).toFixed(0) + "%").join("/"));
    if (outside / samples > 0.02 || eaten < dropped * 0.5) failed = true;
}
process.exit(failed ? 1 : 0);
