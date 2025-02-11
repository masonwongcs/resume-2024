$(document).ready(function () {
    $('.btn').click(function () {
        var random_boolean = Math.random() >= 0.5;
        var that = $(this);
        $(this).addClass('loading');
        setTimeout(function () {
            that.removeClass('loading');
            that.text("OK");
            if(random_boolean){
                showMessage(random_boolean, "You won the rewards");
            } else{
                showMessage(random_boolean, "Try again next time");
            }

        }, 2000);
    });

    $(".instruction").click(function(e){
        e.preventDefault();
        showPopup();
    });
    $(".popup-close").click(function(){
        hidePopup();
    });
});

//Params : (Success or Failed) , Message
function showMessage(isSuccess, message) {
    var isSuccess = isSuccess, rewardsWrapper = $(".rewards-wrapper"), rewardsIcon;
    if (isSuccess) {
        rewardsWrapper.addClass("success");
        rewardsIcon = rewardsWrapper.find(".rewards-icon svg.success-icon");
    } else {
        rewardsWrapper.addClass("failed");
        rewardsIcon = rewardsWrapper.find(".rewards-icon svg.failed-icon");
    }
    rewardsWrapper.find(".content-message").text(message);
    TweenMax.fromTo(rewardsIcon, 0.4, {scale: 0, alpha: 0}, {scale: 1, alpha: 1})
}

function showPopup(){
    $(".popup").show();
    var popup = TweenMax.fromTo($('.popup .popup-container'), 1, { ease: Elastic.easeOut.config(1, 0.3), transform: 'scale(0)' }, { ease: Elastic.easeOut.config(1, 0.3), transform: 'scale(1)' });
    popup.play();
}

function hidePopup(){
    $(".popup").fadeOut();
}