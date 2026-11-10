import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const here=import.meta.dir,source=resolve(here,"../..");
const hash=(v:Uint8Array|string)=>createHash("sha256").update(v).digest("hex");
const native=JSON.parse(await readFile(join(here,"native-result.private.json"),"utf8"));
if(native.status!=="completed"||!native.sessionSettled)throw new Error("Native task not complete");
const h=JSON.parse(await readFile(join(source,".alpha/alpha-round-013-tool-selection/host.private.json"),"utf8")),ready=JSON.parse(await readFile(join(here,"readiness.json"),"utf8"));
const response=await fetch(`http://127.0.0.1:${h.port}/api/native/sessions/${ready.sessionId}/command`,{method:"POST",headers:{"x-alpha-token":h.token,"content-type":"application/json"},body:JSON.stringify({type:"get_messages_page",limit:100}),signal:AbortSignal.timeout(60000)});
if(!response.ok)throw new Error("Cannot read completed transcript");
const page=await response.json() as any,messages=page.data.messages,assistants=messages.filter((m:any)=>m.role==="assistant"),images=[];
for(const m of messages.filter((m:any)=>m.role==="toolResult"))for(const c of m.content??[])if(c.type==="image"){
 const b=Buffer.from(c.data,"base64"),file=`alpha-read-image-${images.length+1}.webp`;
 if(c.mimeType!=="image/webp"||m.isError)throw new Error("Unexpected image result");
 await writeFile(join(here,file),b,{flag:"wx"});images.push({file,toolCallId:m.toolCallId,toolName:m.toolName,mimeType:c.mimeType,bytes:b.length,sha256:hash(b),encodedSha256:hash(c.data)});
}
const answer=assistants.at(-1).content.filter((c:any)=>c.type==="text").map((c:any)=>c.text).join("\n");
await writeFile(join(here,"review-answer.md"),answer+"\n",{flag:"wx"});
await writeFile(join(here,"image-payloads.json"),JSON.stringify({atUtc:new Date().toISOString(),nativeCompleted:true,assistantMessageCount:assistants.length,models:[...new Set(assistants.map((m:any)=>`${m.provider}/${m.model}`))],images,scope:"Exact image blocks returned by native read, after its own image conversion. Not original PNG bytes or provider HTTP capture."},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({assistantMessageCount:assistants.length,imageBlocks:images.length,answerCharacters:answer.length}));
