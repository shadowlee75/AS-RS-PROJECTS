const {test}=require('node:test');
require('./invariants.js')({M:require('../src/motion.js'),Model:require('../src/model.js'),E:require('../src/engine.js'),R:require('../src/report.js')},test);
require('./scene-invariants.js')({Model:require('../src/model.js'),E:require('../src/engine.js'),S:require('../src/scene.js')},test);
