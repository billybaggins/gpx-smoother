/*

 This software is released under the MIT License.

 Copyright (c) 2013-2015, Brenda Zysman

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.

 */
$(document).ready(function(){

  var MAX_DOWNLOAD_SIZE = 1100000;
  var rawValues = [];
  var smoothValues = [];
  var ABOUT_HEIGHT = "400px";
  var UPDATE_HEIGHT = "600px";
  var eltLoadingIndicator = $("#loadingIndicator");
  var xml, newXML;
  var rawTotalSlope;
  var totalDistance;
  var eltFileName = $("#fileName");
  var eltGPXName = $("#gpxName");
  var eltGPXDescription = $("#gpxDescription");
  var eltDownloadStatus = $(".downloadStatus");
  var eltElevationStatus = $('.eleStatus');
  var eltNumPoints = $("#numPoints");
  var graph = new AreaGraph();
  var gpxFile= new GPXFile();

  /** Safe download filename from GPX track name (adds .gpx, strips illegal characters). */
  function fileNameFromGpxName(rawName) {
    var base = $.trim(String(rawName || ""));
    if (!base.length) {
      base = gpxFile.DEFAULT_GPXNAME;
    }
    base = base.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
    if (!base.length) {
      base = "track";
    }
    if (!/\.gpx$/i.test(base)) {
      base += ".gpx";
    }
    return base;
  }

  function syncFilenameFromGpxName() {
    gpxName = $.trim(eltGPXName.val());
    fileName = fileNameFromGpxName(gpxName);
    eltFileName.val(fileName);
  }

  var fileName = fileNameFromGpxName(gpxFile.DEFAULT_GPXNAME);
  var gpxName = gpxFile.DEFAULT_GPXNAME;
  var gpxDescription = gpxFile.DEFAULT_DESCRIPTION;

  var historyStack = [];
  var redoStack = [];
  var MAX_HISTORY = 50;

  function clonePointArray(arr) {
    return arr.map(function(p) { return jQuery.extend(true, {}, p); });
  }

  function pushHistory() {
    if (smoothValues.length === 0) return;
    historyStack.push({
      raw: clonePointArray(rawValues),
      smooth: clonePointArray(smoothValues)
    });
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
    redoStack.length = 0;
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    $('#undo').prop('disabled', historyStack.length === 0);
    $('#redo').prop('disabled', redoStack.length === 0);
  }

  function undo() {
    if (historyStack.length === 0) return;
    redoStack.push({
      raw: clonePointArray(rawValues),
      smooth: clonePointArray(smoothValues)
    });
    var snap = historyStack.pop();
    rawValues = snap.raw.map(function(p) { return jQuery.extend(true, {}, p); });
    smoothValues = snap.smooth.map(function(p) { return jQuery.extend(true, {}, p); });
    var previous = null;
    var totalSlope = 0;
    for (var i = 0; i < smoothValues.length; i++) {
      var pt = smoothValues[i];
      if (previous && pt.distance) pt.slope = (pt.ele - previous.ele) / pt.distance;
      totalSlope += pt.slope;
      previous = pt;
    }
    totalDistance = smoothValues.length ? smoothValues[smoothValues.length - 1].totalDistance : 0;
    refreshGraphFull(totalSlope);
    updateUndoRedoButtons();
  }

  function redo() {
    if (redoStack.length === 0) return;
    historyStack.push({
      raw: clonePointArray(rawValues),
      smooth: clonePointArray(smoothValues)
    });
    var snap = redoStack.pop();
    rawValues = snap.raw.map(function(p) { return jQuery.extend(true, {}, p); });
    smoothValues = snap.smooth.map(function(p) { return jQuery.extend(true, {}, p); });
    var previous = null;
    var totalSlope = 0;
    for (var i = 0; i < smoothValues.length; i++) {
      var pt = smoothValues[i];
      if (previous && pt.distance) pt.slope = (pt.ele - previous.ele) / pt.distance;
      totalSlope += pt.slope;
      previous = pt;
    }
    totalDistance = smoothValues.length ? smoothValues[smoothValues.length - 1].totalDistance : 0;
    refreshGraphFull(totalSlope);
    updateUndoRedoButtons();
  }

  function init() {

    $('#gpxFile').change(handleFileSelect);
    setupDragAndDrop();
    $("#downloadGPX").click(onDownloadGPX);
    $('#smooth').click(smooth);
    $('#setRange').click(setRange);
    $('#flatten').click(flatten);
    $('#elevate').click(elevate);
    $('#reducePoints').click(reducePoints);
    $('#reload').click(reloadValues);
    $('#pointUp').click(function() { adjustPoint(1); });
    $('#pointDown').click(function() { adjustPoint(-1); });
    $('#clearSelection').click(function() { graph.clearSelectedPoint(); });
    $('#deletePoints').click(deleteSelectedPoints);
    $('#addPointMode').click(function() {
      var on = !$(this).hasClass('active');
      $(this).toggleClass('active', on);
      graph.setAddPointMode(on);
    });
    $('#undo').click(undo);
    $('#redo').click(redo);
    graph.onPointClick(onPointSelected);
    graph.onPointDrag(onPointDragged);
    graph.onPointDragStart(onPointDragStart);
    graph.onChartAddPoint(onChartAddPoint);
    $(document).on('keydown', function(e) {
      if (e.key === 'Escape') {
        graph.clearSelectedPoint();
        $('#addPointMode').removeClass('active');
        graph.setAddPointMode(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (graph.getSelectedPointIndices().length > 0) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          adjustPoint(1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          adjustPoint(-1);
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          if ($(e.target).closest('input, textarea, select').length) return;
          e.preventDefault();
          deleteSelectedPoints();
        }
      }
    });
    $('.nav-bar button').click(toggleView);
    $('.chart-bar button').click(toggleChart);
    $(".show-original").click(onToggleOriginalDisplay);

    eltGPXName.change(function() {
      syncFilenameFromGpxName();
      updateXMLMetadata();
    });
    eltGPXDescription.change(function() {
      updateXMLMetadata();
    });

    updateUndoRedoButtons();
    // Check for the various File API support.
    if (window.File && window.FileReader && window.FileList) {
      // Great success! All the File APIs are supported.
    } else {
      alert('Sorry, this will not work in your browser, because file APIs are not fully supported.');
    }
  }

  function displaySlope(totalSlope, numValues) {
    var strSlope = '';
    if (numValues > 1) {
      totalSlope += .0000000005;  // Deal with floating point error
      strSlope = strSlope + parseInt((totalSlope / (numValues - 1) ) * 10000) / 100;
    }
    $('.avg').text(strSlope + '%');
    return(strSlope);
  }

  function updateUI(points, totalSlope) {
    displaySlope(totalSlope, points.length);
    graph.setLine(points, "modified", true);
    updateNewXML(gpxFile.generateNewGPX(newXML, points));
  }

  function toggleView(event) {
    var active = $(".nav-bar button.active");
    active.removeClass("active");
    if (active.hasClass("btnSmooth")) {
      $(".smootherView").hide();
    } else if (active.hasClass("btnAbout")) {
      var about = $(".about");
      about.hide();
      about.height(0);
    } else if (active.hasClass("btnUpdates")) {
      var newStuff = $(".newStuff");
      newStuff.hide();
      newStuff.height(0);
    }
    var targetButton = $(event.target);
    targetButton.addClass('active');
    if (targetButton.hasClass('btnAbout')) {
      var aboutSection =  $(".about");
      $("body,html").stop().animate({scrollTop: 0}, 444);
      aboutSection.show();
      aboutSection.stop().animate({height: ABOUT_HEIGHT, opacity: 1}, 555, "swing", function() {
      });
    } else if (targetButton.hasClass('btnUpdates')) {
      var updateSection =  $(".newStuff");
      $("body,html").stop().animate({scrollTop: 0}, 444);
      updateSection.show();
      updateSection.stop().animate({height: UPDATE_HEIGHT, opacity: 1}, 555, "swing", function() {
      });
    } else if (targetButton.hasClass('btnSmooth')) {
      $(".smootherView").show();
      if (graph) {
        graph.resize();
      }
    }
  }

  function toggleChart(event) {
    event.preventDefault();
    $('#addPointMode').removeClass('active');
    graph.setAddPointMode(false);
    var active = $(".chart-bar button");
    active.removeClass("active");
    var targetButton = $(event.target);
    targetButton.addClass('active');
    graph.graphType(targetButton.data("target"));
    graph.reset();
    if (rawValues.length)
      graph.setLine(rawValues, "original", true);
    if (smoothValues.length)
      graph.setLine(smoothValues, "modified", true);
  }

  function onToggleOriginalDisplay() {
    graph.showOriginal($('.show-original input').is(':checked'));
  }

   function smooth() {
    var dataLength = rawValues.length;
    if (dataLength === 0) return;
    pushHistory();

    var smoothingSize = Math.floor(Number(eltNumPoints.val())/2);
    if (smoothingSize < 2 || smoothingSize > dataLength / 2) {
      smoothingSize = 2;
      eltNumPoints.val(5);
    }

    var toSmooth = rawValues;
    if (smoothValues.length > 0) {
      toSmooth = smoothValues;
    }
    var selected = graph.selected();
    var startDistance = selected[0];
    var endDistance = selected[1];
    var distance = 0;
    var newElevations = [];
    for (var i = 0; i < dataLength; i++) {
      var sumValues = 0;
      var start = i - smoothingSize;
      if (start < 0) {
        start = 0;
      }
      var end = i + smoothingSize;
      if (end > dataLength - 1){
        end = dataLength - 1;
      }
      for (var j = start; j <= end; j++) {
        sumValues += toSmooth[j].ele;
      }
      newElevations.push(sumValues / (end - start + 1));
    }
    var newValues = [];
    var previous = null;
    var totalSlope = 0;
    for (i = 0; i < dataLength; i++) {
      var point = jQuery.extend(true, {},  toSmooth[i]);
      distance = distance + point.distance;
      if (distance >= startDistance && distance <= endDistance) {
        point.ele = newElevations[i];
        point.slope = 0;
        if (previous && point.distance) {
          point.slope = (point.ele - previous.ele) / point.distance;
        }
      }
      newValues.push(point);
      previous = point;
      totalSlope = totalSlope + point.slope;
    }
    smoothValues = newValues;
    updateUI(smoothValues, totalSlope);
   }

  function flatten() {
    var dataLength = rawValues.length;
    if (dataLength === 0) return;
    pushHistory();
    var toFlatten = rawValues;
    if (smoothValues.length > 0) {
      toFlatten = smoothValues;
    }
    var flatValues = [];
    var maxDelta = Math.abs(Number($("#maxDelta").val())) / 100;
    var previous = null;
    var totalSlope = 0;
    var selected = graph.selected();
    var startDistance = selected[0];
    var endDistance = selected[1];
    var distance = 0;
    for (var i = 0; i < dataLength; i++) {
      var point = jQuery.extend(true, {},  toFlatten[i]);
      if (previous) {
        distance = distance + point.distance;
        if (distance >= startDistance && distance <= endDistance) {
          var deltaSlope = point.slope - previous.slope;
          if (Math.abs(deltaSlope) > maxDelta) {
            if (deltaSlope > 0) {
              point.slope = previous.slope + maxDelta;
            } else if (deltaSlope < 0) {
              point.slope = previous.slope - maxDelta;
            }
          }
          point.ele = (point.slope * point.distance) + previous.ele;
        }
      }
      totalSlope = totalSlope + point.slope;
      flatValues.push(point);
      previous = point;
    }
    smoothValues = flatValues;
    updateUI(smoothValues, totalSlope);
  }

  function elevate () {
    var dataLength = rawValues.length;
    if (dataLength === 0) return;
    pushHistory();
    var toElevate = rawValues;
    if (smoothValues.length > 0) {
      toElevate = smoothValues;
    }
    var distance = 0;
    var elevatedValues = [];
    var elevateValue = Number($("#elevateValue").val());
    var selected = graph.selected();
    var startDistance = selected[0];
    var endDistance = selected[1];
    var totalSlope = 0;
    var previous = null;
    for (var i = 0; i < dataLength; i++) {
      var point = jQuery.extend(true, {},  toElevate[i]);
      distance = distance + point.distance;
      if (distance >= startDistance && distance <= endDistance) {
        point.ele = point.ele + elevateValue;
      }
      if (previous && point.distance) {
        point.slope = (point.ele - previous.ele) / point.distance;
      }
      totalSlope = totalSlope + point.slope;
      elevatedValues.push(point);
      previous = point;
    }
    smoothValues = elevatedValues;
    updateUI(smoothValues, totalSlope);
  }

  function reducePoints() {
    var dataLength = rawValues.length;
    if (dataLength === 0) return;
    var toReduce = smoothValues.length > 0 ? smoothValues : rawValues;
    var maxPoints = Math.max(10, Math.min(2000, Number($("#maxPoints").val()) || 700));
    if (toReduce.length <= maxPoints) return;
    var sampled = gpxFile.samplePointsByDistance(toReduce, maxPoints);
    rawValues = sampled;
    smoothValues = sampled.map(function(p) { return jQuery.extend(true, {}, p); });
    rawTotalSlope = 0;
    totalDistance = sampled.length ? sampled[sampled.length - 1].totalDistance : 0;
    for (var i = 0; i < sampled.length; i++) {
      rawTotalSlope += sampled[i].slope || 0;
    }
    historyStack = [];
    redoStack = [];
    $('#addPointMode').removeClass('active');
    graph.setAddPointMode(false);
    graph.clearSelectedPoint();
    xml = gpxFile.generateGPXFromPoints(sampled, gpxName, gpxDescription);
    graph.reset();
    graph.setLine(rawValues, "original", false);
    graph.setLine(smoothValues, "modified", true);
    displaySlope(rawTotalSlope, rawValues.length);
    updateNewXML(gpxFile.generateNewGPX(xml, smoothValues));
    updateUndoRedoButtons();
  }

  function setRange() {
    var dataLength = rawValues.length;
    if (dataLength === 0) return;
    pushHistory();
    var toFlatten = rawValues;
    if (smoothValues.length > 0) {
      toFlatten = smoothValues;
    }
    var flatValues = [];
    var maxSlope = Number($("#maxSlope").val()) / 100;
    var minSlope = Number($("#minSlope").val()) / 100;
    var selected = graph.selected();
    var startDistance = selected[0];
    var endDistance = selected[1];
    var distance = 0;
    var previous = null;
    var totalSlope = 0;
    for (var i = 0; i < dataLength; i++) {
      var point = jQuery.extend(true, {},  toFlatten[i]);
      if (previous) {
        var slope = toFlatten[i].slope;
        distance = distance + point.distance;
        if (distance >= startDistance && distance <= endDistance) {
          if (slope > maxSlope) {
            slope = maxSlope;
          } else if (slope < minSlope) {
            slope = minSlope;
          }
        }
        point.ele = (slope * point.distance) + previous.ele;
        point.slope = slope;
        totalSlope = totalSlope + point.slope;
      }
      flatValues.push(point);
      previous = point;
    }
    smoothValues = flatValues;
    updateUI(smoothValues, totalSlope);
  }

  function updateFilename() {
    var newName = eltFileName.val();
    newName = $.trim(newName);
    if (newName.length > 0) {
      fileName = newName;
    } else {
      syncFilenameFromGpxName();
    }
  }

  function updateXMLMetadata() {
    if (newXML) {
      gpxName = $.trim(eltGPXName.val());
      gpxDescription = $.trim(eltGPXDescription.val());
      newXML = $("#newXML").val();
      newXML = gpxFile.generateNewHeader(newXML, gpxName, gpxDescription);
      return updateNewXML(newXML);
    } else {
      return(null);
    }
  }

  function onDownloadGPX(event) {
    // Update before downloading (in case we haven't
    // lost focus from an input box)
    updateFilename();
    if (!updateXMLMetadata())
      event.preventDefault();
  }

  function updateNewXML(value) {
    var canDownload;
    newXML = gpxFile.formatXML(value);
    $("#newXML").val(newXML);
    var downloadGPX = $("#downloadGPX");
    var fileContents = 'File too large to download...';
    if (newXML.length > MAX_DOWNLOAD_SIZE) {
      eltDownloadStatus.show();
      canDownload = false;
    } else {
      eltDownloadStatus.hide();
      fileContents = encodeURIComponent(newXML);
      canDownload = true;
    }
    downloadGPX.attr('href', 'data:text/plain;charset=utf-8,' + fileContents);
    downloadGPX.attr('download', fileName);
    return(canDownload);
  }

  function refreshGraphFull(totalSlope) {
    displaySlope(totalSlope, smoothValues.length);
    graph.reset();
    graph.setLine(rawValues, "original", false);
    graph.setLine(smoothValues, "modified", true);
    if ($('#addPointMode').hasClass('active')) {
      graph.setAddPointMode(true);
    }
    xml = gpxFile.generateGPXFromPoints(smoothValues, gpxName, gpxDescription);
    updateNewXML(xml);
  }

  function deleteSelectedPoints() {
    if (rawValues.length <= 2) return;
    var indices = graph.getSelectedPointIndices();
    if (indices.length === 0) return;
    pushHistory();
    var totalSlope = gpxFile.deletePointsAtIndices(rawValues, smoothValues, indices);
    if (totalSlope === false) {
      historyStack.pop();
      updateUndoRedoButtons();
      alert("Cannot delete: the track must keep at least two points.");
      return;
    }
    graph.clearSelectedPoint();
    totalDistance = smoothValues.length ? smoothValues[smoothValues.length - 1].totalDistance : 0;
    refreshGraphFull(totalSlope);
    updateUndoRedoButtons();
  }

  function onChartAddPoint(distanceM, elevationM) {
    if (rawValues.length < 2) return;
    pushHistory();
    var totalSlope = gpxFile.insertPointAtDistance(rawValues, smoothValues, distanceM, elevationM);
    if (totalSlope === false) {
      historyStack.pop();
      updateUndoRedoButtons();
      return;
    }
    graph.clearSelectedPoint();
    totalDistance = smoothValues.length ? smoothValues[smoothValues.length - 1].totalDistance : 0;
    refreshGraphFull(totalSlope);
    updateUndoRedoButtons();
  }

  function onPointDragStart() {
    pushHistory();
  }

  function onPointDragged(pointIndex) {
    if (smoothValues.length === 0) return;
    var toAdjust = smoothValues;
    var dataLength = rawValues.length;
    var previous = null;
    var totalSlope = 0;
    for (var i = 0; i < dataLength; i++) {
      var point = toAdjust[i];
      if (previous && point.distance) {
        point.slope = (point.ele - previous.ele) / point.distance;
      }
      totalSlope += point.slope;
      previous = point;
    }
    updateUI(toAdjust, totalSlope);
  }

  function onPointSelected(point, index) {
    if (smoothValues.length === 0 && rawValues.length > 0) {
      smoothValues = rawValues.map(function(p) { return jQuery.extend(true, {}, p); });
      var totalSlope = 0;
      var previous = null;
      for (var i = 0; i < smoothValues.length; i++) {
        var pt = smoothValues[i];
        if (previous && pt.distance) {
          pt.slope = (pt.ele - previous.ele) / pt.distance;
        }
        totalSlope += pt.slope;
        previous = pt;
      }
      updateUI(smoothValues, totalSlope);
    }
    graph.setSelectedPoint(index);
  }

  function adjustPoint(direction) {
    var dataLength = rawValues.length;
    if (dataLength === 0) return;
    var indices = graph.getSelectedPointIndices();
    if (indices.length === 0) return;
    pushHistory();

    var step = Number($("#pointStep").val()) || 1;
    if (step <= 0) step = 1;
    var delta = direction * step;

    var toAdjust = smoothValues.length > 0 ? smoothValues : rawValues;
    if (smoothValues.length === 0) {
      smoothValues = toAdjust.map(function(p) { return jQuery.extend(true, {}, p); });
      toAdjust = smoothValues;
    }

    indices.forEach(function(idx) {
      if (idx >= 0 && idx < dataLength) {
        toAdjust[idx].ele += delta;
      }
    });

    // Recalculate slopes for affected points
    var previous = null;
    var totalSlope = 0;
    for (var i = 0; i < dataLength; i++) {
      var point = toAdjust[i];
      if (previous && point.distance) {
        point.slope = (point.ele - previous.ele) / point.distance;
      }
      totalSlope += point.slope;
      previous = point;
    }

    updateUI(toAdjust, totalSlope);
  }

  function reloadValues() {
    if (rawValues.length > 0) {
      $('#addPointMode').removeClass('active');
      graph.setAddPointMode(false);
      smoothValues = rawValues.map(function(p) { return jQuery.extend(true, {}, p); });
      historyStack = [];
      redoStack = [];
      graph.clearSelectedPoint();
      updateNewXML(gpxFile.generateNewGPX(newXML, rawValues));
      graph.reset();
      graph.setLine(rawValues, "original", false);
      graph.setLine(smoothValues, "modified", true);
      displaySlope(rawTotalSlope, rawValues.length);
      updateUndoRedoButtons();
    }
  }

  function parseValues() {
    $('#addPointMode').removeClass('active');
    graph.setAddPointMode(false);
    var gpxFileInfo = gpxFile.parseGPX(xml);
    gpxName = gpxFileInfo.gpxName;
    gpxDescription = gpxFileInfo.gpxDescription;
    rawTotalSlope =  gpxFileInfo.totalSlope;
    rawValues = gpxFileInfo.rawValues;
    totalDistance = gpxFileInfo.totalDistance;

    $("#gpxName").val(gpxName);
    $("#gpxDescription").val(gpxDescription);
    syncFilenameFromGpxName();
    displaySlope(rawTotalSlope, rawValues.length);
    historyStack = [];
    redoStack = [];
    smoothValues = rawValues.map(function(p) { return jQuery.extend(true, {}, p); });
    graph.setLine(rawValues, "original", false);
    graph.setLine(smoothValues, "modified", true);
    updateUndoRedoButtons();
    if (gpxFileInfo.bElevationAdded) {
      eltElevationStatus.show();
      updateNewXML(gpxFile.generateNewGPX(xml, rawValues));
    } else {
      eltElevationStatus.hide();
      updateNewXML(xml);
    }
  }

  function setupDragAndDrop() {
    var dropZone = document.getElementById('fileDropZone');
    if (!dropZone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function(eventName) {
      dropZone.addEventListener(eventName, function(evt) {
        evt.preventDefault();
        evt.stopPropagation();
      });
    });

    ['dragenter', 'dragover'].forEach(function(eventName) {
      dropZone.addEventListener(eventName, function() {
        $(dropZone).addClass('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(function(eventName) {
      dropZone.addEventListener(eventName, function() {
        $(dropZone).removeClass('drag-over');
      });
    });

    dropZone.addEventListener('drop', function(evt) {
      var files = evt.dataTransfer.files;
      if (files.length === 0) return;
      var file = files[0];
      if (!file.name.toLowerCase().endsWith('.gpx')) {
        alert('Please drop a .gpx file.');
        return;
      }
      loadFile(file);
    });
  }

  function loadFile(file) {
    var reader = new FileReader();
    eltLoadingIndicator.addClass('visible');
    reader.onload = function() {
      xml = reader.result;
      graph.reset();
      parseValues();
      eltLoadingIndicator.removeClass('visible');
    };
    reader.onerror = function() {
      eltLoadingIndicator.removeClass('visible');
      alert('Error reading file.');
    };
    reader.readAsText(file);
  }

  function handleFileSelect(evt) {
    var files = evt.target.files;
    if (files.length === 0)
      return;
    loadFile(files[0]);
  }

  init();

});