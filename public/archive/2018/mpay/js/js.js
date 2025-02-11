
updatePosition = function () {
    var heroBg = document.getElementById('hero-bg');
    var newPos = window.pageYOffset / 2;
    translateY(heroBg, newPos);
};

function translateY(elm, value) {
    var translate = 'translateY(' + value + 'px';
    elm.style['-webkit-transform'] = translate;
    elm.style['-moz-transform'] = translate;
    elm.style['-ms-transform'] = translate;
    elm.style['-o-transform'] = translate;
    elm.style.transform = translate;
}

$(document).ready(function () {
    $(window).on('scroll', updatePosition);
});

function init_map() {
    var myOptions = {zoom: 16,
        scaleControl: false,
        streetViewControl: false,
        scrollwheel: false, center: new google.maps.LatLng(3.0259216, 101.58222550000005), mapTypeId: google.maps.MapTypeId.ROADMAP};
    map = new google.maps.Map(document.getElementById("gmap_canvas"), myOptions);
    marker = new google.maps.Marker({map: map, position: new google.maps.LatLng(3.0259216, 101.58222550000005)});
    infowindow = new google.maps.InfoWindow({content: "<b>ManagePay Systems Berhad (887689-D)</b><br/>Lot 109-113, Jalan USJ21/10,<br/>47630 Subang Jaya"});
    google.maps.event.addListener(marker, "click", function () {
        infowindow.open(map, marker);
    });
    infowindow.open(map, marker);
}
google.maps.event.addDomListener(window, 'load', init_map);


new WOW().init();

jQuery(document).ready(function ($) {

    var options = {
        $FillMode: 2, //[Optional] The way to fill image in slide, 0 stretch, 1 contain (keep aspect ratio and put all inside slide), 2 cover (keep aspect ratio and cover whole slide), 4 actual size, 5 contain for large image, actual size for small image, default value is 0
        $AutoPlay: true, //[Optional] Whether to auto play, to enable slideshow, this option must be set to true, default value is false
        $AutoPlayInterval: 4000, //[Optional] Interval (in milliseconds) to go for next slide since the previous stopped if the slider is auto playing, default value is 3000
        $PauseOnHover: 1, //[Optional] Whether to pause when mouse over if a slider is auto playing, 0 no pause, 1 pause for desktop, 2 pause for touch device, 3 pause for desktop and touch device, 4 freeze for desktop, 8 freeze for touch device, 12 freeze for desktop and touch device, default value is 1

        $ArrowKeyNavigation: true, //[Optional] Allows keyboard (arrow key) navigation or not, default value is false
        $SlideEasing: $JssorEasing$.$EaseOutQuint, //[Optional] Specifies easing for right to left animation, default value is $JssorEasing$.$EaseOutQuad
        $SlideDuration: 800, //[Optional] Specifies default duration (swipe) for slide in milliseconds, default value is 500
        $MinDragOffsetToSlide: 20, //[Optional] Minimum drag offset to trigger slide , default value is 20
        //$SlideWidth: 600,                                 //[Optional] Width of every slide in pixels, default value is width of 'slides' container
        //$SlideHeight: 300,                                //[Optional] Height of every slide in pixels, default value is height of 'slides' container
        $SlideSpacing: 0, //[Optional] Space between each slide in pixels, default value is 0
        $DisplayPieces: 1, //[Optional] Number of pieces to display (the slideshow would be disabled if the value is set to greater than 1), the default value is 1
        $ParkingPosition: 0, //[Optional] The offset position to park slide (this options applys only when slideshow disabled), default value is 0.
        $UISearchMode: 1, //[Optional] The way (0 parellel, 1 recursive, default value is 1) to search UI components (slides container, loading screen, navigator container, arrow navigator container, thumbnail navigator container etc).
        $PlayOrientation: 1, //[Optional] Orientation to play slide (for auto play, navigation), 1 horizental, 2 vertical, 5 horizental reverse, 6 vertical reverse, default value is 1
        $DragOrientation: 1, //[Optional] Orientation to drag slide, 0 no drag, 1 horizental, 2 vertical, 3 either, default value is 1 (Note that the $DragOrientation should be the same as $PlayOrientation when $DisplayPieces is greater than 1, or parking position is not 0)

        $BulletNavigatorOptions: {//[Optional] Options to specify and enable navigator or not
            $Class: $JssorBulletNavigator$, //[Required] Class to create navigator instance
            $ChanceToShow: 2, //[Required] 0 Never, 1 Mouse Over, 2 Always
            $AutoCenter: 1, //[Optional] Auto center navigator in parent container, 0 None, 1 Horizontal, 2 Vertical, 3 Both, default value is 0
            $Steps: 1, //[Optional] Steps to go for each navigation request, default value is 1
            $Lanes: 1, //[Optional] Specify lanes to arrange items, default value is 1
            $SpacingX: 8, //[Optional] Horizontal space between each item in pixel, default value is 0
            $SpacingY: 8, //[Optional] Vertical space between each item in pixel, default value is 0
            $Orientation: 1, //[Optional] The orientation of the navigator, 1 horizontal, 2 vertical, default value is 1
            $Scale: false                                   //Scales bullets navigator or not while slider scale
        },
        $ArrowNavigatorOptions: {//[Optional] Options to specify and enable arrow navigator or not
            $Class: $JssorArrowNavigator$, //[Requried] Class to create arrow navigator instance
            $ChanceToShow: 1, //[Required] 0 Never, 1 Mouse Over, 2 Always
            $AutoCenter: 2, //[Optional] Auto center arrows in parent container, 0 No, 1 Horizontal, 2 Vertical, 3 Both, default value is 0
            $Steps: 1                                       //[Optional] Steps to go for each navigation request, default value is 1
        }
    };

    //Make the element 'slider1_container' visible before initialize jssor slider.
    $("#slider1_container").css("display", "block");
    var jssor_slider1 = new $JssorSlider$("slider1_container", options);

    //responsive code begin
    //you can remove responsive code if you don't want the slider scales while window resizes
    function ScaleSlider() {
        var bodyWidth = document.body.clientWidth;
        if (bodyWidth)
            jssor_slider1.$ScaleWidth(Math.min(bodyWidth, 1920));
        else
            window.setTimeout(ScaleSlider, 30);
    }
    ScaleSlider();

    $(window).bind("load", ScaleSlider);
    $(window).bind("resize", ScaleSlider);
    $(window).bind("orientationchange", ScaleSlider);
    //responsive code end
});

