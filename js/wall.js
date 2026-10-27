/*
 * Light wall: a grid of LED-like tiles drawn on a canvas that sits above the
 * panes. Cells over an open pane are left transparent so the page underneath
 * shows through; every other cell is a light whose brightness and color come
 * from slowly drifting noise.
 *
 * Grid coordinates: column i and row j count 20px cells. Row 0, the last row,
 * and the first and last screen columns are the fixed frame. Columns are in
 * "world" space, which scrolls sideways with the camera when panes stack
 * wider than the screen. Band d (the pane at depth d) covers columns
 * [1 + d * paneCols, 1 + (d + 1) * paneCols) from bandTop to the bottom.
 */
(function () {
    'use strict';

    const BANDS = 3;
    const LUT_SIZE = 512;

    const CFG = {
        tile: 19,
        radius: 2,

        // Brightness is a fine noise field; color is a broad one that drifts
        // through the palette.
        lightScale: 0.1,
        lightDriftX: 0.055,
        lightDriftY: 0.03,
        lightEvolve: 0.09,
        colorScale: 0.045,
        colorDriftX: 0.035,
        colorDriftY: 0.02,
        colorEvolve: 0.05,
        hueDrift: 0.02,

        // The lights are water now: dim, so the fish read on top of it.
        waterFloor: 0.07,
        waterRange: 0.12,

        // One big school streaming left to right, like sardines in an
        // aquarium. Distances are in cells, times in seconds.
        cellsPerFish: 70,
        fishMin: 6,
        fishMax: 48,
        fishLen: [2.4, 6.5],
        fishSpeed: [1.2, 2.6],
        fishHue: 0,
        cellsPerGlint: 130,
        fleeR: 7,
        scareR: 12,
        startleReach: 40,

        // Pane waves sweep across columns; content switches sweep down rows.
        openDur: 0.95,
        flowCols: 3,
        glowCols: 3.4,
        switchDur: 1.1,
        switchHalf: 4,
        switchFlow: 2.4,

        cameraDur: 0.62,
        paletteDur: 0.65,
        splashDur: 1.4,
        splashJag: 6,
        splashSoft: 2.3,
    };

    // Farthest a wave front can wander from its center line, plus a cell.
    const LEAD = CFG.flowCols + 2.5;

    const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
    const smooth = (t) => {
        t = clamp01(t);
        return t * t * (3 - 2 * t);
    };
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    function hash3(x, y, z) {
        let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x61c88647);
        h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    function noise3(x, y, z) {
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        const fx = x - xi, fy = y - yi, fz = z - zi;
        const u = fx * fx * (3 - 2 * fx);
        const v = fy * fy * (3 - 2 * fy);
        const w = fz * fz * (3 - 2 * fz);
        const a = hash3(xi, yi, zi), b = hash3(xi + 1, yi, zi);
        const c = hash3(xi, yi + 1, zi), d = hash3(xi + 1, yi + 1, zi);
        const e = hash3(xi, yi, zi + 1), f = hash3(xi + 1, yi, zi + 1);
        const g = hash3(xi, yi + 1, zi + 1), h = hash3(xi + 1, yi + 1, zi + 1);
        const x0 = a + (b - a) * u, x1 = c + (d - c) * u;
        const x2 = e + (f - e) * u, x3 = g + (h - g) * u;
        const y0 = x0 + (x1 - x0) * v, y1 = x2 + (x3 - x2) * v;
        return y0 + (y1 - y0) * w;
    }

    function fbm(x, y, z) {
        return 0.62 * noise3(x, y, z) + 0.38 * noise3(x * 2.13 + 11.3, y * 2.13 + 7.9, z * 2.13 + 3.1);
    }

    function hexToRgb(hex) {
        const n = parseInt(hex.replace('#', ''), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    // A looping gradient through the palette, blended in linear-ish light so
    // the midpoints stay bright instead of going muddy.
    function fillLUT(out, hexes) {
        const stops = hexes.map(hexToRgb);
        const n = stops.length;
        for (let k = 0; k < LUT_SIZE; k++) {
            const s = (k / LUT_SIZE) * n;
            const i0 = Math.floor(s);
            const f = smooth(s - i0);
            const a = stops[i0 % n], b = stops[(i0 + 1) % n];
            for (let c = 0; c < 3; c++) {
                out[k * 3 + c] = Math.sqrt(a[c] * a[c] * (1 - f) + b[c] * b[c] * f);
            }
        }
    }

    function create(canvas, frameCanvas, hooks) {
        const ctx = canvas.getContext('2d');
        const frameCtx = frameCanvas.getContext('2d');
        const low = document.createElement('canvas');
        const lowCtx = low.getContext('2d');
        let lowImage = null;

        const css = getComputedStyle(document.documentElement);
        const bgHex = css.getPropertyValue('--bg').trim() || '#07110b';
        const lineHex = css.getPropertyValue('--line').trim() || '#11231a';
        const lineRGB = hexToRgb(lineHex);

        let g = null;
        let dpr = 1, cellD = 20, tileD = 19, gapD = 1, offXD = 0, offYD = 0;
        let open = new Uint8Array(0);
        let mask = null;

        const waves = new Map();
        const switches = Array.from({ length: BANDS }, () => []);

        let camX = 0, camFrom = 0, camTo = 0, camT = 1, camWait = 0;

        const lutFrom = new Float32Array(LUT_SIZE * 3);
        const lutTo = new Float32Array(LUT_SIZE * 3);
        const lut = new Float32Array(LUT_SIZE * 3);
        let lutT = 1;
        let seed = 0, seedTo = 0;
        let hueRate = 1, hueSpin = 0;

        let fieldT = Math.random() * 40;
        let realT = 0;
        let last = 0;
        let splash = null;
        const wake = [];
        const sparks = [];
        let dragging = false;
        let lastSparkKey = -1;

        const fish = [];
        const glints = [];
        const tank = { left: 1, right: 2, top: 1, bottom: 2, next: 0 };
        let ptr = null;

        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        let motion = motionQuery.matches ? 0 : 1;
        let dirty = true;
        let running = false;

        const onMotionChange = () => {
            motion = motionQuery.matches ? 0 : 1;
            dirty = true;
        };
        if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
        else motionQuery.addListener(onMotionChange);

        const bandLeft = (d) => 1 + d * g.pc;

        function bandOf(i) {
            if (i < 1) return -1;
            const d = Math.floor((i - 1) / g.pc);
            return d < BANDS ? d : -1;
        }

        function fillBand(d, value) {
            const L = bandLeft(d);
            for (let j = g.bandTop; j < g.rows - 1; j++) {
                const row = j * g.worldCols;
                open.fill(value, row + L, row + L + g.pc);
            }
        }

        /* ---------- layout ---------- */

        function layout(geom, state) {
            g = geom;
            // Keep every cell a whole number of device pixels so the tile
            // mask lines up with the scaled-up light image.
            const raw = Math.min(window.devicePixelRatio || 1, 2);
            dpr = Math.max(1, Math.round(raw * g.cell) / g.cell);
            cellD = g.cell * dpr;
            tileD = CFG.tile * dpr;
            gapD = cellD - tileD;
            offXD = Math.round(g.offX * dpr);
            offYD = Math.round(g.offY * dpr);

            const w = Math.round(g.vw * dpr), h = Math.round(g.vh * dpr);
            for (const c of [canvas, frameCanvas]) {
                if (c.width !== w) c.width = w;
                if (c.height !== h) c.height = h;
            }
            low.width = g.innerCols + 1;
            low.height = g.rows - 2;
            lowImage = lowCtx.createImageData(low.width, low.height);

            buildMask();
            drawFrame();

            open = new Uint8Array(g.worldCols * g.rows);
            waves.clear();
            switches.forEach((list) => { list.length = 0; });
            fillBand(0, 1);
            state.openDepths.forEach((d) => fillBand(d, 1));

            camX = camFrom = camTo = state.camX;
            camT = 1;
            hooks.onCamera(snapCamera());
            measureTank();
            seedSchool();
            dirty = true;
        }

        function buildMask() {
            const c = document.createElement('canvas');
            c.width = c.height = cellD;
            const m = c.getContext('2d');
            m.fillStyle = bgHex;
            m.fillRect(0, 0, cellD, cellD);
            m.globalCompositeOperation = 'destination-out';
            m.beginPath();
            if (m.roundRect) m.roundRect(0, 0, tileD, tileD, CFG.radius * dpr);
            else m.rect(0, 0, tileD, tileD);
            m.fill();
            mask = ctx.createPattern(c, 'repeat');
        }

        // The border ring of unlit tiles never moves, so it gets its own canvas.
        function drawFrame() {
            const f = frameCtx;
            f.setTransform(1, 0, 0, 1, 0, 0);
            f.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
            f.fillStyle = lineHex;
            f.beginPath();
            const tile = (i, j) => {
                const x = offXD + i * cellD, y = offYD + j * cellD;
                if (f.roundRect) f.roundRect(x, y, tileD, tileD, CFG.radius * dpr);
                else f.rect(x, y, tileD, tileD);
            };
            for (let i = 0; i < g.viewCols; i++) {
                tile(i, 0);
                tile(i, g.rows - 1);
            }
            for (let j = 1; j < g.rows - 1; j++) {
                tile(0, j);
                tile(g.viewCols - 1, j);
            }
            f.fill();
        }

        /* ---------- pane waves ---------- */

        // Several depths opened (or closed) together share one front, so a
        // two-pane close reads as a single sweep.
        function startWaves(depths, dir, animate, onDone) {
            if (!g || !depths.length) return;
            const edge = dir > 0
                ? bandLeft(Math.min(...depths)) - LEAD
                : bandLeft(Math.max(...depths)) + g.pc + LEAD;
            const shared = { seed: Math.random() * 40, phase: Math.random() * Math.PI * 2 };
            if (animate && motion && dir > 0) startle(edge);
            const instant = [];

            for (const d of depths) {
                const prev = waves.get(d);
                // Reversing mid-sweep picks up from the current front.
                const live = prev && !prev.done ? prev : null;
                const L = bandLeft(d), R = L + g.pc;
                const w = {
                    d, L, R, dir,
                    x: live ? live.x : edge,
                    seed: live ? live.seed : shared.seed,
                    phase: live ? live.phase : shared.phase,
                    age: live ? live.age : 0,
                    speed: (g.pc + 2 * LEAD) / CFG.openDur,
                    target: dir > 0 ? R + LEAD : L - LEAD,
                    done: false,
                    fade: 1,
                    front: new Float32Array(g.rows),
                    width: new Float32Array(g.rows),
                    onDone,
                };
                waves.set(d, w);
                if (!animate || !motion) instant.push(w);
                else computeFront(w);
            }
            instant.forEach((w) => {
                waves.delete(w.d);
                fillBand(w.d, dir > 0 ? 1 : 0);
            });
            instant.forEach((w) => w.onDone && w.onDone(w.d));
            dirty = true;
        }

        function computeFront(w) {
            const t = w.age, s = w.seed;
            const born = w.dir > 0 ? 0.55 + 0.45 * smooth(t / 0.25) : smooth(t / 0.5);
            for (let j = 1; j < g.rows - 1; j++) {
                w.front[j] = w.x + born * (
                    (fbm(j * 0.13 + s, t * 0.22, 73.4 + s) - 0.5) * 2 * CFG.flowCols +
                    Math.sin(j * 0.21 + t * 1.35 + w.phase) +
                    Math.sin(j * 0.47 - t * 0.8 + s * 0.37) * 0.42
                );
                w.width[j] = Math.max(1.4,
                    CFG.glowCols +
                    (fbm(j * 0.15 + s * 0.4, t * 0.18, 146.2 + s) - 0.5) * 2.8 +
                    Math.sin(j * 0.28 - t * 1.1 + w.phase) * 0.5
                );
            }
        }

        // Cells are sticky: an opening wave only opens, a closing wave only
        // closes, so the ragged front never flickers behind itself.
        function stampWave(w) {
            const W = g.worldCols;
            for (let j = g.bandTop; j < g.rows - 1; j++) {
                const f = w.front[j] - 0.5;
                const row = j * W;
                if (w.dir > 0) {
                    const end = Math.min(w.R, Math.ceil(f));
                    for (let i = w.L; i < end; i++) open[row + i] = 1;
                } else {
                    for (let i = Math.max(w.L, Math.floor(f) + 1); i < w.R; i++) open[row + i] = 0;
                }
            }
        }

        function updateWaves(dt) {
            const finished = [];
            for (const [d, w] of waves) {
                w.age += dt;
                if (!w.done) {
                    w.x += w.dir * w.speed * dt;
                    if (w.dir > 0 ? w.x >= w.target : w.x <= w.target) {
                        w.x = w.target;
                        w.done = true;
                        fillBand(d, w.dir > 0 ? 1 : 0);
                        finished.push(w);
                    }
                } else if (w.dir > 0) {
                    // An opened pane's wave keeps rolling out across the lights.
                    w.x += w.speed * dt;
                    w.fade = Math.exp(-(w.x - w.target) / 10);
                } else {
                    w.fade -= dt / 0.45;
                }
                if (w.done && w.fade < 0.02) {
                    waves.delete(d);
                    continue;
                }
                computeFront(w);
                if (!w.done) stampWave(w);
            }
            finished.forEach((w) => w.onDone && w.onDone(w.d));
        }

        /* ---------- content switches ---------- */

        function startSwitch(d, animate) {
            if (!g) return;
            if (!animate || !motion) {
                hooks.onSwitchDone(d);
                return;
            }
            const rows = g.rows - 1 - g.bandTop;
            const pad = CFG.switchHalf + CFG.switchFlow + 2;
            const s = {
                c: g.bandTop - pad,
                end: g.rows - 1 + pad,
                speed: (rows + 2 * pad) / CFG.switchDur,
                seed: Math.random() * 40,
                phase: Math.random() * Math.PI * 2,
                age: 0,
                center: new Float32Array(g.pc),
                tops: new Int16Array(g.pc),
                bots: new Int16Array(g.pc),
            };
            computeSwitch(s);
            switches[d].push(s);
            hooks.onSwitchFrame(d, switches[d]);
            dirty = true;
        }

        function computeSwitch(s) {
            const t = s.age, h = CFG.switchHalf;
            const rows = g.rows - 1 - g.bandTop;
            for (let k = 0; k < g.pc; k++) {
                const c = s.c +
                    (fbm(k * 0.13 + s.seed, t * 0.22, 91.7 + s.seed) - 0.5) * 2 * CFG.switchFlow +
                    Math.sin(k * 0.23 + t * 1.3 + s.phase) * 0.9;
                s.center[k] = c;
                s.tops[k] = Math.max(0, Math.min(rows, Math.floor(c - h) - g.bandTop));
                s.bots[k] = Math.max(0, Math.min(rows, Math.ceil(c + h) - g.bandTop));
            }
        }

        function updateSwitches(dt) {
            for (let d = 0; d < BANDS; d++) {
                const list = switches[d];
                if (!list.length) continue;
                for (const s of list) {
                    s.age += dt;
                    s.c += s.speed * dt;
                    computeSwitch(s);
                }
                let done = 0;
                while (list.length && list[0].c >= list[0].end) {
                    list.shift();
                    done++;
                }
                for (let n = 0; n < done; n++) hooks.onSwitchDone(d);
                if (list.length) hooks.onSwitchFrame(d, list);
            }
        }

        function cancelSwitches(d) {
            switches[d].length = 0;
            dirty = true;
        }

        /* ---------- camera ---------- */

        function snapCamera() {
            return Math.round(camX * dpr) / dpr;
        }

        // `wait` holds the pan back for a moment so a sweep has time to show
        // before the panes slide. On a narrow screen the pane being closed is
        // the one that slides away, which otherwise hides the sweep entirely.
        function setCamera(x, animate, wait) {
            if (x === camTo) return;
            camFrom = camX;
            camTo = x;
            camT = animate && motion ? 0 : 1;
            camWait = camT < 1 ? wait || 0 : 0;
            if (camT >= 1) {
                camX = x;
                hooks.onCamera(snapCamera());
            }
            dirty = true;
        }

        function updateCamera(dt) {
            if (camT >= 1) return;
            if (camWait > 0) {
                camWait -= dt;
                return;
            }
            camT = Math.min(1, camT + dt / CFG.cameraDur);
            camX = camFrom + (camTo - camFrom) * easeInOut(camT);
            hooks.onCamera(snapCamera());
        }

        /* ---------- palette ---------- */

        function setPalette(hexes, nextSeed, instant) {
            const k = smooth(lutT);
            for (let n = 0; n < lut.length; n++) lutFrom[n] += (lutTo[n] - lutFrom[n]) * k;
            fillLUT(lutTo, hexes);
            seedTo = nextSeed || 0;
            if (instant || !motion) {
                lutT = 1;
                lutFrom.set(lutTo);
                lut.set(lutTo);
                seed = seedTo;
            } else {
                lutT = 0;
            }
            dirty = true;
        }

        function updatePalette(dt) {
            if (lutT < 1) {
                lutT = Math.min(1, lutT + dt / CFG.paletteDur);
                const k = smooth(lutT);
                for (let n = 0; n < lut.length; n++) lut[n] = lutFrom[n] + (lutTo[n] - lutFrom[n]) * k;
            }
            // Each palette also nudges the noise field, so the pattern
            // morphs along with the colors.
            const step = 1.8 * dt;
            const delta = seedTo - seed;
            seed = Math.abs(delta) <= step ? seedTo : seed + Math.sign(delta) * step;
        }

        /* ---------- school ---------- */

        const rand = (a, b) => a + Math.random() * (b - a);

        // The tank spans the whole screen side to side: the panes sit in
        // front of it like panels, and the fish swim on behind them. Top to
        // bottom it follows the lit area, which on a phone is the strip
        // above the page.
        function measureTank() {
            const W = g.worldCols;
            const c0 = 1 + Math.floor(camTo / g.cell);
            let n = 0, top = Infinity, bottom = -Infinity;
            for (let j = 1; j < g.rows - 1; j++) {
                for (let i = c0; i < c0 + g.innerCols; i++) {
                    if (i < W && open[j * W + i]) continue;
                    n++;
                    if (j < top) top = j;
                    if (j > bottom) bottom = j;
                }
            }
            tank.left = c0;
            tank.right = c0 + g.innerCols;
            if (n < 12) return;
            tank.top = top;
            tank.bottom = bottom + 1;
        }

        // Depth runs from 0 (far: small, faint, slow) to 1 (near). Most of
        // the school is a little farther away, like looking into a big tank.
        function makeFish(x) {
            const d = Math.pow(Math.random(), 1.3);
            const [l0, l1] = CFG.fishLen, [s0, s1] = CFG.fishSpeed;
            return {
                x,
                y: rand(tank.top, tank.bottom),
                d,
                len: (l0 + (l1 - l0) * d) * rand(0.9, 1.1),
                speed: s0 + (s1 - s0) * d + rand(-0.15, 0.15),
                vy: 0, kx: 0, ky: 0, boost: 0, ang: 0,
                phase: Math.random() * Math.PI * 2,
                hue: rand(-0.05, 0.05),
            };
        }

        function makeGlint(y) {
            return { x: rand(tank.left, tank.right), y, rise: rand(0.3, 0.9), rate: rand(1.5, 4), t: Math.random() * 10 };
        }

        function seedSchool() {
            const area = (tank.right - tank.left) * (tank.bottom - tank.top);
            const want = Math.round(Math.min(CFG.fishMax, Math.max(CFG.fishMin, area / CFG.cellsPerFish)));
            fish.length = 0;
            for (let n = 0; n < want; n++) fish.push(makeFish(rand(tank.left - 4, tank.right + 2)));
            fish.sort((a, b) => a.d - b.d);
            glints.length = 0;
            for (let n = Math.round(area / CFG.cellsPerGlint); n > 0; n--) glints.push(makeGlint(rand(tank.top, tank.bottom)));
        }

        // Push every fish near (i, j) away from it. `dart` is how much it
        // speeds up, so a fright reads as fleeing, not jitter.
        function frighten(i, j, reach, kick, dart) {
            for (const f of fish) {
                const dx = f.x - i, dy = f.y - j;
                const d = Math.hypot(dx, dy) || 0.01;
                if (d > reach) continue;
                const k = 1 - d / reach;
                f.kx += (dx / d) * kick * k;
                f.ky += (dy / d) * kick * k + rand(-1, 1) * kick * 0.3 * k;
                f.boost = Math.max(f.boost, dart * k);
            }
        }

        // A pane opening sweeps a wall of light across the tank; the fish in
        // its path dart ahead of it. Ones already behind it stay put.
        function startle(edge) {
            for (const f of fish) {
                const ahead = f.x - edge;
                if (ahead < -2) continue;
                const k = Math.exp(-Math.max(0, ahead) / CFG.startleReach);
                f.boost = Math.max(f.boost, 2.4 * k);
                f.kx += rand(3, 7) * k;
                f.ky += rand(-1, 1) * 5 * k;
            }
        }

        function updateSchool(dt) {
            tank.next -= dt;
            if (tank.next <= 0) {
                tank.next = 0.25;
                measureTank();
            }
            if (ptr && realT - ptr.t < 0.3) frighten(ptr.i, ptr.j, CFG.fleeR, 60 * dt, 0.8);

            const fade = Math.exp(-dt * 1.6);
            for (const f of fish) {
                // A shared current bends the whole school the same way, so
                // neighbours swim together.
                let want = (noise3(f.x * 0.05 - realT * 0.1, f.y * 0.07, realT * 0.05) - 0.5) * 1.4;
                const edge = 0.5 + f.len * 0.2;
                if (f.y < tank.top + edge) want += (tank.top + edge - f.y) * 1.5;
                if (f.y > tank.bottom - edge) want -= (f.y - tank.bottom + edge) * 1.5;
                f.vy += (want - f.vy) * Math.min(1, dt * 1.5);

                const vx = f.speed * (1 + f.boost) + f.kx, vy = f.vy + f.ky;
                f.x += vx * dt;
                f.y += vy * dt;
                f.kx *= fade;
                f.ky *= fade;
                f.boost *= Math.exp(-dt * 0.8);

                // The body points where it's going, but never steeply.
                const ang = Math.max(-0.7, Math.min(0.7, Math.atan2(vy, Math.max(0.1, vx))));
                f.ang += (ang - f.ang) * Math.min(1, dt * 5);
                f.phase += dt * (3 + vx * 1.2);

                // Off the right edge (or left far behind when the camera
                // pans): back in from the left, somewhere new.
                if (f.x - f.len * 0.6 > tank.right + 1 || f.x + f.len < tank.left - 12) {
                    f.x = tank.left - f.len * 0.6 - rand(0, 8);
                    f.y = rand(tank.top, tank.bottom);
                    f.vy = f.kx = f.ky = f.boost = 0;
                    f.hue = rand(-0.05, 0.05);
                }
            }

            for (const gl of glints) {
                gl.t += dt;
                gl.y -= gl.rise * dt;
                gl.x += 0.5 * dt;
                if (gl.y < tank.top - 1) Object.assign(gl, makeGlint(tank.bottom + 1));
            }
        }

        function lutColor(hue) {
            let h = hue + hueSpin;
            h -= Math.floor(h);
            const o = ((h * LUT_SIZE) | 0) * 3;
            return [lut[o], lut[o + 1], lut[o + 2]];
        }

        const bgRGB = hexToRgb(bgHex);
        const WHITE = [255, 255, 255];
        const mixRGB = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
        const rgbCss = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

        // Fish are drawn as solid pixels on a grid of half-tile cells. Each
        // cell is sampled at four points so the edges come out by coverage.
        const SUB = [-0.25, -0.25, 0.25, -0.25, -0.25, 0.25, 0.25, 0.25];

        // Fish shape in body lengths, nose along +X: a slim sardine with a
        // spine that bends in a wave growing toward the tail, a forked tail
        // that swings widest, a dorsal fin, a pectoral fin and a big eye.
        const fishSway = (u, ph) => Math.sin(ph - u * 3.2) * 0.07 * u * u;
        const fishWidth = (u) => 0.03 + 0.125 * Math.sin(Math.PI * Math.pow(Math.min(Math.max(u, 0), 0.999), 0.62));
        const BODY = 1, TAIL = 2, FIN = 3, PEC = 4, EYE = 5;
        const hit = { kind: 0, u: 0, v: 0 };

        function sampleFish(X, Y, ph, eyeR) {
            hit.kind = 0;
            const u = (0.5 - X) / 0.76;
            const eu = 0.12, ex = 0.5 - eu * 0.76, ey = fishSway(eu, ph) - fishWidth(eu) * 0.2;
            if ((X - ex) * (X - ex) + (Y - ey) * (Y - ey) < eyeR * eyeR) {
                hit.kind = EYE;
                return hit;
            }
            if (u >= -0.04 && u <= 1) {
                const c = fishSway(u, ph), w = fishWidth(u) * (u < 0 ? Math.sqrt(1 - (u / 0.04) ** 2) : 1);
                if (Math.abs(Y - c) < w) {
                    hit.kind = BODY;
                    hit.u = u;
                    hit.v = (Y - c) / w;
                    return hit;
                }
                if (u > 0.25 && u < 0.55) {
                    const top = c - fishWidth(u), k = (u - 0.25) / 0.3;
                    if (Y < top && Y > top - 0.1 * Math.sin(Math.PI * Math.pow(k, 0.6))) {
                        hit.kind = FIN;
                        return hit;
                    }
                }
                const px = X - (0.5 - 0.24 * 0.76), py = Y - (fishSway(0.24, ph) + fishWidth(0.24) * 0.6);
                const pa = 0.55 + Math.sin(ph * 1.3) * 0.25, ca = Math.cos(pa), sa = Math.sin(pa);
                const qx = px * ca + py * sa, qy = -px * sa + py * ca;
                if ((qx / 0.08) ** 2 + (qy / 0.028) ** 2 < 1) {
                    hit.kind = PEC;
                    return hit;
                }
            }
            if (X < -0.26 && X >= -0.5) {
                const t = (-0.26 - X) / 0.24, c = fishSway(1, ph) * (1 + 0.9 * t);
                const half = 0.025 + 0.15 * Math.pow(t, 0.9), d = Math.abs(Y - c);
                if (d < half && !(t > 0.6 && d < 0.11 * (t - 0.6) / 0.4)) {
                    hit.kind = TAIL;
                    return hit;
                }
            }
            return hit;
        }

        // Fish never show over a pane, and on load they appear only once
        // the lights have come on under them.
        function showsFish(i, j, splashR) {
            if (j < 1 || j >= g.rows - 1 || i < 1) return false;
            if (i < g.worldCols && open[j * g.worldCols + i]) return false;
            if (!splash) return true;
            const dx = i - splash.cx, dy = j - splash.cy;
            const edge = splashR - Math.sqrt(dx * dx + dy * dy) + (fbm(i * 0.3, j * 0.3, 5.7) - 0.5) * CFG.splashJag;
            return edge > CFG.splashSoft * 0.6;
        }

        function drawSchool(camD) {
            const gD = cellD / 2, gap = Math.max(1, Math.round(dpr * 0.75)), t = gD - gap;
            const g0 = Math.floor((camD - offXD) / gD) - 1;
            const g1 = g0 + Math.ceil(canvas.width / gD) + 2;
            const base = lutColor(CFG.fishHue);
            const water = mixRGB(bgRGB, base, 0.12);
            const splashR = splash ? smooth(splash.t / CFG.splashDur) * splash.maxR : 0;

            for (let n = 0; n < fish.length; n++) {
                const f = fish[n];
                const L = f.len, ca = Math.cos(f.ang), sa = Math.sin(f.ang);
                const ex = Math.abs(ca) * 0.56 * L + Math.abs(sa) * 0.36 * L;
                const ey = Math.abs(sa) * 0.56 * L + Math.abs(ca) * 0.36 * L;
                const gx0 = Math.max(g0, Math.floor((f.x - ex) * 2)), gx1 = Math.min(g1, Math.ceil((f.x + ex) * 2));
                const gy0 = Math.floor((f.y - ey) * 2), gy1 = Math.ceil((f.y + ey) * 2);
                if (gx0 > gx1) continue;
                const ph = f.phase, eyeR = L > 3 ? 0.26 / L : 0;
                const c = lutColor(CFG.fishHue + f.hue);
                // Far fish sink back into the water colour.
                const haze = 0.3 + 0.7 * f.d;
                const back = mixRGB(bgRGB, c, 0.5), belly = mixRGB(c, WHITE, 0.72);

                for (let gy = gy0; gy <= gy1; gy++) {
                    for (let gx = gx0; gx <= gx1; gx++) {
                        const wx = (gx + 0.5) / 2 - f.x, wy = (gy + 0.5) / 2 - f.y;
                        const X = (wx * ca + wy * sa) / L, Y = (-wx * sa + wy * ca) / L;
                        if (X > 0.56 || X < -0.52 || Y > 0.32 || Y < -0.32) continue;
                        let inside = 0;
                        for (let k = 0; k < 8; k += 2) {
                            const sx = wx + SUB[k] / 2, sy = wy + SUB[k + 1] / 2;
                            if (sampleFish((sx * ca + sy * sa) / L, (-sx * sa + sy * ca) / L, ph, eyeR).kind) inside++;
                        }
                        const h = sampleFish(X, Y, ph, eyeR);
                        if (!h.kind && inside < 2) continue;
                        if (!showsFish(Math.floor(gx / 2), Math.floor(gy / 2), splashR)) continue;

                        let tile;
                        if (h.kind === EYE) {
                            tile = mixRGB(bgRGB, c, 0.1);
                        } else if (h.kind === BODY && inside === 4) {
                            // Dark back, silver belly, and a bright stripe
                            // just below the middle of the flank.
                            const down = (h.v + 1) / 2;
                            const sheen = 0.3 * Math.exp(-(((h.v - 0.1) / 0.3) ** 2));
                            tile = mixRGB(mixRGB(back, belly, Math.pow(down, 1.2)), WHITE, sheen);
                        } else if (h.kind === TAIL || h.kind === FIN) {
                            tile = mixRGB(bgRGB, back, 0.45 + 0.1 * inside);
                        } else if (h.kind === PEC) {
                            tile = mixRGB(back, belly, 0.5);
                        } else {
                            // Edge of the body: a dimmer tile, by how much of
                            // the cell the fish covers.
                            const u = Math.max(0, Math.min(1, (0.5 - X) / 0.76));
                            const down = (Math.max(-1, Math.min(1, (Y - fishSway(u, ph)) / fishWidth(u))) + 1) / 2;
                            tile = mixRGB(bgRGB, mixRGB(back, belly, down), 0.3 + 0.12 * inside);
                        }
                        ctx.fillStyle = rgbCss(mixRGB(water, tile, haze));
                        ctx.fillRect(offXD + gx * gD - camD, offYD + gy * gD, t, t);
                    }
                }
            }

            // Glitter drifting up through the school: small twinkling dots.
            const spark = rgbCss(mixRGB(base, WHITE, 0.7));
            ctx.fillStyle = spark;
            for (const gl of glints) {
                const tw = 0.5 + 0.5 * Math.sin(gl.t * gl.rate);
                if (tw < 0.35) continue;
                const gx = Math.floor(gl.x * 2), gy = Math.floor(gl.y * 2);
                if (gx < g0 || gx > g1 || !showsFish(Math.floor(gx / 2), Math.floor(gy / 2), splashR)) continue;
                const r = Math.max(dpr, Math.round(t * (0.15 + 0.2 * tw)));
                ctx.globalAlpha = tw;
                ctx.fillRect(offXD + gx * gD - camD + (t - r) / 2, offYD + gy * gD + (t - r) / 2, r, r);
            }
            ctx.globalAlpha = 1;
        }

        /* ---------- pointer ---------- */

        function isLit(i, j) {
            if (j < 1 || j >= g.rows - 1 || i < 1 || i >= g.worldCols) return false;
            if (!open[j * g.worldCols + i]) return true;
            const d = bandOf(i);
            if (d < 0 || j < g.bandTop) return false;
            const k = i - bandLeft(d), r = j - g.bandTop;
            return switches[d].some((s) => r >= s.tops[k] && r < s.bots[k]);
        }

        function pointer(x, y, kind) {
            if (kind === 'up') {
                dragging = false;
                return;
            }
            if (kind === 'down') dragging = true;
            if (!g || !motion) return;
            const col = Math.floor((x - g.offX) / g.cell);
            if (col < 1 || col > g.viewCols - 2) return;
            const i = (x - g.offX + camX) / g.cell;
            const j = (y - g.offY) / g.cell;
            if (!isLit(Math.floor(i), Math.floor(j))) return;

            ptr = { i, j, t: realT };
            if (kind === 'down') frighten(i, j, CFG.scareR, 14, 1.8);

            const strong = kind === 'down' || dragging;
            const prev = wake[wake.length - 1];
            if (kind === 'down' || !prev || Math.hypot(i - prev.i, j - prev.j) > 0.6) {
                wake.push({ i, j, t: realT });
                if (wake.length > 28) wake.shift();
            }
            const key = Math.floor(i * 2) + Math.floor(j * 2) * 8192;
            if (kind === 'down' || key !== lastSparkKey) {
                lastSparkKey = key;
                sparks.push({ i, j, t: 0, r: strong ? 12 : 6.5, a: strong ? 0.85 : 0.38 });
                if (sparks.length > 60) sparks.shift();
            }
        }

        /* ---------- drawing ---------- */

        function render() {
            const W = g.worldCols;
            const camD = Math.round(camX * dpr);
            const c0 = 1 + Math.floor(camD / cellD);
            const nx = low.width, ny = low.height;
            const data = lowImage.data;
            const t = fieldT;
            const waveList = Array.from(waves.values());
            const splashR = splash ? smooth(splash.t / CFG.splashDur) * splash.maxR : 0;
            const liveWake = wake.length > 0;
            const liveSparks = sparks.length > 0;
            const half = CFG.switchHalf;

            for (let y = 0; y < ny; y++) {
                const j = y + 1;
                const inBandRows = j >= g.bandTop;
                for (let x = 0; x < nx; x++) {
                    const i = c0 + x;
                    const p = (y * nx + x) * 4;
                    const isOpen = i < W && open[j * W + i] === 1;
                    let glow = 0;
                    let crest = 0;
                    let cover = false;

                    if (inBandRows) {
                        const d = bandOf(i);
                        if (d >= 0 && switches[d].length) {
                            const k = i - bandLeft(d), r = j - g.bandTop;
                            for (const s of switches[d]) {
                                if (r < s.tops[k] || r >= s.bots[k]) continue;
                                cover = true;
                                const c = s.center[k] - g.bandTop;
                                const edge = Math.min(r + 0.5 - (c - half), c + half - (r + 0.5));
                                glow = Math.max(glow, 0.75 * Math.exp(-(edge * edge) / 1.6));
                            }
                        }
                    }

                    for (let n = 0; n < waveList.length; n++) {
                        const w = waveList[n];
                        const e = i + 0.5 - w.front[j];
                        if (e > 9 || e < -3) continue;
                        if (e >= 0) {
                            const ww = w.width[j];
                            glow = Math.max(glow, w.fade * Math.exp(-(e * e) / (ww * ww)));
                        } else {
                            const q = w.fade * Math.exp(-(e * e) / 0.55);
                            glow = Math.max(glow, q);
                            if (i >= w.L && i < w.R && inBandRows) crest = Math.max(crest, q);
                        }
                    }

                    if (isOpen && !cover) {
                        // A passing front briefly crests over the page.
                        if (crest < 0.15) {
                            data[p + 3] = 0;
                            continue;
                        }
                        glow = crest;
                    }

                    let b = fbm(
                        i * CFG.lightScale + t * CFG.lightDriftX,
                        j * CFG.lightScale + t * CFG.lightDriftY,
                        t * CFG.lightEvolve + 47.1 + seed
                    );
                    b = CFG.waterFloor + CFG.waterRange * clamp01((b - 0.22) / 0.56);
                    let s = fbm(
                        i * CFG.colorScale + t * CFG.colorDriftX,
                        j * CFG.colorScale + t * CFG.colorDriftY,
                        t * CFG.colorEvolve
                    ) * 1.3 + hueSpin;


                    if (liveWake) {
                        let wg = 0;
                        for (let n = 0; n < wake.length; n++) {
                            const wp = wake[n];
                            const age = realT - wp.t - 0.06;
                            if (age < 0) continue;
                            const life = 1 - age / 0.5;
                            if (life <= 0) continue;
                            const dx = i + 0.5 - wp.i, dy = j + 0.5 - wp.j;
                            if (dx > 8 || dx < -8 || dy > 8 || dy < -8) continue;
                            const d2 = dx * dx + dy * dy;
                            const spread = 0.45 + age * 2.2;
                            const ring = Math.sqrt(d2) - age * 6.5;
                            wg += life * life * (
                                0.22 * Math.exp(-d2 / (spread * spread * 0.3)) +
                                0.28 * Math.exp(-(ring * ring) / 0.7)
                            );
                        }
                        b += wg;
                        s += wg * 0.09;
                    }

                    if (liveSparks) {
                        for (let n = 0; n < sparks.length; n++) {
                            const sp = sparks[n];
                            const dx = i - sp.i, dy = j - sp.j;
                            if (dx > 8 || dx < -8 || dy > 8 || dy < -8) continue;
                            const sg = Math.exp(-(dx * dx + dy * dy) / sp.r) * Math.exp(-sp.t / 0.55) * sp.a;
                            b += sg;
                            s += sg * 0.1;
                        }
                    }

                    if (splash) {
                        const dx = i - splash.cx, dy = j - splash.cy;
                        const edge = splashR - Math.sqrt(dx * dx + dy * dy) +
                            (fbm(i * 0.3, j * 0.3, 5.7) - 0.5) * CFG.splashJag;
                        const lit = smooth(edge / CFG.splashSoft);
                        // The lights come up bright behind the ring, then
                        // settle down to water.
                        const settle = 1 - smooth((splash.t - CFG.splashDur * 0.5) / (CFG.splashDur * 0.5 + 0.4));
                        b = b * lit + Math.exp(-(edge * edge) / 5) * 0.8 +
                            lit * 0.55 * Math.exp(-Math.max(0, edge) / 6) * settle;
                    }

                    b += glow * 1.1;

                    s -= Math.floor(s);
                    const o = ((s * LUT_SIZE) | 0) * 3;
                    let r = lut[o], gr = lut[o + 1], bl = lut[o + 2];
                    if (b <= 1) {
                        r *= b;
                        gr *= b;
                        bl *= b;
                    } else {
                        // Past full brightness, push toward white-hot.
                        const hot = Math.min(1, (b - 1) * 0.9);
                        r += (255 - r) * hot;
                        gr += (255 - gr) * hot;
                        bl += (255 - bl) * hot;
                    }
                    // An LED that's off still shows as a dim tile.
                    data[p] = r > lineRGB[0] ? r : lineRGB[0];
                    data[p + 1] = gr > lineRGB[1] ? gr : lineRGB[1];
                    data[p + 2] = bl > lineRGB[2] ? bl : lineRGB[2];
                    data[p + 3] = 255;
                }
            }

            lowCtx.putImageData(lowImage, 0, 0);

            const ix = offXD + cellD, iy = offYD + cellD;
            const iw = g.innerCols * cellD - gapD, ih = (g.rows - 2) * cellD - gapD;
            const dx = offXD + c0 * cellD - camD;

            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.beginPath();
            ctx.rect(ix, iy, iw, ih);
            ctx.clip();
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(low, dx, iy, nx * cellD, ny * cellD);
            // Cut the gaps between tiles, but only where a light was drawn.
            ctx.globalCompositeOperation = 'source-atop';
            mask.setTransform(new DOMMatrix([1, 0, 0, 1, dx, iy]));
            ctx.fillStyle = mask;
            ctx.fillRect(ix, iy, iw, ih);
            // Fish only land on lit tiles, so they pass behind the panes.
            drawSchool(camD);
            ctx.restore();
        }

        function frame(now) {
            requestAnimationFrame(frame);
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            realT += dt;
            if (motion) {
                fieldT += dt;
                hueSpin += dt * CFG.hueDrift * hueRate;
            }

            updateCamera(dt);
            updateWaves(dt);
            updateSwitches(dt);
            updatePalette(dt);
            if (motion && g) updateSchool(dt);

            if (splash) {
                splash.t += dt;
                if (splash.t > CFG.splashDur + 0.4) splash = null;
            }
            for (let k = sparks.length - 1; k >= 0; k--) {
                sparks[k].t += dt;
                if (sparks[k].t > 1.5) sparks.splice(k, 1);
            }
            while (wake.length && realT - wake[0].t > 0.6) wake.shift();

            const busy = motion || waves.size || camT < 1 || lutT < 1 || switches.some((l) => l.length);
            if (!busy && !dirty) return;
            dirty = false;
            render();
        }

        // Lights come on from the middle of whatever lit area is on screen.
        function start() {
            if (running || !g) return;
            running = true;
            if (motion) {
                const c0 = 1 + Math.floor(camX / g.cell);
                let sx = 0, sy = 0, n = 0;
                for (let j = 1; j < g.rows - 1; j++) {
                    for (let i = c0; i < c0 + g.innerCols; i++) {
                        if (open[j * g.worldCols + i]) continue;
                        sx += i;
                        sy += j;
                        n++;
                    }
                }
                if (n) {
                    const cx = sx / n, cy = sy / n;
                    let maxR = 0;
                    for (let j = 1; j < g.rows - 1; j++) {
                        for (let i = c0; i < c0 + g.innerCols; i++) {
                            if (!open[j * g.worldCols + i]) maxR = Math.max(maxR, Math.hypot(i - cx, j - cy));
                        }
                    }
                    splash = { t: 0, cx, cy, maxR: maxR + CFG.splashJag + CFG.splashSoft };
                }
            }
            last = performance.now();
            requestAnimationFrame(frame);
        }

        return {
            layout,
            start,
            openBands: (depths, animate, onDone) => startWaves(depths, 1, animate, onDone),
            closeBands: (depths, animate, onDone) => startWaves(depths, -1, animate, onDone),
            startSwitch,
            cancelSwitches,
            setCamera,
            setPalette,
            setHueRate: (rate) => { hueRate = rate; },
            pointer,
        };
    }

    window.LightWall = { create };
})();
