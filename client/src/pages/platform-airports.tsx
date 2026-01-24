import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plane, Upload, Search, Database, AlertCircle, CheckCircle2 } from "lucide-react";

type AirportInfo = {
  id: string;
  iataCode: string;
  name: string;
  municipality: string | null;
  isoCountry: string | null;
  isoRegion: string | null;
  airportType: string | null;
  isActive: boolean;
};

type AirportStats = {
  count: number;
};

export default function PlatformAirports() {
  const { isPlatformAdmin } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadResult, setUploadResult] = useState<{ inserted: number; updated: number; errors: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: stats } = useQuery<AirportStats>({
    queryKey: ["/api/airports/stats/count"],
  });

  const { data: airports, isLoading } = useQuery<AirportInfo[]>({
    queryKey: ["/api/airports", { search: searchTerm, limit: 50 }],
    enabled: searchTerm.length >= 2 || searchTerm.length === 0,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      
      const sessionId = localStorage.getItem("sessionId");
      const response = await fetch("/api/platform/airports/upload", {
        method: "POST",
        headers: sessionId ? { "X-Session-Id": sessionId } : {},
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setUploadResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/airports"] });
      toast({
        title: "Upload successful",
        description: `Inserted: ${data.inserted}, Updated: ${data.updated}, Errors: ${data.errors}`,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".csv")) {
        toast({
          title: "Invalid file type",
          description: "Please upload a CSV file",
          variant: "destructive",
        });
        return;
      }
      uploadMutation.mutate(file);
    }
  };

  if (!isPlatformAdmin) {
    return (
      <Layout>
        <div className="container mx-auto p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You don't have permission to access this page. Only platform administrators can manage airport codes.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Plane className="w-8 h-8" />
              Airport Codes Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage the global airport codes database used for expense tracking
            </p>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            <Database className="w-4 h-4 mr-2" />
            {stats?.count?.toLocaleString() || "..."} airports
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Airport Codes CSV
            </CardTitle>
            <CardDescription>
              Upload a CSV file with airport codes. The file should have columns: iata_code, name, municipality, iso_country, iso_region, type.
              Existing codes will be updated, new codes will be added.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={uploadMutation.isPending}
                className="max-w-md"
              />
              {uploadMutation.isPending && (
                <span className="text-muted-foreground">Uploading...</span>
              )}
            </div>
            
            {uploadResult && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Upload Complete</AlertTitle>
                <AlertDescription>
                  Inserted: {uploadResult.inserted} | Updated: {uploadResult.updated} | Errors: {uploadResult.errors}
                </AlertDescription>
              </Alert>
            )}

            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">Expected CSV format:</p>
              <code className="bg-muted px-2 py-1 rounded text-xs">
                iata_code,name,municipality,iso_country,iso_region,type
              </code>
              <p className="mt-1">Example row: SEA,Seattle Tacoma International Airport,Seattle,US,US-WA,large_airport</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Search Airport Codes
            </CardTitle>
            <CardDescription>
              Search by code, city name, or airport name
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                placeholder="Search airports (e.g., SEA, Seattle, Ottawa)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
            </div>

            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : airports && airports.length > 0 ? (
                    airports.map((airport) => (
                      <TableRow key={airport.id}>
                        <TableCell className="font-mono font-bold">{airport.iataCode}</TableCell>
                        <TableCell>{airport.name}</TableCell>
                        <TableCell>{airport.municipality || "-"}</TableCell>
                        <TableCell>{airport.isoRegion?.split("-")[1] || airport.isoRegion || "-"}</TableCell>
                        <TableCell>{airport.isoCountry || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {airport.airportType?.replace("_", " ") || "unknown"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {searchTerm ? `No airports found for "${searchTerm}"` : "Enter a search term to find airports"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {airports && airports.length === 50 && (
              <p className="text-sm text-muted-foreground mt-2">
                Showing first 50 results. Refine your search for more specific results.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
