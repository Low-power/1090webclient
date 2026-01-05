/*
Copyright (c) 2019 Sam Lord
Copyright 2018-2026 Rivoreo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// === Settings ===

const RECEIVER_POSITION = [50.27, -3.70];
const INITIAL_POSITION = RECEIVER_POSITION;
const INITIAL_ZOOM_LEVEL = 8;
const DUMP1090_HTTP_URL_BASE = null;
//const DUMP1090_HTTP_URL_BASE = "http://192.168.1.116:8080";
const USE_METRIC_UNITS = false;

// Time between data fetches in seconds
var dataFetchBreakTime = 1;
// How long to wait until we remove planes from the map (seconds)
const PLANE_TIMEOUT = 50;
// On/off toggle for heatmap
var heatMapActive = true;

// === End Settings

if(typeof Object.values !== "function") {
	Object.values = function(o) {
		if(typeof o === "undefined") throw new TypeError("Cannot convert undefined");
		if(o === null) throw new TypeError("Cannot convert null");
		return Object.keys(o).map(function(key) { return o[key]; });
	};
}

// In-mem plane storage
var activePlanes = {};

// public events for current planes
window.planeAnnouncements = [];

// === Leaflet map setup ===
var planeMap = L.map("planeMap").setView(INITIAL_POSITION, INITIAL_ZOOM_LEVEL);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
		attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
	}).addTo(planeMap);
L.marker(RECEIVER_POSITION, {
		icon:new L.Icon.Default({iconSize:[12,20], iconAnchor:[6,20], shadowSize:[20,20]}),
		zIndexOffset:-1000
	}).addTo(planeMap);
var markers = L.layerGroup().addTo(planeMap);

var DivControl = L.Control.extend({
		onAdd:function() {
			return L.DomUtil.create("div", this.options.className);
		}
	});
var info_box = new DivControl({ className:"control infobox", position:"bottomleft" });
var info_div = info_box.addTo(planeMap).getContainer();
L.DomEvent.on(info_div, "click dblclick mousemove mousedown mousewheel wheel drag scroll select", L.DomEvent.stopPropagation);
var update_indicator = new DivControl({ className:"control", position:"topright" });
var update_indicator_div = update_indicator.addTo(planeMap).getContainer();
L.control.scale({ position:"bottomright" }).addTo(planeMap);

// Heatmap setup
var heat = L.heatLayer([], {radius:10}).addTo(planeMap);

var addPlanePath = function(plane) {
    plane.path = L.polyline([], {color:"black"}).addTo(planeMap);
}

// === End map setup ===

/**
 * Remove plane from the system
 * @param {*} plane 
 */
var removePlane = function(plane) {
    if(plane.path) {
        planeMap.removeLayer(plane.path);
    }
    delete activePlanes[plane.hex];
};

/**
 * Fetch new data from the server
 * @param {Function} callbback Called with state change and XMLHttpRequest
 */
var getNewData = function(callback, next_update_in_sec) {
	//console.log(next_update_in_sec);
	const url = DUMP1090_HTTP_URL_BASE ? DUMP1090_HTTP_URL_BASE + "/dump1090/data.json" : "dump1090/data.json";
	const req = new XMLHttpRequest();
	req.open("GET", url);
	req.send();
	req.onreadystatechange = function(event) {
		if(this.readyState !== XMLHttpRequest.DONE) return;
		if(this.status === 200) {
			callback(this);
			update_indicator_div.textContent = "";
		} else {
			update_indicator_div.textContent = "Failed to fetch data";
		}
		if(typeof next_update_in_sec === "number" && next_update_in_sec > 0) {
			setTimeout(getNewData.bind(null, callback, next_update_in_sec), next_update_in_sec * 1000);
		}
	};
	update_indicator_div.textContent = "Updating...";
};

/**
 * Takes server-returned plane object and converts to HTML info text
 * @param {*} plane 
 */
var planeToInfoPanel = function(plane) {
    if (plane.seen > PLANE_TIMEOUT - 10) return "Lost"; // 10 seconds before removal, flag as being lost
    //var infoPanel = "{" + plane.lat.toFixed(4) + "," + plane.lon.toFixed(4) + "}";
    var infoPanel = plane.lat.toFixed(4) + ", " + plane.lon.toFixed(4);
    if(typeof plane.altitude === "number") {
        infoPanel += "<br />Altitude " +
			(USE_METRIC_UNITS ? (plane.altitude * 0.3048).toFixed() + " m" : String(plane.altitude) + " ft");
    }
    if(typeof plane.validtrack === "number") {
        infoPanel += "<br />Heading " + String(plane.track) + "°";
    }
    if(typeof plane.speed === "number") {
        infoPanel += "<br />Speed " +
			(USE_METRIC_UNITS ? (plane.speed * 0.5144444444).toFixed() + " m/s" : String(plane.speed) + " kts");
    }
    infoPanel += "<br />Last seen " + String(plane.seen) + " s ago";
    if(plane.flight) {
        var flight = plane.flight.trim();
        infoPanel += "<br /><a href=\"https://uk.flightaware.com/live/flight/" + flight + "\" target=\"_blank\">" + flight + "</a>";
    }
    return infoPanel;
};

