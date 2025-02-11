$(document).ready(function(){
    $('.ui.dropdown').dropdown();
    $('.ui.rating').rating();

});

function showPopup(){
    $(".popup").show();
    var popup = TweenMax.fromTo($('.popup .popup-container'), 1, { ease: Elastic.easeOut.config(1, 0.3), transform: 'scale(0)' }, { ease: Elastic.easeOut.config(1, 0.3), transform: 'scale(1)' });
    popup.play();
}

function hidePopup(){
    $(".popup").fadeOut();
}