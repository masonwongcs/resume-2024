$(document).ready(function () {
    $('.ui.dropdown').dropdown();
    $('.ui.rating').rating();
    TweenMax.fromTo($('.container'), 0.4, {y: -200, alpha: 0}, {y: 0, alpha: 1})
});