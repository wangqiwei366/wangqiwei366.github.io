(function () {
    'use strict';

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
