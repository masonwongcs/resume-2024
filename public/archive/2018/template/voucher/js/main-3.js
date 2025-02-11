$(document).ready(function(){
	TweenMax.from($(".voucher-wrapper .voucher-left"), 1, { rotationY: "90deg"}, {rotation : 0})
    TweenMax.from($(".voucher-wrapper .voucher-right"), 1, { rotationY: "-90deg"}, {rotation : 0})
});