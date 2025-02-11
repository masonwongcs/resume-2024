$(document).ready(function(){
    $('.ui.dropdown').dropdown();
    $('.ui.rating').rating();
	var currentPage = 1;
	$(".btn.next").off().on("click", function(e){
		e.preventDefault();
		var totalQuestion = $(".survey-form .question").length;
		var currentPageElem = $(".survey-form .question.survey-" + currentPage);

		if($(this).hasClass("done")){
			$(".survey-container").fadeOut();
			showPopup();
		} else{
            currentPageElem.removeClass("active").addClass("prev");
            currentPageElem.next().addClass("active");
            currentPage += 1;

            var progress = (currentPage / totalQuestion) * 100;

            $(".progress .bar").css('transform', 'translateX(' + (progress - 100 ) + '%)').attr("data-percentage", progress.toFixed(0));
            if(currentPage === totalQuestion){
                $(this).addClass("done");
                $(this).html('<i class="check icon"></i>')
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
}