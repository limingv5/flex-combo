module.exports = function (a, b, c, cb) {
  cb(null, "let a="+Math.random(), a, "application/javascript");
};