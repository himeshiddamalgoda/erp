import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { makeStore } from "@/store/store";
import { QuotationForm } from "@/features/quotations/components/quotation-form";
import { QuotationActionDialog } from "@/features/quotations/components/quotation-action-dialog";
import { ApiError } from "@/utils/api-error";
import { quotation, options } from "./fixtures";
function renderForm(onSave) {
  return render(
    <Provider store={makeStore()}>
      <QuotationForm
        quotation={quotation}
        options={options}
        onSave={onSave}
        onCancel={vi.fn()}
        onReload={vi.fn()}
      />
    </Provider>,
  );
}
describe("quotation form interactions", () => {
  it("keeps unsaved notes after STALE_VERSION instead of overwriting with a refetch", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(
      new ApiError({
        status: 409,
        code: "STALE_VERSION",
        message: "Quotation changed; reload before retrying",
      }),
    );
    renderForm(onSave);
    const notes = screen.getByRole("textbox", { name: "Internal notes" });
    await user.clear(notes);
    await user.type(notes, "My unsaved packing changes");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("This quotation has changed");
    expect(notes).toHaveValue("My unsaved packing changes");
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1, intent: "save" }),
    );
  });
  it("saves before submission using an explicit submit intent", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({
      quotation: { ...quotation, version: 2 },
      submissionError: new ApiError({
        status: 422,
        code: "VALIDATION_ERROR",
        message: "Check highlighted fields",
        fields: { paymentTerms: "Required for submission" },
      }),
    });
    renderForm(onSave);
    await user.click(screen.getByRole("button", { name: "Save & submit" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ intent: "submit" }),
      ),
    );
    expect(
      await screen.findByText("Required for submission"),
    ).toBeInTheDocument();
  });
  it("requires a reference and decline reason in the buyer response dialog", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn().mockResolvedValue(undefined);
    function Harness() {
      const [error, setError] = useState(null);
      return (
        <QuotationActionDialog
          context={{
            action: "buyer-response",
            quotation: { ...quotation, status: "Issued" },
            error,
            setError,
          }}
          onClose={vi.fn()}
          onConfirm={confirm}
          onRefresh={vi.fn()}
        />
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: /Declined/ }));
    await user.click(screen.getByRole("button", { name: "Record decline" }));
    expect(
      await screen.findByText("Enter the buyer response reference"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter the reason the buyer declined"),
    ).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    await user.type(
      screen.getByRole("textbox", { name: "Buyer response reference" }),
      "Buyer email",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Reason for declining" }),
      "Delivery too late",
    );
    await user.click(screen.getByRole("button", { name: "Record decline" }));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: "Declined",
          reference: "Buyer email",
          reason: "Delivery too late",
        }),
      ),
    );
  });
});
