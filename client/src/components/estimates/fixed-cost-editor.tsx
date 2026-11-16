import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FixedCostEditor({ value, disabled, onSave }: {
  value: string | null;
  disabled: boolean;
  onSave: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const valid = /^\d{1,8}(\.\d{1,2})?$/.test(draft);
  return (
    <div className="space-y-2 border-t pt-2">
      <label className="block text-sm">
        Fixed cost override ($)
        <Input aria-label="Fixed cost override" value={draft} disabled={disabled}
          inputMode="decimal" placeholder="Use calculated cost"
          onChange={event => setDraft(event.target.value)} />
      </label>
      <p className="text-xs text-muted-foreground">
        Total internal cost for this line. Effort and contingency do not multiply it.
        Selling price is unchanged.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={disabled || !valid || draft === value}
          onClick={() => onSave(draft)}>Save fixed cost</Button>
        {value !== null && <Button size="sm" variant="ghost" disabled={disabled}
          onClick={() => onSave(null)}>Use calculated cost</Button>}
      </div>
    </div>
  );
}
