
var jQT = new $.jQTouch({ statusBar: "black-translucent", fullScreen: true, startupScreen: "startup.png" });

Function.prototype.setScope = function(obj) {
    var method = this, temp = function() {
        return method.apply(obj, arguments);
    };

    return temp;
}

String.prototype.pad = function(length, pad, type) {
    if (!String(pad).length || this.length >= length) return this.toString();
    var string = this;
    switch (type) {
        case 'left':
            while (string.length < length) string = pad + string;
            break;
        default:
            while (string.length < length) string += pad;
    }

    return string;
}

function statementError(tx, error) {
    console.log(error);
}

function transactionError(error) {
    console.log(error);
}

// Station
function Station(id, name) {
    this.id = id;
    this.name = name;
}

Station.fromRow = function(row) {
    return new Station(row["Id"], row["Name"]);
}

// TrainStop
function TrainStop(trainId, stationId, time, direction, dayType) {
    this.trainId = trainId;
    this.stationId = stationId;
    this.time = time;
    this.direction = direction;
    this.dayType = dayType;
    this.friendlyTime = Math.floor(time / 60).toString().pad(2, "0", "left") + ":" + (time % 60).toString().pad(2, "0", "left");
}

TrainStop.fromRow = function(row) {
    return new TrainStop(row["TrainId"], row["StationId"], row["Time"], row["Direction"], row["DayType"]);
}

// SchedulesRepository
function SchedulesRepository(db) {
    this.SQL_GET_STATIONS = "SELECT Id, Name FROM Stations"
    this.SQL_GET_NEXT_TRAIN = "SELECT TrainId, Time, StationId FROM TrainStops WHERE StationId = ? AND Time >= ? AND Direction = ? AND DayType = ? LIMIT 1"
    this.SQL_GET_TRAIN_ARRIVAL = "SELECT TrainId, Time, StationId FROM TrainStops WHERE TrainId = ? AND StationId = ? AND Time >= ? AND Direction = ? AND DayType = ? LIMIT 1"

    this.db = db;
    this.sqlErrorCallback = function(tx, error) {
        console.log(error);
    };

    this.getTrainDirection = function(originStationId, destinyStationId) {
        if (originStationId < destinyStationId) return 1
        return 2;
    };

    this.executeSql = function(sqlQuery, sqlParams, sqlCallback, sqlErrorCallback) {
        if (!sqlErrorCallback) sqlErrorCallback = this.sqlErrorCallback;
        var sqlTransaction = function(tx) { tx.executeSql(sqlQuery, sqlParams, sqlCallback, sqlErrorCallback); };
        this.db.transaction(sqlTransaction);
    };
}

SchedulesRepository.prototype.getStations = function(callback) {
    var sqlCallback = function(tx, result) {
        var stations = [];
        for (var i = 0; i < result.rows.length; i++) {
            stations.push(Station.fromRow(result.rows.item(i)));
        }

        callback(stations);
    }

    this.executeSql(this.SQL_GET_STATIONS, [], sqlCallback);
};

SchedulesRepository.prototype.getNextTrain = function(stationId, time, direction, dayType, callback) {
    var sqlCallback = function(tx, result) {
        if (result.rows.length == 0) {
            callback(null);
        } else {
            callback(TrainStop.fromRow(result.rows.item(0)));
        }
    };

    this.executeSql(this.SQL_GET_NEXT_TRAIN, [stationId, time, direction, dayType], sqlCallback);
};

SchedulesRepository.prototype.getTrainArrival = function(trainId, stationId, time, direction, dayType, callback) {
    var sqlCallback = function(tx, result) {
        if (result.rows.length == 0) {
            callback(null);
        } else {
            callback(TrainStop.fromRow(result.rows.item(0)));
        }
    };

    this.executeSql(this.SQL_GET_TRAIN_ARRIVAL, [trainId, stationId, time, direction, dayType], sqlCallback);
};

SchedulesRepository.prototype.getTrainSchedule = function(fromStationId, toStationId, time, dayType, callback) {
    var retry = function(departure, arrival, fromStationId, toStationId, time, dayType, callback) {
        if (arrival != null) {
            callback(departure, arrival);
        } else {
            var direction = this.getTrainDirection(fromStationId, toStationId);
            this.getNextTrain(fromStationId, time, direction, dayType, function(departure) {
                if (departure == null) return;
                time = departure.time + 1;
                this.getTrainArrival(departure.trainId, toStationId, time, direction, dayType, function(arrival) {
                    retry(departure, arrival, fromStationId, toStationId, time, dayType, callback);
                });
            } .setScope(this));
        }
    } .setScope(this);

    retry(null, null, fromStationId, toStationId, time, dayType, callback);

    return;
};

