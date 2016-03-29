"use strict";

const FlexCombo = require("../flexcombo");
const fs = require("fs");

const confFile = __dirname+"/.config/flex-combo.json";

var inst = new FlexCombo({}, confFile);

inst.entry();
inst.entry();
