"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, MenuItem, TextField, InputAdornment } from "@mui/material";
import { Search, Building2 } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { CustomerStatus, CustomerPagination } from "./customer-shared";
import styles from "../customers.module.css";
export function CustomerFilters({ filters, options, onChange, onReset }) {
  const [draft, setDraft] = useState({ source: filters.q, value: filters.q });
  // Synchronize browser back/reset without remounting the focused search field.
  if (draft.source !== filters.q)
    setDraft({ source: filters.q, value: filters.q });
  const search = draft.source === filters.q ? draft.value : filters.q;
  const setSearch = (value) => setDraft({ source: filters.q, value });
  useEffect(() => {
    if (search === filters.q) return;
    const timer = setTimeout(() => onChange({ q: search, page: 1 }), 350);
    return () => clearTimeout(timer);
  }, [search, filters.q, onChange]);
  const select = (key, label, items) => (
    <TextField
      select
      label={label}
      value={filters[key]}
      onChange={(e) => onChange({ [key]: e.target.value, page: 1 })}
    >
      <MenuItem value="">All</MenuItem>
      {items.map((x) => (
        <MenuItem key={x.id} value={x.id}>
          {x.label}
        </MenuItem>
      ))}
    </TextField>
  );
  const members = [
    ...new Map(
      options.teams.flatMap((t) => t.members).map((m) => [m.id, m]),
    ).values(),
  ];
  return (
    <>
      <div className={styles.filters}>
        <TextField
          label="Search customers"
          placeholder="Name or customer code"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
            },
            htmlInput: { maxLength: 100 },
          }}
        />
        <TextField
          select
          label="Status"
          value={filters.status}
          onChange={(e) => onChange({ status: e.target.value, page: 1 })}
        >
          {["Active", "Archived", "All"].map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
        {select(
          "salesTeamId",
          "Sales team",
          options.teams.map((t) => ({ id: t.id, label: t.name })),
        )}
        {select(
          "ownerId",
          "Owner",
          members.map((m) => ({ id: m.id, label: m.displayName })),
        )}
        <Button onClick={onReset}>Reset filters</Button>
      </div>
      <div className={`${styles.filters} ${styles.filterSecondary}`}>
        {select(
          "country",
          "Country",
          (options.company.countries || []).map((id) => ({ id, label: id })),
        )}
        {select(
          "currency",
          "Currency",
          options.company.currencies.map((id) => ({ id, label: id })),
        )}
        <TextField
          select
          label="Sort by"
          value={filters.sortBy}
          onChange={(e) => onChange({ sortBy: e.target.value, page: 1 })}
        >
          {[
            ["name", "Name"],
            ["code", "Code"],
            ["createdAt", "Created date"],
          ].map(([id, label]) => (
            <MenuItem key={id} value={id}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Sort direction"
          value={filters.sortOrder}
          onChange={(e) => onChange({ sortOrder: e.target.value, page: 1 })}
        >
          <MenuItem value="asc">Ascending</MenuItem>
          <MenuItem value="desc">Descending</MenuItem>
        </TextField>
      </div>
    </>
  );
}
export function CustomerTable({
  data,
  meta,
  filters,
  onChange,
  loading,
  onReset,
  canCreate,
}) {
  return (
    <>
      <div className={styles.table}>
        <table>
          <thead>
            <tr>
              <th>Buyer</th>
              <th>Country / currency</th>
              <th>Sales team</th>
              <th>Owner</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={ROUTES.customer(c.id)}>
                    {c.displayName || c.name}
                  </Link>
                  <small>
                    {c.code} · {c.name}
                  </small>
                </td>
                <td>
                  {c.country}
                  <small>{c.currency}</small>
                </td>
                <td>{c.salesTeam.name}</td>
                <td>{c.owner.displayName}</td>
                <td>
                  <CustomerStatus status={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.length && (
        <div className={styles.empty}>
          <Building2 size={30} />
          <h2>No customers found</h2>
          <p>Try a different search or add your first business buyer.</p>
          <Button onClick={onReset}>Reset filters</Button>
          {canCreate && (
            <Button component={Link} href={ROUTES.newCustomer}>
              New customer
            </Button>
          )}
        </div>
      )}
      <CustomerPagination
        meta={meta}
        filters={filters}
        onChange={onChange}
        disabled={loading}
      />
    </>
  );
}