jQuery(document).ready(function ($) {
    var options = {
        $AutoPlay: true, //[Optional] Whether to auto play, to enable slideshow, this option must be set to true, default value is false
        $AutoPlaySteps: 1, //[Optional] Steps to go for each navigation request (this options applys only when slideshow disabled), the default value is 1
        $AutoPlayInterval: 0, //[Optional] Interval (in milliseconds) to go for next slide since the previous stopped if the slider is auto playing, default value is 3000
        $PauseOnHover: 0, //[Optional] Whether to pause when mouse over if a slider is auto playing, 0 no pause, 1 pause for desktop, 2 pause for touch device, 3 pause for desktop and touch device, 4 freeze for desktop, 8 freeze for touch device, 12 freeze for desktop and touch device, default value is 1

        $ArrowKeyNavigation: true, //[Optional] Allows keyboard (arrow key) navigation or not, default value is false
        $SlideEasing: $JssorEasing$.$EaseLinear, //[Optional] Specifies easing for right to left animation, default value is $JssorEasing$.$EaseOutQuad
        $SlideDuration: 4000, //[Optional] Specifies default duration (swipe) for slide in milliseconds, default value is 500
        $MinDragOffsetToSlide: 20, //[Optional] Minimum drag offset to trigger slide , default value is 20
        $SlideWidth: 200, //[Optional] Width of every slide in pixels, default value is width of 'slides' container
        $SlideHeight: 200, //[Optional] Height of every slide in pixels, default value is height of 'slides' container
        $SlideSpacing: 0, //[Optional] Space between each slide in pixels, default value is 0
        $DisplayPieces: 8, //[Optional] Number of pieces to display (the slideshow would be disabled if the value is set to greater than 1), the default value is 1
        $ParkingPosition: 0, //[Optional] The offset position to park slide (this options applys only when slideshow disabled), default value is 0.
        $UISearchMode: 1, //[Optional] The way (0 parellel, 1 recursive, default value is 1) to search UI components (slides container, loading screen, navigator container, arrow navigator container, thumbnail navigator container etc).
        $PlayOrientation: 1, //[Optional] Orientation to play slide (for auto play, navigation), 1 horizental, 2 vertical, 5 horizental reverse, 6 vertical reverse, default value is 1
        $DragOrientation: 1                                //[Optional] Orientation to drag slide, 0 no drag, 1 horizental, 2 vertical, 3 either, default value is 1 (Note that the $DragOrientation should be the same as $PlayOrientation when $DisplayPieces is greater than 1, or parking position is not 0)
    };

    var jssor_slider2 = new $JssorSlider$("slider2_container", options);

    //responsive code begin
    //you can remove responsive code if you don't want the slider scales while window resizes
    function ScaleSlider() {
        var bodyWidth = document.body.clientWidth;
        if (bodyWidth)
            jssor_slider2.$ScaleWidth(Math.min(bodyWidth, 1920));
        else
            window.setTimeout(ScaleSlider, 30);
    }
    ScaleSlider();

    $(window).bind("load", ScaleSlider);
    $(window).bind("resize", ScaleSlider);
    $(window).bind("orientationchange", ScaleSlider);
    //responsive code end
});

function init() {
    window.addEventListener('scroll', function (e) {
        var distanceY = window.pageYOffset || document.documentElement.scrollTop,
                shrinkOn = 100,
                header = document.querySelector("header");
        if (distanceY > shrinkOn) {
            classie.add(header, "smaller");
        } else {
            if (classie.has(header, "smaller")) {
                classie.remove(header, "smaller");
            }
        }
    });
}
window.onload = init();

$(document).ready(function () {
    //Handles menu drop down
    $('.dropdown-menu').find('form').click(function (e) {
        e.stopPropagation();
    });
});


//Breadcrumbs auto shrink
$(document).ready(function () {
    $(window).resize(function () {

        ellipses1 = $("#bc1 :nth-child(2)");
        if ($("#bc1 a:hidden").length > 0) {
            ellipses1.show();
        } else {
            ellipses1.hide();
        }

        ellipses2 = $("#bc2 :nth-child(2)");
        if ($("#bc2 a:hidden").length > 0) {
            ellipses2.show();
        } else {
            ellipses2.hide();
        }

    });

});
//end of Breadcrumbs auto shrink

//Facebook Comment box
(function (d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id))
        return;
    js = d.createElement(s);
    js.id = id;
    js.src = "//connect.facebook.net/en_US/sdk.js#xfbml=1&version=v2.4";
    fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'facebook-jssdk'));
//end of Facebook Comment box