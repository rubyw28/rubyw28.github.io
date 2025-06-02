document.addEventListener('DOMContentLoaded', () => {
    const heroSection = document.querySelector('.hero');
    const h1Element = heroSection.querySelector('h1');
    const scrollHint = heroSection.querySelector('.scroll-hint');

    const startBgColor = '#e8f5e9'; 
    const endBgColor = '#b9fbc0'; 
    const startTextColor = '#065f46';
    const endTextColor = '#2e4e3f';   

    function interpolateColor(color1, color2, factor) {
        const result = color1.slice(1).match(/.{2}/g).map((c1, i) => {
            const c2 = parseInt(color2.slice(1).match(/.{2}/g)[i], 16);
            const r = Math.round(parseInt(c1, 16) + factor * (c2 - parseInt(c1, 16)));
            return ('0' + r.toString(16)).slice(-2);
        }).join('');
        return '#' + result;
    }

    function handleScroll() {
        const scrollPosition = window.scrollY;
        const heroHeight = heroSection.offsetHeight;
        let scrollProgress = Math.min(scrollPosition / heroHeight, 1);

        const h1Progress = scrollProgress;

        heroSection.style.backgroundColor = interpolateColor(startBgColor, endBgColor, scrollProgress);
        h1Element.style.color = interpolateColor(startTextColor, endTextColor, h1Progress);
        scrollHint.style.opacity = 1 - scrollProgress;
    }

    window.addEventListener('scroll', handleScroll);
    handleScroll();
});