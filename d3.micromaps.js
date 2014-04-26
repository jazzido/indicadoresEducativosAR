var svg, censoData;
var pointsMargin = 20, pointsWidth = 350;
var rowHeight = 30, rowsPerGroup = 4;
var sourceMap;
var mapHeight = rowHeight * 4, mapWidth = 200;
var mapProjection = d3.geo.transverseMercator()
                      .rotate([62,0])
                      .translate([mapWidth / 2, mapHeight / 2]);
var mapPath = d3.geo.path().projection(mapProjection);
var mapProvinces;
var tableInitialized = false;
var selectedProvince, provinceData;
var colors = d3.scale.category10().range();
var transitionDuration = 750;
var YEARS = d3.range(+d3.select('input#year').node().min,
                       +d3.select('input#year').node().max + 1);
var sparklines_svg;
var sparklineStep = 10;
var sparkline_scalex = function(d, i) { return i * sparklineStep; };


// ES6 Array.prototype.findIndex polyfill
(function(globals){
  if (Array.prototype.findIndex) return;

  var findIndex = function(predicate) {
    var list = Object(this);
    var length = list.length >>> 0; // ES.ToUint32;
    if (length === 0) return -1;
    if (typeof predicate !== 'function') {
      throw new TypeError('Array#findIndex: predicate must be a function');
    }
    var thisArg = arguments.length > 1 ? arguments[1] : undefined;
    for (var i = 0; i < length && i in list; i++) {
      if (predicate.call(thisArg, list[i], i, list)) return i;
    }
    return -1;
  };

  if (Object.defineProperty) {

    try {
      Object.defineProperty(Array.prototype, 'findIndex', {
        value: findIndex, configurable: true, writable: true
      });
    } catch(e) {}
  }

  if (!Array.prototype.findIndex) {
    Array.prototype.findIndex = findIndex;
  }
})(this);

var to_id = function(str) {
  return str.replace(/\s+/g, '-').replace('.', '').toLowerCase();
};

var toFixed = function(value, precision) {
  var precision = precision || 0,
      neg = value < 0,
      power = Math.pow(10, precision),
      value = Math.round(value * power),
      integral = String((neg ? Math.ceil : Math.floor)(value / power)),
      fraction = String((neg ? -value : value) % power),
      padding = new Array(Math.max(precision - fraction.length, 0) + 1).join('0');

  return precision ? integral + '.' +  padding + fraction : integral;
};

