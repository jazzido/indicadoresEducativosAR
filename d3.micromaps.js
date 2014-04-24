var svg, censoData;
var pointsMargin = 10, pointsWidth = 300;
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
var transitionDuration = 500;
var YEARS = d3.range(+d3.select('input#year').node().min,
                     +d3.select('input#year').node().max + 1)
              .map(function(y) { return y.toString(); });


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
}

var buildDataTable = function(data) {
  data.map(function(province) {
    province.name = province.id;
    province.id = to_id(province.id)
  })

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

  d3.selectAll('svg#points circle').remove();
  d3.select('svg#points')
  .attr('height', data.length * rowHeight)
  .selectAll('circle')
  .data(data)
  .enter()
  .append('circle')
  .attr('cx', pointsWidth / 2)
  .attr('cy', function(d, i) {
    return i*rowHeight + rowHeight / 2;
  })
  .attr('r', 5)
  .attr('fill', function(d, i) { return colors[i % rowsPerGroup]; })
  .append('title');

  svg.select('#average-line').remove();
  svg.append('line')
  .attr('x1', pointsWidth/2)
  .attr('y1', 0)
  .attr('x2', pointsWidth/2)
  .attr('y2', provinceData.length * rowHeight)
  .attr('stroke-dasharray', '5,5')
  .attr('stroke', '#777')
  .attr('stroke-width', 1)
  .attr('id', 'average-line');


  d3.selectAll('svg#sparklines path').remove();
  d3.select('svg#sparklines')
  .attr('height', data.length * rowHeight)
  .selectAll('path')
  .data(data, function(d) { return d.id })
  .enter()
  .append('path')
  .attr('id', function(d) { return d.id; });

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
    c.style.left = '550px';
    c.style.visibility = 'visible';
    d3.select('#partidos').node().appendChild(c);
    d3.select(c)
    .on('mouseover', function(e) {
      d3.select(this).classed('scaled', true);
    })
    .on('mouseout', function(e) {
      d3.select(this).classed('scaled', false);
    });

  }

};

var plotVariable = function(variable, year, level) {
  var indicador = variable + year + "_" + level;

  // point scale is calculated across the entire time period (years)
  var ext = d3.extent(censoData.reduce(function(memo, prov) {
                          return memo.concat(YEARS.map(function(y) {
                                               return prov[variable + y + '_' + level];
                                             }));
                        }, []));

  var scalex = d3.scale.linear()
               .domain(ext)
               .range([pointsMargin, pointsWidth - pointsMargin])
               .nice();

  var mean = d3.mean(censoData, function(d) {
               return d[indicador];
             });

  d3.select('#extent-min').html(toFixed(scalex.invert(0 - pointsMargin), 2) + '%');
  d3.select('#extent-max').html(toFixed(scalex.invert(pointsWidth + pointsMargin), 2) + '%');
  svg.select('#average-line')
  .transition()
  .duration(transitionDuration)
  .attr('x1', scalex(mean))
  .attr('x2', scalex(mean));

  var sorted = censoData.sort(function(a,b) {
                 return +b[indicador] - +a[indicador];
               });

  var divs = d3.selectAll('#partidos div');
  divs.data(sorted);

  var transition = d3.select('body').transition().duration(transitionDuration),
      delay = function(d, i) { return i * 50 };


  sparklines_svg.select('#year-line')
    .transition()
    .attr('x1', (year - d3.select('input#year').node().min) * 12 + 1)
    .attr('x2', (year - d3.select('input#year').node().min) * 12 + 1);

  if (!tableInitialized) {
    divs.html(function(d) { return d['name'] });
    plotSparklines(sorted, variable, level);
    tableInitialized = true;
  }
  else {
    transition.selectAll('#partidos div')
    .delay(delay)
    .style('top', function(d, i) {
      var cur = this.innerHTML;
      return (sorted.findIndex(function(e) {
                return cur === e['name'];
              }) * rowHeight) + 'px';
    });

    transition.selectAll('svg#sparklines path')
    .delay(delay)
    .attr('transform', function(d, i) {
      var v = sorted.findIndex(function(e) {
                return d['name'] === e['name'];
              }) * rowHeight;
      return 'translate(0,' + v + ')';
    });
  }

    svg.selectAll('circle')
    .data(sorted)
    .transition()
    .duration(transitionDuration)
    .attr('cx', function(d) {
      return scalex(d[indicador]);
    })
    .attr('r', 5)
    .select('title')
    .text(function(d) {
      return d[indicador] + '%';
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
    var scale_y = d3.scale.linear()
                  .domain(d3.extent(data.reduce(function(memo, prov) {
                          return memo.concat(YEARS.map(function(y) {
                                               return prov[variable + y + '_' + level];
                                             }));
                        }, [])))
                  .range([rowHeight - 5, 5]);


    d3.selectAll('svg#sparklines path')
    .data(data)
    .attr('d', function(d) {
      console.log(d.name);
      var d = YEARS.map(function(year) {
            return parseFloat(d[variable + year + "_" + level]);
          });
      console.log(d);

      var sparkline_gen = d3.svg.line()
                          .x(function(d, i) { return i * 12; })
                          .y(scale_y);
      return sparkline_gen(d);
    })
    .attr('transform', function(d, i) {
      return 'translate(0,' + (i * rowHeight) + ')';
    });
  };



  var setScale = function(map) {
    var k = 1.2;

    map.attr('transform',
             'translate(' + mapProjection.translate()[0] + ',' + mapProjection.translate()[1] + ')'
                         + 'scale(' + k + ')'
                         + "translate(-104.07198674046933,-160.25584492248782)");

    map.selectAll('path').style('stroke-width', 1/(k*2) + 'px');;
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
    .attr('provincia', function(d) { return to_id(d.id) })
    .attr('d', mapPath);
  };

  d3.selectAll('select, input#year')
  .on('change', function() {
    var sV = d3.select('select#variable').node();
    var sY = d3.select('input#year').node();
    var sL = d3.select('select#level').node();
    var selectedVariable = sV.options[sV.selectedIndex].value;
    var selectedYear = sY.value;
    var selectedLevel = sL.options[sL.selectedIndex].value;
    plotVariable(selectedVariable, selectedYear, selectedLevel);
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
    d3.select('select#variable').on('change')();
  };

  if (window.frameElement) { // for bl.ocks.org
    window.frameElement.contentWindow.document.body.scroll = 'yes';
    window.frameElement.scrolling = 'yes';
  }

  queue()
  .defer(d3.csv, 'indicadores.csv')
  .defer(d3.json, 'argentina-provincias.topojson')
  .await(ready);