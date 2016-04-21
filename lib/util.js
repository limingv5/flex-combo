"use strict";

const fsLib  = require("fs");
const crypto = require("crypto");
const util   = require("util");
const DAC    = require("dac");
const isUtf8 = DAC.isUtf8;
const iconv  = DAC.iconv;

module.exports = {
  /* 读取文件并返回Unicode编码的字符串，以便在Node.js环境下进行文本处理 */
  getUnicode: function (filePath) {
    if (fsLib.existsSync(filePath)) {
      let buff = fsLib.readFileSync(filePath);
      return isUtf8(buff) ? buff.toString() : iconv.decode(buff, "gbk");
    }
    else {
      return null;
    }
  },

  getBuffer: function (buff, outputCharset) {
    if (!Buffer.isBuffer(buff)) {
      buff = new Buffer(buff);
    }

    let selfCharset = isUtf8(buff) ? "utf-8" : "gbk";
    if (selfCharset == outputCharset) {
      return buff;
    }
    else {
      return iconv.encode(iconv.decode(buff, selfCharset), outputCharset);
    }
  },

  MD5: function (str) {
    return crypto.createHash("md5").update(str).digest("hex");
  },

  unique: function (data) {
    if (util.isArray(data)) {
      return data.filter(function (elem, pos) {
        return elem && data.indexOf(elem) == pos;
      });
    }
    else {
      return [];
    }
  }
};
