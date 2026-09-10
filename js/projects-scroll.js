(function () {
    const section = document.querySelector('.projects-section');
    if (!section) return;

    const timelineItems = section.querySelectorAll('.timeline-item');

    if (timelineItems.length) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            timelineItems.forEach((el) => el.classList.add('is-visible'));
        } else {
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

            timelineItems.forEach((el) => io.observe(el));
        }
    }

    // Project category filtering
    const filterBtns = section.querySelectorAll('.filter-btn');

    filterBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');

            filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));

            timelineItems.forEach((item) => {
                const category = item.getAttribute('data-category');
                item.classList.toggle('filtered-out', filter !== 'all' && category !== filter);
            });
        });
    });

    // PCB renders have a main and a 2D view. The toggle button chooses the view;
    // hovering previews the other one without changing that choice.
    const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    function isAltView(img) {
        return img.dataset.view === 'alt';
    }

    function showPcbView(img, alt) {
        img.dataset.view = alt ? 'alt' : 'default';
        img.src = img.getAttribute(alt ? 'data-alt-src' : 'data-default-src');
    }

    section.querySelectorAll('.project-image-pcb').forEach((img) => {
        if (!img.getAttribute('data-default-src') || !img.getAttribute('data-alt-src')) return;

        // Keep the main render's shape so swapping views never shifts the page.
        const width = img.getAttribute('width');
        const height = img.getAttribute('height');
        if (width && height) img.style.aspectRatio = `${width} / ${height}`;

        if (supportsHover) {
            img.addEventListener('mouseenter', () => {
                img.src = img.getAttribute(isAltView(img) ? 'data-default-src' : 'data-alt-src');
            });
            img.addEventListener('mouseleave', () => showPcbView(img, isAltView(img)));
        }
    });

    section.querySelectorAll('.project-view-toggle').forEach((btn) => {
        const targetId = btn.getAttribute('data-target-image');
        const img = targetId && document.getElementById(targetId);
        if (!img || !img.getAttribute('data-alt-src')) return;

        btn.addEventListener('click', () => {
            const alt = !isAltView(img);
            showPcbView(img, alt);
            btn.textContent = alt ? 'Show main view' : 'Show 2D view';
        });
    });

    const lightbox = document.querySelector('.image-lightbox');
    const lightboxClose = lightbox?.querySelector('.image-lightbox-close');
    const lightboxToggle = lightbox?.querySelector('.image-lightbox-toggle');
    // Video thumbnails already link to their demo, so only standalone images open the viewer.
    const zoomableImages = [...section.querySelectorAll('.project-image')].filter((img) => !img.closest('a'));

    if (!lightbox || !lightboxClose || !lightboxToggle || !zoomableImages.length) return;

    const lightboxImg = document.createElement('img');
    lightboxImg.className = 'image-lightbox-img';
    lightboxImg.alt = '';
    lightbox.append(lightboxImg);

    const pageRegions = document.querySelectorAll('.skip-link, body > header, body > main, body > footer');
    let lightboxDefaultSrc = null;
    let lightboxAltSrc = null;
    let lightboxShowingAlt = false;
    let returnFocusTo = null;

    function setLightboxView(alt) {
        lightboxShowingAlt = alt;
        lightboxImg.src = alt ? lightboxAltSrc : lightboxDefaultSrc;
        lightboxToggle.textContent = alt ? 'Show main view' : 'Show 2D view';
    }

    function openLightbox(img) {
        lightboxDefaultSrc = img.getAttribute('data-default-src') || img.getAttribute('src');
        lightboxAltSrc = img.getAttribute('data-alt-src');
        if (!lightboxDefaultSrc) return;

        lightboxImg.alt = img.getAttribute('alt') || 'Expanded project image';
        lightboxToggle.hidden = !lightboxAltSrc;
        setLightboxView(Boolean(lightboxAltSrc) && isAltView(img));

        returnFocusTo = img;
        lightbox.classList.add('is-open');
        lightbox.setAttribute('aria-hidden', 'false');
        pageRegions.forEach((el) => { el.inert = true; });
        document.body.style.overflow = 'hidden';
        lightboxClose.focus();
    }

    function closeLightbox() {
        if (!lightbox.classList.contains('is-open')) return;

        lightbox.classList.remove('is-open');
        lightbox.setAttribute('aria-hidden', 'true');
        pageRegions.forEach((el) => { el.inert = false; });
        document.body.style.overflow = '';
        lightboxImg.removeAttribute('src');
        lightboxDefaultSrc = null;
        lightboxAltSrc = null;
        lightboxToggle.hidden = true;

        if (returnFocusTo) returnFocusTo.focus({ preventScroll: true });
        returnFocusTo = null;
    }

    zoomableImages.forEach((img) => {
        img.tabIndex = 0;
        img.setAttribute('role', 'button');
        img.setAttribute('aria-label', `Enlarge image: ${img.getAttribute('alt') || 'project image'}`);
        img.addEventListener('click', () => openLightbox(img));
        img.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            openLightbox(img);
        });
    });

    lightboxToggle.addEventListener('click', () => {
        if (lightboxAltSrc) setLightboxView(!lightboxShowingAlt);
    });

    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (event) => {
        if (event.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeLightbox();
    });
})();
