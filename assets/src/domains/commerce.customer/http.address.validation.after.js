module.exports = function(context, callback) {
	console.info(context.request.body);
	callback();
};
