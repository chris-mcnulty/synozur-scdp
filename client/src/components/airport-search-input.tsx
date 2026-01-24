import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plane, Search, X } from "lucide-react";

type AirportInfo = {
  id: string;
  iataCode: string;
  name: string;
  municipality: string | null;
  isoCountry: string | null;
  isoRegion: string | null;
};

interface AirportSearchInputProps {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

export function AirportSearchInput({
  value,
  onChange,
  placeholder = "Search city or code",
  className,
  "data-testid": testId,
}: AirportSearchInputProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: searchResults, isLoading } = useQuery<AirportInfo[]>({
    queryKey: ["/api/airports", { search: searchTerm, limit: 10 }],
    enabled: searchTerm.length >= 2,
    staleTime: 60000,
  });

  const { data: selectedAirport } = useQuery<AirportInfo | null>({
    queryKey: ["/api/airports", value?.toUpperCase()],
    enabled: value?.length === 3,
    staleTime: 60000,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowSearch(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (airport: AirportInfo) => {
    onChange(airport.iataCode);
    setSearchTerm("");
    setIsOpen(false);
    setShowSearch(false);
  };

  const handleCodeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    if (val.length <= 3) {
      onChange(val);
    }
  };

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  return (
    <div className="relative">
      {!showSearch ? (
        <div className="flex gap-1">
          <Input
            value={value}
            onChange={handleCodeInput}
            placeholder={placeholder}
            maxLength={3}
            className={cn(
              "flex-1",
              selectedAirport ? "border-green-500" : value?.length === 3 ? "border-orange-400" : "",
              className
            )}
            data-testid={testId}
          />
          <button
            type="button"
            onClick={() => {
              setShowSearch(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="px-2 py-1 text-muted-foreground hover:text-foreground border rounded-md hover:bg-muted"
            title="Search by city name"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-1">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={searchTerm}
              onChange={handleSearchInput}
              placeholder="Type city name (e.g., Ottawa)"
              className="pl-8"
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setShowSearch(false);
              setSearchTerm("");
              setIsOpen(false);
            }}
            className="px-2 py-1 text-muted-foreground hover:text-foreground border rounded-md hover:bg-muted"
            title="Close search"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isOpen && showSearch && searchTerm.length >= 2 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Searching...</div>
          ) : searchResults && searchResults.length > 0 ? (
            searchResults.map((airport) => (
              <button
                key={airport.id}
                type="button"
                onClick={() => handleSelect(airport)}
                className="w-full px-3 py-2 text-left hover:bg-muted flex items-start gap-2 border-b last:border-b-0"
              >
                <Plane className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    <span className="text-primary">{airport.iataCode}</span>
                    {" - "}
                    <span className="truncate">{airport.name}</span>
                  </div>
                  {airport.municipality && (
                    <div className="text-sm text-muted-foreground truncate">
                      {airport.municipality}
                      {airport.isoRegion && `, ${airport.isoRegion.split("-")[1] || airport.isoRegion}`}
                      {airport.isoCountry && airport.isoCountry !== "US" && airport.isoCountry !== "CA" && ` (${airport.isoCountry})`}
                    </div>
                  )}
                </div>
              </button>
            ))
          ) : (
            <div className="p-3 text-sm text-muted-foreground">
              No airports found for "{searchTerm}"
            </div>
          )}
        </div>
      )}

      {!showSearch && selectedAirport && (
        <div className="text-xs text-green-600 mt-1">
          {selectedAirport.name}
          {selectedAirport.municipality && `, ${selectedAirport.municipality}`}
        </div>
      )}
      {!showSearch && value?.length === 3 && !selectedAirport && (
        <div className="text-xs text-orange-500 mt-1">
          Code not found - you can still use it
        </div>
      )}
      {!showSearch && (!value || value.length < 3) && (
        <div className="text-xs text-muted-foreground mt-1">
          3-letter code or click <Search className="w-3 h-3 inline" /> to search by city
        </div>
      )}
    </div>
  );
}
