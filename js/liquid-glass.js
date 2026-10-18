(function () {
    'use strict';

    var root = document.documentElement;
    var themeKey = 'kimi-theme';

    function preferredTheme() {
        var stored;
        try {
            stored = window.localStorage.getItem(themeKey);
        } catch (error) {
            stored = null;
        }
        if (stored === 'light' || stored === 'dark') return stored;
        return 'dark';
    }

    function updateThemeButtons(theme) {
        var buttons = document.querySelectorAll('.theme-toggle');
        Array.prototype.forEach.call(buttons, function (button) {
            var nextTheme = theme === 'light' ? '深色模式' : '浅色模式';
            button.setAttribute('aria-pressed', String(theme === 'light'));
            button.setAttribute('aria-label', '切换到' + nextTheme);
            button.setAttribute('title', '切换到' + nextTheme);
        });
    }

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        updateThemeButtons(theme);
    }

    applyTheme(preferredTheme());

    document.addEventListener('click', function (event) {
        var button = event.target.closest && event.target.closest('.theme-toggle');
        if (!button) return;
        var nextTheme = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        applyTheme(nextTheme);
        try {
            window.localStorage.setItem(themeKey, nextTheme);
        } catch (error) {
            // Private browsing can deny storage; the in-memory switch still works.
        }
    });

    var cards = document.querySelectorAll('.glass-card');
    if (!cards.length) return;

    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function setLight(card, event) {
        var rect = card.getBoundingClientRect();
        var x = ((event.clientX - rect.left) / rect.width) * 100;
        var y = ((event.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--pointer-x', Math.max(0, Math.min(100, x)) + '%');
        card.style.setProperty('--pointer-y', Math.max(0, Math.min(100, y)) + '%');
    }

    Array.prototype.forEach.call(cards, function (card) {
        var frame = 0;
        var resetTimer;

        card.addEventListener('pointerenter', function (event) {
            if (event.pointerType === 'mouse') card.classList.add('is-pointer-active');
        }, { passive: true });

        card.addEventListener('pointermove', function (event) {
            if (reducedMotion || event.pointerType !== 'mouse') return;
            card.classList.add('is-pointer-active');
            if (frame) return;
            frame = window.requestAnimationFrame(function () {
                setLight(card, event);
                frame = 0;
            });
        }, { passive: true });

        card.addEventListener('pointerdown', function (event) {
            if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
            setLight(card, event);
            card.classList.add('is-touch-active');
            window.clearTimeout(resetTimer);
            resetTimer = window.setTimeout(function () {
                card.classList.remove('is-touch-active');
            }, 520);
        }, { passive: true });

        function clearPointerLight() {
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            card.classList.remove('is-pointer-active');
            card.style.setProperty('--pointer-x', '50%');
            card.style.setProperty('--pointer-y', '0%');
        }

        card.addEventListener('pointerleave', clearPointerLight, { passive: true });
        card.addEventListener('pointercancel', function () {
            clearPointerLight();
            window.clearTimeout(resetTimer);
            card.classList.remove('is-touch-active');
        }, { passive: true });

        card.addEventListener('pointerup', function () {
            if (card.classList.contains('is-touch-active')) {
                window.clearTimeout(resetTimer);
                resetTimer = window.setTimeout(function () {
                    card.classList.remove('is-touch-active');
                }, 260);
            }
        }, { passive: true });
    });
}());
