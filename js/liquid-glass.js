(function () {
    'use strict';

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

        card.addEventListener('pointermove', function (event) {
            if (reducedMotion || event.pointerType !== 'mouse') return;
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

        card.addEventListener('pointerleave', function () {
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            card.style.setProperty('--pointer-x', '50%');
            card.style.setProperty('--pointer-y', '0%');
        });

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
