"use client";
import { Autocomplete, TextField, Button, Alert } from "@mui/material";
import styles from "../sales-teams.module.css";
export function StaffPicker({
  label,
  selected,
  onChange,
  query,
  filters,
  onFilters,
  multiple = false,
  error,
  disabled,
  onRetry,
}) {
  const options = [
    ...new Map(
      [
        ...(Array.isArray(selected) ? selected : selected ? [selected] : []),
        ...(query.data?.data || []),
      ].map((u) => [u.id, u]),
    ).values(),
  ];
  return (
    <div className={styles.stack}>
      <Autocomplete
        multiple={multiple}
        options={options}
        value={selected}
        disabled={disabled}
        loading={query.isFetching}
        filterOptions={(x) => x}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        getOptionLabel={(u) => u.displayName || u.id}
        onChange={(_, v) => onChange(v)}
        onInputChange={(_, v, reason) => {
          if (reason === "input" || reason === "clear")
            onFilters({ q: v, page: 1 });
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            error={!!error}
            helperText={error}
          />
        )}
      />
      {query.error && (
        <Alert severity="error">
          Unable to load staff.
          <Button onClick={onRetry}>Retry staff lookup</Button>
        </Alert>
      )}
      <div className={styles.row}>
        <Button
          disabled={disabled || filters.page <= 1 || query.isFetching}
          onClick={() => onFilters({ page: filters.page - 1 })}
        >
          Previous staff
        </Button>
        <small>
          Page {filters.page} · {query.data?.meta.total || 0} matching staff
        </small>
        <Button
          disabled={
            disabled ||
            query.isFetching ||
            filters.page * filters.pageSize >= (query.data?.meta.total || 0)
          }
          onClick={() => onFilters({ page: filters.page + 1 })}
        >
          Next staff
        </Button>
      </div>
    </div>
  );
}
