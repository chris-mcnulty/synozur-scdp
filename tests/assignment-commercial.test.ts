import { describe, it, expect } from "vitest";
import { assignmentBucketSelection, validateAssignmentBucket, bulkSetAssignmentBucket } from "../server/lib/assignment-commercial";
import { changedAssignmentFields, assignmentFormPricingMode, assignmentPersonChanged } from "../shared/assignment-patch";

function database(project: any, bucket?: any) {
  let index=0;
  return {select:()=>({from:()=>({where:async()=>[index++===0?project:bucket].filter(Boolean)})})};
}
describe("optional assignment commercial contract",()=>{
  it("preserves role pricing and completed engagement on a bucket-only form submission",()=>{
    const existing={personId:"owner",roleId:"consultant",pricingMode:"role",commercialBucketId:"old",lastEditedAt:"2026-08-01"};
    const engagement={status:"completed"};
    const proposed={personId:"owner",roleId:"consultant",pricingMode:assignmentFormPricingMode(existing,"owner","consultant"),commercialBucketId:null};
    const patch=changedAssignmentFields(existing,proposed);
    expect(patch).toEqual({commercialBucketId:null});
    expect(assignmentPersonChanged(existing,proposed)).toBe(false);
    expect(assignmentPersonChanged(existing,patch)).toBe(false);
    if(assignmentPersonChanged(existing,patch)) engagement.status="active";
    expect(engagement.status).toBe("completed");
    expect({...existing,...patch}).toMatchObject({pricingMode:"role",lastEditedAt:"2026-08-01"});
    expect(assignmentPersonChanged(existing,{personId:"other"})).toBe(true);
  });
  it("reduces full-form bucket edits to commercial metadata without Planner timestamps",()=>{
    const before={personId:"owner",hours:"4.00",plannedStartDate:"2026-08-18",plannedEndDate:"2026-08-20",status:"open",taskDescription:"Task",roleInstanceLabel:null,commercialBucketId:"old",lastEditedAt:"2026-08-01"};
    const payload=changedAssignmentFields(before,{personId:"owner",hours:4,plannedStartDate:"2026-08-18",plannedEndDate:"2026-08-20",status:"open",taskDescription:"Task",roleInstanceLabel:null,notes:undefined,commercialBucketId:null});
    expect(payload).toEqual({commercialBucketId:null});
    expect({...before,...payload}.lastEditedAt).toBe("2026-08-01");
    expect(changedAssignmentFields(before,{plannedEndDate:"2026-08-21",commercialBucketId:null})).toEqual({plannedEndDate:"2026-08-21",commercialBucketId:null});
  });
  it("accepts omitted and null independent of time requirements",async()=>{
    expect(assignmentBucketSelection.parse(undefined)).toBeUndefined();
    expect(assignmentBucketSelection.parse(null)).toBeNull();
    for(const value of [undefined,null]) await expect(validateAssignmentBucket("p","t",value,undefined,database({id:"p",commercialBucketsRequired:true}))).resolves.toBeUndefined();
  });
  it("permits retained archived mappings but rejects new selection",async()=>{
    const p={id:"p"}, b={id:"b",isActive:false};
    await expect(validateAssignmentBucket("p","t","b","b",database(p,b))).resolves.toBeUndefined();
    await expect(validateAssignmentBucket("p","t","b",null,database(p,b))).rejects.toThrow("active");
  });
  it("rejects absent scoped project/bucket",async()=>{
    await expect(validateAssignmentBucket("p","t","b",undefined,database(undefined))).rejects.toThrow("tenant");
    await expect(validateAssignmentBucket("p","t","b",undefined,database({id:"p"}))).rejects.toThrow("active");
  });
  it("fails bulk atomically before writing when any selected row is missing",async()=>{
    let writes=0;
    const tx={execute:async()=>{},select:()=>({from:()=>({where:async()=>[{id:"one"}]})}),update:()=>{writes++;throw Error("unexpected");}};
    await expect(bulkSetAssignmentBucket("p","t",{ids:["one","missing"],commercialBucketId:null},{transaction:async(fn:any)=>fn(tx)})).rejects.toThrow("missing");
    expect(writes).toBe(0);
  });
  it("requires explicit bulk set or clear and unique IDs",async()=>{
    await expect(bulkSetAssignmentBucket("p","t",{ids:["one"]},{})).rejects.toThrow();
    await expect(bulkSetAssignmentBucket("p","t",{ids:["one","one"],commercialBucketId:null},{})).rejects.toThrow();
  });
});
