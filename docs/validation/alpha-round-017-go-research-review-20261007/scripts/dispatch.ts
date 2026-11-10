import { createHash } from "node:crypto";
import { access, appendFile, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
const here=import.meta.dir,source=resolve(here,"../.."),game="E:/projects/黑洞空间站";
if(await access(join(here,"dispatch-started.json")).then(()=>true,()=>false))throw new Error("Request already sent; observe same session");
const host=JSON.parse(await readFile(join(source,".alpha/alpha-round-013-tool-selection/host.private.json"),"utf8"));
const ready=JSON.parse(await readFile(join(here,"readiness.json"),"utf8")),base=`/api/native/sessions/${ready.sessionId}`;
const archive=join(source,"docs/validation/alpha-round-016-tool-refresh-20261007");
const player=JSON.parse(await readFile(join(archive,"receipts/player-result.json"),"utf8"));
if(player.actualPlayerExitCode!==0||player.report?.passed!==true||!player.userData.contentUnchanged)throw new Error("Player evidence incomplete");
const hash=(v:Uint8Array|string)=>createHash("sha256").update(v).digest("hex");
const save=(name:string,value:any)=>writeFile(join(here,name),JSON.stringify(value,null,2)+"\n",{flag:"wx"});
const calls:any[]=[],events:any[]=[];
async function api(path:string,input?:any){const r=await fetch(`http://127.0.0.1:${host.port}${path}`,{method:input===undefined?"GET":"POST",headers:{"x-alpha-token":host.token,"content-type":"application/json"},...(input===undefined?{}:{body:JSON.stringify(input)}),signal:AbortSignal.timeout(input?.type==="prompt"?600000:60000)});calls.push({atUtc:new Date().toISOString(),path,type:input?.type,status:r.status});if(!r.ok)throw new Error(`HTTP ${r.status} on ${path}`);return await r.json() as any;}
const safe=(s:any)=>({ompSessionId:s.sessionId,provider:s.model?.provider,model:s.model?.id,messageCount:s.messageCount,isSettled:s.isSettled,isStreaming:s.isStreaming,hasPendingAsyncWork:s.hasPendingAsyncWork,queuedMessageCount:s.queuedMessageCount});
const idle=(s:any)=>s.isSettled&&!s.isStreaming&&!s.hasPendingAsyncWork&&!s.queuedMessageCount;
const before=safe(await api(base+"/state")),selection=await api(base+"/host/tools");
if(!idle(before)||before.messageCount||before.provider!=="opencode-go"||before.model!=="mimo-v2.6-pro"||JSON.stringify(selection)!==JSON.stringify(ready.restricted))throw new Error("Dispatch readiness drift");
const git=(...args:string[])=>{const r=Bun.spawnSync(["git","--no-optional-locks",...args],{cwd:game,windowsHide:true,stdout:"pipe",stderr:"pipe"});if(r.exitCode)throw new Error("Git read failed");return r.stdout.toString();};
const gameBefore={head:git("rev-parse","HEAD").trim(),status:git("status","--porcelain"),index:hash(git("ls-files","--stage"))};
if(gameBefore.status||git("diff","c21c4dc3d00764932457199735697d7f34223b8e","HEAD","--","QuQuArena3D").length)throw new Error("Game drift before author task");
const images=[];for(const name of ["research-arrival.png","research-turn.png"]){const path=join(archive,"player",name),bytes=await readFile(path);images.push({path,bytes:bytes.length,sha256:hash(bytes)});}
let native:any,accepted:any;
const abort=new AbortController(),stream=await fetch(`http://127.0.0.1:${host.port}${base}/events`,{headers:{"x-alpha-token":host.token},signal:abort.signal});
if(!stream.ok)throw new Error("Cannot observe task");
const observing=(async()=>{const decoder=new TextDecoder();let buffer="";for await(const bytes of stream.body!){buffer+=decoder.decode(bytes,{stream:true});const blocks=buffer.split("\n\n");buffer=blocks.pop()!;for(const block of blocks){const line=/^data: (.+)$/m.exec(block)?.[1];if(!line)continue;const event=JSON.parse(line);if(event.type==="prompt_result"){native=event;await save("native-result.private.json",event);}if(!["agent_start","agent_end","session_settled","prompt_result","alpha_snapshot","tool_execution_start","tool_execution_end","host_error","host_exit"].includes(event.type))continue;const imageBlocks=(event.result?.content??[]).filter((c:any)=>c.type==="image").map((c:any)=>({mimeType:c.mimeType,encodedCharacters:c.data?.length,dataSha256:c.data?hash(c.data):undefined}));const row={atUtc:new Date().toISOString(),type:event.type,status:event.status,agentInvoked:event.agentInvoked,sessionSettled:event.sessionSettled,toolName:event.toolName,toolCallId:event.toolCallId,path:event.type==="tool_execution_start"?event.args?.path:undefined,isError:event.isError,hasError:!!event.error,imageBlocks};events.push(row);await appendFile(join(here,"events.jsonl"),JSON.stringify(row)+"\n");}}})().catch(async error=>{if(!abort.signal.aborted)await save("observer-error.json",{atUtc:new Date().toISOString(),message:String(error).replaceAll(host.token,"[PRIVATE]")});});
const message=(await readFile(join(here,"task.txt"),"utf8")).trim();
await save("dispatch-started.json",{atUtc:new Date().toISOString(),sessionId:ready.sessionId,model:"opencode-go/mimo-v2.6-pro",requests:1,retry:false,promptSha256:hash(message),images,gameBefore});
console.log(JSON.stringify({phase:"dispatch-started",sessionId:ready.sessionId,requests:1}));
const request=api(base+"/command",{type:"prompt",message}).then(async r=>{accepted={atUtc:new Date().toISOString(),success:r.success,agentInvoked:r.data?.agentInvoked};await save("accepted.json",accepted);},async error=>{accepted={atUtc:new Date().toISOString(),transportError:String(error).replaceAll(host.token,"[PRIVATE]")};await save("accepted.json",accepted);});
try{
 for(;;){await Bun.sleep(2500);try{const s=safe(await api(base+"/state"));await appendFile(join(here,"states.jsonl"),JSON.stringify({atUtc:new Date().toISOString(),accepted:!!accepted,...s})+"\n");if(accepted&&native&&idle(s))break;}catch(error){await appendFile(join(here,"observation-errors.jsonl"),JSON.stringify({atUtc:new Date().toISOString(),error:String(error).replaceAll(host.token,"[PRIVATE]")})+"\n");}}
 await request;
 const after=safe(await api(base+"/state")),page=await api(base+"/command",{type:"get_messages_page",limit:100}),snapshots=await api(base+"/snapshots");
 const messages=page.data.messages,assistants=messages.filter((m:any)=>m.role==="assistant"),toolResults=messages.filter((m:any)=>m.role==="toolResult");
 const answer=assistants.at(-1)?.content?.filter((c:any)=>c.type==="text").map((c:any)=>c.text).join("\n")??"";
 await writeFile(join(here,"alpha-answer.md"),answer+"\n",{flag:"wx"});
 const restored=await api(base+"/host/tools",{action:"set",names:ready.previousTools.enabled,mounted:ready.previousTools.mounted});
 const restoreExact=["enabled","active","mounted"].every(key=>JSON.stringify([...restored[key]].sort())===JSON.stringify([...ready.previousTools[key]].sort()));
 const imageReads=images.map(image=>({...image,reads:events.filter(e=>e.type==="tool_execution_start"&&e.path?.replaceAll("\\","/")===image.path.replaceAll("\\","/")).map(start=>({start,end:events.find(e=>e.type==="tool_execution_end"&&e.toolCallId===start.toolCallId)}))}));
 const receipt={atUtc:new Date().toISOString(),sessionId:ready.sessionId,before,after,accepted,requests:calls.filter(c=>c.type==="prompt").length,retry:false,responseModels:[...new Set(assistants.map((m:any)=>`${m.provider}/${m.model}`))],native:{status:native.status,agentInvoked:native.agentInvoked,sessionSettled:native.sessionSettled,hasError:!!native.error},tools:{count:toolResults.length,names:toolResults.map((m:any)=>m.toolName),errors:toolResults.filter((m:any)=>m.isError).length,restored,restoreExact},imageReads,game:{before:gameBefore,after:{head:git("rev-parse","HEAD").trim(),status:git("status","--porcelain"),index:hash(git("ls-files","--stage"))}},configUnchanged:hash(await readFile(ready.configPath))===ready.configSha256,latestSnapshot:snapshots.turns.at(-1),scope:"One genuine Go image+source diagnosis. Coordinator supplied Player; no Alpha Unity/Player execution, asset edit or construction acceptance."};
 await save("receipt.json",receipt);await save("calls.json",calls);
 console.log(JSON.stringify({phase:"finished",native:receipt.native,model:receipt.responseModels,tools:receipt.tools.count,errors:receipt.tools.errors,imageReads:imageReads.map(i=>({path:i.path,successfulImages:i.reads.filter(r=>r.end&&!r.end.isError&&r.end.imageBlocks.length).length})),restored:restoreExact,gameClean:!receipt.game.after.status}));
 if(!accepted.success||native.status!=="completed"||native.error||!idle(after)||receipt.requests!==1||!restoreExact||receipt.tools.errors||receipt.responseModels.some(m=>m!=="opencode-go/mimo-v2.6-pro")||imageReads.some(i=>!i.reads.some(r=>r.end&&!r.end.isError&&r.end.imageBlocks.length))||JSON.stringify(receipt.game.before)!==JSON.stringify(receipt.game.after)||!receipt.configUnchanged)process.exitCode=1;
}finally{abort.abort();await observing;}
