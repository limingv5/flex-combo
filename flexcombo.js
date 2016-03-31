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
      host: result.hostname,
      port: result.port || (result.protocol == "https:" ? 443 : 80),
      path: result.path,
      href: result.protocol + "//" + result.host + result.path,
      list: []
    };

    let url    = this.parseDetail.path;
    let prefix = url.indexOf(this.param.servlet + '?');

    if (prefix != -1) {
      let base              = (url.slice(0, prefix) + '/').replace(/\/{1,}/g, '/');
      let file              = url.slice(prefix + this.param.servlet.length + 1);
      let filelist          = file.split(this.param.seperator, 1000);
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
      let mod      = pathLib.join(process.cwd(), filepath);
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

  buildRequestOption(url) {
    url = encodeURI(url);

    var reqHostName = this.parseDetail.host;
    var reqHostIP   = reqHostName;
    if (this.param.hosts && this.param.hosts[reqHostName]) {
      reqHostIP = this.param.hosts[reqHostName];
    }

    var requestOption = {
      protocol: this.parseDetail.protocol,
      host: reqHostIP,
      path: url,
      method: "GET",
      rejectUnauthorized: false,
      headers: {
        "x-broker": "flex-combo",
        host: reqHostName
      }
    };

    requestOption.headers = merge.recursive(true, this.param.headers, requestOption.headers);
    return requestOption;
  }

  _matchEngine(filteredURL, absPath, reqOpt, isFirst, engine, info) {
    var self = this;

    if (new RegExp(info.rule).test(filteredURL)) {
      if (!isFirst) {
        return (function() {
          return function (content, callback) {
            engine(
              {content:content}, reqOpt,
              self.param[info.field],
              function (e, result) {
                if (e) {
                  self.trace && self.trace.error(absPath, info.field + " Engine Error");
                }
                callback(e, result);
              }
            );
          }
        })(engine);
      }
      else {
        return (function () {
          return function (callback) {
            engine(
              absPath, reqOpt,
              self.param[info.field],
              function (e, result) {
                if (e) {
                  self.trace && self.trace.error(absPath, info.field + " Engine Error");
                }
                callback(e, result);
              }
            );
          }
        })(engine);
      }
    }
    else {
      return false;
    }
  }

  engineHandler(_url, cb) {
    let eUrl = _url;
    // .css找不到尝试找.less的特殊操作
    if (!/\.less/.test(_url)) {
      eUrl = _url.replace(/\.css$/, ".less.css");
    }

    let filteredURL = this.filteredUrl(eUrl);
    let absPath     = this.getRealPath(filteredURL);
    let reqOpt      = this.buildRequestOption(filteredURL);

    let Q    = [];
    let self = this;
    for (let item of this.engines) {
      let engine = this._matchEngine(filteredURL, absPath, reqOpt, !Q.length, item[0], item[1]);
      if (engine) {
        Q.push(engine);
      }
    }

    for (let item of Engines) {
      let engine = this._matchEngine(filteredURL, absPath, reqOpt, !Q.length, item[0], item[1]);
      if (engine) {
        Q.push(engine);
      }
    }

    if (Q.length) {
      async.waterfall(Q, function (e, result) {
        if (e) {
          cb(e);
        }
        else {
          cb(e, result);
          self.trace && self.trace.engine(filteredURL, absPath);
        }
      });
    }
    else {
      cb({msg: "Engine Pass!"});
    }
  }

  staticHandler(file, cb) {
    file = this.getRealPath(this.filteredUrl(file));
    if (fsLib.existsSync(file)) {
      fsLib.readFile(file, function (e, data) {
        cb(null, data);
      });
    }
    else {
      cb({msg: "Static Not Found!"});
    }
  }

  cacheHandler(file, cb) {
    cb(null, file);
  }

  remoteHandler(file, cb) {
    cb(null, file);
  }

  task(file, callback) {
    let self = this;
    self.engineHandler(file, function (e, data) {
      if (e) {
        self.staticHandler(file, function (e, data) {
          if (e) {
            self.cacheHandler(file, function (e, data) {
              if (e) {
                self.remoteHandler(file, function (e, data) {
                  if (e) {
                    callback({msg: "All failure!"});
                  }
                  else {
                    callback(e, data);
                  }
                });
              }
              else {
                callback(e, data);
              }
            });
          }
          else {
            callback(e, data);
          }
        });
      }
      else {
        callback(e, data);
      }
    });
  }

  entry(url) {
    this.parser(url);
    this.customEngineReset();

    let self = this;
    let Q    = this.parseDetail.list.map(function (file) {
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