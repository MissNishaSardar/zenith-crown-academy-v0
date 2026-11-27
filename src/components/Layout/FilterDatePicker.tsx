"use client";

import { useState } from "react";

import DatePickerField from "./DatePickerField";

type FilterDatePickerProps = {
  defaultValue: string;
  id: string;
  name: string;
  placeholder?: string;
};

const FilterDatePicker = ({
  defaultValue,
  id,
  name,
  placeholder,
}: FilterDatePickerProps) => {
  const [value, setValue] = useState(defaultValue);

  return (
    <DatePickerField
      id={id}
      name={name}
      onChange={setValue}
      placeholder={placeholder}
      value={value}
    />
  );
};

export default FilterDatePicker;
