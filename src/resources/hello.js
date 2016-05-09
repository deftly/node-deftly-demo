var path = require( "path" );
module.exports = function hello() {
	return {
		name: "hello",
		actions: {
			generic: {
				method: "get",
				url: "/",
				middleware: [ "acceptor" ],
				handle: [
					{
						when: { headers: { accept: "text/plain" } },
						then: function( envelope ) {
							return {
								file: {
									name: path.resolve( "./src/public/hello.txt" )
								}
							};
						}
					},
					{
						when: { headers: { accept: "text/html" } },
						then: function( envelope ) {
							return {
								file: {
									name: path.resolve( "./src/public/hello.html" )
								}
							};
						}
					},
					{
						when: true,
						then: function( envelope ) {
							return {
								status: 200,
								data: { message: "Hello!" }
							};
						}
					}
				]
			},
			personal: {
				method: "get",
				url: "/:name",
				handle: function( envelope, data, next ) {
					return {
						status: 200,
						data: "Hello, " + data.name + "!"
					};
				}
			}
		}
	}	
};