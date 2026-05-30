import { useState } from "react";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, ExternalLink } from "lucide-react";

const thisYear = new Date().getFullYear();
const thisQuarter = Math.floor(new Date().getMonth() / 3) + 1;
const YEARS = Array.from({ length: 5 }, (_, i) => thisYear - i);
const QUARTERS = [1, 2, 3, 4];

function quarterLabel(q: number) {
  const months = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'];
  return `Q${q} (${months[q - 1]})`;
}

export default function PayrollTaxForms() {
  const [form941Year, setForm941Year] = useState(String(thisYear));
  const [form941Quarter, setForm941Quarter] = useState(String(thisQuarter));
  const [annualYear, setAnnualYear] = useState(String(thisYear));

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold">Tax forms</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Download quarterly and annual tax forms. These are generated from your finalized payroll run data.
            Verify the output against SSA AccuWage (W-2) and IRS FIRE-test (1099) before submitting any electronic filing.
          </p>
        </div>

        {/* 941 quarterly */}
        <Card>
          <CardHeader>
            <CardTitle>Form 941 — Employer's Quarterly Federal Tax Return</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Summarises wages paid, federal income tax withheld, and Social Security / Medicare taxes for the quarter.
              Due by the last day of the month following each quarter end (April 30, July 31, Oct 31, Jan 31).
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <Label>Year</Label>
                <Select value={form941Year} onValueChange={setForm941Year}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quarter</Label>
                <Select value={form941Quarter} onValueChange={setForm941Quarter}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>{QUARTERS.map(q => <SelectItem key={q} value={String(q)}>{quarterLabel(q)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/api/payroll/tax-forms/941?year=${form941Year}&quarter=${form941Quarter}`}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="link-941-html"
                >
                  <Button variant="outline"><ExternalLink className="h-4 w-4 mr-2" />View in browser</Button>
                </a>
                <a
                  href={`/api/payroll/tax-forms/941?year=${form941Year}&quarter=${form941Quarter}&format=pdf`}
                  download
                  data-testid="link-941-pdf"
                >
                  <Button><Download className="h-4 w-4 mr-2" />Download PDF</Button>
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* W-2 / W-3 annual */}
        <Card>
          <CardHeader>
            <CardTitle>Forms W-2 & W-3 — Annual wage statements (W-2 employees)</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              W-2 lists each employee's annual wages and withholding. W-3 is the transmittal summary sent to the SSA alongside the W-2 copies.
              Due to employees and SSA by January 31 of the following year.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <Label>Tax year</Label>
                <Select value={annualYear} onValueChange={setAnnualYear}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <a href={`/api/payroll/tax-forms/w2?year=${annualYear}`} download data-testid="link-w2-csv">
                  <Button variant="outline"><Download className="h-4 w-4 mr-2" />W-2 CSV</Button>
                </a>
                <a href={`/api/payroll/tax-forms/w3?year=${annualYear}`} download data-testid="link-w3-csv">
                  <Button variant="outline"><Download className="h-4 w-4 mr-2" />W-3 CSV</Button>
                </a>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              CSV format is suitable for review or import into filing software. For SSA electronic submission, use the EFW2 e-file option in{' '}
              <a href="/payroll/tax-settings" className="underline underline-offset-2">Tax filing settings</a>.
            </p>
          </CardContent>
        </Card>

        {/* 1099-NEC annual */}
        <Card>
          <CardHeader>
            <CardTitle>Form 1099-NEC — Nonemployee compensation (contractors)</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Reports payments of $600 or more made to 1099 contractors during the year.
              Due to recipients and IRS by January 31 of the following year.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <Label>Tax year</Label>
                <Select value={annualYear} onValueChange={setAnnualYear}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <a href={`/api/payroll/tax-forms/1099-nec?year=${annualYear}`} download data-testid="link-1099-csv">
                <Button variant="outline"><Download className="h-4 w-4 mr-2" />1099-NEC CSV</Button>
              </a>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Only contractors with $600+ in total NEC for the year are included. For IRS FIRE electronic submission, use the 1099-NEC FIRE e-file option in{' '}
              <a href="/payroll/tax-settings" className="underline underline-offset-2">Tax filing settings</a>.
            </p>
          </CardContent>
        </Card>

        {/* Reference */}
        <Card>
          <CardHeader><CardTitle>Electronic filing (e-file)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <strong>W-2 / EFW2 →</strong> SSA Business Services Online (BSO). Configure your BSO User ID and employer details in{' '}
              <a href="/payroll/tax-settings" className="underline underline-offset-2">Tax filing settings</a>, then use the EFW2 generate button there.
              Employers with 10+ W-2s are required to e-file.
            </p>
            <p>
              <strong>1099-NEC / FIRE →</strong> IRS FIRE system. Requires a Transmitter Control Code (TCC) from the IRS IR Application.
              Configure it in Tax filing settings and use the FIRE file generator there.
            </p>
            <div className="flex gap-3 pt-2">
              <a href="https://www.ssa.gov/employer/" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">SSA BSO portal <ExternalLink className="h-3 w-3 ml-1.5" /></Button>
              </a>
              <a href="https://fire.test.irs.gov/" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">IRS FIRE test <ExternalLink className="h-3 w-3 ml-1.5" /></Button>
              </a>
              <a href="https://www.irs.gov/filing/e-file-for-large-and-mid-size-businesses" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">IRS e-file info <ExternalLink className="h-3 w-3 ml-1.5" /></Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
