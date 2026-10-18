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
        return 'light';
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

    // Keep the navigation out of the way while reading.  The same direction
    // logic is used for the top navigation on desktop and the bottom dock on
    // phones/tablets; CSS decides which edge the hidden state leaves from.
    (function setupNavigationScroll() {
        var nav = document.querySelector('.navbar-custom');
        if (!nav) return;

        var lastY = Math.max(0, window.pageYOffset || document.documentElement.scrollTop || 0);
        var frame = 0;
        var threshold = 3;

        function setVisible(visible) {
            nav.classList.toggle('nav-scroll-hidden', !visible);
            nav.setAttribute('data-scroll-state', visible ? 'visible' : 'hidden');
        }

        function readScroll() {
            frame = 0;
            var currentY = Math.max(0, window.pageYOffset || document.documentElement.scrollTop || 0);
            var delta = currentY - lastY;

            // Always restore the dock at the top of a page, including after
            // iOS rubber-band scrolling reports a negative scroll position.
            if (currentY <= 12) {
                setVisible(true);
            } else if (Math.abs(delta) >= threshold) {
                // Scrolling the document down hides the dock; reversing
                // direction reveals it again.
                setVisible(delta < 0);
            }
            lastY = currentY;
        }

        function scheduleScrollRead() {
            if (frame) return;
            frame = window.requestAnimationFrame(readScroll);
        }

        setVisible(true);
        window.addEventListener('scroll', scheduleScrollRead, { passive: true });
        window.addEventListener('resize', function () {
            lastY = Math.max(0, window.pageYOffset || document.documentElement.scrollTop || 0);
            setVisible(true);
        }, { passive: true });

        // Opening search should never leave the trigger hidden behind the
        // search sheet.  This also gives keyboard users a stable focus target.
        nav.addEventListener('click', function (event) {
            if (event.target.closest && event.target.closest('.search-icon')) {
                setVisible(true);
            }
        });
    }());

}());
