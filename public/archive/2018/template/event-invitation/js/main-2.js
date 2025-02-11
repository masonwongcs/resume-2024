$(document).ready(function(){
    var envelope;
    var hoverInInteval;
    var hoverOutInterval;
    $('.envelope').hover(function(){
        clearInterval(hoverOutInterval);
        envelope = $(this);
        envelope.addClass('animate');
        hoverInInteval = setTimeout(function() {
            envelope.find('.content').addClass('animate');
        }, 200);

    }, function(){
        clearInterval(hoverInInteval)
        envelope.find('.content').removeClass('animate');
        hoverOutInterval = setTimeout(function(){
            envelope.removeClass('animate');
        }, 200);
    }).click(function(){
        envelope.removeClass('animate');
        envelope.find('.content').removeClass('animate');
        envelope.addClass('view-content');
        envelope.unbind();
    });

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