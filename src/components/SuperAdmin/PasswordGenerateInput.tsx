"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/shadcnui/button";
import { Input } from "@/components/shadcnui/input";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/shadcnui/toggle-group";
import { generateTempPassword } from "@/lib/password";

type PasswordGenerateInputProps = {
  id: string;
  onChange: (value: string) => void;
  value: string;
};

// Generated or manual password entry. The parent owns the value, the mode is
// local: generated mode shows a read only 16 character password with a
// regenerate button, manual mode shows a free typing field with show/hide.
const PasswordGenerateInput = ({
  id,
  onChange,
  value,
}: PasswordGenerateInputProps) => {
  const [mode, setMode] = useState<"generated" | "manual">(
    value.length > 0 ? "generated" : "manual",
  );
  const [showManual, setShowManual] = useState(false);

  const switchToGenerated = () => {
    setMode("generated");
    onChange(generateTempPassword());
  };

  const switchToManual = () => {
    setMode("manual");
    setShowManual(false);
    onChange("");
  };

  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup
        value={[mode]}
        onValueChange={(values: string[]) => {
          const next = values[values.length - 1];
          if (next === "generated") {
            switchToGenerated();
          } else if (next === "manual") {
            switchToManual();
          }
        }}
        spacing={0}
        variant="outline"
        size="sm"
        aria-label="Password source">
        <ToggleGroupItem
          value="generated"
          aria-label="Use a generated password">
          Generated
        </ToggleGroupItem>
        <ToggleGroupItem
          value="manual"
          aria-label="Type a password yourself">
          Type your own
        </ToggleGroupItem>
      </ToggleGroup>
      {mode === "generated" ?
        <div className="flex items-center gap-2">
          <Input
            id={id}
            readOnly
            value={value}
            onFocus={(event) => event.target.select()}
            className="font-mono tracking-wide"
            aria-label="Generated password"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Generate a new password"
            onClick={() => onChange(generateTempPassword())}>
            <RefreshCwIcon aria-hidden="true" />
          </Button>
        </div>
      : <div className="relative">
          <Input
            id={id}
            type={showManual ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="pr-12"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={showManual ? "Hide password" : "Show password"}
            onClick={() => setShowManual((current) => !current)}
            className="absolute top-1/2 right-1.5 -translate-y-1/2">
            {showManual ?
              <EyeOffIcon aria-hidden="true" />
            : <EyeIcon aria-hidden="true" />}
          </Button>
        </div>
      }
    </div>
  );
};

export default PasswordGenerateInput;