var buildDataTable = function(data) {
  data.map(function(province) {
    province.name = province.id;
    province.id = to_id(province.id);
  });

  provinceData = data;

  d3.selectAll('#partidos div').remove();
  d3.select('#partidos')
    .selectAll('div')
    .data(data)
    .enter()
    .append('div')
    .style('top',
      function(d, i) {
        return (i * rowHeight) + 'px';
      });

  // quantile bands
  d3.range(0, data.length / 4)
    .forEach(function(d,i) {
    d3.select('#partidos')
      .append('div')
      .classed({band: true, even: i % 2 === 0, odd: i % 2 !== 0 })
      .style({top: (rowHeight * 4 * i) + 'px', height: (rowHeight * 4) + 'px' });
  });


  svg.selectAll('g.circle').remove();
  svg.attr('height', data.length * rowHeight);

  var circle_groups = svg.selectAll('g.circle')
                         .data(data)
                         .enter()
                         .append('g')
                         .classed('circle', true)
                         .attr('transform', function(d,i) {
                        return 'translate('+(pointsWidth/2)+','+(i*rowHeight + rowHeight / 2)+')';
                      });

  circle_groups.append('circle')
               .attr('fill', function(d, i) { return colors[i % rowsPerGroup]; })
               .attr('r', 5);

  circle_groups
    .append('text');


  d3.select('#extent-min').style('left', '260px');
  d3.select('#extent-max').style('left', pointsWidth + 260 + 'px');

  var sparklines = d3.select('svg#sparklines');
  sparklines.selectAll('g.sparkline').remove();
  sparklines.attr('height', data.length * rowHeight);

  var sparkline_groups = sparklines.selectAll('g.sparkline')
                                   .data(data)
                                   .enter()
                                   .append('g')
                                   .classed('sparkline', true)
                                   .attr('id', function(d) { return d.id; });

  sparkline_groups.append('path');
  sparkline_groups.append('circle').classed('min', true).attr('r', 2);
  sparkline_groups.append('circle').classed('max', true).attr('r', 2);

  d3.select('svg#sparklines')
    .on('click', function() {
    var i = Math.round(d3.mouse(this)[0] / sparklineStep);
    var s = window.location.hash.substr(1).split('/');
    window.location.hash = '#' + s.slice(0,2).join('/') + '/' + (i + YEARS[0]);
  });


  sparklines_svg.select('#year-line').remove();
  sparklines_svg.append('line')
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('x2', 0)
                .attr('y2', provinceData.length * rowHeight)
                .attr('stroke-dasharray', '3,3')
                .attr('stroke', 'red')
                .attr('stroke-width', 1)
                .attr('id', 'year-line')
                .style('opacity', 0.5);

  // delete micromaps
  d3.selectAll('#partidos svg.map').remove();
  setScale(sourceMap);
  // add micromaps (by cloning sourceMap)
  for (i = 0; i < data.length / rowsPerGroup; i++) {
    var c = d3.select('svg#clonethis').node().cloneNode(true);
    c.style.top = i * mapHeight + 'px';
    c.style.left = pointsWidth + 250 + 'px';
    c.style.visibility = 'visible';
    d3.select('#partidos').node().appendChild(c);
  }
};

var plotVariable = function(variable, year, level) {
  var indicador = variable + year + "_" + level;

  // point scale is calculated across the entire time period (years)
  var red = censoData.reduce(function(memo, prov) {
              return memo.concat(YEARS.map(function(y) {
                                   return parseFloat(prov[variable + y + '_' + level]);
                                 }));
            }, []);

  var ext = d3.extent(red);
  var scalex = d3.scale.linear()
                 .domain(ext)
                 .range([pointsMargin, pointsWidth - pointsMargin])
                 .nice();

  d3.select('#extent-min').html(toFixed(scalex.invert(0 - pointsMargin), 1) + '%');
  d3.select('#extent-max').html(toFixed(scalex.invert(pointsWidth + pointsMargin), 1) + '%');

  var sorted = censoData.sort(function(a,b) {
                 return +b[indicador] - +a[indicador];
               });

  var divs = d3.selectAll('#partidos div:not(.band)');
  divs.data(sorted);

  var transition = d3.select('body').transition().duration(transitionDuration),
      delay = function(d, i) { return 400 + i * 25; };


  var year_line_x = (year - d3.select('input#year').node().min) * sparklineStep + 1;
  sparklines_svg.select('#year-line')
                .transition()
                .attr('x1', year_line_x)
                .attr('x2', year_line_x);

  if (!tableInitialized) {
    divs.html(function(d) {
      return '<span class="name">' + d['name'] + '</span><span class="change"></span>';
    });
    plotSparklines(sorted, variable, level);
    tableInitialized = true;
  }
  else {
    transition.selectAll('#partidos div:not(.band)')
              .delay(delay)
              .style('top', function(d, i) {
      var cur = this.querySelector('span.name').innerHTML;
      var idx  = sorted.findIndex(function(e) {
                   return cur === e['name'];
                 });
      // check whether it goes up or down
      var new_top = (idx * rowHeight);
      var cur_top = parseInt(this.style.getPropertyValue('top'));
      if (cur_top > new_top) {
        d3.select(this.querySelector('span.change'))
          .style('opacity', 1)
          .classed('up', true)
          .classed('down', false)
          .classed('equal', false)
          .text('▲');
      }
      else if (cur_top < new_top) {
        d3.select(this.querySelector('span.change'))
          .style('opacity', 1)
          .classed('down', true)
          .classed('up', false)
          .classed('equal', false)
          .text('▼');
      }
      else {
        d3.select(this.querySelector('span.change'))
          .style('opacity', 1)
          .classed('down', false)
          .classed('up', false)
          .classed('equal', true)
          .text('=');

      }
      return new_top + 'px';
    })
              .each('end', function(e) {
      d3.select(this).select('span.change').transition().style('opacity', 0);
    });

    transition.selectAll('svg#sparklines g.sparkline')
              .delay(delay)
              .attr('transform', function(d, i) {
      var v = sorted.findIndex(function(e) {
                return d['name'] === e['name'];
              }) * rowHeight;
      return 'translate(2,' + v + ')';
    });
  }

  svg.selectAll('g.circle')
     .data(sorted)
     .transition()
     .delay(delay)
     .duration(transitionDuration)
     .attr('transform', function(d,i) {
    return 'translate('+(scalex(d[indicador]))+','+(i*rowHeight + rowHeight / 2)+')';
  });

  svg.selectAll('g.circle text')
     .text(function(d, i) {
    return toFixed(this.parentNode.__data__[indicador], 1) + '%';
  });

  d3.selectAll('#partidos .map path').style('fill', 'white');
  var _f = function(d,k) {
    return k == i;
  };
  for (var i = 0; i < sorted.length / rowsPerGroup; i++) {
    var m = d3.selectAll('#partidos svg.map')
              .filter(_f);
    for (var j = 0; j < rowsPerGroup; j++) {
      var d = sorted[i*rowsPerGroup + j];
      if (d === undefined) continue;
      m.selectAll('path#' + d.id)
       .style('fill', colors[j % rowsPerGroup]);
    }
  }
};


