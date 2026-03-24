GPXFile = function() {

  var gpxFile = {};
  gpxFile.DEFAULT_GPXNAME = "Smoothed Ride";
  gpxFile.DEFAULT_DESCRIPTION = "Created by the MeteoPace GPX tool.";
  gpxFile.DEFAULT_ELEVATION_METRES = 100;

  // formatXML taken from https://gist.github.com/sente/1083506 (Stuart Powers)
  gpxFile.formatXML = function (xml) {
    var formatted = '';
    var reg = /(>)(<)(\/*)/g;
    xml = xml.replace(reg, '$1\r\n$2$3');
    xml = xml.replace(/ xmlns=""/g, '');
    var pad = 0;
    jQuery.each(xml.split('\r\n'), function(index, node) {
      node = $.trim(node);
      var indent = 0;
      if (node.match( /.+<\/\w[^>]*>$/ )) {
        indent = 0;
      } else if (node.match( /^<\/\w/ )) {
        if (pad != 0) {
          pad -= 1;
        }
      } else if (node.match( /^<\w[^>]*[^\/]>.*$/ )) {
        indent = 1;
      } else {
        indent = 0;
      }
      var padding = '';
      for (var i = 0; i < pad; i++) {
        padding += '  ';
      }
      formatted += padding + node + '\r\n';
      pad += indent;
    });
    return formatted;
  };

  gpxFile.generateNewHeader = function (xml, gpxName, gpxDescription) {
    var gpxDoc = $.parseXML(xml);
    if (gpxName || gpxDescription) {
      var metaData = $(gpxDoc).find('metadata');
      if (metaData.length > 0) {
        if (gpxName && gpxName.length > 0) {
          var eltName = metaData.find('name');
          if (eltName.length > 0) {
            eltName[0].textContent = gpxName;
          }
        }
        if (gpxDescription && gpxDescription.length > 0) {
          var eltDescription = metaData.find('desc');
          if (eltDescription.length > 0) {
            eltDescription[0].textContent = gpxDescription;
          }
        }
      }
    }
    return(new XMLSerializer()).serializeToString(gpxDoc);
  };

  gpxFile.generateNewGPX = function (xml, dataValues) {
    var gpxDoc = $.parseXML(xml);
    var eleTrkpt =  $(gpxDoc).find('trkpt');
    var numPoints = eleTrkpt.length;
    for (var iDataValue = 0; iDataValue < numPoints; iDataValue++) {
      var eleElevation = $(eleTrkpt[iDataValue]).find("ele");
      if (eleElevation.length > 0) {
        if (dataValues[iDataValue].ele !=  Number(eleElevation[0].textContent)) {
          eleElevation[0].textContent = dataValues[iDataValue].ele.toString();
        }
      } else {
        var newElevation = gpxDoc.createElement("ele");
        newElevation.appendChild(gpxDoc.createTextNode(dataValues[iDataValue].ele.toString()));
        eleTrkpt[iDataValue].appendChild(newElevation);
      }
    }
    return(new XMLSerializer()).serializeToString(gpxDoc);
  };

  /**
   * Generate a complete GPX from an array of points (used when point count differs from original).
   * Points: { lat, long, ele }
   */
  gpxFile.generateGPXFromPoints = function (points, gpxName, gpxDescription) {
    gpxName = gpxName || gpxFile.DEFAULT_GPXNAME;
    gpxDescription = gpxDescription || gpxFile.DEFAULT_DESCRIPTION;
    var trkpts = points.map(function(p) {
      return '    <trkpt lat="' + p.lat + '" lon="' + p.long + '">\n      <ele>' + p.ele + '</ele>\n    </trkpt>';
    }).join('\n');
    var gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx>\n  <metadata>\n    <name>' + escapeXml(gpxName) + '</name>\n    <desc>' + escapeXml(gpxDescription) + '</desc>\n  </metadata>\n  <trk>\n    <name>' + escapeXml(gpxName) + '</name>\n    <trkseg>\n' + trkpts + '\n    </trkseg>\n  </trk>\n</gpx>';
    return gpx;
  };

  function escapeXml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Sample points by distance along route to preserve geometry while reducing count.
   * Keeps first and last points.
   */
  gpxFile.samplePointsByDistance = function (points, maxPoints) {
    if (points.length <= maxPoints) {
      return points;
    }
    var totalDist = points[points.length - 1].totalDistance;
    if (!totalDist || totalDist <= 0) {
      return points;
    }
    var result = [jQuery.extend(true, {}, points[0])];
    var targetInterval = totalDist / (maxPoints - 1);
    var currentDist = 0;
    var nextTarget = targetInterval;
    for (var i = 1; i < points.length - 1; i++) {
      currentDist += points[i].distance;
      if (currentDist >= nextTarget) {
        result.push(jQuery.extend(true, {}, points[i]));
        nextTarget += targetInterval;
        if (result.length >= maxPoints - 1) break;
      }
    }
    result.push(jQuery.extend(true, {}, points[points.length - 1]));
    var prev = null;
    var totalSlope = 0;
    for (var j = 0; j < result.length; j++) {
      var pt = result[j];
      pt.distance = 0;
      pt.totalDistance = 0;
      pt.slope = 0;
      if (prev) {
        pt.distance = distVincenty(prev.lat, prev.long, pt.lat, pt.long);
        if (pt.distance) pt.slope = (pt.ele - prev.ele) / pt.distance;
        pt.totalDistance = prev.totalDistance + pt.distance;
      }
      totalSlope += pt.slope;
      prev = pt;
    }
    return result;
  };

  gpxFile.parseHeader = function(doc) {
    var metaData = $(doc).find('metadata');
    var gpxName = gpxFile.DEFAULT_GPXNAME;
    var gpxDescription = gpxFile.DEFAULT_DESCRIPTION;
    if (metaData.length > 0) {
      var eltName = metaData.find('name');
      if (eltName.length > 0) {
        var docName = eltName[0].textContent;
        docName = $.trim(docName);
        if (docName.length > 0) {
          gpxName = docName;
        }
      }
      var eltDescription = metaData.find('desc');
      if (eltDescription.length > 0) {
        var docDescription = eltDescription[0].textContent;
        docDescription = $.trim(docDescription);
        if (docDescription.length > 0) {
          gpxDescription = docDescription;
        }
      }
    }
    return {gpxName: gpxName, gpxDescription: gpxDescription};
  };

  /**
   * Recompute distance, totalDistance, and slope for each point (metres along route).
   * @returns {number} sum of per-segment slopes (same convention as parseGPX)
   */
  gpxFile.recalculatePointMetrics = function(points) {
    var previous = null;
    var totalDist = 0;
    var totalSlope = 0;
    for (var i = 0; i < points.length; i++) {
      var pt = points[i];
      pt.distance = 0;
      pt.totalDistance = 0;
      pt.slope = 0;
      if (previous) {
        pt.distance = distVincenty(previous.lat, previous.long, pt.lat, pt.long);
        if (pt.distance) {
          pt.slope = (pt.ele - previous.ele) / pt.distance;
        }
        totalDist += pt.distance;
        pt.totalDistance = totalDist;
      }
      totalSlope += pt.slope;
      previous = pt;
    }
    return totalSlope;
  };

  /**
   * Insert one track point at a distance along the route (metres from start).
   * Geometry is linearly interpolated between neighbours; raw elevation is interpolated,
   * smooth elevation is set by the caller. Mutates both arrays in place (same length).
   * @returns {false|number} false on failure, else total slope sum for the smooth track
   */
  gpxFile.insertPointAtDistance = function(rawPts, smoothPts, distanceMeters, smoothEle) {
    if (!rawPts || !smoothPts || rawPts.length !== smoothPts.length || rawPts.length < 2) {
      return false;
    }
    var eps = 0.75;
    var maxD = rawPts[rawPts.length - 1].totalDistance;
    if (distanceMeters <= eps || distanceMeters >= maxD - eps) {
      return false;
    }
    var insertIndex = -1;
    var t = 0;
    for (var i = 1; i < rawPts.length; i++) {
      var prevD = rawPts[i - 1].totalDistance;
      var nextD = rawPts[i].totalDistance;
      var segLen = nextD - prevD;
      if (segLen < eps * 2) {
        continue;
      }
      if (distanceMeters >= prevD + eps && distanceMeters <= nextD - eps) {
        insertIndex = i;
        t = (distanceMeters - prevD) / segLen;
        break;
      }
    }
    if (insertIndex < 0 || t <= 0 || t >= 1) {
      return false;
    }
    var rp = rawPts[insertIndex - 1];
    var rn = rawPts[insertIndex];
    var lat = rp.lat + t * (rn.lat - rp.lat);
    var lon = rp.long + t * (rn.long - rp.long);
    var rawEle = rp.ele + t * (rn.ele - rp.ele);
    smoothEle = Math.round(Number(smoothEle) * 10) / 10;
    rawEle = Math.round(rawEle * 10) / 10;
    var newRaw = { lat: lat, long: lon, ele: rawEle, distance: 0, totalDistance: 0, slope: 0 };
    var newSmooth = { lat: lat, long: lon, ele: smoothEle, distance: 0, totalDistance: 0, slope: 0 };
    rawPts.splice(insertIndex, 0, newRaw);
    smoothPts.splice(insertIndex, 0, newSmooth);
    gpxFile.recalculatePointMetrics(rawPts);
    return gpxFile.recalculatePointMetrics(smoothPts);
  };

  var MIN_TRACK_POINTS = 2;

  /**
   * Remove points at the given indices from both tracks (same indices in raw and smooth).
   * @returns {false|number} false on failure, else total slope sum for the smooth track
   */
  gpxFile.deletePointsAtIndices = function(rawPts, smoothPts, indices) {
    if (!rawPts || !smoothPts || rawPts.length !== smoothPts.length) {
      return false;
    }
    var uniq = {};
    var list = [];
    for (var i = 0; i < indices.length; i++) {
      var idx = indices[i];
      if (typeof idx !== "number" || idx !== Math.floor(idx) || idx < 0 || idx >= rawPts.length) {
        continue;
      }
      if (uniq[idx]) continue;
      uniq[idx] = true;
      list.push(idx);
    }
    if (list.length === 0) {
      return false;
    }
    if (rawPts.length - list.length < MIN_TRACK_POINTS) {
      return false;
    }
    list.sort(function(a, b) { return b - a; });
    for (var k = 0; k < list.length; k++) {
      rawPts.splice(list[k], 1);
      smoothPts.splice(list[k], 1);
    }
    gpxFile.recalculatePointMetrics(rawPts);
    return gpxFile.recalculatePointMetrics(smoothPts);
  };

  gpxFile.parseGPX = function (xml) {
    var rawValues = [];
    var previous =  null;
    var totalDistance = 0;
    var totalSlope = 0;
    var bElevationAdded = false;
    var doc = $.parseXML(xml);
    var fileInfo = gpxFile.parseHeader(doc);
    $(doc).find('trkpt').each(function(){
      var point =  {};
      point.lat = Number($(this).attr("lat"));
      point.long =  Number($(this).attr("lon"));
      var eleElevation = $(this).find("ele");
      if (eleElevation.length > 0) {
        point.ele =  Number(eleElevation[0].textContent);
      } else {
        // Add the elevation. TACX won't accept a track at zero elevation so
        // set it to the value of the previous point, or an arbitrary value of
        // 100 meters if there is no previous elevation.
        if (previous && previous.ele) {
          point.ele =  previous.ele;
        } else {
          point.ele =  gpxFile.DEFAULT_ELEVATION_METRES;
        }
        bElevationAdded = true;
      }
      point.distance = 0;
      point.totalDistance = 0;
      point.slope = 0;
      if (previous) {
        point.distance = distVincenty(previous.lat, previous.long, point.lat, point.long);
        if (point.distance) {
          point.slope = (point.ele - previous.ele) / point.distance;
        }
        totalDistance += point.distance;
        point.totalDistance = totalDistance;
      }
      totalSlope += point.slope;
      rawValues.push(point);
      previous = point;
    });
    fileInfo.rawValues = rawValues;
    fileInfo.bElevationAdded = bElevationAdded;
    fileInfo.totalSlope = totalSlope;
    fileInfo.totalDistance = totalDistance;
    return fileInfo;
  };

  return gpxFile;

};
