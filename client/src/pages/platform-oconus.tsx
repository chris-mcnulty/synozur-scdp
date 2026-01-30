import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Upload, Search, Database, AlertCircle, CheckCircle2, Calendar, MapPin } from "lucide-react";

type OconusRate = {
  id: string;
  country: string;
  location: string;
  seasonStart: string | null;
  seasonEnd: string | null;
  lodging: number;
  mAndIe: number;
  maxPerDiem: number;
  effectiveDate: string;
  fiscalYear: number;
  isActive: boolean;
};

type OconusStats = {
  count: number;
};

type FiscalYearsResponse = {
  fiscalYears: number[];
};

export default function PlatformOconus() {
  const { isPlatformAdmin } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [uploadResult, setUploadResult] = useState<{ inserted: number; updated: number; skipped: number; errors: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery<OconusStats>({
    queryKey: ["/api/oconus/stats/count"],
  });

  const { data: fiscalYearsData, isLoading: fyLoading, isError: fyError } = useQuery<FiscalYearsResponse>({
    queryKey: ["/api/oconus/stats/fiscal-years"],
  });

  const { data: countries, isLoading: countriesLoading, isError: countriesError } = useQuery<string[]>({
    queryKey: ["/api/oconus/countries"],
  });

  const ratesQueryUrl = searchTerm.length >= 2 
    ? `/api/oconus/rates?search=${encodeURIComponent(searchTerm)}&limit=50`
    : selectedCountry
    ? `/api/oconus/rates?search=${encodeURIComponent(selectedCountry)}&limit=50`
    : `/api/oconus/rates?limit=50`;
    
  const { data: rates, isLoading: ratesLoading, isError: ratesError } = useQuery<OconusRate[]>({
    queryKey: ["/api/oconus/rates", searchTerm, selectedCountry],
    queryFn: async () => {
      const res = await fetch(ratesQueryUrl, {
        headers: { "X-Session-Id": localStorage.getItem("sessionId") || "" }
      });
      if (!res.ok) throw new Error("Failed to fetch OCONUS rates");
      return res.json();
    },
    enabled: searchTerm.length >= 2 || searchTerm.length === 0,
  });

  const isLoading = statsLoading || fyLoading || countriesLoading || ratesLoading;
  const hasError = statsError || fyError || countriesError || ratesError;

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      
      const sessionId = localStorage.getItem("sessionId");
      const response = await fetch("/api/platform/oconus/upload", {
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
      queryClient.invalidateQueries({ queryKey: ["/api/oconus"] });
      queryClient.invalidateQueries({ queryKey: ["/api/oconus/stats/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/oconus/stats/fiscal-years"] });
      queryClient.invalidateQueries({ queryKey: ["/api/oconus/countries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/oconus/rates"] });
      toast({
        title: "Upload successful",
        description: `Inserted: ${data.inserted}, Updated: ${data.updated}, Skipped: ${data.skipped}, Errors: ${data.errors}`,
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
      if (!file.name.endsWith(".zip") && !file.name.endsWith(".txt")) {
        toast({
          title: "Invalid file type",
          description: "Please upload a ZIP or TXT file from the DoD DTMO website",
          variant: "destructive",
        });
        return;
      }
      uploadMutation.mutate(file);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  if (!isPlatformAdmin) {
    return (
      <Layout>
        <div className="container mx-auto p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You don't have permission to access this page. Only platform administrators can manage OCONUS rates.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  if (hasError) {
    return (
      <Layout>
        <div className="container mx-auto p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading Data</AlertTitle>
            <AlertDescription>
              There was an error loading OCONUS rate data. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  if (isLoading && !rates) {
    return (
      <Layout>
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading OCONUS rates data...</p>
            </div>
          </div>
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
              <Globe className="w-8 h-8" />
              OCONUS Per Diem Rates Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage Outside Continental US per diem rates for expense calculations
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="text-lg px-4 py-2">
              <Database className="w-4 h-4 mr-2" />
              {stats?.count?.toLocaleString() || "..."} rates
            </Badge>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              <Calendar className="w-4 h-4 mr-2" />
              FY: {fiscalYearsData?.fiscalYears?.join(", ") || "..."}
            </Badge>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload OCONUS Rates
            </CardTitle>
            <CardDescription>
              Upload per diem rate files from the DoD Defense Travel Management Office (DTMO).
              Download the OCONUS Per Diem ASCII files from{" "}
              <a 
                href="https://www.travel.dod.mil/Travel-Transportation-Rates/Per-Diem/Per-Diem-Rate-Lookup/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                travel.dod.mil
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".zip,.txt"
                onChange={handleFileChange}
                disabled={uploadMutation.isPending}
                className="max-w-md"
              />
              {uploadMutation.isPending && (
                <span className="text-muted-foreground">Uploading and processing...</span>
              )}
            </div>
            
            {uploadResult && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Upload Complete</AlertTitle>
                <AlertDescription>
                  Inserted: {uploadResult.inserted} | Updated: {uploadResult.updated} | Skipped: {uploadResult.skipped} | Errors: {uploadResult.errors}
                </AlertDescription>
              </Alert>
            )}

            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium">Instructions:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Visit the DoD DTMO website and download the OCONUS Per Diem ASCII files</li>
                <li>Upload the ZIP file directly (or extract and upload individual .txt files)</li>
                <li>New fiscal year rates will be added; existing rates for the same fiscal year will be updated</li>
                <li>Historical rates are preserved for expense calculations on past travel</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Search OCONUS Rates
            </CardTitle>
            <CardDescription>
              Search by country or location name, or filter by country
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <Input
                placeholder="Search by country or location..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (e.target.value) setSelectedCountry("");
                }}
                className="max-w-md"
              />
              <span className="text-muted-foreground">or</span>
              <Select 
                value={selectedCountry || "all"} 
                onValueChange={(value) => {
                  setSelectedCountry(value === "all" ? "" : value);
                  if (value !== "all") setSearchTerm("");
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {countries?.map((country) => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Season</TableHead>
                    <TableHead className="text-right">Lodging</TableHead>
                    <TableHead className="text-right">M&IE</TableHead>
                    <TableHead className="text-right">Max Per Diem</TableHead>
                    <TableHead>FY</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : rates && rates.length > 0 ? (
                    rates.map((rate) => (
                      <TableRow key={rate.id}>
                        <TableCell className="font-medium">{rate.country}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            {rate.location}
                          </div>
                        </TableCell>
                        <TableCell>
                          {rate.seasonStart && rate.seasonEnd ? (
                            <Badge variant="outline" className="text-xs">
                              {rate.seasonStart} - {rate.seasonEnd}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">Year-round</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(rate.lodging)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(rate.mAndIe)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{formatCurrency(rate.maxPerDiem)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{rate.fiscalYear}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {searchTerm || selectedCountry 
                          ? `No rates found for "${searchTerm || selectedCountry}"` 
                          : "Enter a search term or select a country to find rates"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {rates && rates.length === 50 && (
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