var announceCurrentPlanes = function() {
    window.planeAnnouncements.forEach(function(cb) { cb(activePlanes); });
	//for(var cb of window.planeAnnouncements) cb(activePlanes);
};

/**
 * Call this once to trigger the map continuous update
 */
var updateMap = function() {
    /**
     * Remove and re-add plane markers and info
     * @param {*} activePlanes Our plane repository
     */
    var drawMarkers = function(activePlanes) {
        // clear map markers
        markers.clearLayers();
        Object.values(activePlanes).forEach(function(plane) {
				if(!plane.validposition) return;
				addPlaneMarker(plane);
				updateHeatmapLayer(plane);
				addPathMarker(plane);
			});
    };
    /**
     * Update the heatmap with the location of a plane
     * Assumes valid coordinates
     * Ignores if plane has not been seen in 
     * @param {*} plane 
     */
    var updateHeatmapLayer = function(plane) {
        // Add heatmap markers for recent positions
        if(heatMapActive && plane.seen < dataFetchBreakTime + 1) {
            heat.addLatLng([plane.lat, plane.lon]);
        }
    };
    /**
     * Add a plane icon and hover info panel
     * @param {*} plane 
     */
    var addPlaneMarker = function(plane) {
		var image_path = plane.seen > PLANE_TIMEOUT - 10 ? "media/plane_gray.png" : "media/plane_black.png";
		var rotate = String(plane.track) + "deg";
		var newMarker = new L.Marker([plane.lat, plane.lon], {
				icon:new L.DivIcon({
						className:"infoPanel",
						html:"<img style=\"transform:rotate(" + rotate + "); -moz-transform:rotate(" + rotate + ");\" src=\"" + image_path + "\" />" +
							'<div class="infoText">' + planeToInfoPanel(plane) + '</div>',
						iconSize:[36,36]
					})
			});
		markers.addLayer(newMarker).addTo(planeMap);
    };
    var addPathMarker = function(plane) {
        if(!plane.path) {
            addPlanePath(plane);
        }
        plane.path.addLatLng(L.latLng(plane.lat, plane.lon));
    };
    /**
     * Used as callback for getNewData
     * Updates our in-mem plane repository including removing old planes
     * @param {*} res 
     * @param {*} http 
     */
    var updatePlanes = function(http) {
        if(!http.responseText) return;
        var now = Date.now();
        var newPlanes = JSON.parse(http.responseText);
        // Add/update with returned planes
        newPlanes.forEach(function(newPlane) {
            if(!activePlanes[newPlane.hex]) {
                newPlane.new = true;
                newPlane.first_seen = now;
            } else {
                newPlane.new = false;
                var storedPlane = activePlanes[newPlane.hex];
                newPlane.first_seen = storedPlane.first_seen;
                if(!newPlane.validposition) {
                    newPlane.lat = storedPlane.lat;
                    newPlane.lon = storedPlane.lon;
                    newPlane.validposition = storedPlane.validposition;
                }
                if(!newPlane.validtrack) {
                    newPlane.track = storedPlane.track;
                    newPlane.validtrack = newPlane.validtrack;
                }
                if(!newPlane.altitude) {
                    newPlane.altitude = storedPlane.altitude;
                }
                if(!newPlane.flight) {
                    newPlane.flight = storedPlane.flight;
                }
                if(!newPlane.speed) {
                    newPlane.speed = storedPlane.speed;
                }
                newPlane.path = storedPlane.path;
            }
            newPlane.last_seen = now;
            // Add or override
            activePlanes[newPlane.hex] = newPlane;
        });
        // include out of date planes in our update
        announceCurrentPlanes();
        // Remove out of date planes
        //for(var plane of newPlanes) {
        for(var i in newPlanes) {
            var plane = newPlanes[i];
            if(plane.seen > PLANE_TIMEOUT) {
                removePlane(plane);
            }
        }
        //for(var plane of Object.values(activePlanes)) {
        Object.values(activePlanes).forEach(function(plane) {
                if(now - plane.last_seen > PLANE_TIMEOUT * 1000) removePlane(plane);
            });
        drawMarkers(activePlanes);
    };

    getNewData(updatePlanes, dataFetchBreakTime);
};

updateMap();
