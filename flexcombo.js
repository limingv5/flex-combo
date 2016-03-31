"use strict";

const pathLib = require("path");
const urlLib  = require("url");
const fsLib   = require("fs-extra");
const merge   = require("merge");
const async   = require("async");
const Stack   = require("plug-trace").stack;

// 默认注册编译引擎
let Engines = new Map();

class FlexCombo {
  constructor(priority, confFile) {
    // URL分析结果
    this.parseDetail = {};

    // 动态注册引擎
    this.engines = new Map();

    // trace信息
    this.trace = null;

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

  addEngine(rule, engine, field) {
    if (!Engines.has(engine)) {
      Engines.set(engine, {
        rule: rule,
        field: field
      });
    }
  }

  addCustomEngine(rule, engine, field) {
    if (!this.engines.has(engine)) {
      this.engines.set(engine, {
        rule: rule,
        field: field
      });
    }
  }

  /**
   * url分析
   */
  parser(_url) {
    _url = _url.replace(/([^\?])\?[^\?].*$/, "$1").replace(/[\?\,]{1,}$/, '');

    let result  = urlLib.parse(_url);
    result.path = result.path.replace(/[\\|\/]{1,}/g, '/');

    this.parseDetail = {
      protocol: result.protocol,
      host: result.host,
      path: result.path,
      href: result.protocol + "//" + result.host + result.path,
      list: []
    };

    let url    = this.parseDetail.path;
    let prefix = url.indexOf(this.param.servlet + '?');

    if (prefix != -1) {
      let base     = (url.slice(0, prefix) + '/').replace(/\/{1,}/g, '/');
      let file     = url.slice(prefix + this.param.servlet.length + 1);
      let filelist = file.split(this.param.seperator, 1000);
      this.parseDetail.list = filelist.map(function (i) {
        return urlLib.resolve(base, i);
      });
    }
    else {
      this.parseDetail.list = [url];
    }
  }

  customEngineReset() {
    this.engines.clear();
    let tmp = [];

    let engines = this.param.engine;
    for (let regStr in engines) {
      let filepath = engines[regStr].replace(/\.js$/, '');
      let mod = pathLib.join(process.cwd(), filepath);
      if (tmp.indexOf(mod) == -1 && fsLib.existsSync(mod + ".js")) {
        tmp.push(mod);
        this.addCustomEngine(regStr, require(mod), filepath);
        delete require.cache[mod];
      }
    }
  }

  filteredUrl(_url) {
    let filter = this.param.filter;
    let regx, ori_url;

    for (let k in filter) {
      regx = new RegExp(k);
      if (regx.test(_url)) {
        ori_url = _url;
        _url    = _url.replace(regx, filter[k]);
        if (this.trace) {
          this.trace.filter(regx, ori_url, _url);
        }
      }
    }
    return _url;
  }

  getRealPath(_url) {
    var map = this.param.urls;
    _url    = (/^\//.test(_url) ? '' : '/') + _url;

    // urls中key对应的实际目录
    var repPath = process.cwd(), revPath = _url, longestMatchNum = 0;
    for (var k in map) {
      if (_url.indexOf(k) == 0 && longestMatchNum < k.length) {
        longestMatchNum = k.length;
        repPath         = map[k];
        revPath         = _url.slice(longestMatchNum);
      }
    }

    return pathLib.normalize(pathLib.join(repPath, revPath));
  }

  engineHandler(file, cb) {
    // for (let item of this.engines) {
    //   if (new RegExp(item[1].rule).test(file)) {
    //     console.log(file, item[1])
    //   }
    // }
    // for (let item of Engines) {
    //   if (new RegExp(item[1].rule).test(file)) {
    //     console.log(file, item[1])
    //   }
    // }
    cb(null, file);
  }

  staticHandler(file, cb) {
    file = this.getRealPath(this.filteredUrl(file));
    console.log(file)
    fsLib.readFile(file, cb);
  }

  cacheHandler(file, cb) {
    cb(null, file);
  }

  remoteHandler(file, cb) {
    cb(null, file);
  }

  task(file, callback) {
    let steps = [this.engineHandler, this.staticHandler, this.cacheHandler, this.remoteHandler];
    let idx = 0;
    let _e = null;

    async.until(
      function () {
        return !_e;
      },
      function (cb) {
        steps[idx](file, function (e, data) {
          _e = e;
          cb(e, data);
        });
      },
      function (e, data) {
        callback(e, data);
      }
    );
  }

  entry(url) {
    this.parser(url);
    this.customEngineReset();

    let self = this;
    let Q = this.parseDetail.list.map(function (file) {
      return function (callback) {
        self.task(file, callback);
      }
    });
    async.parallel(Q, function (e, result) {
      console.log(result)
    });
  }

  handle(req, res, next) {
    var host = (req.connection.encrypted ? "https" : "http") + "://" + (req.hostname || req.host || req.headers.host);
    // 不用.pathname的原因是由于??combo形式的url，parse方法解析有问题
    var path = urlLib.parse(req.url).path;
    this.entry(host + path);

    this.trace = new Stack("flex-combo");
  }
}

module.exports = FlexCombo;