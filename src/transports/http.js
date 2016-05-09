var _ = require( "lodash" );
var when = require( "when" );
var express = require( "express" );
var request = require( "request" );
var http = require( "http" );
var mime = require( "mime" );
var fs = require( "fs" );
var path = require( "path" );
var hostname = require( "os" ).hostname();
var log;

function getEnvelope( action, resource, req ) {
	// again oversimplified, but it'll do
	var env =  {
		transport: "http",
		action: action.name,
		resource: resource.name,
		body: req.body || {},
		data: req.body || {},
		query: req.query || {},
		params: req.params || {},
		headers: req.headers || {},
		route: req.url,
		user: req.user,
		cookies: req.cookies
	};

	[ req.params, req.query ]
		.forEach( function( source ) {
			Object.keys( source ).forEach( function( key ) {
				var val = source[ key ];
				if ( !_.has( env.data, key ) ) {
					env.data[ key ] = val;
				}
				if ( !_.has( env.params, key ) ) {
					env.params[ key ] = val;
				}
			} );
		} );
	return env;
}

// this is just terribly oversimplified, but it serves its purpose
function getUrl( resource, action ) {
	if( action.url ) {
		return [ "/", resource.name, action.url ].join( "" ); 
	} else {
		return [ "/", resource.name, "/", action.name ].join( "" );
	}
}

function createContext( state, action, resource ) {
	var url = getUrl( resource, action );
	var method = action.method ? action.method.toLowerCase() : "all";
	state.express[ method ] ( 
		url, 
		setContext.bind( null, action, resource )
	);
}

function createRoute( state, deftly, action, resource ) {
	var url = getUrl( resource, action );
	var method = action.method || "all"; // lol
	state.express[ method.toLowerCase() ]( url, function( req, res ) {
		var envelope = getEnvelope( action, resource, req );
		deftly.handle( envelope )
			.then( 
				function( reply ) {
					if( reply.file ) {
						sendFile( res, reply );
					} else if( reply.stream ) {
						sendStream( res, reply );
					} else if( reply.redirect ) {
						redirect( res, reply );
					} else if( reply.forward ) {
						forwardTo( res, reply );
					} else {
						replyWith( res, reply );
					}
				},  
				function( error ) {
					// only called if no error strategy was available
					res.send( 500, "Server Error" );
				}
			);
	} );
}

function createRoutes( state, deftly ) {
	deftly.forEachAction( createContext.bind( null, state ) );
	state.express.use( telemetry.bind( null, state, deftly ) );
	deftly.forEachAction( createRoute.bind( null, state, deftly ) );
}

function forwardTo( req, res, reply ) {
	if ( !req.readable ) {
		var original = {
			method: req.method,
			headers: req.headers
		};
		if ( req.body ) {
			original.body = req.body;
			if ( _.isObject( req.body ) ) {
				original.json = true;
			}
		}
		var forwarded = _.defaults( options, original );
		return request( forwarded ).pipe( res );
	} else {
		return req.pipe( request( options ) ).pipe( res );
	}
}

function initialize( state, deftly ) {
	log = deftly.log.get( "http" ); 
	var configuration = deftly.config.http || {};
	Object.assign( state, {
		config: configuration
	} );
	var reply = when();
	if( configuration.configure ) {
		reply = configuration.configure( state );
		if( !reply.then ) {
			reply = when( reply );
		}
	}
	return reply.then( createRoutes.bind( null, state, deftly ) );
}

function redirect( res, reply ) {
	var code = reply.statusCode || reply.status || 302;
	setMeta( res, reply );
	res.redirect( code, reply.url );
}

function replyWith( res, reply ) {
	var code = reply.statusCode || reply.status || 200;
	setMeta( res, reply );
	res
		.status( code )
		.send( reply.data );
}

