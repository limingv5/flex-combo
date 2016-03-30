"use strict";

const FlexCombo = require("../flexcombo");
const fs = require("fs");
const DAC = require("dac");

const confFile = __dirname+"/.config/flex-combo.json";

var inst = new FlexCombo({}, confFile);

inst.addEngine("\\.tpl$|\\.tpl\\.js$|\\.html\\.js$", DAC.tpl, "dac/tpl");
inst.addEngine("\\.less\\.js$", DAC.lessjs, "dac/tpl");
inst.addEngine("\\.less$|\\.less\\.css$", DAC.less, "dac/less");
inst.addEngine("\\.less\\.html$", DAC.lesspolymer, "dac/polymer");
inst.addEngine("\\.js$", DAC.babel, "dac/babel");
inst.addEngine("\\.js$", DAC.xmd, "dac/xmd");

inst.entry("http://g.alicdn.com/1.1.1/??index.js,engines/xxx.js");
