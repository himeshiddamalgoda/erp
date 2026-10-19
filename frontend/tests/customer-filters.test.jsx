import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CustomerFilters } from "@/features/customers/components/customer-list";
import { CUSTOMER_FILTERS } from "@/constants/customers";
it("retains search focus across URL updates and synchronizes external reset", async () => {
  const onChange = vi.fn(),
    options = {
      teams: [],
      company: { countries: ["LK"], currencies: ["USD"] },
    };
  const props = {
    filters: CUSTOMER_FILTERS,
    options,
    onChange,
    onReset: vi.fn(),
  };
  const view = render(<CustomerFilters {...props} />),
    input = screen.getByRole("textbox", { name: "Search customers" });
  input.focus();
  fireEvent.change(input, { target: { value: "Ocean" } });
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({ q: "Ocean", page: 1 }),
  );
  view.rerender(
    <CustomerFilters
      {...props}
      filters={{ ...CUSTOMER_FILTERS, q: "Ocean" }}
    />,
  );
  expect(screen.getByRole("textbox", { name: "Search customers" })).toBe(input);
  expect(input).toHaveFocus();
  view.rerender(<CustomerFilters {...props} />);
  expect(input).toHaveValue("");
});