function sendFile( res, reply ) {
	var file = reply.file;
	var code = reply.statusCode || reply.status || 200;
	var headers = reply.headers || {};
	headers[ "Content-Type" ] = reply.file.type || mime.lookup( file.name );
	res.status( code );
	var options = {
		headers: reply.headers,
		maxAge : reply.maxAge || 0
	};
	res.sendFile( file.name, options, function( err ) {
		if( err ) {
			log.error( `Error sending file ${file.name}: ${err.stack}` );
		}
	} );
}

function sendStream( res, reply ) {
	var code = reply.statusCode || reply.status || 200;
	var headers = reply.headers || {};
	headers[ "Content-Type" ] = reply.content || reply.type || "application/octet-stream";
	res.status( code );
	setMeta( res, reply );
	reply.stream.pipe( res );
}

function sendStream( res, reply ) {
	var code = reply.statusCode || reply.status || 200;
	setMeta( res, reply );
}

function setContext( action, resource, req, res, next ) {
	req.metricKey = [ resource.name, action.name, "http" ];
	next();
}

function setMeta( res, reply ) {
	if ( reply.headers ) {
		res.set( reply.headers );
	}
	if ( reply.cookies ) {
		_.each( reply.cookies, function( v, k ) {
			res.cookie( k, v.value, v.options );
		} );
	}
}

function start( state ) {
	var port = state.config.port || 8800;
	log.info( "http listener starting at", port );
	state.http.listen( port );
}

function stop( state ) {
	state.http.close();
}

function telemetry( state, deftly, req, res, next ) {
	var ip;
	if( req.meaured ) {
		next();
		return;
	}
	req.measued = true;
	// for some edge cases, trying to access the ip/ips property
	// throws an exception, this work-around appears to avoid the
	// need to rely on try/catch
	if ( req.app ) {
		ip = req.ips.length ? req.ips[ 0 ] : req.ip ;
	} else {
		ip = req.headers[ "X-Forwarded-For" ] || req.socket.remoteAddress;
	}
	res.setMaxListeners( 0 );
	var metricKey = req.metricKey || [ req.url.replace( /[\/]/g, "-" ) ];
	var timer = deftly.metrics.timer( metricKey.concat( "duration" ) );
	var requests = deftly.metrics.meter( metricKey.concat( "requests" ), "count" );
	var ingress = deftly.metrics.meter( metricKey.concat( "ingress" ), "bytes" );
	var egress = deftly.metrics.meter( metricKey.concat( "egress" ), "bytes" );
	var method = req.method.toUpperCase();
	var startingSent = req.socket.bytesWritten;
	var startingRead = req.socket.bytesRead;
	res.once( "finish", function() {
		var user = _.isObject( req.user ) ? ( req.user.name || req.user.username || req.user.id ) : "anonymous";
		var read = req.socket.bytesRead - startingRead;
		var readKB = read / 1024;
		var code = res.statusCode;
		var message = res.statusMessage;
		var sent = req.socket.bytesWritten - startingSent;
		var sentKB = sent ? sent / 1024 : 0;
		var url = req.url;
		var elapsed = timer.record( { name: "HTTP_API_DURATION" } );
		requests.record( 1, { name: "HTTP_API_REQUESTS" } );
		ingress.record( read, { name: "HTTP_API_INGRESS" } );
		egress.record( sent, { name: "HTTP_API_EGRESS" } );

		log.info( "%s@%s %s (%d ms) [%s] %s %s (%d KB) %s %s (%d KB)",
			process.title,
			hostname,
			ip,
			elapsed,
			user || "anonymous",
			method,
			url,
			readKB,
			code,
			message || "",
			sentKB
		);
	} );
	next();
}

module.exports = function expressTransport() {
	var app = express();
	var state = {
		express: app,
		request: request,
		http: http.createServer( app )
	};
	return {
		createRoute: createRoute.bind( null, state.app ),
		createRoutes: createRoutes.bind( null, state ),
		getEnvelope: getEnvelope,
		getUrl: getUrl,
		initialize: initialize.bind( null, state ),
		start: start.bind( null, state ),
		stop: stop.bind( null, state )
	};
}