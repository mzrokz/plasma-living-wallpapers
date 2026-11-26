.pragma library

// Pond simulation: everything that moves, with no drawing. All lengths are pixels,
// times are seconds, angles are radians. A PondHost owns one Pond; each PondScene looking
// into it copies the state into its shaders after every step.

const SPINE = 12;              // points per koi, nose to tail tip
const MAX_DROPS = 12;          // wave impulses the wave shader accepts per step
const MAX_PELLETS = 60;
const SEAM = 8;                // screens closer than this count as touching
const TAU = Math.PI * 2;

// Cursor behaviours, in the order the settings page lists them.
const Cursor = { Natural: 0, Shy: 1, Friendly: 2, Ignore: 3 };

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
const pick = list => list[Math.floor(Math.random() * list.length)];

// Math.hypot and for..of are several times slower than these in Qt's JS engine, so the
// per-frame loops avoid them.
function hypot(x, y) { return Math.sqrt(x * x + y * y); }

function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
}

function smooth(edge0, edge1, v) {
    const t = clamp((v - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

// style: 0 patches, 1 asagi, 2 tancho. a/b: how much of the body each patch colour covers.
const VARIETIES = [
    { name: "Kohaku",  weight: 4, style: 0, base: "#f6efe4", patchA: "#d2431c", patchB: "#d2431c", a: 0.50, b: 0.00, metal: 0.10 },
    { name: "Sanke",   weight: 3, style: 0, base: "#f5eee3", patchA: "#cf3d1a", patchB: "#17161a", a: 0.47, b: 0.33, metal: 0.10 },
    { name: "Showa",   weight: 3, style: 0, base: "#1b1a1f", patchA: "#f1e9df", patchB: "#cc3b17", a: 0.50, b: 0.47, metal: 0.10 },
    { name: "Utsuri",  weight: 1, style: 0, base: "#1a1a1e", patchA: "#e98a1c", patchB: "#e98a1c", a: 0.52, b: 0.00, metal: 0.10 },
    { name: "Bekko",   weight: 1, style: 0, base: "#f0e6d4", patchA: "#1b1a1d", patchB: "#1b1a1d", a: 0.34, b: 0.00, metal: 0.10 },
    { name: "Hariwake", weight: 2, style: 0, base: "#ece9e2", patchA: "#e8a32e", patchB: "#e8a32e", a: 0.53, b: 0.00, metal: 0.80 },
    { name: "Ogon",    weight: 2, style: 0, base: "#e6a53a", patchA: "#e6a53a", patchB: "#e6a53a", a: 0.00, b: 0.00, metal: 1.00 },
    { name: "Platinum", weight: 1, style: 0, base: "#e4e4e0", patchA: "#e4e4e0", patchB: "#e4e4e0", a: 0.00, b: 0.00, metal: 1.00 },
    { name: "Benigoi", weight: 2, style: 0, base: "#d95a1e", patchA: "#e8742c", patchB: "#e8742c", a: 0.40, b: 0.00, metal: 0.15 },
    { name: "Asagi",   weight: 2, style: 1, base: "#7c93a6", patchA: "#cb5a26", patchB: "#dfe3e2", a: 0.00, b: 0.00, metal: 0.20 },
    { name: "Tancho",  weight: 2, style: 2, base: "#f7f1e8", patchA: "#d0301a", patchB: "#d0301a", a: 0.00, b: 0.00, metal: 0.10 }
];

function dealVarieties(count) {
    // Deal from a weighted deck so a small pond still gets a good mix.
    const out = [];
    let deck = [];
    while (out.length < count) {
        if (!deck.length) {
            for (const v of VARIETIES)
                for (let i = 0; i < v.weight; ++i) deck.push(v);
            deck.sort(() => Math.random() - 0.5);
        }
        let i = deck.findIndex(v => out.length === 0 || v !== out[out.length - 1]);
        out.push(deck.splice(Math.max(i, 0), 1)[0]);
    }
    return out;
}

class Koi {
    constructor(pond, variety) {
        this.variety = variety;
        this.seed = rand(0, 40);
        this.sizeFactor = rand(0.74, 1.22);
        this.boldness = Math.random();
        this.pace = rand(0.85, 1.15);

        const at = pond.spot(pond.koi, 0.08);
        this.x = at.x;
        this.y = at.y;
        this.heading = rand(-Math.PI, Math.PI);
        this.turnRate = 0;
        this.speed = 40;
        this.wander = 0;
        this.depth = rand(0.1, 0.8);
        this.targetDepth = this.depth;
        this.depthTimer = rand(2, 12);
        this.phase = rand(0, TAU);
        this.thrust = 0.4;
        this.coast = rand(0, 4);
        this.startle = 0;
        this.startleAngle = 0;
        this.excite = 0;
        this.hearing = [];
        this.sweepL = 0.3;
        this.sweepR = 0.3;
        this.flip = Math.random() < 0.5 ? 1 : -1;
        this.wakeClock = 0;

        this.resize(pond);
        this.chain = [];
        for (let i = 0; i < SPINE; ++i)
            this.chain.push({ x: this.x - Math.cos(this.heading) * this.segment * i,
                              y: this.y - Math.sin(this.heading) * this.segment * i });
        this.points = new Array(SPINE * 2).fill(0);
        this.bent = NaN;
        this.bend();
    }

    resize(pond) {
        this.length = 204 * pond.unit * pond.options.koiSize * this.sizeFactor;
        this.segment = this.length / (SPINE - 1);
    }

    step(pond, dt) {
        const o = pond.options;
        const L = this.length;
        const cruise = 46 * pond.unit * o.speed * this.pace;

        // Koi swim in bursts: a few beats of the tail, then glide.
        this.coast -= dt;
        if (this.coast < -rand(1.2, 3.0)) this.coast = rand(1.4, 4.5);
        let targetSpeed = cruise * (this.coast < 0 ? 1.45 : 0.72);
        let agility = 1.0;

        this.wander += (Math.random() - 0.5) * 0.85 * Math.sqrt(dt);
        this.wander *= Math.exp(-dt * 0.4);
        let dx = Math.cos(this.heading + this.wander) * 1.0;
        let dy = Math.sin(this.heading + this.wander) * 1.0;

        // Let fish slip a little past the screen edge, then turn home.
        const reach = L * 1.15, slack = L * 0.22;
        const s = pond.shore(this.x, this.y);
        const wl = smooth(reach, -slack, this.x - s.left), wr = smooth(reach, -slack, s.right - this.x);
        const wt = smooth(reach, -slack, this.y - s.top), wb = smooth(reach, -slack, s.bottom - this.y);
        dx += (wl - wr) * 3.4;
        dy += (wt - wb) * 3.4;

        // Neighbours at a similar depth: keep apart, loosely agree on direction.
        const koi = pond.koi, x = this.x, y = this.y;
        for (let i = 0; i < koi.length; ++i) {
            const k = koi[i];
            const ex = x - k.x;
            if (ex > L * 3 || ex < -L * 3 || k === this) continue;
            const ey = y - k.y;
            const d2 = ex * ex + ey * ey;
            const near = (L + k.length) * 0.42;
            if (d2 > near * near * 6) continue;
            const d = Math.sqrt(d2) + 1e-3;
            const layer = 1 - smooth(0.15, 0.5, Math.abs(this.depth - k.depth));
            if (d < near) {
                const push = (1 - d / near) * 2.6 * (0.25 + 0.75 * layer);
                dx += ex / d * push;
                dy += ey / d * push;
                if (layer > 0.4 && this.depthTimer > 1)
                    this.targetDepth = clamp(this.depth + (this.depth >= k.depth ? 0.25 : -0.25), 0.04, 0.95);
            } else {
                const w = 0.16 * (1 - d / (near * 2.45));
                dx += Math.cos(k.heading) * w;
                dy += Math.sin(k.heading) * w;
            }
        }

        // Change depth now and then.
        this.depthTimer -= dt;
        if (this.depthTimer < 0) {
            this.depthTimer = rand(6, 20);
            this.targetDepth = Math.random() < 0.6 ? rand(0.05, 0.4) : rand(0.4, 0.92);
        }

        // Food.
        this.excite = Math.max(0, this.excite - dt * 0.12);
        const meal = this.startle > 0 ? null : this.findFood(pond);
        if (meal) {
            const ex = meal.x - this.x, ey = meal.y - this.y;
            const d = hypot(ex, ey) + 1e-3;
            dx += ex / d * 5.5;
            dy += ey / d * 5.5;
            this.excite = 1;
            this.targetDepth = Math.max(0.03, meal.depth);
            // Ease off when the food is beside or behind, so the fish turns instead of orbiting.
            const facing = Math.cos(wrapAngle(Math.atan2(ey, ex) - this.heading));
            const rush = (2.1 + 1.9 * this.boldness) * (0.45 + 0.55 * Math.max(0, facing));
            targetSpeed = cruise * rush * (0.55 + 0.45 * smooth(L * 0.15, L * 1.2, d));
            agility = 2.0;
            if (d < L * 0.1 + 5 * pond.unit) pond.eat(this, meal);
        }

        // Cursor.
        const c = pond.cursor;
        if (c.active && o.cursorMode !== Cursor.Ignore && !meal) {
            const ex = this.x - c.x, ey = this.y - c.y;
            const d = hypot(ex, ey) + 1e-3;
            const U = pond.unit;
            if (o.cursorMode === Cursor.Natural) {
                const fright = 190 * U;
                if (c.speed > 1100 * U && d < fright && this.startle <= 0)
                    this.scare(Math.atan2(ey, ex), rand(0.6, 1.1));
                else if (c.still > 0.8 + 2.2 * (1 - this.boldness) && d < 560 * U && this.boldness > 0.3)
                    [dx, dy, targetSpeed] = this.circle(pond, dx, dy, d, ex, ey, cruise);
            } else if (o.cursorMode === Cursor.Shy) {
                const fear = 230 * U;
                if (d < fear) {
                    const w = 1 - d / fear;
                    dx += ex / d * w * 7;
                    dy += ey / d * w * 7;
                    targetSpeed = Math.max(targetSpeed, cruise * (1 + 3.4 * w));
                    agility = 1.8;
                    if (d < 80 * U && this.startle <= 0) this.scare(Math.atan2(ey, ex), rand(0.5, 0.9));
                }
            } else if (d < 1400 * U) {
                [dx, dy, targetSpeed] = this.circle(pond, dx, dy, d, ex, ey, cruise * 1.35);
                agility = 1.4;
            }
        }

        if (this.startle > 0) {
            this.startle -= dt;
            dx += Math.cos(this.startleAngle) * 9;
            dy += Math.sin(this.startleAngle) * 9;
            targetSpeed = cruise * 6.2;
            agility = 3.1;
            this.targetDepth = Math.max(this.targetDepth, 0.55);
        }

        // Steering: smoothed turn rate, limited the way a long body is.
        const want = wrapAngle(Math.atan2(dy, dx) - this.heading);
        const maxTurn = (0.95 + 0.004 * this.speed / pond.unit) * agility;
        const targetTurn = clamp(want * 1.9 * agility, -maxTurn, maxTurn);
        this.turnRate += (targetTurn - this.turnRate) * (1 - Math.exp(-dt * 4.5 * agility));
        this.heading = wrapAngle(this.heading + this.turnRate * dt);

        const gain = targetSpeed > this.speed ? (this.startle > 0 ? 9 : 1.7 * agility) : 0.85;
        this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-dt * gain));
        this.x += Math.cos(this.heading) * this.speed * dt;
        this.y += Math.sin(this.heading) * this.speed * dt;
        this.depth += (this.targetDepth - this.depth) * (1 - Math.exp(-dt * (this.startle > 0 ? 2.2 : 0.7)));

        // Tail: beats faster with speed, harder when accelerating or turning.
        const pace = this.speed / (cruise + 1e-3);
        const effort = clamp((targetSpeed - this.speed) / (cruise + 1e-3), -0.4, 2.5);
        const wantThrust = clamp(0.30 + 0.24 * pace * 0.6 + 0.34 * effort, 0.16, 1.15);
        this.thrust += (wantThrust - this.thrust) * (1 - Math.exp(-dt * 3));
        this.phase += dt * (1.9 + 2.5 * Math.sqrt(pace) * this.pace + 2.4 * this.thrust) / Math.sqrt(this.sizeFactor);

        // Pectorals: paddle when slow, fold when fast, brake on the inside of a turn.
        const idle = 0.42 - 0.42 * smooth(0.8, 2.6, pace);
        const row = Math.sin(this.phase * 0.5) * 0.13 * (1 - smooth(1, 3, pace));
        const steer = clamp(this.turnRate * 0.4, -0.4, 0.4);
        this.sweepL += (idle + row - steer - this.sweepL) * (1 - Math.exp(-dt * 5));
        this.sweepR += (idle - row + steer - this.sweepR) * (1 - Math.exp(-dt * 5));

        this.follow();
        this.wake(pond, dt);
    }

    findFood(pond) {
        let best = null, bestScore = Infinity;
        if (!pond.foodLeft) return null;
        for (const p of pond.pellets) {
            if (!p.alive || p.age < 0.15) continue;
            const d = hypot(p.x - this.x, p.y - this.y);
            // Word of a meal spreads outwards.
            if (d > 150 * pond.unit + p.age * 420 * pond.unit) continue;
            if (d > 1100 * pond.unit * (0.45 + 0.55 * this.boldness)) continue;
            const turn = Math.abs(wrapAngle(Math.atan2(p.y - this.y, p.x - this.x) - this.heading));
            const score = d + turn * 60 * pond.unit;
            if (score < bestScore) { bestScore = score; best = p; }
        }
        return best;
    }

    // Drift in close to the cursor, then loop around it.
    circle(pond, dx, dy, d, ex, ey, cruise) {
        const ring = this.length * (0.75 + 0.5 * this.boldness);
        const pull = clamp((d - ring) / (ring * 0.8), -1.2, 1.6);
        dx += -ex / d * pull * 2.2 + -ey / d * this.flip * 1.5;
        dy += -ey / d * pull * 2.2 + ex / d * this.flip * 1.5;
        this.targetDepth = Math.min(this.targetDepth, 0.25);
        return [dx, dy, cruise * (d > ring * 2 ? 1.7 : 1.0)];
    }

    scare(angle, time) {
        this.startle = time;
        // Break sideways as often as straight away, as real fish do.
        this.startleAngle = angle + rand(-0.7, 0.7);
        this.coast = -0.1;
    }

    // Each point trails the one ahead of it; the bend between links is limited.
    follow() {
        const c = this.chain;
        c[0].x = this.x;
        c[0].y = this.y;
        let prev = this.heading + Math.PI;
        for (let i = 1; i < SPINE; ++i) {
            const a = c[i - 1], b = c[i];
            let ang = Math.atan2(b.y - a.y, b.x - a.x);
            const limit = i < 3 ? 0.07 : 0.2;
            ang = prev + clamp(wrapAngle(ang - prev), -limit, limit);
            b.x = a.x + Math.cos(ang) * this.segment;
            b.y = a.y + Math.sin(ang) * this.segment;
            prev = ang;
        }
    }

    // Add the swimming wave on top of the trailing spine. Only needed by whoever draws it.
    bend() {
        if (this.bent === this.phase) return;
        this.bent = this.phase;
        const c = this.chain, p = this.points;
        for (let i = 0; i < SPINE; ++i) {
            const a = c[Math.max(i - 1, 0)], b = c[Math.min(i + 1, SPINE - 1)];
            const ex = b.x - a.x, ey = b.y - a.y;
            const d = hypot(ex, ey) + 1e-6;
            const s = i / (SPINE - 1);
            const amp = this.length * this.thrust * (0.012 - 0.03 * s + 0.135 * s * s);
            const off = amp * Math.sin(this.phase - s * 4.4);
            p[i * 2] = c[i].x - ey / d * off;
            p[i * 2 + 1] = c[i].y + ex / d * off;
        }
    }

    wake(pond, dt) {
        if (this.depth > 0.34) return;
        this.wakeClock -= dt;
        if (this.wakeClock > 0) return;
        const pace = this.speed / (46 * pond.unit);
        this.wakeClock = 0.12;
        if (pace < 1.2) return;
        const tail = this.chain[SPINE - 2];
        const power = (1 - this.depth / 0.34) * Math.min(pace, 4) * 0.011 * (Math.sin(this.phase - 4) > 0 ? 1 : -1);
        pond.drop(tail.x, tail.y, 11 * pond.unit, power);
    }
}

class Fry {
    constructor(pond) {
        const at = pond.spot(pond.fry, 0.2);
        this.x = at.x;
        this.y = at.y;
        const a = rand(0, TAU);
        this.vx = Math.cos(a) * 40;
        this.vy = Math.sin(a) * 40;
        this.angle = a;
        this.phase = rand(0, TAU);
        this.size = rand(25, 37);
        this.ax = 0;
        this.ay = 0;
        this.panic = 0;
        this.tone = Math.random();
    }

    // What the fish would like to do: school up, steer clear of anything bigger.
    steer(pond, school) {
        const U = pond.unit;
        const fry = pond.fry, koi = pond.koi;
        let ax = 0, ay = 0, mx = 0, my = 0, hx = 0, hy = 0, n = 0;
        for (let i = 0; i < fry.length; ++i) {
            const f = fry[i];
            if (f === this) continue;
            const ex = f.x - this.x, ey = f.y - this.y;
            const d2 = ex * ex + ey * ey;
            if (d2 > 15000 * U * U) continue;
            const d = Math.sqrt(d2) + 1e-3;
            mx += ex; my += ey; hx += f.vx; hy += f.vy; ++n;
            if (d < 30 * U) {
                ax -= ex / d * (1 - d / (30 * U)) * 190 * U;
                ay -= ey / d * (1 - d / (30 * U)) * 190 * U;
            }
        }
        if (n) {
            ax += mx / n * 0.75 + (hx / n - this.vx) * 1.1;
            ay += my / n * 0.75 + (hy / n - this.vy) * 1.1;
        }
        ax += (school.x - this.x) * 0.14;
        ay += (school.y - this.y) * 0.14;
        ax += rand(-70, 70) * U;
        ay += rand(-70, 70) * U;

        // Everything bigger is scary.
        for (let i = 0; i < koi.length; ++i) {
            const k = koi[i];
            const ex = this.x - k.x, ey = this.y - k.y;
            const d = hypot(ex, ey) + 1e-3;
            const fear = k.length * 0.5;
            if (d < fear) {
                ax += ex / d * (1 - d / fear) * 620 * U;
                ay += ey / d * (1 - d / fear) * 620 * U;
            }
        }
        const c = pond.cursor;
        if (c.active && pond.options.cursorMode !== Cursor.Ignore) {
            const ex = this.x - c.x, ey = this.y - c.y;
            const d = hypot(ex, ey) + 1e-3;
            const fear = 110 * U;
            if (d < fear && pond.options.cursorMode !== Cursor.Friendly) {
                ax += ex / d * (1 - d / fear) * 1900 * U;
                ay += ey / d * (1 - d / fear) * 1900 * U;
                this.panic = Math.max(this.panic, 0.5);
            }
        }
        this.ax = ax;
        this.ay = ay;
    }

    step(pond, dt) {
        const U = pond.unit;
        this.panic = Math.max(0, this.panic - dt);
        this.vx += this.ax * dt;
        this.vy += this.ay * dt;
        const v = hypot(this.vx, this.vy) + 1e-3;
        const top = (this.panic > 0 ? 250 : 78) * U * pond.options.speed;
        const lo = 22 * U * pond.options.speed;
        const target = clamp(v, lo, top);
        const k = v > top ? Math.exp(-dt * 5) : 1;
        const nv = v > top ? target + (v - target) * k : target;
        this.vx *= nv / v;
        this.vy *= nv / v;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        const turn = wrapAngle(Math.atan2(this.vy, this.vx) - this.angle);
        this.angle = wrapAngle(this.angle + turn * (1 - Math.exp(-dt * 9)));
        this.phase += dt * (6 + nv / U * 0.13);
    }
}

// Pads, flowers and petals: things that float, get shoved and drift back.
class Floater {
    constructor(x, y, radius, mass) {
        this.homeX = this.x = x;
        this.homeY = this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = radius;
        this.mass = mass;
        this.angle = rand(0, TAU);
        this.spin = 0;
        this.seed = Math.random();
        this.sway = rand(0, TAU);
        this.anchored = true;
    }

    step(pond, dt) {
        const U = pond.unit;
        this.sway += dt * 0.4;
        if (this.anchored) {
            this.vx += (this.homeX + Math.cos(this.sway) * 5 * U - this.x) * 0.5 * dt;
            this.vy += (this.homeY + Math.sin(this.sway * 1.3) * 5 * U - this.y) * 0.5 * dt;
        } else {
            this.vx += (Math.cos(this.sway * 0.7) * 5 + 5) * U * dt;
            this.vy += (Math.sin(this.sway * 0.5) * 5 + 2) * U * dt;
        }
        const c = pond.cursor;
        if (c.active) {
            const ex = this.x - c.x, ey = this.y - c.y;
            const reach = this.radius + 34 * U;
            const d = hypot(ex, ey) + 1e-3;
            if (d < reach) {
                const w = (1 - d / reach) / this.mass;
                this.vx += (c.vx * 1.7 + ex / d * c.speed * 0.5) * w * dt;
                this.vy += (c.vy * 1.7 + ey / d * c.speed * 0.5) * w * dt;
                this.spin += (ex * c.vy - ey * c.vx) / (reach * reach) * w * dt * 0.9;
            }
        }
        for (let i = 0; i < pond.rings.length; ++i) {
            const r = pond.rings[i];
            const ex = this.x - r.x, ey = this.y - r.y;
            const d = hypot(ex, ey) + 1e-3;
            if (Math.abs(d - r.radius) < 26 * U) {
                const w = r.power * 130 * U * dt / this.mass / (1 + d / (260 * U));
                this.vx += ex / d * w;
                this.vy += ey / d * w;
                this.spin += (this.seed - 0.5) * w * 0.02;
            }
        }
        const drag = Math.exp(-dt * 1.1);
        this.vx *= drag;
        this.vy *= drag;
        this.spin *= Math.exp(-dt * 0.8);
        const lim = 160 * U;
        this.vx = clamp(this.vx, -lim, lim);
        this.vy = clamp(this.vy, -lim, lim);
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.angle += (this.spin + (this.seed - 0.5) * 0.02) * dt;
        if (!this.anchored) {
            const m = this.radius * 2 + 10;
            if (this.x > pond.width + m) this.x = -m;
            if (this.x < -m) this.x = pond.width + m;
            if (this.y > pond.height + m) this.y = -m;
            if (this.y < -m) this.y = pond.height + m;
        }
    }
}

class Firefly {
    constructor(pond) {
        const at = pond.spot(pond.fireflies, 0);
        this.x = at.x;
        this.y = at.y;
        this.a = rand(0, TAU);
        this.phase = rand(0, TAU);
        this.rate = rand(0.5, 1.1);
        this.glow = 0;
    }

    step(pond, dt) {
        this.a += rand(-3, 3) * Math.sqrt(dt) * 0.8;
        const v = 24 * pond.unit;
        this.x += Math.cos(this.a) * v * dt;
        this.y += Math.sin(this.a) * v * dt;
        const c = pond.cursor;
        if (c.active) {
            const ex = this.x - c.x, ey = this.y - c.y;
            const d = hypot(ex, ey) + 1e-3, reach = 130 * pond.unit;
            if (d < reach) {
                this.x += ex / d * (1 - d / reach) * 190 * pond.unit * dt;
                this.y += ey / d * (1 - d / reach) * 190 * pond.unit * dt;
            }
        }
        const m = 40;
        if (this.x < -m) this.x = pond.width + m; else if (this.x > pond.width + m) this.x = -m;
        if (this.y < -m) this.y = pond.height + m; else if (this.y > pond.height + m) this.y = -m;
        this.phase += dt * this.rate;
        this.glow = Math.pow(Math.max(0, Math.sin(this.phase)), 1.6);
    }
}

// screens: rectangles on the desktop that look into the pond. Counts in the options are
// per screen, so a wider pond is no emptier.
class Pond {
    constructor(screens, options) {
        this.options = Object.assign({
            koiCount: 12, koiSize: 1, speed: 1, fryCount: 18, padCount: 7, flowers: true,
            petalCount: 9, fireflyCount: 14, cursorMode: Cursor.Natural, clickFeeds: true, rain: 0
        }, options);
        this.edges = { left: 0, right: 0, top: 0, bottom: 0 };
        this.frame(screens);
        this.cursor = { active: false, x: 0, y: 0, vx: 0, vy: 0, speed: 0, still: 0, px: 0, py: 0, moved: false };
        this.koi = [];
        this.fry = [];
        this.pads = [];
        this.flowers = [];
        this.petals = [];
        this.fireflies = [];
        this.pellets = [];
        this.rings = [];
        this.drops = [];
        this.stir = null;
        this.rainClock = 0;
        this.turn = 0;
        this.foodLeft = false;
        this.schools = [];
        for (let i = 0; i < MAX_PELLETS; ++i)
            this.pellets.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, depth: 0, opacity: 0 });
        this.syncKoi();
        this.syncFry();
        this.plant();
        this.syncPetals();
        this.syncFireflies();
    }

    // Fit the pond to the box around all the screens; its own coordinates start there.
    frame(screens) {
        this.left = Math.min(...screens.map(r => r.x));
        this.top = Math.min(...screens.map(r => r.y));
        this.width = Math.max(...screens.map(r => r.x + r.width)) - this.left;
        this.height = Math.max(...screens.map(r => r.y + r.height)) - this.top;
        this.unit = Math.min(...screens.map(r => r.height)) / 1080;
        this.screens = screens.map(r => ({ x: r.x - this.left, y: r.y - this.top, width: r.width, height: r.height, watched: true }));
        this.unwatched = false;
    }

    // Fish that nobody can see are simulated in coarser steps. seen: the rectangles of the
    // screens in view.
    watch(seen) {
        for (const s of this.screens)
            s.watched = seen.some(r => r.x - this.left === s.x && r.y - this.top === s.y);
        this.unwatched = this.screens.some(s => !s.watched);
    }

    inSight(e, reach) {
        if (!this.unwatched) return true;
        const list = this.screens;
        for (let i = 0; i < list.length; ++i) {
            const r = list[i];
            if (r.watched && e.x > r.x - reach && e.x < r.x + r.width + reach && e.y > r.y - reach && e.y < r.y + r.height + reach) return true;
        }
        return false;
    }

    total(option) { return this.options[option] * this.screens.length; }

    screenAt(x, y) {
        const list = this.screens;
        let best = list[0], bestD = Infinity;
        for (let i = 0; i < list.length && bestD > 0; ++i) {
            const r = list[i];
            const ex = Math.max(r.x - x, 0, x - r.x - r.width), ey = Math.max(r.y - y, 0, y - r.y - r.height);
            const d = ex * ex + ey * ey;
            if (d < bestD) { bestD = d; best = r; }
        }
        return best;
    }

    // Where open water ends in each direction from here, crossing between touching screens.
    shore(x, y) {
        const e = this.edges, list = this.screens, home = this.screenAt(x, y);
        e.left = home.x;
        e.right = home.x + home.width;
        e.top = home.y;
        e.bottom = home.y + home.height;
        const cx = clamp(x, e.left, e.right), cy = clamp(y, e.top, e.bottom);
        for (let pass = 1; pass < list.length; ++pass)
            for (let i = 0; i < list.length; ++i) {
                const r = list[i], right = r.x + r.width, bottom = r.y + r.height;
                if (cy >= r.y && cy <= bottom) {
                    if (r.x < e.left && right > e.left - SEAM) e.left = r.x;
                    if (right > e.right && r.x < e.right + SEAM) e.right = right;
                }
                if (cx >= r.x && cx <= right) {
                    if (r.y < e.top && bottom > e.top - SEAM) e.top = r.y;
                    if (bottom > e.bottom && r.y < e.bottom + SEAM) e.bottom = bottom;
                }
            }
        return e;
    }

    // A random place on whichever screen has the fewest of the given things.
    spot(list, inset) {
        const held = this.screens.map(() => 0);
        for (const e of list) held[this.screens.indexOf(this.screenAt(e.x, e.y))]++;
        const r = this.screens[held.indexOf(Math.min(...held))];
        return { x: r.x + rand(inset, 1 - inset) * r.width, y: r.y + rand(inset, 1 - inset) * r.height };
    }

    // Grow or shrink without disturbing fish that are already there.
    syncKoi() {
        const want = this.total("koiCount");
        if (this.koi.length < want)
            for (const v of dealVarieties(want - this.koi.length)) this.koi.push(new Koi(this, v));
        this.koi.length = want;
    }

    syncFry() {
        const want = this.total("fryCount");
        while (this.fry.length < want) this.fry.push(new Fry(this));
        this.fry.length = want;
        while (this.schools.length < this.screens.length) this.schools.push({ x: 0, y: 0, t: rand(0, 100) });
        this.schools.length = this.screens.length;
    }

    syncPetals() {
        const want = this.total("petalCount");
        while (this.petals.length < want) {
            const at = this.spot(this.petals, 0);
            const f = new Floater(at.x, at.y, rand(7, 12) * this.unit, 0.35);
            f.anchored = false;
            this.petals.push(f);
        }
        this.petals.length = want;
    }

    syncFireflies() {
        const want = this.total("fireflyCount");
        while (this.fireflies.length < want) this.fireflies.push(new Firefly(this));
        this.fireflies.length = want;
    }

    // Lay pads out in clumps that hug the edges and leave open water in the middle.
    plant() {
        this.pads = [];
        this.flowers = [];
        const U = this.unit;
        for (const r of this.screens) {
            const clumps = [];
            const corners = [[0.05, 0.1], [0.95, 0.88], [0.92, 0.1], [0.07, 0.9], [0.5, 0.0], [0.55, 1.0]];
            corners.sort(() => Math.random() - 0.5);
            let placed = 0;
            for (let i = 0; placed < this.options.padCount && i < 400; ++i) {
                const ci = Math.min(Math.floor(placed / 3), corners.length - 1);
                if (!clumps[ci]) clumps[ci] = { x: r.x + corners[ci][0] * r.width, y: r.y + corners[ci][1] * r.height };
                const radius = rand(46, 108) * U;
                const spread = (90 + i * 1.1) * U;
                const x = clumps[ci].x + rand(-1.5, 1.5) * spread, y = clumps[ci].y + rand(-1.2, 1.2) * spread;
                if (this.pads.some(p => hypot(p.x - x, p.y - y) < (p.radius + radius) * 0.97)) continue;
                this.pads.push(new Floater(x, y, radius, 1.5 + radius / (60 * U)));
                placed++;
            }
        }
        if (this.options.flowers) {
            const n = Math.ceil(this.pads.length / 3);
            const hosts = this.pads.slice().sort((a, b) => a.radius - b.radius).slice(0, n);
            for (const h of hosts) {
                const a = rand(0, TAU);
                const r = rand(36, 52) * U;
                const f = new Floater(h.x + Math.cos(a) * h.radius * 0.9, h.y + Math.sin(a) * h.radius * 0.9, r, 1.8);
                this.flowers.push(f);
            }
        }
    }

    // Screens changing size stretch the pond. One coming or going leaves the others as
    // they were.
    reshape(screens) {
        const was = { left: this.left, top: this.top, width: this.width, height: this.height, unit: this.unit };
        const same = screens.length === this.screens.length;
        this.frame(screens);
        const sx = same ? this.width / was.width : 1, sy = same ? this.height / was.height : 1;
        const ox = same ? 0 : was.left - this.left, oy = same ? 0 : was.top - this.top;
        const grow = this.unit / was.unit;
        const move = e => {
            e.x = e.x * sx + ox;
            e.y = e.y * sy + oy;
        };
        for (const list of [this.koi, this.fry, this.petals, this.pads, this.flowers, this.fireflies, this.pellets])
            for (const e of list) {
                move(e);
                if (e.homeX !== undefined) {
                    e.homeX = e.homeX * sx + ox;
                    e.homeY = e.homeY * sy + oy;
                    e.radius *= grow;
                }
            }
        for (const k of this.koi) {
            k.resize(this);
            k.chain.forEach(move);
        }
        if (!same) {
            // Fish whose screen has gone are the first to go, then wait just out of sight.
            const stray = e => { const r = this.screenAt(e.x, e.y); return e.x < r.x || e.x > r.x + r.width || e.y < r.y || e.y > r.y + r.height; };
            this.koi.sort((a, b) => stray(a) - stray(b));
            this.fry.sort((a, b) => stray(a) - stray(b));
            this.syncKoi();
            this.syncFry();
            this.syncPetals();
            this.syncFireflies();
            this.plant();
            for (const k of this.koi) this.bringHome(k, k.length * 0.2);
            for (const f of this.fry) this.bringHome(f, 20 * this.unit);
        }
        for (const k of this.koi) {
            k.follow();
            k.bent = NaN;
        }
    }

    bringHome(e, slack) {
        const r = this.screenAt(e.x, e.y);
        const ex = clamp(e.x, r.x - slack, r.x + r.width + slack) - e.x;
        const ey = clamp(e.y, r.y - slack, r.y + r.height + slack) - e.y;
        for (const p of [e].concat(e.chain ?? [])) {
            p.x += ex;
            p.y += ey;
        }
    }

    drop(x, y, radius, strength) {
        if (this.drops.length < MAX_DROPS)
            this.drops.push({ x, y, radius, strength });
    }

    moveCursor(x, y) {
        const c = this.cursor;
        if (!c.active) {
            c.active = true;
            c.px = x;
            c.py = y;
            c.vx = c.vy = c.speed = 0;
        }
        c.x = x;
        c.y = y;
    }

    leaveCursor() {
        this.cursor.active = false;
        this.cursor.still = 0;
    }

    tap(x, y) {
        const U = this.unit;
        this.drop(x, y, 17 * U, -0.85);
        this.rings.push({ x, y, radius: 0, power: 1 });
        if (this.options.clickFeeds) {
            const n = 3 + Math.floor(Math.random() * 3);
            for (let i = 0; i < n; ++i) this.feed(x, y);
        } else {
            // A splash with nothing to eat startles whoever is underneath.
            for (const k of this.koi) {
                const d = hypot(k.x - x, k.y - y);
                if (d < 220 * U) k.scare(Math.atan2(k.y - y, k.x - x), rand(0.5, 1));
            }
        }
        for (const f of this.fry)
            if (hypot(f.x - x, f.y - y) < 170 * U) {
                const a = Math.atan2(f.y - y, f.x - x);
                f.vx += Math.cos(a) * 260 * U;
                f.vy += Math.sin(a) * 260 * U;
                f.panic = 0.7;
            }
    }

    feed(x, y) {
        let p = this.pellets.find(e => !e.alive);
        if (!p) p = this.pellets.reduce((a, b) => a.age > b.age ? a : b);
        const a = rand(0, TAU), v = rand(8, 85) * this.unit;
        p.alive = true;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(a) * v;
        p.vy = Math.sin(a) * v;
        p.age = 0;
        p.depth = 0;
        p.opacity = 1;
    }

    eat(koi, p) {
        p.alive = false;
        p.opacity = 0;
        this.drop(p.x, p.y, 9 * this.unit, -0.34);
        koi.speed *= 0.6;
        koi.excite = 1;
    }

    step(dt) {
        const U = this.unit, c = this.cursor;

        if (c.active) {
            const vx = (c.x - c.px) / dt, vy = (c.y - c.py) / dt;
            const k = 1 - Math.exp(-dt * 16);
            c.vx += (vx - c.vx) * k;
            c.vy += (vy - c.vy) * k;
            c.speed = hypot(c.vx, c.vy);
            c.still = c.speed < 30 * U ? c.still + dt : 0;
            const moved = hypot(c.x - c.px, c.y - c.py);
            this.stir = moved > 0.5
                ? { ax: c.px, ay: c.py, bx: c.x, by: c.y, strength: clamp(c.speed / (900 * U), 0, 1) }
                : null;
            c.px = c.x;
            c.py = c.y;
        } else {
            this.stir = null;
            c.speed = 0;
        }

        for (const r of this.rings) r.radius += 120 * U * dt;
        this.rings = this.rings.filter(r => r.radius < 620 * U);

        this.foodLeft = false;
        for (const p of this.pellets) {
            if (!p.alive) continue;
            this.foodLeft = true;
            p.age += dt;
            const drag = Math.exp(-dt * 2.4);
            p.vx *= drag;
            p.vy *= drag;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            // Float for a while, soak, sink, dissolve.
            p.depth = smooth(9, 17, p.age) * 0.8;
            p.opacity = 1 - smooth(16, 20, p.age);
            if (p.age > 20) p.alive = false;
        }

        // A third of the fish take their turn at whatever need not happen every step.
        this.turn = (this.turn + 1) % 3;
        const coarse = Math.min(dt * 3, 0.1);
        for (let i = 0; i < this.koi.length; ++i) {
            const k = this.koi[i];
            if (this.inSight(k, k.length * 2)) k.step(this, dt);
            else if (i % 3 === this.turn) k.step(this, coarse);
        }

        // Each school tours the pond no faster than minnows can follow.
        const tour = Math.min(1, 1920 * U / this.width);
        for (const s of this.schools) {
            s.t += dt * 0.055 * this.options.speed * tour;
            const x = this.width * (0.5 + 0.38 * Math.sin(s.t * 1.7) * Math.cos(s.t * 0.6));
            const y = this.height * (0.5 + 0.34 * Math.sin(s.t * 2.3 + 1));
            const r = this.screenAt(x, y);
            s.x = clamp(x, r.x, r.x + r.width);
            s.y = clamp(y, r.y, r.y + r.height);
        }
        // Steering is the costly part of a minnow.
        for (let i = 0; i < this.fry.length; ++i) {
            const f = this.fry[i], turn = i % 3 === this.turn;
            if (turn) f.steer(this, this.schools[i % this.schools.length]);
            if (this.inSight(f, 80 * U)) f.step(this, dt);
            else if (turn) f.step(this, coarse);
        }

        for (const list of [this.pads, this.flowers, this.petals])
            for (const f of list) f.step(this, dt);
        this.spread();

        for (const f of this.fireflies) f.step(this, dt);

        if (this.options.rain > 0) {
            this.rainClock -= dt;
            while (this.rainClock < 0 && this.drops.length < MAX_DROPS - 4) {
                this.drop(Math.random() * this.width, Math.random() * this.height, rand(6, 10) * U, -rand(0.12, 0.4));
                this.rainClock += rand(0.3, 1.7) / (this.total("rain") * 34);
            }
            this.rainClock = Math.max(this.rainClock, -0.05);
        }
    }

    // Pads bump instead of stacking.
    spread() {
        const p = this.pads;
        for (let i = 0; i < p.length; ++i)
            for (let j = i + 1; j < p.length; ++j) {
                const a = p[i], b = p[j];
                const ex = b.x - a.x, ey = b.y - a.y;
                const d = hypot(ex, ey) + 1e-3;
                const overlap = (a.radius + b.radius) * 0.96 - d;
                if (overlap <= 0) continue;
                const t = a.mass + b.mass;
                a.x -= ex / d * overlap * b.mass / t * 0.5;
                a.y -= ey / d * overlap * b.mass / t * 0.5;
                b.x += ex / d * overlap * a.mass / t * 0.5;
                b.y += ey / d * overlap * a.mass / t * 0.5;
            }
    }

    // Hand this step's wave impulses to the caller.
    takeDrops() {
        const d = this.drops;
        this.drops = [];
        return d;
    }
}

