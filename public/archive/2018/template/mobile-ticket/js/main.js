$(document).ready(function(){
	new QRCode(document.getElementById("qr"), {text: "1234567", width: 180, height: 180});
	var pageContent = $('.page-content');
	var pageHeaderHeight = $('.page-header').height();
	$(window).bind('scroll', function() {
      
      var scrollTop = $(window).scrollTop();
      var elementOffset = pageContent.offset().top;
      var currentElementOffset = (elementOffset - scrollTop);
      var diffRatio = currentElementOffset / elementOffset;
      
      if(diffRatio >= 0){
      	$('.qr').css("opacity", diffRatio);
      	if(diffRatio <= 0.5){
      		$('.qr').css("opacity", 0);
      	}
            TweenMax.to($('.page-header'), 0.1, { height: pageHeaderHeight * diffRatio });
      	// $('.page-header').css("height", pageHeaderHeight * diffRatio + "px");
      }
   });

	$(".menu-toggle").click(function(e){
	    e.preventDefault();
	    $(".sidenav").addClass('active');
	    $(".overlay").fadeIn();
        $(".overlay").click(function(e){
            e.preventDefault();
            $(".sidenav").removeClass('active');
            $(".overlay").fadeOut();
        })
    })
});