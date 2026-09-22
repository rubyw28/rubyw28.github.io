/*
 * Page shell: fits the panes to the light wall's grid, routes between pages,
 * and tells the wall when panes open, close, or change.
 *
 * Content lives in index.html. The home page sits in the first pane; every
 * other page waits in #library until it's opened into pane 1 or 2.
 */
(function () {
    'use strict';

    const CELL = 20;
    const GAP = 1;
    const MAX_DEPTH = 2;
    const PANE_COLS = 17;

    // Light wall colors per page (data-palette) or hover block
    // (data-hover-palette). Keep every stop saturated: pale stops go grey when a
    // tile dims, and dark stops read as dead LEDs.
    const PALETTES = {
        home: ['#0f9d58', '#18c26b', '#34d17f', '#5ee89a', '#b5f23d', '#1fc7b6', '#12b886', '#7ef0b4', '#22c55e', '#0ea968'],
        about: ['#ff8a65', '#ffab70', '#ffc56e', '#7ee8a2', '#4fd1a5', '#ff7a90'],
        experience: ['#ff9900', '#ffb13b', '#3d8bfd', '#5aa9ff', '#ff7a00', '#8cc4ff'],
        aws: ['#ff9900', '#ffad1f', '#ffc247', '#f08000', '#ffb84d', '#ff8a00'],
        jpl: ['#1f6feb', '#3d8bfd', '#5aa9ff', '#8cc4ff', '#2155c4', '#fc3d21'],
        projects: ['#11a150', '#1fbf62', '#3ad67a', '#d4a82a', '#f0c83c', '#e6b422'],
        golf: ['#2fa84f', '#4cc05f', '#6fd36a', '#9be070', '#e8d27a', '#f7fff0'],
        flipper: ['#ff8200', '#ff9a1f', '#ffb040', '#ff6a00', '#ffc36b', '#ff8f2e'],
        airdropV4: ['#0f9d4a', '#17b95a', '#2fd36f', '#d4a82a', '#f0c83c', '#1aa653'],
        drawingCar: ['#ef4056', '#ffb000', '#1fbfa6', '#3d8bfd', '#ff7a1a', '#ffd23f'],
        airdropSensor: ['#7c3aed', '#9155f7', '#a878ff', '#c49bff', '#d4a82a', '#8b45f0'],
        birdsong: ['#4cc3ff', '#7fd4ff', '#ffd60a', '#ff5a5f', '#ffb347', '#38b6ff'],
        dora: ['#ff2d2d', '#ff4d4d', '#ff6b6b', '#ff3b1f', '#ff8080', '#e81c3a'],
        taipeiMetro: ['#e3002c', '#1a86d6', '#c48c31', '#11a36f', '#f8b61c', '#ffdb00', '#9258c8'],
        fiberOptic: ['#00b4d8', '#1cc8ee', '#48d8f5', '#7ae7ff', '#0096c7', '#2ee6d6'],
        erp: ['#c8102e', '#e0303f', '#f25c54', '#ff7b6b', '#d62828', '#ff9e7a'],
        party: ['#ff4d6d', '#ff9f1c', '#ffe66d', '#7ae582', '#48cae4', '#9d4edd'],
    };

    // Old section anchors still land somewhere sensible.
    const LEGACY_HASHES = {
        '#about': '/about',
        '#experience': '/experience',
        '#projects': '/projects',
        '#mini-golf': '/mini-golf',
    };

    const root = document.documentElement;
    const viewport = document.getElementById('viewport');
    const strip = document.getElementById('strip');
    const library = document.getElementById('library');
    const panes = Array.from(strip.querySelectorAll('.pane'));
    const home = panes[0].querySelector('.page');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const pages = new Map([['/', home]]);
    library.querySelectorAll('.page[data-route]').forEach((page) => pages.set(page.dataset.route, page));

    pages.forEach((page, route) => {
        if (route === '/') return;
        const heading = page.querySelector('h2');
        if (heading) heading.tabIndex = -1;
    });

    // The close control belongs to the pane, not to the page inside it, so it
    // stays put while the page scrolls.
    panes.forEach((pane, depth) => {
        if (depth === 0) return;
        const close = document.createElement('a');
        close.className = 'pane-close';
        close.href = '#/';
        close.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>';
        pane.appendChild(close);
    });

    // One slot per pane. Mid-switch a slot holds several layered pages,
    // oldest first; the last one is what the pane is becoming.
    const slots = panes.map((pane, depth) => ({
        depth,
        pane,
        layers: depth === 0 ? [home] : [],
        state: depth === 0 ? 'open' : 'closed',
    }));

    let desired = ['/'];
    let geom = null;

    const wall = window.LightWall.create(
        document.getElementById('wall'),
        document.getElementById('frame'),
        {
            onCamera(x) {
                strip.style.transform = `translate3d(${-x}px, 0, 0)`;
            },
            onSwitchFrame,
            onSwitchDone,
        }
    );

    /* ---------- layout ---------- */

    function measure() {
        const vw = root.clientWidth;
        const vh = window.innerHeight;
        const viewCols = Math.max(6, Math.floor((vw + GAP) / CELL));
        const rows = Math.max(8, Math.floor((vh + GAP) / CELL));
        const innerCols = viewCols - 2;
        // Wide screens get fixed-width panes side by side. Narrow ones get one
        // pane at a time under a strip of lights.
        const wide = innerCols >= PANE_COLS * 2;
        const pc = wide ? (vw >= 1680 ? PANE_COLS + 1 : PANE_COLS) : Math.min(innerCols, 24);
        return {
            vw,
            vh,
            cell: CELL,
            viewCols,
            rows,
            innerCols,
            pc,
            wide,
            bandTop: wide ? 1 : Math.max(3, Math.min(12, Math.round(rows * 0.28))),
            offX: Math.floor((vw - (viewCols * CELL - GAP)) / 2),
            offY: Math.floor((vh - (rows * CELL - GAP)) / 2),
            worldCols: 1 + (MAX_DEPTH + 1) * pc + viewCols + 2,
        };
    }

    function cameraFor(depth) {
        const runway = geom.wide ? 3 : 0;
        const need = 1 + (depth + 1) * geom.pc + runway + 1;
        return Math.max(0, need - geom.viewCols) * CELL;
    }

    function setGeometry() {
        const next = measure();
        if (geom && Object.keys(next).every((key) => next[key] === geom[key])) return;
        geom = next;

        const s = root.style;
        s.setProperty('--inner-x', geom.offX + CELL + 'px');
        s.setProperty('--inner-y', geom.offY + CELL + 'px');
        s.setProperty('--inner-w', geom.innerCols * CELL - GAP + 'px');
        s.setProperty('--inner-h', (geom.rows - 2) * CELL - GAP + 'px');
        s.setProperty('--pane-w', geom.pc * CELL - GAP + 'px');
        s.setProperty('--pane-h', (geom.rows - 1 - geom.bandTop) * CELL - GAP + 'px');
        s.setProperty('--pane-y', (geom.bandTop - 1) * CELL + 'px');
        s.setProperty('--pane-stride', geom.pc * CELL + 'px');
        root.classList.toggle('is-narrow', !geom.wide);

        // A resize settles anything mid-transition.
        slots.slice(1).forEach((slot) => {
            settleLayers(slot);
            if (slot.state === 'closing') finishClose(slot);
            else if (slot.state === 'opening') slot.state = 'open';
        });
        wall.layout(geom, {
            openDepths: slots.filter((slot) => slot.depth > 0 && slot.state === 'open').map((slot) => slot.depth),
            camX: cameraFor(desired.length - 1),
        });
    }

    /* ---------- panes ---------- */

    function mount(slot, page) {
        page.style.clipPath = '';
        slot.pane.appendChild(page);
        page.scrollTop = 0;
        slot.layers.push(page);
        if (page.querySelector('#miniGolfCanvas') && typeof window.resizeCanvas === 'function') {
            requestAnimationFrame(() => window.resizeCanvas());
        }
        // Videos only load once their page is open, and never autoplay for
        // someone who asked for less motion.
        if (!reduceMotion.matches) {
            page.querySelectorAll('video[loop]').forEach((video) => {
                const started = video.play();
                if (started) started.catch(() => {});
            });
        }
    }

    function unmount(page) {
        page.style.clipPath = '';
        page.querySelectorAll('video').forEach((video) => {
            video.pause();
            video.currentTime = 0;
        });
        library.appendChild(page);
    }

    function settleLayers(slot) {
        wall.cancelSwitches(slot.depth);
        while (slot.layers.length > 1) unmount(slot.layers.shift());
        if (slot.layers[0]) slot.layers[0].style.clipPath = '';
    }

    function replaceLayers(slot, page) {
        settleLayers(slot);
        slot.layers.splice(0).forEach(unmount);
        mount(slot, page);
    }

    function finishClose(slot) {
        slot.layers.splice(0).forEach(unmount);
        slot.state = 'closed';
        slot.pane.hidden = true;
        slot.pane.inert = false;
    }

    function switchTo(slot, page, animate) {
        if (!animate || slot.layers.includes(page)) {
            replaceLayers(slot, page);
            return;
        }
        mount(slot, page);
        page.style.clipPath = 'inset(0 0 100% 0)';
        wall.startSwitch(slot.depth, animate);
    }

    // Each layered page shows only the rows between the bands around it:
    // the newest above the latest band, the oldest below the first.
    function onSwitchFrame(depth, bands) {
        const layers = slots[depth].layers;
        if (layers.length !== bands.length + 1) return;
        const height = (geom.rows - 1 - geom.bandTop) * CELL;
        layers.forEach((page, k) => {
            const upper = k < bands.length ? bands[k].bots : null;
            const lower = k > 0 ? bands[k - 1].tops : null;
            page.style.clipPath = clipPolygon(upper, lower, height);
        });
    }

    function onSwitchDone(depth) {
        const slot = slots[depth];
        if (slot.layers.length > 1) unmount(slot.layers.shift());
        if (slot.layers.length === 1) slot.layers[0].style.clipPath = '';
    }

    function clipPolygon(upper, lower, height) {
        const pts = [];
        for (let k = 0; k < geom.pc; k++) {
            const y = upper ? upper[k] * CELL : 0;
            pts.push(`${k * CELL}px ${y}px`, `${(k + 1) * CELL}px ${y}px`);
        }
        for (let k = geom.pc - 1; k >= 0; k--) {
            const y = lower ? lower[k] * CELL : height;
            pts.push(`${(k + 1) * CELL}px ${y}px`, `${k * CELL}px ${y}px`);
        }
        return `polygon(${pts.join(',')})`;
    }

    function apply(stack, animate) {
        desired = stack;
        const opening = [];
        const closing = [];

        for (let d = 1; d <= MAX_DEPTH; d++) {
            const slot = slots[d];
            const page = pages.get(stack[d]);
            if (page) {
                if (slot.state === 'closed' || slot.state === 'closing') {
                    if (slot.layers[slot.layers.length - 1] !== page) replaceLayers(slot, page);
                    slot.state = 'opening';
                    slot.pane.hidden = false;
                    slot.pane.inert = false;
                    opening.push(d);
                } else if (slot.layers[slot.layers.length - 1] !== page) {
                    switchTo(slot, page, animate);
                }
            } else if (slot.state === 'open' || slot.state === 'opening') {
                settleLayers(slot);
                slot.state = 'closing';
                slot.pane.inert = true;
                closing.push(d);
            }
        }

        wall.openBands(opening, animate, (d) => {
            if (slots[d].state === 'opening') slots[d].state = 'open';
        });
        wall.closeBands(closing, animate, (d) => {
            if (slots[d].state === 'closing') finishClose(slots[d]);
        });
        wall.setCamera(cameraFor(stack.length - 1), animate);
        syncActiveLinks();
        refreshPalette();
    }

    function syncActiveLinks() {
        slots.forEach((slot) => {
            const next = desired[slot.depth + 1];
            slot.pane.querySelectorAll('a[href^="#/"]:not(.pane-close)').forEach((link) => {
                const on = !!next && routeFromHref(link.getAttribute('href')) === next;
                link.classList.toggle('is-on', on);
                if (on) link.setAttribute('aria-current', 'page');
                else link.removeAttribute('aria-current');
            });

            const close = slot.pane.querySelector(':scope > .pane-close');
            const open = desired[slot.depth];
            if (!close || !open) return;
            close.href = urlFor(desired[slot.depth - 1] || '/');
            const heading = pages.get(open).querySelector('h2');
            close.setAttribute('aria-label', 'Close ' + (heading ? heading.textContent : 'page'));
        });
    }

    /* ---------- routing ---------- */

    function routeFromHref(href) {
        if (!href || href === '#' || href === '#/') return '/';
        if (LEGACY_HASHES[href]) return LEGACY_HASHES[href];
        const route = href.startsWith('#/') ? href.slice(1).replace(/\/+$/, '') : '';
        return pages.has(route) ? route : '/';
    }

    function chainFor(route) {
        const chain = [];
        let page = pages.get(route);
        while (page && page !== home && chain.length < MAX_DEPTH) {
            chain.unshift(page.dataset.route);
            page = pages.get(page.dataset.parent || '/');
        }
        return ['/'].concat(chain);
    }

    function isValidStack(stack) {
        return Array.isArray(stack) && stack[0] === '/' && stack.length <= MAX_DEPTH + 1 &&
            stack.every((route) => pages.has(route));
    }

    function urlFor(route) {
        return route === '/' ? location.pathname + location.search : '#' + route;
    }

    function animated() {
        return !reduceMotion.matches;
    }

    function navigate(stack, focusNew) {
        const same = stack.length === desired.length && stack.every((route, i) => route === desired[i]);
        if (same) return;
        history.pushState({ stack }, '', urlFor(stack[stack.length - 1]));
        apply(stack, animated());
        if (focusNew) {
            const page = pages.get(stack[stack.length - 1]);
            const heading = page && page.querySelector('h2');
            if (heading) heading.focus({ preventScroll: true });
        }
    }

    function closeTo(depth, restoreFocus) {
        const closed = desired[depth];
        navigate(desired.slice(0, depth));
        if (restoreFocus && closed) {
            const link = slots[depth - 1].pane.querySelector(`a[href="#${closed}"]`);
            if (link) link.focus({ preventScroll: true });
        }
    }

    strip.addEventListener('click', (e) => {
        const link = e.target.closest('a[href^="#"]');
        if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const pane = link.closest('.pane');
        if (!pane) return;
        e.preventDefault();
        const depth = Number(pane.dataset.depth);
        const keyboard = e.detail === 0;

        if (link.classList.contains('pane-close')) {
            closeTo(depth, keyboard);
            return;
        }
        const route = routeFromHref(link.getAttribute('href'));
        // Clicking the link for a pane that's already open closes it.
        if (desired[depth + 1] === route) {
            closeTo(depth + 1, keyboard);
            return;
        }
        const prefix = desired.slice(0, depth + 1);
        const at = prefix.indexOf(route);
        let next = at >= 0 ? prefix.slice(0, at + 1) : prefix.concat(route);
        if (next.length > MAX_DEPTH + 1) next = prefix.slice(0, MAX_DEPTH).concat(route);
        navigate(next, keyboard);
    });

    window.addEventListener('popstate', (e) => {
        const stack = isValidStack(e.state && e.state.stack) ? e.state.stack : chainFor(routeFromHref(location.hash));
        apply(stack, animated());
    });

    window.addEventListener('hashchange', () => {
        const route = routeFromHref(location.hash);
        if (route !== desired[desired.length - 1]) apply(chainFor(route), animated());
    });

    /* ---------- palette ---------- */

    let hoverKey = null;
    let currentKey = null;
    let partyUntil = 0;

    function lockedKey() {
        for (let d = desired.length - 1; d >= 1; d--) {
            const key = pages.get(desired[d]).dataset.palette;
            if (key && PALETTES[key]) return key;
        }
        return 'home';
    }

    function seedFor(key) {
        if (key === 'home') return 0;
        let h = 0;
        for (let n = 0; n < key.length; n++) h = (h * 31 + key.charCodeAt(n)) | 0;
        return ((h >>> 0) % 60) * 0.07;
    }

    function refreshPalette(instant) {
        const key = performance.now() < partyUntil ? 'party' : hoverKey || lockedKey();
        if (key === currentKey) return;
        currentKey = key;
        wall.setPalette(PALETTES[key], seedFor(key), instant);
    }

    function paletteKeyAt(el) {
        if (!(el instanceof Element) || !strip.contains(el)) return null;
        const link = el.closest('a[href^="#/"]');
        if (link && !link.classList.contains('pane-close')) {
            const page = pages.get(routeFromHref(link.getAttribute('href')));
            return page ? page.dataset.palette || 'home' : null;
        }
        const block = el.closest('[data-hover-palette]');
        return block ? block.dataset.hoverPalette : null;
    }

    function setHover(key) {
        if (key && !PALETTES[key]) key = null;
        if (key === hoverKey) return;
        hoverKey = key;
        refreshPalette();
    }

    document.addEventListener('pointerover', (e) => {
        if (e.pointerType !== 'touch') setHover(paletteKeyAt(e.target));
    });
    document.addEventListener('focusin', (e) => setHover(paletteKeyAt(e.target)));
    root.addEventListener('pointerleave', () => setHover(null));

    function party() {
        partyUntil = performance.now() + 5000;
        wall.setHueRate(14);
        refreshPalette();
        setTimeout(() => {
            wall.setHueRate(1);
            refreshPalette();
        }, 5000);
    }

    /* ---------- pointer wake ---------- */

    window.addEventListener('pointermove', (e) => {
        if (lightbox.hidden) wall.pointer(e.clientX, e.clientY, 'move');
    }, { passive: true });
    window.addEventListener('pointerdown', (e) => {
        if (lightbox.hidden) wall.pointer(e.clientX, e.clientY, 'down');
    }, { passive: true });
    window.addEventListener('pointerup', () => wall.pointer(0, 0, 'up'), { passive: true });
    window.addEventListener('pointercancel', () => wall.pointer(0, 0, 'up'), { passive: true });

    /* ---------- project images ---------- */

    const lightbox = document.getElementById('lightbox');
    const lightboxImg = lightbox.querySelector('img');
    const lightboxToggle = lightbox.querySelector('.lightbox-toggle');
    const lightboxClose = lightbox.querySelector('.lightbox-close');
    const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let lightboxSource = null;
    let lightboxAlt = false;

    // PCB renders have a main and a 2D view. The button picks the view;
    // hovering previews the other one without changing that choice.
    function isAltView(img) {
        return img.dataset.view === 'alt';
    }

    function showView(img, alt) {
        img.dataset.view = alt ? 'alt' : 'main';
        img.src = alt ? img.dataset.altSrc : img.dataset.mainSrc;
    }

    document.querySelectorAll('img[data-alt-src]').forEach((img) => {
        img.dataset.mainSrc = img.getAttribute('src');
        if (!supportsHover) return;
        img.addEventListener('mouseenter', () => {
            img.src = isAltView(img) ? img.dataset.mainSrc : img.dataset.altSrc;
        });
        img.addEventListener('mouseleave', () => showView(img, isAltView(img)));
    });

    document.querySelectorAll('.pcb-toggle').forEach((button) => {
        const img = document.getElementById(button.dataset.image);
        if (!img) return;
        button.addEventListener('click', () => {
            const alt = !isAltView(img);
            showView(img, alt);
            button.textContent = alt ? 'Show main view' : 'Show 2D view';
        });
    });

    function setLightboxView(alt) {
        lightboxAlt = alt;
        lightboxImg.src = alt ? lightboxSource.dataset.altSrc : lightboxSource.dataset.mainSrc || lightboxSource.src;
        lightboxToggle.textContent = alt ? 'Show main view' : 'Show 2D view';
    }

    function openLightbox(img) {
        lightboxSource = img;
        lightboxImg.alt = img.alt;
        lightboxToggle.hidden = !img.dataset.altSrc;
        setLightboxView(!!img.dataset.altSrc && isAltView(img));
        lightbox.hidden = false;
        viewport.inert = true;
        lightboxClose.focus();
    }

    function closeLightbox() {
        if (lightbox.hidden) return;
        lightbox.hidden = true;
        viewport.inert = false;
        lightboxImg.removeAttribute('src');
        if (lightboxSource) lightboxSource.focus({ preventScroll: true });
        lightboxSource = null;
    }

    document.querySelectorAll('img.zoomable').forEach((img) => {
        img.tabIndex = 0;
        img.setAttribute('role', 'button');
        img.setAttribute('aria-label', 'Enlarge image: ' + img.alt);
        img.addEventListener('click', () => openLightbox(img));
        img.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            openLightbox(img);
        });
    });

    lightboxToggle.addEventListener('click', () => setLightboxView(!lightboxAlt));
    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
    });

    /* ---------- keys ---------- */

    const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiStep = 0;

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!lightbox.hidden) closeLightbox();
            else if (desired.length > 1) closeTo(desired.length - 1, true);
            return;
        }
        if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        konamiStep = key === KONAMI[konamiStep] ? konamiStep + 1 : key === KONAMI[0] ? 1 : 0;
        if (konamiStep === KONAMI.length) {
            konamiStep = 0;
            party();
        }
    });

    /* ---------- start ---------- */

    let resizeQueued = false;
    function queueResize() {
        if (resizeQueued) return;
        resizeQueued = true;
        requestAnimationFrame(() => {
            resizeQueued = false;
            setGeometry();
        });
    }
    window.addEventListener('resize', queueResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', queueResize);

    const startRoute = routeFromHref(location.hash);
    const startStack = chainFor(startRoute);
    history.replaceState({ stack: startStack }, '', urlFor(startRoute));

    setGeometry();
    refreshPalette(true);
    wall.setCamera(cameraFor(startStack.length - 1), false);
    wall.start();
    root.classList.add('is-ready');

    // Deep links open their panes once the lights are up.
    if (startStack.length > 1) {
        setTimeout(() => apply(startStack, animated()), animated() ? 450 : 0);
    }
})();
