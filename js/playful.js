/**
 * Home page micro-interactions: greeting, logo leaf, photo leaf, Konami, footer.
 */
(function () {
    function showToast(message) {
        var el = document.createElement('div');
        el.className = 'playful-toast';
        el.textContent = message;
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
        requestAnimationFrame(function () {
            el.classList.add('playful-toast--visible');
        });
        setTimeout(function () {
            el.classList.remove('playful-toast--visible');
            setTimeout(function () {
                el.remove();
            }, 400);
        }, 4200);
    }

    function normKey(e) {
        if (e.key === 'B' || e.key === 'b') return 'b';
        if (e.key === 'A' || e.key === 'a') return 'a';
        return e.key;
    }

    function setupKonami(reduceMotion) {
        var hero = document.getElementById('heroSection');
        if (!hero) return;

        var seq = [
            'ArrowUp',
            'ArrowUp',
            'ArrowDown',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'ArrowLeft',
            'ArrowRight',
            'b',
            'a',
        ];
        var step = 0;

        document.addEventListener('keydown', function (e) {
            if (e.target.closest('input, textarea, select, [contenteditable="true"]')) {
                step = 0;
                return;
            }
            var key = normKey(e);
            var want = seq[step];
            if (key === want) {
                step += 1;
                if (step >= seq.length) {
                    step = 0;
                    showToast('Konami code. Saturated greens for a few seconds.');
                    if (!reduceMotion) {
                        document.body.classList.add('konami-party');
                        setTimeout(function () {
                            document.body.classList.remove('konami-party');
                        }, 4500);
                    }
                }
            } else {
                step = key === seq[0] ? 1 : 0;
            }
        });
    }

    function init() {
        var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        var greetingEl = document.getElementById('heroGreeting');
        if (greetingEl) {
            var hour = new Date().getHours();
            var bucket = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
            var lines = {
                night: ['Up late? Hi.', 'Night-owl? fair enough.'],
                morning: ['Morning.', 'Early! hi.'],
                afternoon: ['Afternoon.', 'Middle of the day. Hi.'],
                evening: ['Evening.', 'End of the day — hi.'],
            };
            var options = lines[bucket];
            greetingEl.textContent = options[Math.floor(Math.random() * options.length)];
        }

        var leafBtn = document.getElementById('logoLeafBtn');
        if (leafBtn) {
            var count = 0;
            var resetTimer = null;

            function bump() {
                clearTimeout(resetTimer);
                count += 1;
                resetTimer = setTimeout(function () {
                    count = 0;
                }, 2200);

                if (count < 5) {
                    if (!reduceMotion) {
                        leafBtn.classList.remove('logo-leaf--wiggle');
                        void leafBtn.offsetWidth;
                        leafBtn.classList.add('logo-leaf--wiggle');
                    }
                    return;
                }

                count = 0;
                if (!reduceMotion) {
                    leafBtn.classList.remove('logo-leaf--celebrate');
                    void leafBtn.offsetWidth;
                    leafBtn.classList.add('logo-leaf--celebrate');
                    setTimeout(function () {
                        leafBtn.classList.remove('logo-leaf--celebrate');
                    }, 900);
                }
                showToast('Leafy high-five! Use Play in the nav or About for mini golf.');
            }

            leafBtn.addEventListener('click', function (e) {
                e.preventDefault();
                bump();
            });
            leafBtn.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    bump();
                }
            });
        }

        var photoBadge = document.getElementById('photoBadgeBtn');
        if (photoBadge) {
            var quips = ['Hm.', 'Still just a leaf.', 'Okay.'];
            photoBadge.addEventListener('click', function () {
                if (!reduceMotion) {
                    photoBadge.classList.remove('photo-badge--spin');
                    void photoBadge.offsetWidth;
                    photoBadge.classList.add('photo-badge--spin');
                }
                showToast(quips[Math.floor(Math.random() * quips.length)]);
            });
        }

        var footerSig = document.getElementById('footerSignature');
        if (footerSig) {
            var ft = 0;
            var fc = 0;
            footerSig.addEventListener('click', function () {
                var now = Date.now();
                if (now - ft > 700) fc = 0;
                ft = now;
                fc += 1;
                if (fc >= 3) {
                    fc = 0;
                    showToast('Triple-click noted.');
                }
            });
        }

        setupKonami(reduceMotion);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
