import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { normalize, hash, hundredths } from "./source";
import { preview, type Review } from "./review";
import { build } from "./build";
import { consoleScript } from "./console";
const args = ["-h","/tmp","-p","55433","-U","runner","-d","postgres","-v","ON_ERROR_STOP=1","-At"];
const sql = (s: string) => execFileSync("psql",args,{input:s,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();
const source = await normalize();
assert.equal(source.tasks.length,41);
assert.equal(source.tasks.reduce((s,t)=>s+t.hours100,0),906900);
assert.equal(source.phases.reduce((s,t)=>s+t.feeCents,0),424429200);
assert.equal(source.tasks.find(t=>t.key==="2.4")?.hours100,91800);
assert.throws(()=>hundredths(0.001));
assert.equal(hash(source),hash(await normalize()));
assert((await preview()).blockers.length>40);
const role = {id:"fixture-role",name:"Fixture only",tenant_id:"fixture-tenant",default_cost_rate:"175.13",default_rack_rate:"900.00",is_always_salaried:false};
const review: Review = {sourceHash:hash(source),tenant:{id:"fixture-tenant",name:"The Synozur Alliance",slug:"synozur"},
 databaseName:"postgres",publishedUrl:"https://fixture.invalid",productionConnectionEvidence:"ISOLATED FIXTURE ONLY",
 costCurrency:"USD",currencyReview:"Fixture USD",operatorReference:"TEST ONLY",estimateName:source.estimateName,estimateDate:source.estimateDate,
 roles:[role,{...role,id:"fixture-role2"}],allocations:Object.fromEntries([...source.tasks,...source.supplements].map(a=>[a.key,{note:"Fixture-only allocation, NOT a proposed production mapping",splits:[{roleId:role.id,hours100:a.hours100}]}]))};
review.allocations["1.1.1"].splits=[{roleId:role.id,hours100:3333},{roleId:"fixture-role2",hours100:4667}];
const p=await preview(review);assert.deepEqual(p.blockers,[]);
assert.equal(p.lines.reduce((s,l)=>s+l.feeCents,0),424429200);
for(const mutate of [
 (r:Review)=>r.costCurrency="EUR",
 (r:Review)=>r.roles[0].default_cost_rate=null,
 (r:Review)=>r.roles[0].tenant_id="foreign",
 (r:Review)=>r.roles[0].is_always_salaried=true,
 (r:Review)=>r.allocations["1.1.1"].splits[0].hours100++,
 (r:Review)=>delete r.allocations["1.CONT"],
 (r:Review)=>r.sourceHash="changed",
]) {const r=structuredClone(review);mutate(r);assert((await preview(r)).blockers.length);}
await assert.rejects(()=>build(review,"apply","wrong"));
sql(`INSERT INTO tenants(id,name,slug) VALUES('fixture-tenant','The Synozur Alliance','synozur');
INSERT INTO roles(id,name,tenant_id,default_rack_rate,default_cost_rate) VALUES
('fixture-role','Fixture only','fixture-tenant',900,175.13),('fixture-role2','Fixture only 2','fixture-tenant',900,175.13);`);
review.roles[1].name="Fixture only 2";
const approved=await preview(review);
const apply=consoleScript(await build(review,"apply",approved.previewHash)),rollback=consoleScript(await build(review,"rollback",approved.previewHash));
// Failed transaction must leave no client.
assert.throws(()=>sql(apply.replace("INSERT INTO public.estimate_line_items","SELECT 1/0; INSERT INTO public.estimate_line_items")));
assert.equal(sql("SELECT count(*) FROM clients"),"0");
// Two concurrent imports serialize and only create one hierarchy.
const parallel = (text:string)=>new Promise<void>((resolve,reject)=>{
 const child=spawn("psql",args,{stdio:["pipe","pipe","pipe"]});let err="";
 child.stderr.on("data",d=>err+=d);child.on("close",code=>code===0?resolve():reject(new Error(err)));child.stdin.end(text);
});
await Promise.all([parallel(apply),parallel(apply)]);
assert.equal(sql("SELECT count(*) FROM clients"),"1");
assert.equal(sql("SELECT sum(adjusted_hours)||':'||sum(total_amount) FROM estimate_line_items"),"13059.36:4244292.00");
assert.equal(sql("SELECT count(*) FROM estimate_line_items WHERE rate<>325 OR factor<>1 OR NOT has_manual_rate_override"),"0");
assert.equal(sql("SELECT count(*) FROM projects"),"0");
sql(await build(review,"verify"));
const changed=structuredClone(review);changed.operatorReference="changed";
const cp=await preview(changed);
const changedSql=await build(changed,"apply",cp.previewHash);assert.throws(()=>sql(changedSql));
sql("UPDATE estimate_line_items SET comments='edited' WHERE id=(SELECT id FROM estimate_line_items LIMIT 1)");
assert.throws(()=>sql(apply));assert.throws(()=>sql(rollback));
sql(`UPDATE estimate_line_items t SET comments=x->'row'->>'comments' FROM ai_guardrails_import_runs,
 jsonb_array_elements(after_images) x WHERE x->>'table'='estimate_line_items' AND t.id=x->'row'->>'id'`);
sql("INSERT INTO users(id,name) VALUES('fixture-user','Fixture'); INSERT INTO estimate_shares(estimate_id,user_id,granted_by) SELECT id,'fixture-user','fixture-user' FROM estimates");
assert.throws(()=>sql(rollback));
sql("DELETE FROM estimate_shares");
sql("UPDATE roles SET default_cost_rate=176 WHERE id='fixture-role'");
assert.throws(()=>sql(apply));
sql("UPDATE roles SET default_cost_rate=175.13 WHERE id='fixture-role'");
sql(rollback);
assert.equal(sql("SELECT count(*) FROM clients"),"0");
assert.equal(sql("SELECT count(*) FROM ai_guardrails_import_runs WHERE rolled_back_at IS NOT NULL"),"1");
assert.throws(()=>sql(apply));
console.log("Guardrails isolated reconciliation, splits, costing, concurrent idempotency, drift, atomicity and rollback checks passed.");
