/*
Copyright (c) 2019 Sam Lord
Copyright 2018-2025 Rivoreo

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

//var infoDiv = document.getElementById("infoDiv");
var info_boxes = document.getElementsByClassName("infobox");
var infoDiv = info_boxes.item(0);

var planeToText = function(plane) {
    const flight = plane.flight.trim();
    flightLink = flight === "" ?
		"No name" : "<a href=\"https://uk.flightaware.com/live/flight/" + flight + "\" target=\"_blank\">" + flight + "</a>";
    const validString = plane.validposition ? "valid" : "invalid";
    const positionString = plane.validposition ?
		("(" + String(plane.lat) + "," + String(plane.lon) + "@" + plane.altitude + ")") : ("(?,?@" + plane.altitude + ")");
    const timeString = "Seen " + plane.seen + " sec ago";
    return flightLink + ",(" + plane.hex + "): " + validString + " - " + positionString + ". " + timeString;
};

var planesToText = function(planes) {
	const values = Object.values(planes);
	if(values.length == 0) return "None tracked";
	var text = "";
	values.forEach(function(plane) { text += planeToText(plane) + "<br>\n"; });
	//for(var plane of values) text += planeToText(plane) + "<br>\n";
	return text;
};

var planeUpdate = function(planes) {
    infoDiv.innerHTML = planesToText(planes);
};

window.planeAnnouncements.push(planeUpdate);