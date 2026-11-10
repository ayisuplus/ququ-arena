import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
const here=import.meta.dir, source=resolve(here,"../.."), game="E:/projects/黑洞空间站";
const hash=(v:Uint8Array)=>createHash("sha256").update(v).digest("hex");
const git=(cwd:string,...args:string[])=>{const r=Bun.spawnSync(["git","--no-optional-locks",...args],{cwd,windowsHide:true,stdout:"pipe",stderr:"pipe"});if(r.exitCode)throw new Error("Git read failed");return r.stdout;};
const safe=(s:any)=>({sessionId:s.sessionId,provider:s.model?.provider,model:s.model?.id,messageCount:s.messageCount,isSettled:s.isSettled,isStreaming:s.isStreaming,hasPendingAsyncWork:s.hasPendingAsyncWork,queuedMessageCount:s.queuedMessageCount});
const idle=(s:any)=>s.isSettled&&!s.isStreaming&&!s.hasPendingAsyncWork&&!s.queuedMessageCount;
const hosts=[];
for(const round of ["alpha-round-011-host-state","alpha-round-013-tool-selection"]){
 const h=JSON.parse(await readFile(join(source,".alpha",round,"host.private.json"),"utf8"));
 const get=async(path:string)=>fetch(`http://127.0.0.1:${h.port}${path}`,{headers:{"x-alpha-token":h.token},signal:AbortSignal.timeout(30000)});
 const health=await (await get("/health")).json() as any;
 if(health.engine!=="omp-native")throw new Error("Wrong host identity");
 const sessions=await (await get("/api/native/sessions")).json() as any, states=[];
 for(const s of sessions.sessions){const r=await get(`/api/native/sessions/${s.id}/state`);if(r.status===409){states.push({id:s.id,cwd:s.cwd,closed:true});continue;}if(!r.ok)throw new Error("State unavailable");const state=safe(await r.json());states.push({id:s.id,cwd:s.cwd,...state});if(!idle(state))throw new Error("Active task; do not dispatch");}
 let chosen;
 if(round==="alpha-round-013-tool-selection"){const catalog=await(await get("/api/native/models")).json() as any;const m=catalog.models.find((m:any)=>m.available&&m.provider==="opencode-go"&&m.id==="mimo-v2.6-pro");if(!m)throw new Error("Go model unavailable");chosen={provider:m.provider,id:m.id,input:m.input,reasoning:m.reasoning,available:m.available};}
 hosts.push({round,pid:h.pid,engine:health.engine,states,chosen});
}
const repos=[source,game].map(cwd=>({cwd,head:git(cwd,"rev-parse","HEAD").toString().trim(),status:git(cwd,"status","--porcelain").toString(),indexSha256:hash(git(cwd,"ls-files","--stage"))}));
if(repos.some(r=>r.status))throw new Error("Baseline dirty; inspect before game task");
if(git(game,"diff","c21c4dc3d00764932457199735697d7f34223b8e","HEAD","--","QuQuArena3D").length)throw new Error("Player baseline source drift");
await writeFile(join(here,"preflight.json"),JSON.stringify({atUtc:new Date().toISOString(),repos,hosts,requests:0},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({repos,hosts:hosts.map(h=>({round:h.round,pid:h.pid,sessions:h.states.length,allClosedOrIdle:true,chosen:h.chosen})),requests:0}));
