/**
 * 二次开发示例，更灵活定义功能
 * require("flex-combo").API
 * */

var http = require("http");
var FlexCombo  = require("../").API;

// 添加assets动态编译引擎
// 例如要加入stylus支持，可通过addEngine添加动态编译逻辑
FlexCombo.addEngine("\\.styl\\.css$", function (absPath, url, param, callback) {
  callback(null, "/* css content */");
});


http
  .createServer(function (req, res) {
    var fcInst = new FlexCombo({});
    fcInst.handle(req, res, function () {
      res.writeHead(404, {"Content-Type": "text/plain"});
      res.end("Your combo file not found.");
    });
  })
  .listen(80, function() {
    console.log("Started!");
  });