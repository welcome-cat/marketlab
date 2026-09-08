import {simulatePhone} from './phone-entry.mjs';
// Read the applied market defaults, not a duplicated candidate configuration.
const config={};
for(const entries of [[1],[1,1],[1,1,1],[1,1,1,1],[1,1,1,1,1,1],[1,4]]) for(const aggressive of [false,true]) {
 const r=simulatePhone(config,entries,15,aggressive);
 console.log(JSON.stringify({entries,aggressive,config,firms:r.map(f=>({...f,p10:f.history.filter(x=>x.round<=10).reduce((s,x)=>s+x.profit,0),overlap:f.history.filter(x=>x.round>=4).reduce((s,x)=>s+x.profit,0),first12:f.history.slice(0,12).reduce((s,x)=>s+x.profit,0),history:process.argv.includes('--details')?f.history:undefined}))}));
}
