"use strict";

/**
 * 主入口
 * 通过require("flex-combo")
 * */
const pathLib = require("path");
const trace = require("plug-trace");
const DAC = require("dac");
const FlexCombo = require("./flexcombo");

const pkg = require(__dirname + "/package.json");

let init_config = function(dir) {
  if (typeof dir == "string" && dir) {
    let confFile, json = pkg.name + ".json";
    if (pathLib.isAbsolute(dir)) {
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

    return confFile;
  }
  else {
    return '';
  }
};

let init_param = function (param) {
  if (typeof param == "object" && param) {
    let rootdir = param.rootdir || "src";
    if (rootdir.indexOf('/') == 0 || /^\w{1}:[\\/].*$/.test(rootdir)) {
      param.rootdir = rootdir;
    }
    else {
      param.rootdir = pathLib.normalize(pathLib.join(process.cwd(), rootdir));
    }

    return param;
  }
  else {
    return {};
  }
};

FlexCombo.addEngine("\\.tpl$|\\.tpl\\.js$|\\.html\\.js$", DAC.tpl, "dac/tpljs");
FlexCombo.addEngine("\\.less\\.js$", DAC.lessjs, "dac/lessjs");
FlexCombo.addEngine("\\.less$|\\.less\\.css$", DAC.less, "dac/less");
FlexCombo.addEngine("\\.less\\.html$", DAC.lesspolymer, "dac/polymer");
FlexCombo.addEngine("\\.js$", DAC.babel, "dac/babel");
FlexCombo.addEngine("\\.js$", DAC.xmd, "dac/xmd");

var exports = module.exports = function (input_param, dir) {
  process.on(pkg.name, function (data) {
    console.log("\n=== Served by %s ===", trace.chalk.white(pkg.name));
    trace(data);
  });

  let param = init_param(input_param);
  let confFile = init_config(dir);

  return function () {
    let req, res, next;
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
      if (req && res && next) {
        let fcInst = new FlexCombo(param, confFile);
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

exports.API = FlexCombo;
exports.config = require("./lib/param");


exports.engine = function (input_param, dir) {
  let through = require("through2");

  let param = init_param(input_param);
  let confFile = init_config(dir);

  process
    .removeAllListeners(pkg.name)
    .on(pkg.name, function (data) {
      trace(data, "error");
    });

  return through.obj(function (file, enc, cb) {
    let fcInst = new FlexCombo(param, confFile);

    let self = this;

    if (file.isNull()) {
      self.emit("error", "isNull");
      cb(null, file);
      return;
    }

    if (file.isStream()) {
      self.emit("error", "Streaming not supported");
      cb(null, file);
      return;
    }

    fcInst.stream(file.path, function (buff) {
      if (buff) {
        file.contents = buff;
      }
      self.push(file);
      cb();
    });
  });
};
exports.gulp = exports.engine;
