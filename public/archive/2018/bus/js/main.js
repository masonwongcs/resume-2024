$(document).ready(function(){

  // Handlebar template
  var source   = $("#bus-template").html();
  var template = Handlebars.compile(source);

  var favouriteSource = $("#favourite-template").html();
  var favouriteTemplate = Handlebars.compile(favouriteSource);

  // Create new busList instance
  var busList = new LDB.Collection('busList');

  loadBusStopList();

  bindFocusEvent();

  $(".submit").click(function(){
    getBusStopData();
  });

  $(".favourite").click(function(){
    $(this).toggleClass("checked");
    var currentBus = $(".bus-id").val();

    if($(this).hasClass("checked")){
       if(currentBus !== ""){

          var item = {
            busNo: currentBus
          };

          // Check the current input is it stored in DB
          busList.find({ busNo: currentBus }, function(results){
            if(!results[0]){
              //If data not found in DB, save it
              busList.save(item, function(_item){
                toast(currentBus + " added");
              });
            }
          });
       }
    }else{
      deleteFavourite(currentBus)
      toast(currentBus + " removed");
    }
  });

  function getBusStopData(){
    var currentBus = $(".bus-id").val();

    $(".loading").addClass("show");

    $.ajax({
      url: "https://arrivelah.herokuapp.com/?id=" + currentBus
    }).done(function(data){
      
      if(data.services.length === 0){
        toast("No bus stop found");
      }

      $(".loading").removeClass("show");
      console.log(data);
      for(var i=0; i< data.services.length;i++){
        data.services[i].next.duration_min = Math.abs(Math.round(data.services[i].next.duration_ms/1000/60));
        data.services[i].subsequent.duration_min = Math.abs((data.services[i].subsequent.duration_ms/1000/60).toFixed(0));    
        if(data.services[i].next.duration_min < 2){
          data.services[i].next.status = "coming"
        } else if(data.services[i].next.duration_min > 9){
          data.services[i].next.status = "late"
        }
        
      }
      $(".result").html(template(data));
      for(var i=0; i< data.services.length;i++){
        showMap(data.services[i].next.lat,data.services[i].next.lng, data.services[i].no);
      }

    })

    bindBackToMain();
  }

  function loadBusStopList(){
    if(busList.items !== undefined){
      $(".result").html(favouriteTemplate(busList.items));
    }
    bindLoadBusStop();
    bindBusStopFavouriteButton();
  }

  function bindLoadBusStop(){
    $(document).on("click", ".bus-stop", function(){
      var currentBus = $(this).find("span").text().trim();
      $(".bus-id").val(currentBus);
      getBusStopData();
    });
  }

  function bindBusStopFavouriteButton(){
    $(document).on("click", ".bus-stop .delete", function(){
      var currentBus = $(this).siblings("span").text().trim();
      deleteFavourite(currentBus);
      $(this).parent(".bus-stop").fadeOut(200, function(){
        $(this).remove();
      })
    });
  }

  function deleteFavourite(currentBus){
    busList.find({ busNo: currentBus }, function(items){
        for(var i in items){
          items[i].delete();
        }
      });
  }

  function bindFocusEvent(){

    $(document).on("click", ".bus", function(){
      $(this).toggleClass("active");
      $(this).find(".back").click(function(){
        $(this).toggleClass("active");
      });
    });

    $(".bus-id").focus(function(){
      $(this).parent(".submit-input").addClass("focus");
    });

    $(".bus-id").blur(function(){
      $(".submit").click(function(){
        $(this).parent(".submit-input").addClass("focus");
      });
      if($(".result").is(':empty')){
        $(this).parent(".submit-input").removeClass("focus");
      }
    });
  }

  function bindBackToMain(){
    $(document).on("click", ".back-to-main", function(){
      $(".result .bus").each(function(){
        // setTimeout(function(){
          $(this).remove();
        // }, 200);
      })
      $(this).fadeOut(200, function(){
        $(this).remove();
      })
      $(".bus-id").val("");

      loadBusStopList();
    })
  }

  function showMap(lat,lng, bus){
    initialize();
    // In this example, we center the map, and add a marker, using a LatLng object
      // literal instead of a google.maps.LatLng object. LatLng object literals are
      // a convenient way to add a LatLng coordinate and, in most cases, can be used
      // in place of a google.maps.LatLng object.

      var map;
      function initialize() {
        var mapOptions = {
          zoom: 16,
          center: {lat: lat, lng: lng}
        };
        map = new google.maps.Map(document.getElementById('bus-' + bus),
            mapOptions);

        var marker = new google.maps.Marker({
          // The below line is equivalent to writing:
          // position: new google.maps.LatLng(-34.397, 150.644)
          position: {lat: lat, lng: lng},
          map: map
        });

        // You can use a LatLng literal in place of a google.maps.LatLng object when
        // creating the Marker object. Once the Marker object is instantiated, its
        // position will be available as a google.maps.LatLng object. In this case,
        // we retrieve the marker's position using the
        // google.maps.LatLng.getPosition() method.
        var infowindow = new google.maps.InfoWindow({
          content: '<p>Marker Location:' + marker.getPosition() + '</p>'
        });

        google.maps.event.addListener(marker, 'click', function() {
          infowindow.open(map, marker);
        });
      }

      google.maps.event.addDomListener(window, 'load', initialize);
  }

  function toast(msg){
    $("<div class='toast'><h3>"+msg+"</h3></div>")
    .css({ display: "block", 
      opacity: 0.90, 
      position: "fixed",
      padding: "0 7px",
      "text-align": "center",
      width: "270px",
      left: ($(window).width() - 284)/2,
      bottom: "5rem"},
      )
    .appendTo( $(".content-wrapper") ).delay( 1500 )
    .fadeOut( 400, function(){
      $(this).remove();
    });
  }
});