$(document).ready(function() {

    particlesJS.load('particles-js', 'json/particles.json', function() {
        console.log('callback - particles.js config loaded');
    });

    $('#page-not-found').fadeIn();

    if ($('body').hasClass('error')) {
        TweenMax.to($(".overlay:nth-child(1)"), 1.5, { width: "83%" });
        TweenMax.to($(".overlay:nth-child(2)"), 1, { width: "156%" });

        let b = baffle('.four-o-four h3').start().set({ characters: '1234567890' });
        let c = baffle('.four-o-four h4').start().set({ characters: '█▒▓ ░' });

        $(".footer").fadeIn();
        setTimeout(function() {
            b.reveal(1000);
            c.reveal(1000);
        }, 2000);

        $("a#go-home").attr("href", getBaseUrl());

    } else {

        // Compile content
        var source = $("#content-template").html();
        var template = Handlebars.compile(source);

        $.getJSON("json/content.json", function(data) {
            var html = template(data);

            $(".tiles-content").append(html);

            $(".filter-wrapper").stick_in_parent();

            // Content hover animation
            // $(".content").hover(function() {
            //     TweenMax.to($(this).find("figure figcaption"), 0.2, { opacity: 1, y: '-20px', x: '-100%' });
            //     // $(this).find("figure figcaption").fadeToggle();
            // }, function() {
            //     TweenMax.to($(this).find("figure figcaption"), 0.2, { opacity: 0, y: '20px', x: '-100%' });
            // });

            $(".content").click(function() {

                var img = $(this).find("img");
                var content = "";
                if (img.length > 1) {
                    img.each(function() {
                        var imgAddr = $(this).attr("src");
                        var imgCaption = $(this).siblings("figcaption").html();
                        var imgDesc = $(this).siblings(".desc-text").html();

                        var images = '<figure><img src="' + imgAddr + '"/></figure>';
                        var title = '<h3>' + imgCaption + '</h3>';
                        var description = '<p class="desc-text">' + imgDesc + '</p>';
                        var string = images + title + description;
                        content += string;
                    });
                } else {
                    var imgAddr = img.attr("src");
                    var imgCaption = $(this).find("figcaption").html();
                    var imgDesc = $(this).find(".desc-text").html();

                    var images = '<figure><img src="' + imgAddr + '"/></figure>';
                    var title = '<h3>' + imgCaption + '</h3>';
                    var description = '<p class="desc-text">' + imgDesc + '</p>';
                    content = images + title + description;
                }

                $.sweetModal({
                    content: content
                });

                $(".main-wrapper").addClass("blur");

                $(".sweet-modal-close-link").click(function() {
                    $(".main-wrapper").removeClass("blur");
                });
            });
        });


        // TweenMax.to($(".overlay:nth-child(1)"), 1, { width: "73%" });
        // TweenMax.to($(".overlay:nth-child(2)"), 1.5, { width: "156%" });

        // Wait type js finished

        // setTimeout(function() {
        //     Typed.new('.header .name', {
        //         strings: ["HI, I'm <span class=\"m\">M</span><span class=\"a\">A</span><span class=\"s\">S</span><span class=\"o\">O</span><span class=\"n\">N</span>"],
        //         typeSpeed: 50
        //     });
        // }, 1000);

        var designSvg = new Vivus('design', { duration: 100 }, initParallax());
        var photographySvg = new Vivus('photography');


        setTimeout(function() {
            $(".scroll-me").fadeIn();

            // new Vivus('scroll-me', { duration: 100 }, initParallax());
            // new Vivus('line', { duration: 100 }, initParallax())
        }, 2000);

        setTimeout(function() {
            TweenMax.to('#photography', 1, { opacity: 1 });
        }, 7000);

        setInterval(function() {
            designSvg.play(-1);
            photographySvg.play(1);
            // TweenMax.to('#design', 1, { ease: Power4.easeOut, transform: 'translateY(-100vh)' });
        }, 5000);

        setInterval(function() {
            photographySvg.play(-1);
            designSvg.play(1);
        }, 10000);

        var tl = new TimelineMax({ repeat: -1, restart: true });
        tl.staggerFromTo($('.scroll-me .scroller'), 1, { opacity: 0, }, { opacity: 1 }, 0.3);

        setTimeout(function() {
            $('html, body').bind('mousewheel', function(e) {
                initHome();
                $(this).unbind();
            });

            $('.scroll-me').click(function() {
                initHome();
            });

        }, 3000);

        function initHome() {
            setTimeout(function() {
                setTimeout(function() {
                    $("body, html").removeClass("disable-scrolling");
                    TweenMax.to('.scroll-down', 0.2, { ease: Power4.easeOut, y: '0' });
                }, 4000);
                TweenMax.staggerTo('.overlay', 1.6, { ease: Power4.easeOut, height: 0 }, 0.3);

                $("#particles-js").fadeOut();
                $("#design").fadeOut();
                $("#photography").fadeOut();

                // TweenMax.to('.name', 1, { ease: Power4.easeOut, fontSize: '1.6rem', color: '#424242' });
                // TweenMax.to($('.name span'), 2, { ease: Power4.easeOut, fontSize: '2.3rem', color: '#424242' });
                $(".scroll-me").hide();

                setTimeout(function() {
                    $('#background-svg').fadeIn();
                    new Vivus('hamburger', { duration: 100 }, initParallax());
                    new Vivus('background-svg', { duration: 200 }, initParallax());
                }, 1000);
            }, 480);
        };

        // Shrink and unload bg
        setTimeout(function() {
            // TweenMax.staggerTo('.overlay', 1.6, { ease:  Power4.easeOut, width: 0 }, 0.3);
            // TweenMax.to('.name', 1, { ease: Power4.easeOut, fontSize: '1.6rem', color: '#424242' });
            // TweenMax.to($('.name span'), 2, { ease: Power4.easeOut, fontSize: '2.3rem', color: '#424242' });
        }, 4000);
    }

    $('.header .name').click(function() {
        new Vivus('background-svg', { duration: 200 }, initParallax());
    });

    $('.header .name').hover(function() {
        $(this).toggleClass("animate");
    });



    $("a[title]").parent("div").remove();

    $(".hamburger").click(function(e) {
        e.preventDefault();

        // $(".main-wrapper").toggleClass("drawer-open");

        // if($(this).hasClass("active")){
        // TweenMax.to($(".main-wrapper"),0.2,{y:'+=200px', transform: 'scale(1)'});
        // } else{
        TweenMax.to($(".main-wrapper"), 0.2, { transform: 'scale(0.93)', opacity: '0.4' });
        // }

        TweenMax.to($(".header"), 0.2, { borderRadius: '1.5rem' });

        $(".logo").toggleClass("logo-float");
        $(".close").fadeToggle(160);
        // $(".nav-wrapper").fadeToggle(160);

        $(".nav-wrapper").show();

        for (var i = 1; i <= $(".nav-list .nav-item").length; i++) {
            var j = i - 1;
            TweenMax.from($(".nav-list .nav-item")[j], 0.3, { y: "50px", delay: i * 0.03 });
            TweenMax.to($(".nav-list .nav-item")[j], 0.3, { opacity: '1', delay: i * 0.1 });
        }

        $(".hamburger-icon").toggleClass("transparent");
        $("body, html").toggleClass("disable-scrolling");
        // $(".bg").toggleClass("transparent");
    });

    $(".hamburger-icon").hover(function() {
        $(".hamburger-icon").find(".top").toggleClass("hamburger-expand-up");
        $(".hamburger-icon").find(".bottom").toggleClass("hamburger-expand-down");
    });

    $(".nav-wrapper .nav-item").click(function() {
        $("body, html").addClass("disable-scrolling");
        $(this).addClass("active");
        $(".nav-wrapper .nav-item").not($(this)).removeClass("active");
        var selected = $(this).find("a").attr("class");
        $(".main-wrapper").addClass("nav-open");
        if (!$(".drawer-content").is(':visible')) {
            $(".drawer-content").fadeIn(100);
            $(".drawer-content").removeClass("transparent");
        };
        $("#" + selected).parent(".drawer-wrapper").show();
        $(":not(#" + selected + ")").parent(".drawer-wrapper").hide();
        if (selected == "skills") {
            for (var i = 1; i <= $(".progress-bar progress").length; i++) {
                setTimeout('$(".skills li:nth-child(' + i + ') .progress-bar progress").addClass("show-progress")', i * 200);
            }
            for (var i = 1; i <= $(".skill-set li").length; i++) {
                setTimeout('$(".skill-set li:nth-child(' + i + ')").addClass("show")', i * 200);
            }
        } else {
            $(".progress-bar progress").removeClass("show-progress");
            $(".skill-set li").removeClass("show");
        }
        if (selected == "contact") {
            setTimeout('$(".contact .location iframe").addClass("show")', 1200);
            for (var i = 1; i <= $(".contact li").length; i++) {
                setTimeout('$(".contact li:nth-child(' + i + ')").addClass("show")', i * 200);
            }
        } else {
            $(".contact li").removeClass("show");
            $(".contact .location iframe").removeClass("show");
        }
        if (selected == "about") {
            setTimeout('$(".about .profile-pic").addClass("show")', 600);
            setTimeout('$(".about .profile .name").addClass("show")', 800);
            setTimeout('$(".about .profile .designation").addClass("show")', 1000);
        } else {
            $(".about .profile-pic").removeClass("show");
            $(".about .profile .name").removeClass("show");
            $(".about .profile .designation").removeClass("show");
        }
        if (selected == "experience") {
            for (var i = 1; i <= $("ul.experience li").length; i++) {
                setTimeout('$("ul.experience li:nth-child(' + i + ')").addClass("expand")', i * 200);
            }
        } else {
            $("ul.experience li").removeClass("expand");
        }
        $("html, body").addClass("bg-color-paused");
        $(".drawer-content").addClass("bg-color-paused");
        setTimeout('$(".drawer-content").removeClass("perspective")', 500);
    });

    $(".filter-item:not(:last-child)").click(function(e) {
        $(this).addClass("active");
        $(".filter-item").not($(this)).removeClass("active");
        var filterItem = $(this).find("a").text();
        if (filterItem == "Design") {
            // $('.content[data-type="design"]').removeClass("hide");
            // $('.content:not([data-type="design"])').addClass("hide");

            TweenMax.to($('.content[data-type="design"]'), 0.3, { width: '50%' });
            TweenMax.to($('.content[data-type="design"] figcaption'), 0.3, { transform: 'scaleX(1)' });
            TweenMax.to($('.content:not([data-type="design"])'), 0.3, { width: '0' });
            TweenMax.to($('.content:not([data-type="design"]) figcaption'), 0.3, { transform: 'scaleX(0)' });

        } else if (filterItem == "Photography") {
            // $('.content[data-type="photography"]').removeClass("hide");
            // $('.content:not([data-type="photography"])').addClass("hide");

            TweenMax.to($('.content[data-type="photography"]'), 0.3, { width: '50%' });
            TweenMax.to($('.content[data-type="photography"] figcaption'), 0.3, { transform: 'scaleX(1)' });
            TweenMax.to($('.content:not([data-type="photography"])'), 0.3, { width: '0' });
            TweenMax.to($('.content:not([data-type="photography"]) figcaption'), 0.3, { transform: 'scaleX(0)' });
        } else {
            // $('.content[data-type="design"]').removeClass("hide");
            // $('.content[data-type="photography"]').removeClass("hide");

            TweenMax.to($('.content[data-type="design"]'), 0.3, { width: '50%' });
            TweenMax.to($('.content[data-type="design"] figcaption'), 0.3, { transform: 'scaleX(1)' });
            TweenMax.to($('.content[data-type="photography"]'), 0.3, { width: '50%' });
            TweenMax.to($('.content[data-type="photography"] figcaption'), 0.3, { transform: 'scaleX(1)' });
        }
    });

    $(".close").hover(function() {
        TweenMax.to($(this), 0.3, { rotation: 90 });
    }, function() {
        TweenMax.to($(this), 0.3, { rotation: -90 });
    });


    $(".close").click(function(e) {
        e.preventDefault();
        // $(".main-wrapper").removeClass("drawer-open");

        var removeStyle = function() {
            $(".main-wrapper").attr("style", "");
        }

        TweenMax.to($(".main-wrapper"), 0.2, { y: '+=10%', transform: 'scale(1)', onComplete: removeStyle });

        TweenMax.to($(".header"), 0.2, { borderRadius: '0' });

        $(".logo").removeClass("logo-float");
        $(".close").fadeOut(160);

        for (var i = 1; i <= $(".nav-list .nav-item").length; i++) {
            var j = i - 1;
            TweenMax.to($(".nav-list .nav-item")[j], 0.2, { opacity: '0', delay: i * 0.1 });
        }

        $(".nav-wrapper").fadeOut(160);
        $(".nav-wrapper .nav-item").removeClass("active");
        $(".hamburger-icon").removeClass("transparent");
        $(".main-wrapper").removeClass("nav-open");
        $("body, html").removeClass("disable-scrolling");
        $(".drawer-content").fadeOut();
        $(".drawer-content").addClass("perspective")

        $(".progress-bar progress").removeClass("show-progress");
        $(".skill-set li").removeClass("show");

        $("html, body").removeClass("bg-color-paused");
        setTimeout('$(".bg").removeClass("transparent")', 1000);
    });


    $(".filter-item:last-child").click(function(e) {
        e.preventDefault();
        $("html, body").animate({
            scrollTop: 0
        }, 800);
    });

    $(".scroll-down").click(function(e) {
        e.preventDefault();
        $("html, body").animate({
            scrollTop: $(".main-content").offset().top
        }, 800);
    });

    $(".progress-bar progress").each(function() {
        $(this).val($(this).parent(".progress-bar").data("value"));
    });

    $(".content figure img").each(function(index) {

    });

    echo.init();

    function initParallax() {
        $(document).mousemove(function(e) {
            $('.laptop').parallax(-30, e);
            $('.mouse').parallax(60, e);
            // $('.scroll-me').parallax(60, e);
        });
    }

    function getBaseUrl() {
        var re = new RegExp(/^.*\//);
        return re.exec(window.location.href);
    }


});
