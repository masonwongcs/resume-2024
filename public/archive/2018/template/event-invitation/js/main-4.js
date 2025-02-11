$(document).ready(function () {
    TweenMax.from($('.voucher-title'), 1, {y: 100, alpha: 0});
    TweenMax.from($('.voucher-date'), 1.2, {y: 100, alpha: 0});
    TweenMax.from($('.voucher-venue'), 1.4, {y: 100, alpha: 0});
    TweenMax.from($('.voucher-desc'), 1.6, {y: 100, alpha: 0});
});