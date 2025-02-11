$(document).ready(function(){
    TweenMax.fromTo($('.voucher-wrapper'), 1, {ease: Elastic.easeOut.config(1, 0.8), scale: 0}, {ease: Elastic.easeOut.config(1, 0.3),scale:1, y: '-50%'})
    $(".redeem-btn").click(function(){
        showPopup();
    })
});

function showPopup(){
    $(".popup").show();
    var popup = TweenMax.fromTo($('.popup .popup-container'), 1, { ease: Elastic.easeOut.config(1, 0.3), transform: 'scale(0)' }, { ease: Elastic.easeOut.config(1, 0.3), transform: 'scale(1)' });
    popup.play();
    $(".popup-close").click(function(){
        hidePopup();
    })
}

function hidePopup(){
    $(".popup").fadeOut();
}