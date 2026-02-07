import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { SystemSetting } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Info, 
  Mail, 
  Calendar, 
  Settings, 
  ExternalLink,
  Building,
  Users,
  FileText,
  BookOpen,
  Map,
  History
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";

type EnvironmentInfo = {
  environment: string;
  isProduction: boolean;
  nodeEnv: string;
  replitDeployment: string;
};

export default function About() {
  // Fetch system settings for version information
  const { data: systemSettings = [] } = useQuery<SystemSetting[]>({
    queryKey: ["/api/system-settings"]
  });

  // Fetch environment information from backend
  const { data: environmentInfo } = useQuery<EnvironmentInfo>({
    queryKey: ["/api/environment"]
  });

  // Get version and company settings
  const majorVersion = systemSettings.find((s: SystemSetting) => s.settingKey === 'VERSION_MAJOR')?.settingValue || '0';
  const releaseDate = systemSettings.find((s: SystemSetting) => s.settingKey === 'VERSION_RELEASE_DATE')?.settingValue || new Date().toISOString().split('T')[0];
  const companyName = systemSettings.find((s: SystemSetting) => s.settingKey === 'COMPANY_NAME')?.settingValue || 'Synozur Consulting Delivery Platform';
  
  // Format version number (major.yyyy.mm.dd)
  const formatVersionNumber = (major: string, dateStr: string) => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${major}.${year}.${month}.${day}`;
  };

  const versionNumber = formatVersionNumber(majorVersion, releaseDate);
  const isProductionRelease = majorVersion !== '0';
  
  // Use backend-provided environment information
  const environment = environmentInfo?.environment || 'Development';

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Building className="h-8 w-8 text-primary" />
          </div>
          <div>
            <p className="text-lg text-muted-foreground font-medium">{companyName}</p>
            <h1 className="text-3xl font-bold tracking-tight">Constellation</h1>
            <p className="text-xl text-muted-foreground">
              Synozur Consulting Delivery Platform{" "}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help border-b border-dotted border-muted-foreground/50">(SCDP)</span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-center">
                  <p className="text-xs italic">
                    Fun fact: SCDP also happens to be the acronym for Sterling Cooper Draper Pryce, 
                    the fictional ad agency from Mad Men.
                  </p>
                </TooltipContent>
              </Tooltip>
            </p>
          </div>
          <div className="flex items-center justify-center space-x-2">
            <Badge 
              variant={environment === 'Production' ? "default" : "secondary"}
              className="text-sm"
              data-testid="badge-environment"
            >
              {environment}
            </Badge>
            <Badge 
              variant={isProductionRelease ? "default" : "outline"}
              className="text-sm"
              data-testid="badge-version"
            >
              Version {versionNumber}
            </Badge>
            {!isProductionRelease && (
              <Badge variant="outline" className="text-sm">
                Beta
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Platform Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Info className="h-5 w-5" />
                <span>Platform Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">About Constellation</p>
                <p className="text-sm text-muted-foreground">
                  A comprehensive consulting delivery platform for managing the entire lifecycle 
                  of consulting projects. From initial estimation through final billing, Constellation 
                  streamlines operations with features for resource allocation, time tracking, 
                  expense recording, and automated invoice generation.
                </p>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <p className="text-sm font-medium">Key Features</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Project estimation and management</li>
                  <li>• Time tracking and expense management</li>
                  <li>• Client and invoice management</li>
                  <li>• Role-based access control</li>
                  <li>• Automated billing and reporting</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Support & Help */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Support & Help</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Need Assistance?</p>
                <p className="text-sm text-muted-foreground">
                  Our IT support team is here to help with any questions or issues you may encounter.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">IT Support</p>
                    <p className="text-sm text-muted-foreground">ITHelp@synozur.com</p>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => window.open('mailto:ITHelp@synozur.com', '_blank')}
                  data-testid="button-email-support"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Email
                </Button>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-sm font-medium">Documentation</p>
                <p className="text-sm text-muted-foreground">
                  Access comprehensive guides, product updates, and roadmap information.
                </p>
                
                <div className="space-y-2">
                  <Link href="/user-guide">
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <BookOpen className="h-4 w-4 mr-2" />
                      User Guide
                    </Button>
                  </Link>
                  
                  <Link href="/roadmap">
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <Map className="h-4 w-4 mr-2" />
                      Product Roadmap
                    </Button>
                  </Link>
                  
                  <Link href="/changelog">
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <History className="h-4 w-4 mr-2" />
                      Changelog
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Version Information */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5" />
                <span>Version Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{versionNumber}</div>
                  <div className="text-sm text-muted-foreground">Current Version</div>
                </div>
                
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {new Date(releaseDate).toLocaleDateString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Release Date</div>
                </div>
                
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {environment}
                  </div>
                  <div className="text-sm text-muted-foreground">Environment</div>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start space-x-3">
                  <Settings className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Version Management
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Version numbers follow the format: Major.YYYY.MM.DD. The major version 
                      is managed through admin settings and will increment for significant releases.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}