// Light through the day, as keyframes by hour.
// light: rgb + brightness, sky: rgb + reflection, night: 0..1
const DAY = [
    { h: 0,    light: [0.58, 0.74, 1.00, 0.66], sky: [0.62, 0.76, 1.00, 0.62], caustic: 0.55, night: 1 },
    { h: 4.8,  light: [0.60, 0.74, 1.00, 0.66], sky: [0.62, 0.76, 1.00, 0.60], caustic: 0.52, night: 1 },
    { h: 6.3,  light: [1.00, 0.82, 0.78, 0.80], sky: [1.00, 0.72, 0.66, 0.62], caustic: 0.60, night: 0.2 },
    { h: 8.5,  light: [1.00, 0.96, 0.89, 1.00], sky: [1.00, 0.97, 0.92, 0.52], caustic: 0.95, night: 0 },
    { h: 12.5, light: [1.00, 1.00, 0.97, 1.08], sky: [0.95, 0.99, 1.00, 0.50], caustic: 1.10, night: 0 },
    { h: 16.5, light: [1.00, 0.96, 0.88, 1.02], sky: [1.00, 0.95, 0.85, 0.50], caustic: 1.00, night: 0 },
    { h: 18.3, light: [1.00, 0.78, 0.58, 0.86], sky: [1.00, 0.66, 0.42, 0.66], caustic: 0.75, night: 0.1 },
    { h: 19.6, light: [0.76, 0.68, 0.94, 0.70], sky: [0.80, 0.56, 0.80, 0.55], caustic: 0.42, night: 0.65 },
    { h: 21,   light: [0.58, 0.74, 1.00, 0.66], sky: [0.62, 0.76, 1.00, 0.62], caustic: 0.55, night: 1 },
    { h: 24,   light: [0.58, 0.74, 1.00, 0.66], sky: [0.62, 0.76, 1.00, 0.62], caustic: 0.55, night: 1 }
];

