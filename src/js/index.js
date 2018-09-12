import _ from 'lodash';
import * as d3 from "d3";
import * as d3_tile from "d3-tile";
import * as VectorTile from "@mapbox/vector-tile";
import Protobuf from "pbf";


require('../sass/styles.sass');

if(process.env.NODE_ENV !== 'production')
	console.log('DEVELOPMENT MODE');

nextZen();

function nextZen(){
	var vectorTilesUrl = 'https://cdn-tiles-base.weblyzard.com/data/v3/';
	var vectorTilesExtention = 'pbf';
	var defaultScale = 152.94;
	var pi = Math.PI,
		tau = 2 * pi;

	var width = Math.max(960, window.innerWidth),
		height = Math.max(500,  window.innerHeight);

	width = 1000;
	height = 600;

	var map = d3.select("body").append("div")
		.attr("class", "map")
		.style("width", width + "px")
		.style("height", height + "px");

	var svgCont = map.append('svg')
		.attr('width', width)
		.attr('height', height);

	// var projection = d3.geoMercator()
	var projection = d3.geoMercator()
		.scale(defaultScale)
		.translate([0, 0])
		.clipExtent([[1,1],[width-1,height-1]]);
		
	var defTranslate = projection.translate();

	var initTransform = {
		x: 0,
		y: 0,
		k: 1
	}

	var path = d3.geoPath(projection)

	var tile = d3_tile.tile()
		.wrap(false)
		.size([width, height])
		// .translate(projection([0, 0]))

	var zoom = d3.zoom()
		.scaleExtent([1, 5400])
		.on("zoom", zoomed);

	var oldZoom = 1;

	var stylesJSON;
	var parsedStyles = {};
	var stylesURL = 'https://cdn-tiles-base.weblyzard.com/styles/klokantech-basic-en-20180718a/style.json';


	function geojson({x, y, z}, layer, filter = () => true) {
		if (!layer) return;
		const features = [];
		for (let i = 0; i < layer.length; ++i) {
			const f = layer.feature(i).toGeoJSON(x, y, z);
			if (filter.call(null, f, i, features)) features.push(f);
		}
		return {type: "FeatureCollection", features};
	}

	function zoomed() {
		console.log('zoom');
		
		var currentTransform = d3.event.transform;
		// console.dir(currentTransform);
		projection.scale(defaultScale * currentTransform.k).translate([currentTransform.x, currentTransform.y]);
		drawTiles(projection.scale() * 2 * Math.PI, currentTransform);
		// drawTilesTopoJSON(projection.scale() * 2 * Math.PI, currentTransform);
	}

	function drawTiles(scale, currentTransform){
		tile.scale(scale).translate([currentTransform.x, currentTransform.y]);
		var newZoom;
		var tiles = Promise.all(tile().map(async d => {
			// console.log('get Tile: x = '+d.x+' y = '+d.y+' z = '+ d.z);
			newZoom = d.z;
			d.layers = new VectorTile.VectorTile(
				new Protobuf(
					await d3.buffer(vectorTilesUrl + '' + d.z + '/' + d.x + '/' + d.y + '.' + vectorTilesExtention))).layers; 
			return d;
		}));

			
		tiles.then(function(tilesRes){
				// console.log('tilesRes');
				// console.dir(tilesRes);
				
				removeOldTiles();
				oldZoom = newZoom;
				
			var updTiles = svgCont
				.style('background', parsedStyles.background.paint['background-color'])
				.selectAll('g')
				.data(tilesRes);

			updTiles
				.enter()
				.append('g')
				.attr('class', 'vector-tile')
				.each(function(tile, tileIndex){	
					console.log('====== Get Tile =======');
					console.log('Tile (z,x,y): ' + tile.z + '-' + tile.x + '-' + tile.y);
					
					
					d3.select(this)
						.selectAll('g')
						.data(Object.keys(tile.layers))
						.enter()
						.append('g')
						.attr('class', function(d){return d;})
						.each(function(layerName, j){
							// Dont render names
							// if(layerName === 'water_name' || layerName === 'place' || layerName == 'mountain_peak')
							// 	return;
							var d3layer = d3.select(this);
							if(parsedStyles.layers[layerName]){
								d3layer
									.attr('fill', parsedStyles.layers[layerName].paint['fill-color'] ? parsedStyles.layers[layerName].paint['fill-color'] : 'transparent')									
									.attr('stroke', parsedStyles.layers[layerName].paint['line-color']);									
							}
							var geoJson = geojson(tile, tile.layers[layerName]).features;
							console.log('Geojson to render:');
							console.dir(geoJson);
							d3layer
								.selectAll('path')
								.data(geoJson)
								.enter()
								.append('path')
								.attr('class', function(d){return d.properties.subclass ? d.properties.subclass : d.properties.class})
								.attr('d', function(d){
									var name = d.properties.subclass ? d.properties.subclass : d.properties.class;
									if(name == 'nature_reserve' || name =='national_park'){
										return;
									}
									return path(d);
								})
								.each(function(d){
									var d3path = d3.select(this);
									var name = d.properties.subclass ? d.properties.subclass : d.properties.class;
									if(d.properties.admin_level){
										name = "boundary_" + (d.properties.admin_level == 2 ? '2' : '4');
									}
									if(parsedStyles.paths[name]){
										d3path
											.attr('fill', parsedStyles.paths[name].paint['fill-color'] ? parsedStyles.paths[name].paint['fill-color'] : 'transparent')									
											.attr('stroke', parsedStyles.paths[name].paint.stroke || parsedStyles.paths[name].paint['line-color'])
											.attr('stroke-dasharray', function(d){
												if(parsedStyles.paths[name].paint['line-dasharray']){
													return parsedStyles.paths[name].paint['line-dasharray'][0] + ',' + parsedStyles.paths[name].paint['line-dasharray'][1];
												}
												return '';
											});	
									}
								});
						});

				});
				
		});

	}

	function removeOldTiles(){
		svgCont.selectAll('g').remove();
	}

	function parseStylesJSON(){
		function addPathStyles(name, style){
			parsedStyles.paths[name] = style;			
		}
		console.log('============ PARSING STYLES.json ==============');
		parsedStyles.layers = {};
		parsedStyles.paths = {};
		stylesJSON.layers.forEach(function(layer){
			console.log(layer);
			var style = {
				'paint': _.clone(layer.paint),
				'layout': _.clone(layer.layout)
			}
			// Is not a layer => bg
			if(!layer['source-layer']){
				parsedStyles[layer.id] = style;
				return;
			}
			// Styles for entire layer
			if(!layer.filter || layer.filter[1] == '$type'){
				parsedStyles.layers[layer['source-layer']] = style;
				return;
			}
			if(layer.id == 'landuse_overlay_national_park'){
				parsedStyles.layers[layer['source-layer']] = style;
				return;
			}
			var filters = layer.filter[0] == 'all' ? layer.filter.slice(1) : [layer.filter];
			filters.forEach(function(filter){
				if(filter[1] == '$type')
					return;
				switch(filter[0]){
					case '==':
						if(filter[1] == 'class' || filter[1] == 'subclass'){
							addPathStyles(filter[2], style);
						}
						break;
					case 'in':
						if(filter[1] == 'class'){
							filter.splice(2).forEach(function(clazz){
								addPathStyles(clazz, style);
							});
						} else if (filter[1] == 'admin_level'){
							addPathStyles('boundary_4', style);
						}
						break;
					case '<=':
						if(filter[1] == 'admin_level'){
							addPathStyles('boundary_2', style);
						}
						break;
					case '!in':
						parsedStyles.layers[layer['source-layer']] = style;
						break;
					default:
						// console.dir(filter);
				}
			});
		});
	}

	d3.json(stylesURL).then(function(json){
		stylesJSON = json;
		parseStylesJSON();
		console.log('=========== PARSED STYLES ===========');
		console.dir(parsedStyles);
		drawTiles(projection.scale() * 2 * Math.PI, initTransform);
		// drawTilesTopoJSON(projection.scale() * 2 * Math.PI, initTransform);
	});
	
	svgCont.call(zoom).call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(1));
}