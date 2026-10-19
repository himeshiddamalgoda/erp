"use client";
import { useId } from "react";
import { Controller } from "react-hook-form";
import { MenuItem, TextField } from "@mui/material";
import styles from "./forms.module.css";
export function FormField({
  name,
  label,
  control,
  options,
  required = false,
  placeholder = "Select an option",
  onValueChange,
  helperText,
  ...props
}) {
  const id = useId();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <div>
          <label
            id={`${id}-label`}
            className={
              name.startsWith("lines.") ? "sr-only" : styles.fieldLabel
            }
            htmlFor={id}
          >
            {label}
            {required && (
              <span aria-hidden="true" className={styles.required}>
                *
              </span>
            )}
          </label>
          <TextField
            {...field}
            ref={undefined}
            inputRef={field.ref}
            value={field.value ?? ""}
            id={id}
            select={Boolean(options)}
            required={required}
            error={Boolean(fieldState.error)}
            helperText={fieldState.error?.message || helperText}
            onChange={(event) => {
              field.onChange(event);
              onValueChange?.(event.target.value);
            }}
            slotProps={{
              htmlInput: { "aria-label": label },
              select: options
                ? {
                    displayEmpty: true,
                    labelId: `${id}-label`,
                    SelectDisplayProps: { "aria-labelledby": `${id}-label` },
                  }
                : undefined,
            }}
            {...props}
          >
            {options && [
              <MenuItem key="placeholder" value="">
                {placeholder}
              </MenuItem>,
              ...options.map((option) => (
                <MenuItem
                  key={option.id}
                  value={option.id}
                  disabled={option.disabled}
                >
                  {option.label}
                </MenuItem>
              )),
            ]}
          </TextField>
        </div>
      )}
    />
  );
}
