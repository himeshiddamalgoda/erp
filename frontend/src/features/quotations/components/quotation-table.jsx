"use client";
import {
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
} from "@mui/material";
import Link from "next/link";
import { ArrowUpRight, FilePlus2, SearchX, Plus } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { PAGE_SIZES } from "@/constants/quotations";
import {
  formatDate,
  formatMoney,
  formatQuantity,
  initials,
} from "@/utils/format";
import { StatusBadge } from "@/components/ui/status-badge";
import styles from "../quotations.module.css";
export function QuotationTable({
  data = [],
  meta,
  filters,
  onPage,
  onPageSize,
  canCreate,
  onReset,
  isPlaceholderData,
}) {
  if (!data.length)
    return (
      <div className={styles.empty}>
        <div className={styles.emptyArt}>
          {meta?.total > 0 || filters.q || filters.status ? (
            <SearchX size={34} strokeWidth={1.25} />
          ) : (
            <FilePlus2 size={34} strokeWidth={1.25} />
          )}
        </div>
        <h2>
          {meta?.total > 0
            ? "No quotations on this page"
            : filters.q || filters.status || filters.customerId
              ? "No matching quotations"
              : "Every great order starts with an offer."}
        </h2>
        <p>
          {filters.q || filters.status || filters.customerId
            ? "Try a different search or reset your filters to find the right offer."
            : "Build your first garment quotation, bring your team into the review, and turn the right offer into an order."}
        </p>
        {canCreate && !filters.q && !filters.status && !filters.customerId ? (
          <Button
            component={Link}
            href={ROUTES.newQuotation}
            variant="contained"
            startIcon={<Plus size={15} />}
          >
            Create your first quotation
          </Button>
        ) : (
          <Button variant="outlined" onClick={onReset}>
            Reset filters
          </Button>
        )}
      </div>
    );
  return (
    <>
      <div
        className={`${styles.tableWrap} ${isPlaceholderData ? styles.refreshingTable : ""}`}
      >
        <Table className={styles.table} aria-label="Quotations">
          <TableHead>
            <TableRow>
              <TableCell>Quotation</TableCell>
              <TableCell>Buyer</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell align="right">Total value</TableCell>
              <TableCell>Valid until</TableCell>
              <TableCell align="right">
                <span className="sr-only">Open</span>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((quote) => (
              <TableRow hover key={quote.id}>
                <TableCell>
                  <div className={styles.quoteNumber}>
                    <Link href={ROUTES.quotation(quote.id)}>
                      {quote.quoteNumber}
                    </Link>
                    <span className={styles.revisionPill}>
                      R{quote.revision}
                    </span>
                  </div>
                  <span className={styles.cellSub}>
                    Created {formatDate(quote.createdAt)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className={styles.buyerCell}>
                    <span className={styles.buyerAvatar}>
                      {initials(quote.customerName)}
                    </span>
                    {quote.customerName}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={quote.status} />
                </TableCell>
                <TableCell align="right">
                  <span className={styles.noWrap}>
                    {formatQuantity(quote.totalQty)}{" "}
                    <span
                      className={`${styles.cellSub} ${styles.quantityUnit}`}
                    >
                      PCS
                    </span>
                  </span>
                </TableCell>
                <TableCell align="right">
                  <span className={styles.moneyCell}>
                    {formatMoney(quote.total, quote.currency)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={styles.dateCell}>
                    {quote.validUntil
                      ? formatDate(quote.validUntil)
                      : "Not set"}
                  </span>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Open quotation">
                    <IconButton
                      component={Link}
                      href={ROUTES.quotation(quote.id)}
                      size="small"
                      aria-label={`Open ${quote.quoteNumber} revision ${quote.revision}`}
                    >
                      <ArrowUpRight size={16} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <TablePagination
        component="div"
        className={styles.tablePagination}
        count={meta?.total || 0}
        page={filters.page - 1}
        rowsPerPage={filters.pageSize}
        rowsPerPageOptions={PAGE_SIZES}
        onPageChange={(_, value) => onPage(value + 1)}
        onRowsPerPageChange={(e) => onPageSize(Number(e.target.value))}
        labelRowsPerPage="Rows per page"
        showFirstButton
        showLastButton
      />
    </>
  );
}
