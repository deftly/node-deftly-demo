module.exports = function telemetry() {
	return {
		name: "telemetry",
		actions: {
			"metrics": {
				method: "GET",
				url: "/",
				handle: function( envelope, metrics ) {
					var report = metrics.getReport();
					return { data: report };
				}
			}
		}
	};
};