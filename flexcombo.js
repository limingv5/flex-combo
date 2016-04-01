"use strict";

const pathLib = require("path");
const urlLib  = require("url");
const fsLib   = require("fs-extra");
const merge   = require("merge");
const async   = require("async");
const Stack   = require("plug-trace").stack;
const Helper  = require("./lib/util");

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
      this.trace && this.trace.error("Can't require config file!", "IO");
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

  resetCustomEngine() {
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

  /**
   * url分析
   */
  parse(_url) {
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

  getFilteredUrl(_url) {
    let filter = this.param.filter;
    let regx, ori_url;

    for (let k in filter) {
      regx = new RegExp(k);
      if (regx.test(_url)) {
        ori_url = _url;
        _url    = _url.replace(regx, filter[k]);
        this.trace && this.trace.filter(regx, ori_url, _url);
      }
    }
    return _url;
  }

  getRealPath(_url) {
    let map = this.param.urls;
    _url    = (/^\//.test(_url) ? '' : '/') + _url;

    // urls中key对应的实际目录
    let repPath = process.cwd(), revPath = _url, longestMatchNum = 0;
    for (let k in map) {
      if (_url.indexOf(k) == 0 && longestMatchNum < k.length) {
        longestMatchNum = k.length;
        repPath         = map[k];
        revPath         = _url.slice(longestMatchNum);
      }
    }

    return pathLib.normalize(pathLib.join(repPath, revPath));
  }

  getCacheFilePath(_url) {
    if (this.cacheDir) {
      return pathLib.join(this.cacheDir, Helper.MD5(pathLib.join(this.parseDetail.host, _url)));
    }
    else {
      return '';
    }
  }

  buildRequestOption(url) {
    let reqHostName = this.parseDetail.host;
    let reqHostIP   = reqHostName;
    if (this.param.hosts && this.param.hosts[reqHostName]) {
      reqHostIP = this.param.hosts[reqHostName];
    }

    let requestOption = {
      protocol: this.parseDetail.protocol,
      host: reqHostIP,
      path: encodeURI(url),
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

  _matchEngine(filteredURL, absPath, fakeReqOpt, isNotFirst, engine, info) {
    let self = this;

    if (new RegExp(info.rule).test(filteredURL)) {
      if (isNotFirst) {
        return function (content, callback) {
          engine(
            {content: content}, fakeReqOpt,
            self.param[info.field] || {},
            function (e, result) {
              if (e) {
                self.trace && self.trace.error(absPath, info.field + " Engine Error");
              }
              callback(e, result);
            }
          );
        }
      }
      else {
        return function (callback) {
          engine(
            absPath, fakeReqOpt,
            self.param[info.field] || {},
            function (e, result) {
              if (e) {
                self.trace && self.trace.error(absPath, info.field + " Engine Error");
              }
              else {
                self.trace && self.trace.engine(filteredURL, absPath);
              }
              callback(e, result);
            }
          );
        }
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

    let filteredURL = this.getFilteredUrl(eUrl);
    let absPath     = this.getRealPath(filteredURL);
    let fakeReqOpt  = this.buildRequestOption(filteredURL);

    let Q    = [];
    let self = this;
    for (let item of this.engines) {
      let engine = this._matchEngine(filteredURL, absPath, fakeReqOpt, Q.length, item[0], item[1]);
      if (engine) {
        Q.push(engine);
      }
    }
    for (let item of Engines) {
      let engine = this._matchEngine(filteredURL, absPath, fakeReqOpt, Q.length, item[0], item[1]);
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
        }
      });
    }
    else {
      cb({msg: "Engine Pass!"});
    }
  }

  staticHandler(file, cb) {
    let filteredURL = this.getFilteredUrl(file);
    let absPath = this.getRealPath(filteredURL);
    let self = this;

    fsLib.readFile(absPath, function (e, data) {
      if (e) {
        self.trace && self.trace.warn(absPath, "Not in Local");
      }
      else {
        self.trace && self.trace.local(filteredURL, absPath);
      }

      cb(e, data);
    });
  }

  cacheHandler(file, cb) {
    let absPath = this.getCacheFilePath(file);
    let self = this;

    fsLib.readFile(absPath, function (e, data) {
      self.trace && self.trace.cache(file, absPath);
      cb(e, data);
    });
  }

  remoteHandler(file, cb) {
    cb(null, file);
  }

  task(file, callback) {
    let self = this;
    let step = 0;
    let taskQueue = [this.engineHandler, this.staticHandler, this.cacheHandler, this.remoteHandler];

    async.doUntil(
      function (cb) {
        if (step < taskQueue.length) {
          taskQueue[step++].bind(self)(file, function (e, data) {
            if (e) {
              cb(null, null);
            }
            else {
              cb(null, data);
            }
          });
        }
        else {
          cb({msg: "Not Matched!"});
        }
      },
      function (isFin) {
        return isFin !== null;
      },
      function (err, data) {
        callback(err, data);
      }
    );
  }

  entry(url, callback) {
    this.parse(url);
    this.resetCustomEngine();

    let self = this;
    let Q    = this.parseDetail.list.map(function (file) {
      return function (cb) {
        self.task(file, cb);
      }
    });
    async.parallel(Q, function (e, result) {
      callback(e, result);
    });
  }

  handle(req, res, next) {
    let host = (req.connection.encrypted ? "https" : "http") + "://" + (req.hostname || req.host || req.headers.host);
    // 不用.pathname的原因是由于??combo形式的url，parse方法解析有问题
    let path = urlLib.parse(req.url).path;

    this.entry(host + path, function(e, result) {
      if (e) {
        next();
      }
      else {
        console.log(result);
      }
    });

    this.trace = new Stack("flex-combo");
  }
}

module.exports = FlexCombo;