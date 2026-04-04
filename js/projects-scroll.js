(function () {
    const section = document.querySelector('.projects-section');
    if (!section) return;

    const targets = section.querySelectorAll('.projects-heading, .timeline-item');
    if (!targets.length) return;

    function revealAll() {
        targets.forEach((el) => el.classList.add('is-visible'));
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        revealAll();
        return;
    }

    const io = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                io.unobserve(entry.target);
            });
        },
        { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
    );

    targets.forEach((el) => io.observe(el));
})();
