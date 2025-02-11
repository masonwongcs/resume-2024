$(document).ready(function(){
	$(".menu ul li a").click(function(e){
		e.preventDefault();
		$(this).parent("li").addClass("active");
		$(".menu ul li").not($(this).parent("li")).removeClass("active");

		var selected = $(this).data("nav");
		console.log(selected);
		$(".content").find('div[data-nav="' + selected + '"]').addClass("active");
		$(".content").find('div').not('div[data-nav="' + selected + '"]').removeClass("active");
	});

	toggleStart();
	changeStopWatchColor();

	function toggleStart(){
		$(".start-btn").click(function(){

			$(".result-container").addClass("started");
			$(".start-line").addClass("hide");

			TweenMax.fromTo('#audience', 1 ,{x: "-50%", repeat: -1, ease:Linear.easeNone},{x: "50%", repeat: -1, ease:Linear.easeNone})
			TweenMax.fromTo('#road', 0.4 ,{x: "0%", repeat: -1, ease:Linear.easeNone},{x: "50%", repeat: -1, ease:Linear.easeNone})

			setCurrSpeed();
		})
	}

    function changeStopWatchColor() {
        let time =  30 * 1000;
        this.stopwatch = setInterval(()=>{

            time -= 1000

            $(".stopwatch .counter span").text(time/1000);

            if(time < 10000){
                $(".stopwatch .circle").addClass("green");
            }

            if(time < 1){

                $(".stopwatch .circle").addClass("green");
                $(".stopwatch .counter span").text("GO");
                $(".stopwatch-container").addClass("hide");
                clearInterval(this.stopwatch)

                setTimeout(()=>{
                    $(".stopwatch-container").addClass("hidden");
                },1000)

                // this.toggleStartAnimation()
            }
        },1000)
    }

	setCurrSpeed = () =>{
        let currCar = 0;
        let randomArray, randomCars;
        const START_IN_ORDER = true;
        let currSpeedArr = [0,0,0,0,0,0,0,0,0,0];

        this.interval = setInterval(()=>{

            if(currCar === 0)
                randomArray = getRandomArray(randomArray);
                randomCars = getRandomArray(randomCars);

            // START_IN_ORDER ?
				currSpeedArr[currCar] = randomArray[0];
                setCurrentCarSpeed(currCar, randomArray[0]);
                // : currSpeedArr = currSpeedArr.set(randomCars[0], randomArray[0])

            randomArray.push(randomArray.shift());
            randomCars.push(randomCars.shift());

            currCar += 1;
            if(currCar === 10) currCar = 0;
        }, 400)
    }

	getRandomArray=(array)=>{
        if(array){
            return shuffle(array);
        }
        return shuffle([1,2,3,4,5,6,7,8,9,10]);
    }

    setCurrentCarSpeed =(cars, speed) =>{
        // console.log(cars, speed)
        TweenMax.to(`#cars-${cars + 1}`, 0.1 ,{x: `-${(speed - 1 )*20}vw`, ease:Linear.easeNone});
        if(speed >= 6){
            TweenMax.to(`#cars-${cars + 1} span`, 0.1 ,{opacity: 1, ease:Linear.easeNone});
        }else{
            TweenMax.to(`#cars-${cars + 1} span`, 0.1 ,{opacity: 0, ease:Linear.easeNone});
        }
        // console.log(`-${(speed - 1 )*9}vw`)
    }

    shuffle = (array) =>{
        let currentIndex = array.length;
        let temporaryValue, randomIndex;

        while(0 !== currentIndex){
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;

            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }
        return array;
    }
});