var plotSparklines = function(data, variable, level) {
  // scale_y common to all sparklines
  var red = data.reduce(function(memo, prov) {
              return memo.concat(YEARS.map(function(y) {
                                   return parseFloat(prov[variable + y + '_' + level]);
                                 }));
            }, []);

  var ext = d3.extent(red);
  var scale_y = d3.scale.linear()
                  .domain(ext)
                  .range([rowHeight - 5, 5]);
  var sparkline_gen = d3.svg.line()
                        .x(sparkline_scalex)
                        .y(scale_y);

  var sparkline_groups = d3.selectAll('svg#sparklines g.sparkline')
                           .data(data)
                           .attr('transform', function(d, i) {
                           return 'translate(2,' + (i * rowHeight) + ')';
                         });

  sparkline_groups.select('path')
                  .attr('d', function(d) {
    var d = YEARS.map(function(year) {
              return parseFloat(d[variable + year + "_" + level]);
            });
    return sparkline_gen(d);
  });

  sparkline_groups.select('circle.max')
                  .attr('transform', function(d, i) {
    var series = YEARS.map(function(year,i) {
                   return parseFloat(d[variable + year + "_" + level]);
                 });
    var max = d3.max(series);

    return 'translate('+sparkline_scalex(null, series.findIndex(function(v) { return v === max; }))+', '+scale_y(max)+')';

  });

  sparkline_groups.select('circle.min')
                  .attr('transform', function(d, i) {
    var series = YEARS.map(function(year,i) {
                   return parseFloat(d[variable + year + "_" + level]);
                 });
    var min = d3.min(series);
    return 'translate(' + (sparkline_scalex(null, series.findIndex(function(v) { return v === min; })))+', '+scale_y(min)+')';
  });



};



var setScale = function(map) {
  var k = 1.2;

  map.attr('transform',
    'translate(' + mapProjection.translate()[0] + ',' + mapProjection.translate()[1] + ')' +
      'scale(' + k + ')' +
      "translate(-104.07198674046933,-160.25584492248782)");

  map.selectAll('path').style('stroke-width', 1/(k*2) + 'px');
};

