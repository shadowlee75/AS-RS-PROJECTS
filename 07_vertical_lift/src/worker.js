'use strict';
self.onmessage=({data})=>{try{const progress=value=>self.postMessage({type:'progress',value});if(data.type==='run')self.postMessage({type:'result',run:LiftEngine.run(data.config,progress)});else if(data.type==='compare')self.postMessage({type:'compare',rows:LiftEngine.compare(data.config,progress)});}catch(e){self.postMessage({type:'error',message:e.message});}};
