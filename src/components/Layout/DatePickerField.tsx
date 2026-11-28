"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/shadcnui/button";
import { Calendar } from "@/components/shadcnui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcnui/popover";

type DatePickerFieldProps = {
  ariaInvalid?: boolean;
  disabled?: boolean;
  id: string;
  minDate?: string;
  name?: string;
  onBlur?: () => void;
  onChange: (next: string) => void;
  placeholder?: string;
  value: string;
};

const parseKey = (value: string): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const DatePickerField = ({
  ariaInvalid,
  disabled,
  id,
  minDate,
  name,
  onBlur,
  onChange,
  placeholder = "Pick a date",
  value,
}: DatePickerFieldProps) => {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseKey(value), [value]);
  const minDay = useMemo(
    () => (minDate ? parseKey(minDate) : undefined),
    [minDate],
  );

  const calendarDisabled = useMemo(() => {
    if (disabled) return true;
    if (minDay) {
      const cutoff = new Date(minDay);
      cutoff.setHours(0, 0, 0, 0);
      return { before: cutoff };
    }
    return undefined;
  }, [disabled, minDay]);

  const handleSelect = (next: Date | undefined) => {
    onChange(next ? format(next, "yyyy-MM-dd") : "");
    onBlur?.();
    setOpen(false);
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              aria-invalid={ariaInvalid}
              data-empty={!selected}
              disabled={disabled}
              id={id}
              type="button"
              variant="outline"
              className="data-[empty=true]:text-muted-foreground justify-start font-normal"
            />
          }>
          <CalendarIcon data-icon="inline-start" />
          {selected ? format(selected, "PPP") : <span>{placeholder}</span>}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-0">
          <Calendar
            captionLayout="dropdown"
            defaultMonth={selected ?? minDay}
            disabled={calendarDisabled}
            mode="single"
            onSelect={handleSelect}
            selected={selected}
          />
        </PopoverContent>
      </Popover>
      {name ?
        <input
          name={name}
          type="hidden"
          value={value}
        />
      : null}
    </>
  );
};

export default DatePickerField;
