document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('toggle-about-button');
    const body = document.body;
    const aboutContent = document.querySelector('.about-content');
    const moreAboutContent = document.querySelector('.more-about-content');
    const mainNav = document.querySelector('nav');
    const playBanner = document.getElementById('aboutPlayBanner');

    let showingMore = false;

    if (aboutContent) aboutContent.classList.remove('hidden');
    if (moreAboutContent) moreAboutContent.classList.add('hidden');
    if (mainNav) mainNav.style.display = 'block';

    function openGame() {
        if (showingMore || !toggleButton || !aboutContent || !moreAboutContent) return;
        body.classList.add('inverted');
        aboutContent.classList.add('hidden');
        moreAboutContent.classList.remove('hidden');
        moreAboutContent.classList.add('visible');
        if (mainNav) mainNav.style.display = 'none';
        toggleButton.setAttribute('aria-label', 'Back to about');
        showingMore = true;
        body.classList.add('game-active');
        if (typeof resizeCanvas === 'function') resizeCanvas();
    }

    function closeGame() {
        if (!showingMore || !toggleButton || !aboutContent || !moreAboutContent) return;
        body.classList.remove('inverted');
        aboutContent.classList.remove('hidden');
        moreAboutContent.classList.add('hidden');
        moreAboutContent.classList.remove('visible');
        if (mainNav) mainNav.style.display = 'block';
        toggleButton.setAttribute('aria-label', 'Show mini golf');
        showingMore = false;
        body.classList.remove('game-active');
        if (location.hash === '#mini-golf') {
            history.replaceState(null, '', location.pathname + location.search);
        }
    }

    if (toggleButton) {
        toggleButton.addEventListener('click', () => {
            if (showingMore) closeGame();
            else openGame();
        });
    }

    if (playBanner) {
        playBanner.addEventListener('click', (e) => {
            e.preventDefault();
            history.pushState(null, '', '#mini-golf');
            openGame();
        });
    }

    function tryOpenFromHash() {
        if (location.hash !== '#mini-golf') return;
        openGame();
        const el = document.getElementById('mini-golf');
        if (el) {
            requestAnimationFrame(() => {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    }

    tryOpenFromHash();
    window.addEventListener('hashchange', tryOpenFromHash);
});