var buildMap = function(topology) {
  sourceMap = d3.select('body')
                .append('svg')
                .attr('height', mapHeight)
                .attr('width', mapWidth)
                .attr('id', 'clonethis')
                .attr('class', 'map')
                .append('g');

  mapProvinces = topojson.feature(topology, topology.objects.provincias);
  sourceMap.selectAll('path')
           .data(mapProvinces.features)
           .enter()
           .append('path')
           .attr('id', function(d) { return to_id(d.id); })
           .attr('provincia', function(d) { return to_id(d.id); })
           .attr('d', mapPath);
};


// code for handling hashchange and controls events sucks big time
// sorry a/b that.
d3.selectAll('select, input#year').on('change', function() {

  var sV = d3.select('select#variable').node();
  var sY = d3.select('input#year').node();
  var sL = d3.select('select#level').node();
  var selectedVariable = sV.options[sV.selectedIndex].value;
  var selectedYear = sY.value;
  var selectedLevel = sL.options[sL.selectedIndex].value;

  if (this !== window) {
    if (this.tagName === 'SELECT') { tableInitialized = false; }
    window.location.hash = '#' + [selectedVariable, selectedLevel, selectedYear].join('/');
  }
  plotVariable(selectedVariable, selectedYear, selectedLevel);
  d3.select('span#current-year').text(sY.value);
});


var parseHash = function(hash, force) {
  var selection = window.location.hash.substr(1).split('/');
  if (selection.length !== 3) { return };

  var sV = d3.select('select#variable');
  var sY = d3.select('input#year');
  var sL = d3.select('select#level');
  var selectedVariable = sV.node().options[sV.node().selectedIndex].value;
  var selectedYear = sY.node().value;
  var selectedLevel = sL.node().options[sL.node().selectedIndex].value;

  // validate hash pieces
  if (d3.selectAll('select#variable option')[0].findIndex(function(o) { return o.value === selection[0] }) === -1 ||
      d3.selectAll('select#level option')[0].findIndex(function(o) { return o.value === selection[1] }) === -1 ||
      (parseInt(selectedYear) < parseInt(sY.node().getAttribute('min')) &&
          parseInt(selectedYear) > parseInt(sY.node().getAttribute('max')))) {
    return;
  }

  // check for changes
  if (selectedVariable !== selection[0] || force) {
    sV.node().selectedIndex = d3.selectAll('select#variable option')[0].findIndex(function(o) { return o.value === selection[0]; });
    tableInitialized = false;
    sV.on('change')(sV.node());
  }

  if (selectedLevel !== selection[1]) {
    sL.node().selectedIndex = d3.selectAll('select#level option')[0].findIndex(function(o) { return o.value === selection[1]; });
    tableInitialized = false;
    sL.on('change')(sL.node());
  }

  if (selectedYear !== selection[2]) {
    sY.node().value = selection[2];
    sY.on('change')(sY.node());
  }

};


d3.select(window).on('hashchange', function() {
  parseHash(this.location.hash);
});

var ready = function(error, data, argentina) {
  censoData = data;
  buildMap(argentina);

  svg = d3.select('#container')
          .append('svg')
          .attr('width', pointsWidth)
          .attr('id', 'points');

  sparklines_svg = d3.select('#container')
                     .append('svg')
                     .attr('width', 100)
                     .attr('id', 'sparklines');


  buildDataTable(censoData, 2003, "egb_1");
  if (window.location.hash === '') {
    window.location.hash = '#abandono/egb_1/2003';
  }
  else {
    parseHash(window.location.hash, true);
  }

};

if (window.frameElement) { // for bl.ocks.org
  window.frameElement.contentWindow.document.body.scroll = 'yes';
  window.frameElement.scrolling = 'yes';
}

queue()
  .defer(d3.csv, 'indicadores.csv')
  .defer(d3.json, 'argentina-provincias.topojson')
  .await(ready);
