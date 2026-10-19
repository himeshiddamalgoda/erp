"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Button,
  TextField,
  MenuItem,
  Tabs,
  Tab,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  InputAdornment,
  IconButton,
} from "@mui/material";
import {
  Search,
  ListFilter,
  Plus,
  Package,
  PauseCircle,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/constants/sales-orders";
import { ROUTES } from "@/constants/routes";
import { formatMoney, formatDate, formatQuantity } from "@/utils/format";
import { StatusBadge } from "@/components/ui/status-badge";
import { OrderPagination } from "./order-pagination";
import styles from "../sales-orders.module.css";
export function OrderStats({ confirmed, held, delivered }) {
  return (
    <div className={styles.stats}>
      {[
        [
          "Confirmed orders",
          confirmed,
          Package,
          "Reviewed and ready for operations",
        ],
        ["On hold", held, PauseCircle, "Local handoff paused"],
        [
          "Awaiting closure",
          delivered,
          CheckCircle2,
          "Every garment line delivered",
        ],
      ].map(([label, value, Icon, hint]) => (
        <div className={`${styles.card} ${styles.stat}`} key={label}>
          <div className={styles.statTop}>
            {label}
            <span className={styles.statIcon}>
              <Icon size={16} />
            </span>
          </div>
          <strong>{value ?? "—"}</strong>
          <small>{hint}</small>
        </div>
      ))}
    </div>
  );
}
export function OrderFilters({ filters, options, onChange, onReset }) {
  const [advanced, setAdvanced] = useState(false),
    [q, setQ] = useState(filters.q);
  const select = (key, label, items) => (
    <TextField
      select
      label={label}
      value={filters[key]}
      onChange={(e) =>
        onChange({
          [key]: e.target.value,
          page: 1,
          ...(key === "salesTeamId" ? { ownerId: "" } : {}),
        })
      }
    >
      <MenuItem value="">All</MenuItem>
      {items.map((i) => (
        <MenuItem key={i.id} value={i.id}>
          {i.label}
        </MenuItem>
      ))}
    </TextField>
  );
  return (
    <>
      <Tabs
        className={styles.tabs}
        value={
          ["", "Draft", "Confirmed", "InProgress", "Delivered"].includes(
            filters.status,
          )
            ? filters.status
            : false
        }
        onChange={(_, status) => onChange({ status, page: 1 })}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Order status"
      >
        {[
          ["", "All orders"],
          ["Draft", "Drafts"],
          ["Confirmed", "Confirmed"],
          ["InProgress", "In progress"],
          ["Delivered", "Delivered"],
        ].map(([v, l]) => (
          <Tab key={v} value={v} label={l} />
        ))}
      </Tabs>
      <div className={styles.filters}>
        <form
          className={styles.search}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            onChange({ q: q.trim(), page: 1 });
          }}
        >
          <TextField
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search order, buyer or PO…"
            slotProps={{
              htmlInput: {
                "aria-label": "Search sales orders",
                maxLength: 100,
              },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton type="submit" aria-label="Apply order search">
                      <ArrowUpRight size={15} />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </form>
        <TextField
          select
          value={filters.source}
          className={styles.filter}
          onChange={(e) => onChange({ source: e.target.value, page: 1 })}
          slotProps={{
            select: { displayEmpty: true },
            htmlInput: { "aria-label": "Order source" },
          }}
        >
          <MenuItem value="">All sources</MenuItem>
          <MenuItem value="direct">Direct orders</MenuItem>
          <MenuItem value="quotation">From quotation</MenuItem>
        </TextField>
        <TextField
          select
          value={`${filters.sortBy}:${filters.sortOrder}`}
          className={styles.filter}
          onChange={(e) => {
            const [sortBy, sortOrder] = e.target.value.split(":");
            onChange({ sortBy, sortOrder, page: 1 });
          }}
          slotProps={{ htmlInput: { "aria-label": "Sort orders" } }}
        >
          {[
            ["createdAt:desc", "Newest first"],
            ["createdAt:asc", "Oldest first"],
            ["total:desc", "Highest value"],
            ["requestedDeliveryDate:asc", "Delivery date"],
            ...(![
              "createdAt:desc",
              "createdAt:asc",
              "total:desc",
              "requestedDeliveryDate:asc",
            ].includes(`${filters.sortBy}:${filters.sortOrder}`)
              ? [[`${filters.sortBy}:${filters.sortOrder}`, "Custom sort"]]
              : []),
          ].map(([v, l]) => (
            <MenuItem key={v} value={v}>
              {l}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="outlined"
          startIcon={<ListFilter size={15} />}
          aria-expanded={advanced}
          onClick={() => setAdvanced((v) => !v)}
        >
          Filters
        </Button>
        <Button
          onClick={() => {
            setQ("");
            onReset();
          }}
        >
          Reset
        </Button>
      </div>
      <Collapse in={advanced}>
        <div className={styles.filterPanel}>
          {select(
            "status",
            "Status",
            ORDER_STATUSES.map((id) => ({
              id,
              label: ORDER_STATUS_LABELS[id] || id,
            })),
          )}
          {select("onHold", "Hold status", [
            { id: "true", label: "On hold" },
            { id: "false", label: "Not on hold" },
          ])}
          {select(
            "customerId",
            "Buyer",
            options.customers.map((c) => ({ id: c.id, label: c.name })),
          )}
          {select(
            "salesTeamId",
            "Sales team",
            options.teams.map((t) => ({ id: t.id, label: t.name })),
          )}
          {select("ownerId", "Owner", [
            ...new Map(
              options.teams
                .filter(
                  (t) => !filters.salesTeamId || t.id === filters.salesTeamId,
                )
                .flatMap((t) => t.members)
                .map((m) => [m.id, { id: m.id, label: m.displayName }]),
            ).values(),
          ])}
          <TextField
            label="Delivery from"
            type="date"
            value={filters.deliveryFrom}
            onChange={(e) =>
              onChange({ deliveryFrom: e.target.value, page: 1 })
            }
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { max: filters.deliveryTo || undefined },
            }}
          />
          <TextField
            label="Delivery to"
            type="date"
            value={filters.deliveryTo}
            onChange={(e) => onChange({ deliveryTo: e.target.value, page: 1 })}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { min: filters.deliveryFrom || undefined },
            }}
          />
        </div>
      </Collapse>
    </>
  );
}
export function OrderTable({
  data = [],
  meta,
  filters,
  onChange,
  canCreate,
  onReset,
  loading,
}) {
  return (
    <>
      {!data.length ? (
        <div className={styles.empty}>
          <Package size={35} />
          <h2>No sales orders to show</h2>
          <p>
            Create a direct order or convert an accepted quotation. If filters
            are applied, try resetting them.
          </p>
          <div className={styles.buttons}>
            {canCreate && (
              <Button
                component={Link}
                href={ROUTES.newSalesOrder}
                variant="contained"
                startIcon={<Plus size={15} />}
              >
                New direct order
              </Button>
            )}
            <Button onClick={onReset}>Reset filters</Button>
          </div>
        </div>
      ) : (
        <div className={styles.tableWrap} aria-busy={loading}>
          <Table
            className={`${styles.table} ${styles.orderListTable}`}
            aria-label="Sales orders"
          >
            <TableHead>
              <TableRow>
                {[
                  "Order / source",
                  "Buyer / PO",
                  "Status",
                  "Delivery",
                  "Quantity",
                  "Total value",
                  "Open",
                ].map((h) => (
                  <TableCell key={h}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((o) => (
                <TableRow hover key={o.id}>
                  <TableCell>
                    <Link href={ROUTES.salesOrder(o.id)}>{o.orderNumber}</Link>
                    <span className={styles.sub}>
                      {o.sourceQuotationId
                        ? "From " + o.sourceQuoteNumber
                        : "Direct order"}{" "}
                      · R{o.documentRevision}
                    </span>
                  </TableCell>
                  <TableCell>
                    {o.customerName}
                    <span className={styles.sub}>
                      PO {o.buyerPoNumber || "not set"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} />
                    {o.isOnHold && (
                      <span className={styles.hold}>
                        <PauseCircle size={10} />
                        On hold
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={styles.noWrap}>
                    {formatDate(o.requestedDeliveryDate)}
                  </TableCell>
                  <TableCell className={styles.noWrap}>
                    {formatQuantity(o.totalQty)} PCS
                  </TableCell>
                  <TableCell className={styles.noWrap}>
                    {formatMoney(o.total, o.currency)}
                  </TableCell>
                  <TableCell>
                    <IconButton
                      component={Link}
                      href={ROUTES.salesOrder(o.id)}
                      aria-label={`Open ${o.orderNumber}`}
                    >
                      <ArrowUpRight size={16} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <OrderPagination
        meta={meta}
        page={filters.page}
        pageSize={filters.pageSize}
        onChange={onChange}
        disabled={loading}
      />
    </>
  );
}
