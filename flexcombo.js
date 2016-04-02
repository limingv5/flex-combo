"use strict";

const pathLib = require("path");
const urlLib  = require("url");
const fsLib   = require("fs-extra");
const merge   = require("merge");
const mime    = require("mime");
const async   = require("async");
const fetch   = require("fetch-agent");
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

    // 根目录设置
    if (!this.param.urls['/']) {
      this.param.urls['/'] = this.param.rootdir || "src";
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

    return merge.recursive(true, require("./lib/param"), confJSON, this.priority);
  }

  static addEngine(rule, engine, field) {
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

  parse(origin) {
    let _url    = origin.replace(/([^\?])\?[^\?].*$/, "$1").replace(/[\?\,]{1,}$/, '');
    let result  = urlLib.parse(_url);
    result.path = result.path.replace(/[\\|\/]{1,}/g, '/');

    this.parseDetail = {
      url: origin,
      href: result.protocol + "//" + result.host + result.path,
      protocol: result.protocol,
      host: result.hostname,
      port: result.port || (result.protocol == "https:" ? 443 : 80),
      path: result.path,
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

  convert(buff, _url) {
    let outputCharset = (this.param.charset || "utf-8").toLowerCase();
    if (this.param.urlBasedCharset && _url && this.param.urlBasedCharset[_url]) {
      outputCharset = this.param.urlBasedCharset[_url];
    }

    return Helper.getBuffer(buff, outputCharset);
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
    let _path = pathLib.normalize(pathLib.join(repPath, revPath));
    return pathLib.isAbsolute(_path) ? _path : pathLib.join(process.cwd(), _path);
  }

  getCacheFilePath(_url) {
    if (this.cacheDir) {
      return pathLib.join(this.cacheDir, Helper.MD5(pathLib.join(this.parseDetail.host, _url)));
    }
    else {
      return '';
    }
  }

  cacheFile(absPath, buff) {
    if (absPath && !/[<>\*\?]+/g.test(absPath)) {
      fsLib.writeFile(absPath, buff, function (e) {
        if (!e) {
          fsLib.chmod(absPath, 0o777);
        }
      });
    }
  }

  buildRequestOption(url, force) {
    let reqHostName = this.parseDetail.host;
    let reqHostIP = this.param.hosts[reqHostName];
    if (force || reqHostIP) {
      let requestOption = {
        protocol: this.parseDetail.protocol,
        host: reqHostIP || reqHostName,
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
    else {
      return false;
    }
  }

  _matchEngine(filteredURL, absPath, fakeReqOpt, isNotFirst, engine, info) {
    if (new RegExp(info.rule).test(filteredURL)) {
      let self  = this;
      let param = this.param[info.field] || {};
      let trace = function (e, isPass) {
        if (!isPass) {
          if (e) {
            self.trace && self.trace.error(absPath, info.field);
          }
          else {
            self.trace && self.trace.engine(info.field, absPath);
          }
        }
      };

      if (isNotFirst) {
        return function (content, callback) {
          engine(
            {content: content}, fakeReqOpt, param,
            function (e, result, isPass) {
              trace(e, isPass);
              callback(e, result);
            }
          );
        }
      }
      else {
        return function (callback) {
          engine(
            absPath, fakeReqOpt, param,
            function (e, result, isPass) {
              trace(e, isPass);
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

  engineHandler(pathInfo, cb) {
    let filteredURL = pathInfo.filtered;
    let absPath     = pathInfo.abs;
    let fakeReqOpt  = this.buildRequestOption(filteredURL, true);

    if (fsLib.existsSync(absPath)) {
      this.trace && this.trace.local(filteredURL, absPath);
    }

    let Q = [];
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
          cb(null, this.convert(result, pathInfo.base));
        }
      }.bind(this));
    }
    else {
      cb(true);
    }
  }

  staticHandler(pathInfo, cb) {
    let absPath = pathInfo.abs;
    let self    = this;

    fsLib.readFile(absPath, function (e, data) {
      if (e) {
        self.trace && self.trace.warn(absPath, "Not in Local");
        cb(e);
      }
      else {
        cb(null, self.convert(data, pathInfo.base));
      }
    });
  }

  cacheHandler(pathInfo, cb) {
    let cachePath = pathInfo.cache;
    let self      = this;

    fsLib.readFile(cachePath, function (e, data) {
      if (e) {
        self.trace && self.trace.warn(pathInfo.href, "Not in Cache");
      }
      else {
        self.trace && self.trace.cache(pathInfo.base, cachePath);
      }

      cb(e, data);
    });
  }

  fetchHandler(pathInfo, cb) {
    let self   = this;
    let remoteURL = pathInfo.href;
    let reqOpt = this.buildRequestOption(pathInfo.base);
    if (reqOpt) {
      fetch.request(reqOpt, function (e, buff, nsres) {
        if (e) {
          self.trace && self.trace.error(remoteURL + " Request Error!", "Network 500");
          cb(e);
        }
        else {
          if (nsres.statusCode == 404) {
            self.trace && self.trace.error(remoteURL, "Network 404");

            cb(nsres);
          }
          else {
            self.trace && self.trace.remote(pathInfo.href, reqOpt.host);

            pathInfo.cache && self.cacheFile(pathInfo.cache, buff);
            cb(null, buff);
          }
        }
      });
    }
    else {
      self.trace && self.trace.error(remoteURL, "Req Loop");
      cb({msg: "Req Loop!"});
    }
  }

  task(url, callback) {
    let filteredURL = this.getFilteredUrl(url);
    let pathInfo    = {
      base: url,
      filtered: filteredURL,
      abs: this.getRealPath(filteredURL),
      cache: this.getCacheFilePath(url),
      href: this.parseDetail.protocol + "//" + this.parseDetail.host + ':' + this.parseDetail.port + url
    };

    let self      = this;
    let step      = 0;
    let taskQueue = [this.engineHandler, this.staticHandler, this.cacheHandler, this.fetchHandler];
    async.doUntil(
      function (cb) {
        if (step < taskQueue.length) {
          taskQueue[step++].bind(self)(pathInfo, function (e, data) {
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

  entry(callback) {
    this.resetCustomEngine();

    this.trace && this.trace.request(this.parseDetail.host, this.parseDetail.list);

    let self = this;
    let Q    = this.parseDetail.list.map(function (file) {
      return function (cb) {
        self.task(file, cb);
      }
    });
    async.parallel(Q, function (e, result) {
      if (e) {
        self.trace && self.trace.fail(self.parseDetail.url);
      }
      else {
        self.trace && self.trace.response(self.parseDetail.url, result);
      }
      callback(e, result);
    });
  }

  stream(absPath, cb) {
    let filtered = urlLib.resolve('/', pathLib.relative(this.param.rootdir, absPath));
    this.engineHandler({
      base: filtered,
      filtered: filtered,
      abs: absPath
    }, function (e, data) {
      cb(data);
    });
  }

  handle(req, res, next) {
    // 不用.pathname的原因是由于??combo形式的url，parse方法解析有问题
    let URL = (req.connection.encrypted ? "https" : "http") + "://" + (req.hostname || req.host || req.headers.host) + urlLib.parse(req.url).path;
    this.parse(URL);
    let absPath = this.getRealPath(this.getFilteredUrl(this.parseDetail.path));

    if (fsLib.existsSync(absPath) && fsLib.statSync(absPath).isDirectory()) {
      req.url = urlLib.resolve('/', pathLib.relative(this.param.rootdir, absPath));
      next();
    }
    else {
      this.trace = new Stack("flex-combo");
      this.entry(function (e, result) {
        if (e) {
          next();
        }
        else {
          let content = Buffer.concat(result);
          let header = {
            "Access-Control-Allow-Origin": '*',
            "Content-Length": content.length,
            "X-MiddleWare": "flex-combo"
          };
          let sample = this.parseDetail.list[0];
          if (sample) {
            header["Content-Type"] = mime.lookup(sample);
          }
          res.writeHead(200, header);
          res.write(content);
          res.end();
        }
      }.bind(this));
    }
  }
}

module.exports = FlexCombo;