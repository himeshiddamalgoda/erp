import { TablePagination } from "@mui/material";
export function OrderPagination({
  meta,
  page,
  pageSize,
  onChange,
  disabled = false,
}) {
  return (
    <TablePagination
      component="div"
      count={meta?.total || 0}
      page={page - 1}
      rowsPerPage={pageSize}
      rowsPerPageOptions={[10, 20, 50, 100]}
      onPageChange={(_, p) => onChange({ page: p + 1 })}
      onRowsPerPageChange={(e) =>
        onChange({ pageSize: Number(e.target.value), page: 1 })
      }
      showFirstButton
      showLastButton
      slotProps={{
        actions: {
          firstButton: { disabled: disabled || page <= 1 },
          previousButton: { disabled: disabled || page <= 1 },
          nextButton: {
            disabled: disabled || page * pageSize >= (meta?.total || 0),
          },
          lastButton: {
            disabled: disabled || page * pageSize >= (meta?.total || 0),
          },
        },
      }}
    />
  );
}
