(function () {
    const hero = document.getElementById('heroSection');
    const h1 = document.getElementById('heroH1');
    if (!hero || !h1) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
    }

    const startBg = '#e8f5e9';
    const endBg = '#b9fbc0';
    const startTxt = '#065f46';
    const endTxt = '#2e4e3f';

    function lerpHex(c1, c2, t) {
        return (
            '#' +
            c1
                .slice(1)
                .match(/.{2}/g)
                .map((a, i) => {
                    const b = parseInt(c2.slice(1).match(/.{2}/g)[i], 16);
                    return (
                        '0' +
                        Math.round(parseInt(a, 16) + t * (b - parseInt(a, 16))).toString(16)
                    ).slice(-2);
                })
                .join('')
        );
    }

    let ticking = false;
    function updateHeroColors() {
        const p = Math.min(window.scrollY / (hero.offsetHeight || 1), 1);
        hero.style.backgroundColor = lerpHex(startBg, endBg, p);
        h1.style.color = lerpHex(startTxt, endTxt, p);
        ticking = false;
    }

    function onScroll() {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(updateHeroColors);
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    updateHeroColors();
})();
