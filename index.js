/**
 * 主入口
 * 通过require("flex-combo")
 * */
var pathLib = require("path");
var fsLib = require("fs-extra");
var DAC = require("dac");
var trace = require("plug-trace");
var FlexCombo = require("./flexcombo");

var pkg = require(__dirname + "/package.json");

function init_config(dir, key, except) {
  if (dir) {
    var confFile, json = pkg.name + ".json";
    if (dir.indexOf('/') == 0 || /^\w{1}:[\\/].*$/.test(dir)) {
      if (/\.json$/.test(dir)) {
        confFile = dir;
      }
      else {
        confFile = pathLib.join(dir, json);
      }
    }
    else {
      confFile = pathLib.join(process.cwd(), dir, json);
    }

    if (fsLib.existsSync(confFile)) {
      var userParam = require(confFile);
      delete require.cache[confFile];

      if (key && typeof userParam[key] == "undefined") {
        var param = require("./lib/param");
        var keys = Object.keys(param[key]);

        userParam[key] = {};
        except = except || [];

        keys.map(function (i) {
          if (except.indexOf(i) == -1 && typeof userParam[i] != "undefined") {
            userParam[key][i] = userParam[i];
            delete userParam[i];
          }
          else {
            userParam[key][i] = param[key][i];
          }
        });

        fsLib.outputJsonSync(confFile, userParam, {encoding: "utf-8"});
        fsLib.chmod(confFile, "0777");
      }
    }

    return confFile;
  }
  else {
    return null;
  }
}

// var fcInst = new API();
// fcInst.addEngine("\\.tpl$|\\.tpl\\.js$|\\.html\\.js$", DAC.tpl, "dac/tpl");
// fcInst.addEngine("\\.less\\.js$", DAC.lessjs, "dac/tpl");
// fcInst.addEngine("\\.less$|\\.less\\.css$", DAC.less, "dac/less");
// fcInst.addEngine("\\.less\\.html$", DAC.lesspolymer, "dac/polymer");
// fcInst.addEngine("\\.js$", DAC.babel, "dac/babel");
// fcInst.addEngine("\\.js$", DAC.xmd, "dac/xmd");

exports = module.exports = function (param, dir) {
  var confFile = init_config(dir, "dac/tpl", ["filter"]);
  var fcInst = new FlexCombo(param, confFile);

  process.on(pkg.name, function (data) {
    console.log("\n=== Served by %s ===", trace.chalk.white(pkg.name));
    trace(data);
  });

  return function () {
    var req, res, next;
    switch (arguments.length) {
      case 1:
        req = this.req;
        res = this.res;
        next = arguments[0];
        break;
      case 3:
        req = arguments[0];
        res = arguments[1];
        next = arguments[2];
        break;
      default:
        next = function () {
          console.log("Unknown Web Container!");
        };
    }

    try {
      if (req && res && !res._header && next) {
        fcInst.handle(req, res, next);
      }
      else {
        next();
      }
    }
    catch (e) {
      console.log(e);
    }
  }
};

// exports.API = API;
// exports.name = pkg.name;
// exports.config = require("./lib/param");
// exports.engine = function (param, dir) {
//   var through = require("through2");
//   var confFile = init_config(dir, "dac/tpl", ["filter"]);
//
//   process
//     .removeAllListeners(pkg.name)
//     .on(pkg.name, function (data) {
//       trace(data, "error");
//     });
//
//   return through.obj(function (file, enc, cb) {
//     fcInst = new API(param, confFile);
//
//     var self = this;
//
//     if (file.isNull()) {
//       self.emit("error", "isNull");
//       cb(null, file);
//       return;
//     }
//
//     if (file.isStream()) {
//       self.emit("error", "Streaming not supported");
//       cb(null, file);
//       return;
//     }
//
//     fcInst.stream(file.path, function (buff) {
//       if (buff) {
//         file.contents = buff;
//       }
//       self.push(file);
//       cb();
//     });
//   });
// };
// exports.gulp = exports.engine;
