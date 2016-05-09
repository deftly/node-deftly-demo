var deftly = require( "deftly" );

deftly.init( {
	resources: [ "./src/resources/*.js" ],
	middleware: [ "./src/middleware/*.js" ],
	plugins: [ "./src/plugins/*.js" ],
	transports: [ "./src/transports/*.js" ]
} )
.then( function( service ) {
	service.metrics.recordUtilization();
	service.metrics.useLocalAdapter();
	service.start();
} );