var allStations;
var repo;
var currFromStation;
var currToStation;
var changingStation = 0;

function getDefaults() {
	var from = localStorage.getItem('from');
	if(!from) from = 1;
	var to = localStorage.getItem('to');
	if(!to) to = 21;
	return { from: from, to: to };
}

function setDefaults() {
	localStorage.setItem('from', currFromStation);
	localStorage.setItem('to', currToStation);
}

function initApp(db) {
    repo = new SchedulesRepository(db);
    repo.getStations(function(stations) {
        allStations = stations;
        bindStations(stations);
        var defaults = getDefaults();
        load(defaults.from, defaults.to);
    });
}

function load(fromStation, toStation) {
    currFromStation = fromStation;
    currToStation = toStation;
    $("#fromStation").text("");
    $("#toStation").text("");
    retrieveSchedule(fromStation, toStation, new Date().getHours() * 60 + new Date().getMinutes(), 1);
}

function retrieveSchedule(fromStation, toStation, time, dayType) {
    var retrieveNextSchedule = function(fromStation, toStation, time, dayType, top) {
        repo.getTrainSchedule(fromStation, toStation, time, dayType, function(stopA, stopB) {
            var li = $("<li></li>").appendTo($("#stops"));
            var a = $("<time></time>")
                        .append(stopA.friendlyTime)
                        .append(" ... ")
                        .append(stopB.friendlyTime)
                        .appendTo(li);
            time = stopA.time + 1;
            if (top - 1 > 0) retrieveNextSchedule(fromStation, toStation, time, dayType, top - 1);
        } .setScope(this));
    } .setScope(this);

    $("#stops").empty();
    retrieveNextSchedule(fromStation, toStation, time, dayType, 3);

    $("#fromStation").text(getStation(fromStation).name).hide().fadeIn();
    $("#toStation").text(getStation(toStation).name).hide().fadeIn();
}

function getStation(id) {
    for (var i = 0; i < allStations.length; i++) {
        if (allStations[i].id == id) return allStations[i];
    }

    return null;
}


// Stations
function bindStations(stations) {
    $.each(stations, function(ix, station) {
        var li = $("<li class='a'></li>").appendTo($("#stations ul"));
        $("<a href='javascript:void(0)'></a>").appendTo(li)
        		  .append(station.name)
		      	  .click(function(e) {
				    var id = station.id;
				    currFromStation = changingStation == 1 ? id : currFromStation;
				    currToStation = changingStation == 2 ? id : currToStation;
				    jQT.goTo("#home");
				});
    });
}

// App Init
$(document).ready(function() {
    var displayOnlineStatus = function() {
        $("#status").text(navigator.onLine ? "Online" : "Offline");
    };

    $("#home").bind('pageAnimationEnd', function(e, info) {
        if (info.direction == "in") load(currFromStation, currToStation);
    });

    displayOnlineStatus();
    
    if (document.body) {
        document.body.addEventListener("online", displayOnlineStatus, true);
        document.body.addEventListener("offline", displayOnlineStatus, true);
    }

    $("#swapStations").click(function() {
        load(currToStation, currFromStation);
    });

    $("#fromStation").click(function() {
        changingStation = 1;
        jQT.goTo("#stations");
    });

    $("#toStation").click(function() {
        changingStation = 2;
        jQT.goTo("#stations");
    });
    
    $("#setDefault").click(function() {
    	if(confirm('Are you sure?')) {
    		setDefaults();
    	}
    });

    try {
        if (window.openDatabase) {
            var db = openDatabase("TrainScheduleX", "0.1", "Train Schedules Db", 200000);
            if (!db) {
                alert("Failed to open the database on disk.  This is probably because the version was bad or there is not enough space left in this domain's quota");
                return;
            }

            db.transaction(function(tx) {
                tx.executeSql(
							"SELECT COUNT(*) FROM Stations",
							[],
							function(result) { initApp(db); },
							function(tx, error) {
							    db.transaction(
									function(tx) { for (var i = 0; i < IMPORT_DB_SCRIPT.length; i++) tx.executeSql(IMPORT_DB_SCRIPT[i]); },
									transactionError,
									function() { initApp(db); });
							});
            });
        } else {
            alert("Couldn't open the database.  Please try with a WebKit nightly with this feature enabled");
        }
    } catch (err) { }
});