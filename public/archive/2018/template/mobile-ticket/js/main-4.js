$(document).ready(function () {
    new QRCode(document.getElementById("qr"), {text: "1234567", width: 180, height: 180});
    $(".ticket-footer .btn").click(function(e){
    	$(this).parents(".ticket-footer").addClass('active');
    	$(this).parents(".ticket-wrapper").addClass('active');
    	$(".qr-wrapper").click(function(){
    		$(this).siblings(".ticket-footer").removeClass('active');
    		$(this).parents(".ticket-wrapper").removeClass('active');
    	});
    })
});