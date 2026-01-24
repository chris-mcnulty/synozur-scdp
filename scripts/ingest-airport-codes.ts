import { db } from "../server/db";
import { airportCodes } from "../shared/schema";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function ingestAirportCodes() {
  const csvPath = path.join(process.cwd(), "attached_assets/flat-ui__data-Fri_Jan_23_2026_1769217195966.csv");
  
  console.log("Reading CSV file...");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n");
  
  console.log(`Total lines in CSV: ${lines.length}`);
  
  const header = lines[0].split(",");
  
  const iataCodeIndex = 9;
  const nameIndex = 2;
  const typeIndex = 1;
  const countryIndex = 5;
  const regionIndex = 6;
  const municipalityIndex = 7;
  const coordinatesIndex = 12;
  
  const validAirports: Array<{
    iataCode: string;
    name: string;
    municipality: string | null;
    isoCountry: string | null;
    isoRegion: string | null;
    airportType: string | null;
    coordinates: string | null;
  }> = [];
  
  const iataCodePattern = /^[A-Z]{3}$/;
  const seenCodes = new Set<string>();
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const parts = parseCSVLine(line);
    const iataCode = parts[iataCodeIndex]?.trim();
    
    if (iataCode && iataCodePattern.test(iataCode) && !seenCodes.has(iataCode)) {
      seenCodes.add(iataCode);
      
      const name = parts[nameIndex]?.trim() || "Unknown";
      const municipality = parts[municipalityIndex]?.trim() || null;
      const isoCountry = parts[countryIndex]?.trim() || null;
      const isoRegion = parts[regionIndex]?.trim() || null;
      const airportType = parts[typeIndex]?.trim() || null;
      const coordinates = parts[coordinatesIndex]?.trim() || null;
      
      validAirports.push({
        iataCode,
        name,
        municipality: municipality === "null" ? null : municipality,
        isoCountry: isoCountry === "null" ? null : isoCountry,
        isoRegion: isoRegion === "null" ? null : isoRegion,
        airportType: airportType === "null" ? null : airportType,
        coordinates: coordinates === "null" ? null : coordinates,
      });
    }
  }
  
  console.log(`Found ${validAirports.length} valid 3-letter IATA codes`);
  
  console.log("Clearing existing airport codes...");
  await db.delete(airportCodes);
  
  console.log("Inserting airports into database...");
  
  const batchSize = 500;
  let inserted = 0;
  
  for (let i = 0; i < validAirports.length; i += batchSize) {
    const batch = validAirports.slice(i, i + batchSize);
    
    await db.insert(airportCodes).values(batch.map(airport => ({
      iataCode: airport.iataCode,
      name: airport.name,
      municipality: airport.municipality,
      isoCountry: airport.isoCountry,
      isoRegion: airport.isoRegion,
      airportType: airport.airportType,
      coordinates: airport.coordinates,
      isActive: true,
    })));
    
    inserted += batch.length;
    console.log(`Progress: ${inserted}/${validAirports.length}`);
  }
  
  console.log(`Done! Inserted: ${inserted}`);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

ingestAirportCodes()
  .then(() => {
    console.log("Airport code ingestion complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error ingesting airport codes:", error);
    process.exit(1);
  });
