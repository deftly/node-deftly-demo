// simplify the accept down to a single item
// this would usually be terrible but it
// shows how middleware can be plugged in
// and simplifies the hello action
module.exports = function acceptor() {
	return [
		function( envelope, headers, next ) {
			if( headers.accept ) {
				headers.accept = headers.accept.split( "," )[ 0 ];
			}
			next();
		}
	];
};