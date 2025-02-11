$(document).ready(function(){
    $('.ui.dropdown').dropdown();
    $('.ui.rating').rating();
    var currentPage = 1;
    var totalQuestion = $(".survey-form .question").length;
    for(var i = 1; i<= totalQuestion; i++){
        $(".progress").append('<div class="bar"></div>');
	}

	$(".progress .bar:nth-child(" + currentPage + ")").addClass("active");

    $(".question-cover .start-button").off().on("click", function(e){
    	e.preventDefault();
        TweenMax.to($(this).parent(".question-cover"), 1, { ease: Power4.easeOut, transform: 'translateY(-100vh)' });
        TweenMax.fromTo($(".survey-form"), 1, { ease: Power4.easeOut, transform: 'scale(0.7)' }, { ease: Power4.easeOut, transform: 'scale(1)' });
        setTimeout(function(){
            $(".question-cover").hide();
		}, 1000);
    });

    $(".btn.next").off().on("click", function(e){
        var currentPageElem = $(".survey-form .question.survey-" + currentPage);
        e.preventDefault();
        if($(this).hasClass("done")){
            $(".survey-container").fadeOut();
            showPopup();
        } else{
            currentPageElem.removeClass("active").addClass("prev");
            currentPageElem.next().addClass("active");
            currentPage += 1;

            var progress = (currentPage / totalQuestion) * 100;

            $(".progress .bar:nth-child(" + currentPage + ")").addClass("active");
            if(currentPage === totalQuestion){
                $(this).addClass("done");
                $(this).text('Submit')
            }
        }
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
    window.close();
}