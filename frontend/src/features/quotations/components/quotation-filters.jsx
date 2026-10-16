"use client";
import { useState } from "react";
import {
  Button,
  Checkbox,
  Collapse,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import { QUOTATION_STATUSES } from "@/constants/quotations";
import { ListFilter, Search, X, RotateCcw } from "lucide-react";
import styles from "../quotations.module.css";
export function QuotationFilters({
  filters,
  options,
  onChange,
  onReset,
  total,
}) {
  const [advanced, setAdvanced] = useState(false);
  const [search, setSearch] = useState(filters.q);
  const activeFilters = [
    "customerId",
    "salesTeamId",
    "ownerId",
    "fromDate",
    "toDate",
  ].filter((k) => filters[k]).length;
  const tabs = [
    ["", "All quotations"],
    ["Draft", "Drafts"],
    ["PendingApproval", "Pending approval"],
    ["Issued", "Issued"],
    ["Accepted", "Accepted"],
  ];
  const selected = tabs.some(([value]) => value === filters.status)
    ? filters.status
    : false;
  return (
    <>
      <div className={styles.listTop}>
        <Tabs
          value={selected}
          onChange={(_, status) => onChange({ status, page: 1 })}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Quotation status"
          className={styles.listTabs}
        >
          {tabs.map(([value, label]) => (
            <Tab
              key={value}
              value={value}
              label={
                <span>
                  {label}
                  {value === "" && (
                    <span className={styles.tableCount}>{total ?? "—"}</span>
                  )}
                </span>
              }
            />
          ))}
        </Tabs>
        <FormControlLabel
          className={styles.historyToggle}
          control={
            <Checkbox
              size="small"
              checked={filters.includeRevisions}
              onChange={(e) =>
                onChange({ includeRevisions: e.target.checked, page: 1 })
              }
            />
          }
          label="Show revisions"
        />
      </div>
      <div className={styles.filters}>
        <form
          className={styles.search}
          onSubmit={(e) => {
            e.preventDefault();
            onChange({ q: search.trim(), page: 1 });
          }}
          role="search"
        >
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quotation number or buyer…"
            slotProps={{
              htmlInput: { "aria-label": "Search quotations", maxLength: 200 },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton
                      type="button"
                      size="small"
                      aria-label="Clear search"
                      onClick={() => {
                        setSearch("");
                        onChange({ q: "", page: 1 });
                      }}
                    >
                      <X size={14} />
                    </IconButton>
                  </InputAdornment>
                ) : (
                  <InputAdornment position="end">
                    <IconButton
                      type="submit"
                      size="small"
                      aria-label="Apply search"
                    >
                      <Search size={14} />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </form>
        <TextField
          select
          value={filters.customerId}
          onChange={(e) => onChange({ customerId: e.target.value, page: 1 })}
          className={styles.filterControl}
          slotProps={{
            htmlInput: { "aria-label": "Filter by buyer" },
            select: { displayEmpty: true },
          }}
        >
          <MenuItem value="">All buyers</MenuItem>
          {options?.customers.map((buyer) => (
            <MenuItem key={buyer.id} value={buyer.id}>
              {buyer.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          value={
            filters.sortBy === "total"
              ? "total"
              : filters.sortOrder === "asc"
                ? "oldest"
                : "latest"
          }
          onChange={(e) =>
            onChange({
              sortBy: e.target.value === "total" ? "total" : "createdAt",
              sortOrder: e.target.value === "oldest" ? "asc" : "desc",
              page: 1,
            })
          }
          className={styles.filterControl}
          slotProps={{ htmlInput: { "aria-label": "Sort quotations" } }}
        >
          <MenuItem value="latest">Newest first</MenuItem>
          <MenuItem value="oldest">Oldest first</MenuItem>
          <MenuItem value="total">Highest value</MenuItem>
        </TextField>
        <Button
          variant="outlined"
          className={styles.filterButton}
          startIcon={<ListFilter size={14} />}
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
        >
          Filters{activeFilters ? ` (${activeFilters})` : ""}
        </Button>
      </div>
      <Collapse in={advanced}>
        <div className={styles.filterPanel}>
          <TextField
            select
            label="Status"
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value, page: 1 })}
            slotProps={{
              select: { displayEmpty: true },
              inputLabel: { shrink: true },
            }}
          >
            <MenuItem value="">All statuses</MenuItem>
            {QUOTATION_STATUSES.map((status) => (
              <MenuItem key={status} value={status}>
                {status === "PendingApproval" ? "Pending approval" : status}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Sales team"
            value={filters.salesTeamId}
            onChange={(e) =>
              onChange({ salesTeamId: e.target.value, ownerId: "", page: 1 })
            }
            slotProps={{
              select: { displayEmpty: true },
              inputLabel: { shrink: true },
            }}
          >
            <MenuItem value="">All teams</MenuItem>
            {options?.teams.map((team) => (
              <MenuItem key={team.id} value={team.id}>
                {team.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Owner"
            value={filters.ownerId}
            onChange={(e) => onChange({ ownerId: e.target.value, page: 1 })}
            slotProps={{
              select: { displayEmpty: true },
              inputLabel: { shrink: true },
            }}
          >
            <MenuItem value="">All owners</MenuItem>
            {Array.from(
              new Map(
                (options?.teams || [])
                  .filter(
                    (team) =>
                      !filters.salesTeamId || team.id === filters.salesTeamId,
                  )
                  .flatMap((team) => team.members)
                  .map((m) => [m.id, m]),
              ).values(),
            ).map((member) => (
              <MenuItem key={member.id} value={member.id}>
                {member.displayName}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Quotation date from"
            type="date"
            value={filters.fromDate}
            onChange={(e) => onChange({ fromDate: e.target.value, page: 1 })}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { max: filters.toDate || undefined },
            }}
          />
          <TextField
            label="Quotation date to"
            type="date"
            value={filters.toDate}
            onChange={(e) => onChange({ toDate: e.target.value, page: 1 })}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { min: filters.fromDate || undefined },
            }}
          />
        </div>
      </Collapse>
      {(filters.q ||
        filters.status ||
        activeFilters > 0 ||
        filters.includeRevisions) && (
        <div className={styles.filtersApplied}>
          <span>
            Filtered results
            {filters.includeRevisions ? " · Revision history included" : ""}
          </span>
          <Button
            size="small"
            startIcon={<RotateCcw size={12} />}
            onClick={onReset}
          >
            Reset filters
          </Button>
        </div>
      )}
    </>
  );
}
