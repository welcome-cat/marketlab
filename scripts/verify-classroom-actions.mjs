// Offline transaction contract checks. Never connects to Firebase.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
globalThis.fixture = new Map();
registerHooks({
 resolve(s,c,next) {
  if(s==='firebase/firestore') return {url:'mock:firestore',shortCircuit:true};
  if(s.startsWith('.')&&c.parentURL?.endsWith('.ts')) {const u=new URL(s+'.ts',c.parentURL);if(existsSync(u))return {url:u.href,shortCircuit:true};}
  return next(s,c);
 },
 load(u,c,next) {
  if(u==='mock:firestore')return {format:'module',shortCircuit:true,source:`
   export const doc=(_db,...parts)=>parts.join('/');
   export async function runTransaction(_db,fn){const changes=[];const result=await fn({get:async ref=>({exists:()=>globalThis.fixture.has(ref),data:()=>structuredClone(globalThis.fixture.get(ref)),id:ref.split('/').at(-1)}),update:(ref,data)=>changes.push([ref,data])});for(const [ref,data] of changes)globalThis.fixture.set(ref,{...globalThis.fixture.get(ref),...data});return result;}
   export const collection=()=>{},getDoc=()=>{},getDocs=()=>{},onSnapshot=()=>{},query=()=>{},where=()=>{},writeBatch=()=>{},setDoc=()=>{},updateDoc=()=>{};
  `};
  if(u.endsWith('/firebase/config.ts'))return {format:'module',source:'export const db={};',shortCircuit:true};
  if(u.endsWith('.ts'))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText};
  return next(u,c);
 }
});
const {companyService}=await import('../src/services/companyService.ts');
const {MARKETS}=await import('../src/types/domain.ts');
const {defaultNewsTemplates}=await import('../src/services/newsService.ts');
const room='rooms/test',firm=room+'/companies/a';
fixture.set(room,{currentRound:1,status:'RUNNING',roundPhase:'DECISION',markets:MARKETS,economicsQuizzes:[{id:'q',question:'test',choices:['a','b'],answer:1,reward:100}],quizSchedule:{'1':'q'}});
fixture.set(firm,{cash:1000,currentMarketId:MARKETS[0].id,machineAssets:[]});
await companyService.awardQuiz('test','a',1,0);
assert.equal(fixture.get(firm).cash,1000);
assert.equal(fixture.get(firm).quizAttempts['1'].correct,false);
await assert.rejects(companyService.awardQuiz('test','a',1,1),/QUIZ_ALREADY_COMPLETED/);
fixture.set(firm,{cash:1000,currentMarketId:MARKETS[0].id,machineAssets:[]});
await companyService.awardQuiz('test','a',1,1);
assert.equal(fixture.get(firm).cash,1100);
await assert.rejects(companyService.awardQuiz('test','a',2,1),/ROUND_CHANGED/);
await companyService.exitMarket('test','a',MARKETS[0].id,MARKETS[1].id);
assert.equal(fixture.get(firm).currentMarketId,MARKETS[1].id);
await assert.rejects(companyService.exitMarket('test','a',MARKETS[0].id,MARKETS[1].id),/MARKET_CHANGED/);
fixture.set(room+'/productionPlans/a_1',{});
await assert.rejects(companyService.exitMarket('test','a',MARKETS[1].id,MARKETS[0].id),/PRODUCTION_ALREADY_CONFIRMED/);
for(const [id,article] of Object.entries(defaultNewsTemplates()).filter(([id])=>!id.startsWith('recovery_'))){assert.ok(article.body.trim().length>0,id);assert.ok(article.body.split('\n').length<=2,id);}
console.log('PASS: correct/wrong quiz rewards, repeat submission, changed round, atomic market change guards, short articles.');

const {roomService, normalizeRoom, withRecoveryNews}=await import('../src/services/roomService.ts');
const {getPublishedNewspaper}=await import('../src/services/newsService.ts');
const waiting=normalizeRoom('test',{status:'WAITING',currentRound:1,markets:MARKETS});
assert.deepEqual(getPublishedNewspaper(waiting),[]);
const articles=waiting.demandEvents.map(event=>({...event,articleHeadline:'새 소비자 기사',articleBody:'수정한 소비자 원고',supplyArticleHeadline:'새 생산 기사',supplyArticleBody:'수정한 생산 원고'}));
fixture.set(room,waiting);
await roomService.confirmDemandEvents('test',articles);
assert.deepEqual(getPublishedNewspaper(normalizeRoom('test',fixture.get(room))),normalizeRoom('test',fixture.get(room)).pendingDemandEvents);
assert.equal(getPublishedNewspaper(fixture.get(room))[0].articleBody,'수정한 소비자 원고');
await roomService.startRoom('test');
assert.equal(getPublishedNewspaper(fixture.get(room))[0].supplyArticleBody,'수정한 생산 원고');
await assert.rejects(roomService.confirmDemandEvents('test',articles),/DEMAND_EVENT_SELECTION_NOT_ALLOWED/);
const recovered=withRecoveryNews(articles,[{...articles[0],optionId:'income_up'}]);
assert.notEqual(recovered[0].articleBody,articles[0].articleBody);
assert.deepEqual(withRecoveryNews(recovered,[{...articles[0],optionId:'income_up'}]),recovered);
console.log('PASS: unpublished waiting room, publish before start, unchanged articles on start, rejected late publication, recovery included once.');
