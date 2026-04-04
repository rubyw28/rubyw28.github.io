(function () {
    var root = document.documentElement;
    var header = document.querySelector('header');
    if (!header) return;

    function measure() {
        var h = header.getBoundingClientRect().height;
        if (h > 0) {
            root.style.setProperty('--header-height', Math.ceil(h) + 'px');
        }
    }

    function sync() {
        requestAnimationFrame(function () {
            requestAnimationFrame(measure);
        });
    }

    measure();
    sync();

    window.addEventListener('resize', sync, { passive: true });
    window.addEventListener('orientationchange', sync, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', sync, { passive: true });
    }
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(sync).observe(header);
    }
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(sync);
    }
})();
