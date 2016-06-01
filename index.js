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

FlexCombo.addEngine("\\.tpl$|\\.tpl\\.js$|\\.html\\.js$", DAC.tpl, "dac/tpl");
FlexCombo.addEngine("\\.swig$|\\.swig\\.js$", DAC.swig, "dac/tpl");
FlexCombo.addEngine("\\.less\\.js$", DAC.lessjs, "dac/lessjs");
FlexCombo.addEngine("\\.less$|\\.less\\.css$", DAC.less, "dac/less");
FlexCombo.addEngine("\\.less\\.html$", DAC.lesspolymer, "dac/polymer");
FlexCombo.addEngine("\\.js$", DAC.babel, "dac/babel");
FlexCombo.addEngine("\\.js$", DAC.xmd, "dac/xmd");

module.exports = function (input_param, dir) {
  process.on(pkg.name, function (data) {
    console.log("\n=== Served by %s ===", trace.chalk.white(pkg.name));
    trace(data);
  });

  let param = init_param(input_param);
  let confFile = init_config(dir);

  return function (req, res, next) {
    try {
      if (req && res && next) {
        let fcInst = new FlexCombo(param, confFile);
        fcInst.handle(req, res, next);
      }
      else {
        console.log("arguments error!");
      }
    }
    catch (e) {
      console.log(e);
    }
  }
};

module.exports.koa = function (ctx, param, cb) {
  let fcInst = new FlexCombo(param);
  fcInst.koa(ctx.req, function (e, body, header) {
    if (e) {
      cb(e);
    }
    else {
      ctx.set(header);
      cb(null, body);
    }
  });
};

module.exports.gulp = module.exports.engine = function (input_param, dir) {
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
module.exports.API = FlexCombo;
