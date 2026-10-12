// Isolated local PostgreSQL only; NEVER reads the application's environment URL.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { buildSql, buildOperatorApply } from "../scripts/platinum-co1/build";
const sql = (text: string) => execFileSync("psql", ["-h","/tmp","-p","55432","-U","runner","-d","postgres","-v","ON_ERROR_STOP=1","-At"], {input:text,encoding:"utf8",stdio:["pipe","pipe","pipe"]});
const fail = (text: string) => assert.throws(() => sql(text));
sql(`DELETE FROM clients WHERE id='co-c'; DELETE FROM tenants WHERE id IN ('co-t','co-other');
INSERT INTO tenants(id,name,slug) VALUES('co-t','CO Fixture','co-fixture'),('co-other','Other Fixture','co-other');
INSERT INTO clients(id,tenant_id,name) VALUES('co-c','co-t','Platinum Equity');
INSERT INTO projects(id,tenant_id,client_id,name,code,commercial_scheme) VALUES('co-p','co-t','co-c','Fixture Platinum','CO-TEST','tm');
INSERT INTO users(id,name,primary_tenant_id) VALUES('co-u','Fixture Owner','co-t');
INSERT INTO project_engagements(id,tenant_id,project_id,user_id) VALUES('co-e','co-t','co-p','co-u');
INSERT INTO commercial_buckets(id,tenant_id,project_id,label,basis,value_basis,dollar_ceiling) VALUES
('co-r','co-t','co-p','Recovery','fixed_fee',24092,null),
('co-f','co-t','co-p','Configuration','fixed_fee',50000,null),
('co-a','co-t','co-p','Advisory','capped_tm',null,26000);
INSERT INTO project_allocations(id,tenant_id,project_id,person_id,week_number,hours,pricing_mode,rack_rate,planned_start_date,planned_end_date)
VALUES('co-existing','co-t','co-p','co-u',1,4,'person',200,'2026-07-01','2026-07-03');`);
sql(`INSERT INTO time_entries(id,tenant_id,project_id,person_id,date,hours,commercial_bucket_id,commercial_eligibility_outcome)
VALUES('co-time','co-t','co-p','co-u','2026-06-01',4,'co-r','not_eligible');
INSERT INTO project_planner_connections(id,project_id,plan_id,sync_enabled) VALUES('co-conn','co-p','external-plan',false);
INSERT INTO planner_task_sync(id,connection_id,allocation_id,task_id) VALUES('co-sync','co-conn','co-existing','external-task');`);
const get = (table: string, id: string) => JSON.parse(sql(`SELECT to_jsonb(t) FROM ${table} t WHERE id='${id}';`).trim());
const timeBefore=get("time_entries","co-time"), plannerBefore=get("planner_task_sync","co-sync");
const m = JSON.parse(readFileSync("scripts/platinum-co1/manifest.json","utf8"));
Object.assign(m,{tenantId:"co-t",tenantName:"CO Fixture",projectId:"co-p",projectName:"Fixture Platinum",operatorReference:"Fixture review",inventoryReviewed:true,plannerMaintenanceConfirmed:true,originalAnchor:"2026-07-01"});
for(const [key,id] of [["recovery","co-r"],["configuration","co-f"],["advisory","co-a"]]) Object.assign(m.buckets[key],{id,expected:get("commercial_buckets",id)});
for(const s of m.sources) Object.assign(s,{decision:"exclude",reviewNote:"Fixture excludes overlapping scope",assignments:[]});
const row = {sourceKey:"security/one",action:"update",allocationId:"co-existing",expected:get("project_allocations","co-existing"),classification:"configuration",scheduleMode:"rebase",sourcePrecision:"reviewed month-only offsets",sourceStart:"2026-07-01",sourceEnd:"2026-07-03",ownerReviewed:true,effortRatesReviewed:true,hierarchyReviewed:true,scheduleReviewed:true,reviewNote:"Fixture approved"};
Object.assign(m.sources[0],{decision:"include",assignments:[row]});
assert.match(sql(buildSql(m,"preview")),/2026-08-18/);
const missingAssignments=structuredClone(m);
missingAssignments.sources[1].decision="include";
delete missingAssignments.sources[1].assignments;
assert.match(sql(buildSql(missingAssignments,"preview")),/Unresolved source decision/);
fail(buildSql(missingAssignments,"apply",true));
assert.equal(sql("SELECT count(*) FROM assignment_import_runs").trim(),"0");
const nullAssignments=structuredClone(missingAssignments);
nullAssignments.sources[1].assignments=null;
fail(buildSql(nullAssignments,"apply",true));
const wrong=structuredClone(m); wrong.tenantId="co-other"; fail(buildSql(wrong,"apply",true));
assert.equal(get("project_allocations","co-existing").commercial_bucket_id,null);
sql(buildSql(m,"apply",true));
const after=get("project_allocations","co-existing");
assert.equal(after.planned_start_date,"2026-08-18"); assert.equal(after.planned_end_date,"2026-08-20");
sql(buildSql(m,"apply",true)); assert.deepEqual(get("project_allocations","co-existing"),after);
sql(`UPDATE project_allocations SET notes='later edit' WHERE id='co-existing'`);
fail(buildSql(m,"apply",true)); fail(buildSql(m,"rollback",true));
sql(`UPDATE project_allocations SET notes=NULL WHERE id='co-existing'`);
sql(buildSql(m,"rollback",true)); assert.deepEqual(get("project_allocations","co-existing"),row.expected);
fail(`UPDATE project_allocations SET tenant_id='co-other',commercial_bucket_id='co-f' WHERE id='co-existing'`);
sql(`UPDATE commercial_buckets SET is_active=false WHERE id='co-f'`);
fail(`UPDATE project_allocations SET commercial_bucket_id='co-f' WHERE id='co-existing'`);
sql(`UPDATE commercial_buckets SET is_active=true WHERE id='co-f';
DELETE FROM assignment_import_rows; DELETE FROM assignment_import_runs;
UPDATE projects SET commercial_buckets_required=true WHERE id='co-p';`);
// Explicit baseline remains null even on a time-classification-required project.
const baseline=structuredClone(m);
Object.assign(baseline.sources[0].assignments[0],{classification:"baseline",scheduleMode:"preserve"});
sql(buildSql(baseline,"apply",true));
assert.equal(get("project_allocations","co-existing").commercial_bucket_id,null);
assert.equal(get("project_allocations","co-existing").last_edited_at,null);
sql(buildSql(baseline,"rollback",true));
sql(`DELETE FROM assignment_import_rows; DELETE FROM assignment_import_runs;`);
const completed=structuredClone(m);
sql(`UPDATE project_allocations SET status='completed',completed_date='2026-07-03' WHERE id='co-existing'`);
completed.sources[0].assignments[0].expected=get("project_allocations","co-existing");
fail(buildSql(completed,"apply",true));
sql(`UPDATE project_allocations SET status='open',completed_date=NULL WHERE id='co-existing'`);
const insertion=structuredClone(m);
const inserted={...row,sourceKey:"security/new",action:"insert",allocationId:"co-new",expected:undefined,values:{person_id:"co-u",task_description:"Reviewed new requirements",hours:2,rack_rate:200,pricing_mode:"person",week_number:1}};
insertion.sources[0].assignments.push(inserted);
const interrupted=structuredClone(insertion); interrupted.sources[0].assignments[1].values.person_id="missing";
fail(buildSql(interrupted,"apply",true));
assert.equal(get("project_allocations","co-existing").commercial_bucket_id,null);
sql(buildSql(insertion,"apply",true)); sql(buildSql(insertion,"apply",true));
assert.equal(get("project_allocations","co-new").planned_end_date,"2026-08-20");
sql(`CREATE TABLE fixture_new_reference(allocation_id varchar REFERENCES project_allocations(id) ON DELETE CASCADE);
INSERT INTO fixture_new_reference VALUES('co-new')`);
fail(buildSql(insertion,"rollback",true));
sql(`DROP TABLE fixture_new_reference`);
sql(buildSql(insertion,"rollback",true));
assert.equal(sql(`SELECT count(*) FROM project_allocations WHERE id='co-new'`).trim(),"0");
assert.deepEqual(get("time_entries","co-time"),timeBefore);
assert.deepEqual(get("planner_task_sync","co-sync"),plannerBefore);
// Client execution is tracked without named people or billable allocations.
sql(`DELETE FROM assignment_import_rows; DELETE FROM assignment_import_runs;`);
const withClient=structuredClone(insertion);
withClient.clientTrackingReviewed=true;
withClient.clientTracking=[{
  id:"10000000-0000-4000-8000-000000000001",sourceKey:"D-baseline",type:"action_item",
  title:"Client executes No-AI labeling",description:"Approved client-owned execution, unassigned.",
  dueDate:"2026-08-25",ownerId:null,assigneeId:null
}];
const unapprovedClient=structuredClone(withClient);
unapprovedClient.clientTrackingReviewed=false;
fail(buildSql(unapprovedClient,"apply",true));
const namedClient=structuredClone(withClient);
namedClient.clientTracking[0].ownerId="co-u";
fail(buildSql(namedClient,"apply",true));
const duplicateClient=structuredClone(withClient);
duplicateClient.clientTracking.push({...duplicateClient.clientTracking[0]});
fail(buildSql(duplicateClient,"apply",true));
// Invalid calendar dates fail after assignment insertion, but the whole batch rolls back.
const invalidClientDate=structuredClone(withClient);
invalidClientDate.clientTracking[0].dueDate="2026-02-31";
fail(buildOperatorApply(invalidClientDate));
assert.equal(sql(`SELECT count(*) FROM project_allocations WHERE id='co-new'`).trim(),"0");
assert.equal(sql(`SELECT count(*) FROM assignment_import_runs`).trim(),"0");
assert.match(sql(buildSql(withClient,"preview")),/insert \(not applied\)/);
sql(buildSql(withClient,"apply")); // Dry-run includes companion, persists nothing.
assert.equal(sql(`SELECT count(*) FROM raidd_entries`).trim(),"0");
sql(buildOperatorApply(withClient));
const clientAfter=get("raidd_entries",withClient.clientTracking[0].id);
assert.equal(clientAfter.owner_id,null);
assert.equal(clientAfter.assignee_id,null);
assert.equal(clientAfter.status,"open");
assert.equal(sql(`SELECT count(*) FROM assignment_import_runs`).trim(),"2");
sql(buildSql(withClient,"apply",true));
assert.deepEqual(get("raidd_entries",clientAfter.id),clientAfter);
assert.match(sql(buildSql(withClient,"verify")),/unchanged \/ verified/);
sql(`UPDATE raidd_entries SET status='closed' WHERE id='${clientAfter.id}'`);
fail(buildSql(withClient,"apply",true));
fail(buildSql(withClient,"rollback",true));
assert.equal(sql(`SELECT count(*) FROM project_allocations WHERE id='co-new'`).trim(),"1");
sql(`UPDATE raidd_entries SET status='open' WHERE id='${clientAfter.id}';
CREATE TABLE fixture_raidd_reference(entry_id varchar REFERENCES raidd_entries(id) ON DELETE SET NULL);
INSERT INTO fixture_raidd_reference VALUES('${clientAfter.id}')`);
fail(buildSql(withClient,"rollback",true));
sql(`DROP TABLE fixture_raidd_reference;
INSERT INTO raidd_entries(id,tenant_id,project_id,type,title,parent_entry_id)
VALUES('co-client-child','co-t','co-p','action_item','Later child','${clientAfter.id}')`);
fail(buildSql(withClient,"rollback",true));
sql(`DELETE FROM raidd_entries WHERE id='co-client-child'`);
sql(buildSql(withClient,"rollback",true));
assert.equal(sql(`SELECT count(*) FROM raidd_entries`).trim(),"0");
assert.equal(sql(`SELECT count(*) FROM project_allocations WHERE id='co-new'`).trim(),"0");
assert.equal(sql(`SELECT count(*) FROM assignment_import_runs WHERE rolled_back_at IS NOT NULL`).trim(),"2");
fail(buildSql(withClient,"apply",true));
assert.deepEqual(get("time_entries","co-time"),timeBefore);
assert.deepEqual(get("planner_task_sync","co-sync"),plannerBefore);
console.log("Platinum SQL: preview, atomic failure, tenant isolation, signature anchor, rerun, later-edit protection, rollback, archived rejection passed");
console.log("Client companion: approval, unnamed ownership, duplicate prevention, atomic dry-run/apply, rerun, complete audit images, later-edit/FK/logical-reference protection and rollback passed");
