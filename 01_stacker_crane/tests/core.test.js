const test = require('node:test');
require('./invariants.js')({ M: require('../src/motion.js'), Model: require('../src/model.js'), E: require('../src/engine.js'), R: require('../src/report.js') }, test);
