"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, MenuItem, TextField } from "@mui/material";
import { ROUTES } from "@/constants/routes";
import { TeamStatus, TeamPagination } from "./team-shared";
import styles from "../sales-teams.module.css";
export function TeamFilters({ filters, onChange, onReset, people }) {
  const [draft, setDraft] = useState({ source: filters.q, value: filters.q });
  if (draft.source !== filters.q)
    setDraft({ source: filters.q, value: filters.q });
  const select = (key, label, items) => (
    <TextField
      select
      label={label}
      slotProps={{ select: { SelectDisplayProps: { "aria-label": label } } }}
      value={filters[key]}
      onChange={(e) => onChange({ [key]: e.target.value, page: 1 })}
    >
      {items.map((x) => (
        <MenuItem key={x.id} value={x.id}>
          {x.label}
        </MenuItem>
      ))}
    </TextField>
  );
  return (
    <form
      className={styles.filters}
      onSubmit={(e) => {
        e.preventDefault();
        onChange({ q: draft.value, page: 1 });
      }}
    >
      <TextField
        label="Search teams"
        placeholder="Name or team code"
        value={draft.value}
        onChange={(e) => setDraft({ ...draft, value: e.target.value })}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />
      <Button type="submit">Search</Button>
      {select(
        "status",
        "Status",
        ["Active", "Archived", "All"].map((id) => ({ id, label: id })),
      )}
      {["managerId", "memberId"].map((key) => (
        <div key={key}>
          {select(key, key === "managerId" ? "Manager" : "Member", [
            { id: "", label: "All" },
            ...people.map((p) => ({ id: p.id, label: p.displayName })),
            ...(filters[key] && !people.some((p) => p.id === filters[key])
              ? [{ id: filters[key], label: filters[key] }]
              : []),
          ])}
        </div>
      ))}
      {select("sortBy", "Sort by", [
        { id: "name", label: "Name" },
        { id: "code", label: "Code" },
        { id: "createdAt", label: "Created date" },
      ])}
      {select("sortOrder", "Direction", [
        { id: "asc", label: "Ascending" },
        { id: "desc", label: "Descending" },
      ])}
      <Button onClick={onReset}>Reset filters</Button>
    </form>
  );
}
export function TeamTable({ data, meta, filters, onChange, loading }) {
  return (
    <>
      <div className={styles.table}>
        <table>
          <thead>
            <tr>
              <th>Sales team</th>
              <th>Status</th>
              <th>Manager</th>
              <th>Active members</th>
              <th>Eligible members</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            {data.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={ROUTES.salesTeam(t.id)}>{t.name}</Link>
                  <small>{t.code}</small>
                </td>
                <td>
                  <TeamStatus status={t.status} />
                </td>
                <td>{t.manager?.displayName || "Manager requires repair"}</td>
                <td>{t.activeMemberCount}</td>
                <td>{t.eligibleMemberCount}</td>
                <td>{t.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.length && (
          <div className={styles.empty}>
            <h2>No teams found</h2>
            <p>Try another search or reset the filters.</p>
          </div>
        )}
      </div>
      <TeamPagination
        meta={meta}
        filters={filters}
        onChange={onChange}
        disabled={loading}
      />
    </>
  );
}
