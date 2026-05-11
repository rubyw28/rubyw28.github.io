(function () {
    const section = document.querySelector('.projects-section');
    if (!section) return;

    const targets = section.querySelectorAll('.projects-heading, .timeline-item');

    function revealAll(items) {
        items.forEach((el) => el.classList.add('is-visible'));
    }

    if (targets.length) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            revealAll(targets);
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

            targets.forEach((el) => io.observe(el));
        }
    }

    const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const lightbox = document.querySelector('.image-lightbox');
    const lightboxImg = lightbox?.querySelector('.image-lightbox-img');
    const lightboxClose = lightbox?.querySelector('.image-lightbox-close');
    const lightboxToggle = lightbox?.querySelector('.image-lightbox-toggle');
    const projectImages = section.querySelectorAll('.project-image');
    const pcbImages = section.querySelectorAll('.project-image-pcb');
    const viewToggles = section.querySelectorAll('.project-view-toggle');

    if (!lightbox || !lightboxImg || !lightboxClose || !lightboxToggle || !projectImages.length) return;

    let lightboxDefaultSrc = null;
    let lightboxAltSrc = null;
    let lightboxShowingAlt = false;

    pcbImages.forEach((img) => {
        const defaultSrc = img.getAttribute('data-default-src');
        const altSrc = img.getAttribute('data-alt-src');
        if (!defaultSrc || !altSrc) return;

        if (supportsHover) {
            img.addEventListener('mouseenter', () => {
                img.src = altSrc;
            });
            img.addEventListener('mouseleave', () => {
                img.src = defaultSrc;
            });
            img.addEventListener('focus', () => {
                img.src = altSrc;
            });
            img.addEventListener('blur', () => {
                img.src = defaultSrc;
            });
        }
    });

    viewToggles.forEach((btn) => {
        const targetId = btn.getAttribute('data-target-image');
        if (!targetId) return;
        const targetImg = section.querySelector(`#${targetId}`);
        if (!targetImg) return;
        const defaultSrc = targetImg.getAttribute('data-default-src');
        const altSrc = targetImg.getAttribute('data-alt-src');
        if (!defaultSrc || !altSrc) return;

        btn.addEventListener('click', () => {
            const currentPath = new URL(targetImg.src, window.location.href).pathname;
            const altPath = new URL(altSrc, window.location.href).pathname;
            const showingAlt = currentPath === altPath;
            targetImg.src = showingAlt ? defaultSrc : altSrc;
            btn.textContent = showingAlt ? 'Show 2D View' : 'Show Main View';
        });
    });

    function closeLightbox() {
        lightbox.classList.remove('is-open');
        lightbox.setAttribute('aria-hidden', 'true');
        lightboxImg.src = '';
        lightboxImg.alt = '';
        lightboxDefaultSrc = null;
        lightboxAltSrc = null;
        lightboxShowingAlt = false;
        lightboxToggle.hidden = true;
        lightboxToggle.textContent = 'Show 2D View';
        document.body.style.overflow = '';
    }

    projectImages.forEach((img) => {
        img.addEventListener('click', () => {
            const defaultSrc = img.getAttribute('data-default-src');
            const src = img.getAttribute('src');
            if (!src && !defaultSrc) return;

            // On desktop, PCB hover previews 2D. Keep zoom focused on the main view.
            const lightboxSrc =
                supportsHover && img.classList.contains('project-image-pcb') && defaultSrc
                    ? defaultSrc
                    : (src || defaultSrc);

            lightboxImg.src = lightboxSrc;
            lightboxImg.alt = img.getAttribute('alt') || 'Expanded project image';
            lightboxDefaultSrc = defaultSrc || src;
            lightboxAltSrc = img.getAttribute('data-alt-src');
            lightboxShowingAlt = false;

            if (lightboxDefaultSrc && lightboxAltSrc) {
                lightboxToggle.hidden = false;
                lightboxToggle.textContent = 'Show 2D View';
            } else {
                lightboxToggle.hidden = true;
            }

            lightbox.classList.add('is-open');
            lightbox.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        });
    });

    lightboxToggle.addEventListener('click', () => {
        if (!lightboxDefaultSrc || !lightboxAltSrc) return;
        lightboxShowingAlt = !lightboxShowingAlt;
        lightboxImg.src = lightboxShowingAlt ? lightboxAltSrc : lightboxDefaultSrc;
        lightboxToggle.textContent = lightboxShowingAlt ? 'Show Main View' : 'Show 2D View';
    });

    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (event) => {
        if (event.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && lightbox.classList.contains('is-open')) {
            closeLightbox();
        }
    });

    // Project category filtering
    const filterContainer = document.querySelector('.project-filters');
    const filterBtns = filterContainer?.querySelectorAll('.filter-btn');
    const timelineItems = section.querySelectorAll('.timeline-item');

    if (filterBtns && timelineItems.length) {
        filterBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter');

                // Update active button
                filterBtns.forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');

                // Filter items
                timelineItems.forEach((item) => {
                    const category = item.getAttribute('data-category');
                    if (filter === 'all' || category === filter) {
                        item.classList.remove('filtered-out');
                    } else {
                        item.classList.add('filtered-out');
                    }
                });
            });
        });
    }

})();
