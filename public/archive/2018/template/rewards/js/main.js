$(document).ready(function(){
    var random_boolean = Math.random() >= 0.5;
    if(random_boolean){
    	$("#result").addClass("successful");
	}else{
        $("#result").addClass("failed");
	}
	$(".btn.next").click(function(){
		$(this).addClass("loading");
		var parent = $(this).parents(".reward-wrapper");
		
		//Ajax call here, now simulate with setTimeout
		setTimeout(function(){
		if(parent.next().hasClass("successful")){
			$("body").addClass("successful");
			$(".result.success").show();
			TweenMax.to($('.confetti'), 1, { ease: Elastic.easeOut.config(1, 0.3), transform: 'scale(1.5)' });
			
		} else if(parent.next().hasClass("failed")){
            $(".result.failed").show();
            $("body").addClass("failed");
        }
		else{
			TweenMax.to($('.confetti'), 1, { ease: Elastic.easeOut.config(1, 0.3), transform: 'scale(0)' });
			$("body").removeClass("successful");
            $("body").removeClass("failed");
		}

		TweenMax.to(parent, 0.6, {  ease: Elastic.easeOut.config(1, 0.3), transform: 'translateX(-100vw)' });
		TweenMax.to(parent.next(), 1, {  ease: Elastic.easeOut.config(1, 0.3), transform: 'translateX(0)' });
		}, 2000)
		
	})

    $(".instruction").click(function(e){
        e.preventDefault();
        showPopup();
    });
    $(".popup-close").click(function(){
        hidePopup();
    });
});

function showPopup(){
    $(".popup").show();
    var popup = TweenMax.fromTo($('.popup .popup-container'), 1, { ease: Elastic.easeOut.config(1, 0.3), transform: 'scale(0)' }, { ease: Elastic.easeOut.config(1, 0.3), transform: 'scale(1)' });
    popup.play();
}

function hidePopup(){
    $(".popup").fadeOut();
}