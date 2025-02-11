$(document).ready(function(){
	new QRCode(document.getElementById("qr"), {text: "1234567", width: 180, height: 180});
    $(".menu-toggle").click(function(e){
        e.preventDefault();
        $(".sidenav").toggleClass('active');
    })
});