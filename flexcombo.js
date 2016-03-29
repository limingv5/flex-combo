"use strict";

const pathLib = require("path");
const fsLib   = require("fs-extra");
const merge   = require("merge");
const Stack   = require("plug-trace").stack;

class FlexCombo {
  constructor(priority, confFile) {
    // 配置相关
    this.priority = priority || {}; // 代码显示注入的配置项,优先级最高
    this.confFile = confFile;       // 配置文件地址

    if (confFile) {
      if (!fsLib.existsSync(confFile)) {
        fsLib.outputJson(confFile, require("./lib/param"), {encoding: "utf-8"}, function () {
          fsLib.chmod(confFile, 0o777);
        });
      }

      this.cacheDir = pathLib.join(pathLib.dirname(confFile), "../.cache");
    }
    if (!this.cacheDir) {
      this.cacheDir = pathLib.normalize(pathLib.join(process.cwd(), ".cache"));
    }
    this.cacheDir = pathLib.join(this.cacheDir, "flex-combo");
    if (!fsLib.existsSync(this.cacheDir)) {
      fsLib.mkdirs(this.cacheDir, function (e, dir) {
        fsLib.chmod(dir, 0o777);
        fsLib.chmod(this.cacheDir, 0o777);
      }.bind(this));
    }
  }

  get param() {
    let confJSON = {};
    try {
      if (this.confFile) {
        confJSON = require(this.confFile);
        delete require.cache[this.confFile];
      }
    }
    catch (e) {
      this.trace.error("Can't require config file!", "IO");
      confJSON = {};
    }

    return merge.recursive({}, require("./lib/param"), confJSON, this.priority);
  }

  parser(_url) {
    let url    = urlLib.parse(_url).path.replace(/[\\|\/]{1,}/g, '/');
    let prefix = url.indexOf(this.param.servlet + '?');

    if (prefix != -1) {
      let base     = (url.slice(0, prefix) + '/').replace(/\/{1,}/g, '/');
      let file     = url.slice(prefix + this.param.servlet.length + 1);
      let filelist = file.split(this.param.seperator, 1000);
      return filelist.map(function (i) {
        return urlLib.resolve(base, i);
      });
    }
    else {
      return [url];
    }
  }

  entry() {
    console.log(this.param);
  }

  handle(req, res, next) {
    this.trace  = new Stack("flex-combo");
  }
}

module.exports = FlexCombo;