import { db } from "../server/db";
import { oconusPerDiemRates } from "../shared/schema";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

interface OconusRate {
  country: string;
  location: string;
  seasonStart: string;
  seasonEnd: string;
  lodging: number;
  mie: number;
  proportionalMeals: number | null;
  incidentals: number | null;
  maxPerDiem: number;
  effectiveDate: string | null;
  fiscalYear: number;
}

async function ingestOconusRates(zipPath?: string, fiscalYear?: number) {
  const targetZipPath = zipPath || path.join(process.cwd(), "attached_assets/OCONUS-ASCII-2026_1769712725667.zip");
  const targetFiscalYear = fiscalYear || 2026;
  const tempDir = "/tmp/oconus_ingest";
  
  console.log(`Processing OCONUS rates for fiscal year ${targetFiscalYear}...`);
  console.log(`Using ZIP file: ${targetZipPath}`);
  
  if (!fs.existsSync(targetZipPath)) {
    throw new Error(`ZIP file not found: ${targetZipPath}`);
  }
  
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });
  
  console.log("Extracting ZIP file...");
  execSync(`unzip -o "${targetZipPath}" -d "${tempDir}"`, { stdio: "pipe" });
  
  const files = fs.readdirSync(tempDir);
  console.log(`Found files: ${files.join(", ")}`);
  
  const oconusFile = files
    .filter(f => f.endsWith("oconus.txt") && !f.includes("oconusnm"))
    .sort()
    .pop();
  
  if (!oconusFile) {
    throw new Error("No OCONUS data file found in ZIP");
  }
  
  console.log(`Using data file: ${oconusFile}`);
  
  const filePath = path.join(tempDir, oconusFile);
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  
  console.log(`Total lines in file: ${lines.length}`);
  
  const rates: OconusRate[] = [];
  const seenLocations = new Set<string>();
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const parts = line.split(";");
    if (parts.length < 12) continue;
    
    const country = parts[0]?.trim() || "";
    const location = parts[1]?.trim() || "";
    const seasonStart = parts[2]?.trim() || "";
    const seasonEnd = parts[3]?.trim() || "";
    const lodging = parseInt(parts[4]) || 0;
    const mie = parseInt(parts[5]) || 0;
    const proportionalMeals = parts[6] ? parseInt(parts[6]) : null;
    const incidentals = parts[7] ? parseInt(parts[7]) : null;
    const maxPerDiem = parseInt(parts[10]) || 0;
    const effectiveDate = parts[11]?.trim() || null;
    
    if (!country || !location || !seasonStart || !seasonEnd) continue;
    
    const locationKey = `${country}|${location}|${seasonStart}|${seasonEnd}`;
    if (seenLocations.has(locationKey)) continue;
    seenLocations.add(locationKey);
    
    rates.push({
      country,
      location,
      seasonStart,
      seasonEnd,
      lodging,
      mie,
      proportionalMeals,
      incidentals,
      maxPerDiem,
      effectiveDate,
      fiscalYear: targetFiscalYear,
    });
  }
  
  console.log(`Parsed ${rates.length} unique rate records`);
  
  console.log(`Deleting existing rates for fiscal year ${targetFiscalYear}...`);
  const { eq } = await import("drizzle-orm");
  await db.delete(oconusPerDiemRates).where(eq(oconusPerDiemRates.fiscalYear, targetFiscalYear));
  
  console.log("Inserting new rates...");
  const batchSize = 500;
  let inserted = 0;
  
  for (let i = 0; i < rates.length; i += batchSize) {
    const batch = rates.slice(i, i + batchSize);
    
    await db.insert(oconusPerDiemRates).values(batch.map(rate => ({
      country: rate.country,
      location: rate.location,
      seasonStart: rate.seasonStart,
      seasonEnd: rate.seasonEnd,
      lodging: rate.lodging,
      mie: rate.mie,
      proportionalMeals: rate.proportionalMeals,
      incidentals: rate.incidentals,
      maxPerDiem: rate.maxPerDiem,
      effectiveDate: rate.effectiveDate,
      fiscalYear: rate.fiscalYear,
      isActive: true,
    })));
    
    inserted += batch.length;
    console.log(`Progress: ${inserted}/${rates.length}`);
  }
  
  console.log(`Done! Inserted ${inserted} OCONUS per diem rates for FY${targetFiscalYear}`);
  
  fs.rmSync(tempDir, { recursive: true });
  
  return inserted;
}

const args = process.argv.slice(2);
const zipArg = args.find(a => a.endsWith(".zip"));
const yearArg = args.find(a => /^\d{4}$/.test(a));

ingestOconusRates(zipArg, yearArg ? parseInt(yearArg) : undefined)
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Error ingesting OCONUS rates:", err);
    process.exit(1);
  });