function lightAt(hour) {
    let i = 0;
    while (i < DAY.length - 2 && DAY[i + 1].h <= hour) ++i;
    const a = DAY[i], b = DAY[i + 1];
    const t = clamp((hour - a.h) / (b.h - a.h), 0, 1);
    const mix = (p, q) => p + (q - p) * t;
    return {
        light: a.light.map((v, n) => mix(v, b.light[n])),
        sky: a.sky.map((v, n) => mix(v, b.sky[n])),
        caustic: mix(a.caustic, b.caustic),
        night: mix(a.night, b.night)
    };
}

// Water palettes, in the order the settings page lists them.
const WATERS = [
    { water: [0.085, 0.31, 0.29, 0.52], deep: [0.015, 0.115, 0.135], sand: "#7d7a5c", stone: "#6d7468", moss: "#31502c" },  // jade
    { water: [0.075, 0.30, 0.42, 0.52], deep: [0.015, 0.11, 0.21], sand: "#86836e", stone: "#6c7680", moss: "#2d4f45" },  // lagoon
    { water: [0.045, 0.12, 0.15, 0.58], deep: [0.012, 0.04, 0.06], sand: "#4d4f4a", stone: "#4b5156", moss: "#223026" }, // ink
    { water: [0.26, 0.48, 0.44, 0.18], deep: [0.12, 0.30, 0.31], sand: "#b3a683", stone: "#8f8b7d", moss: "#58713d" },  // clear spring
    { water: [0.25, 0.27, 0.12, 0.50], deep: [0.11, 0.14, 0.05], sand: "#8d7d4f", stone: "#77705a", moss: "#4c5a24" }   // moss garden
];
