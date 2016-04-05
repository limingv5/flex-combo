"use strict";

const FlexCombo = require("../flexcombo");
const fs = require("fs");
const DAC = require("dac");
const trace = require("plug-trace");

FlexCombo.addEngine("\\.tpl$|\\.tpl\\.js$|\\.html\\.js$", DAC.tpl, "dac/tpl");
FlexCombo.addEngine("\\.less\\.js$", DAC.lessjs, "dac/tpl");
FlexCombo.addEngine("\\.less$|\\.less\\.css$", DAC.less, "dac/less");
FlexCombo.addEngine("\\.less\\.html$", DAC.lesspolymer, "dac/polymer");
FlexCombo.addEngine("\\.js$", DAC.babel, "dac/babel");
FlexCombo.addEngine("\\.js$", DAC.xmd, "dac/xmd");

process.on("flex-combo", function (data) {
  trace(data);
});

let confFile = __dirname+"/.config/flex-combo.json";
let inst = new FlexCombo({rootdir: "./"}, confFile);

inst.parse("https://g.alicdn.com/1.1.1/??index.js,.config/flex-combo.json,engines/xxx1.js");
inst.entry(function (e, result) {
  if (e) {
    console.log(e)
  }
  else {
    console.log(result)
  }
});

// inst.entry("http://g.alicdn.com/jbc/box/1.2.9/index.js", function (e, result) {
//   console.log(result);
// });
