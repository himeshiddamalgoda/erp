"use client";
import { useEffect, useState } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDispatch } from "react-redux";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Radio,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { Plus, Save, Trash2 } from "lucide-react";
import { FormField } from "@/components/forms/form-field";
import { ApiErrorAlert } from "@/components/ui/page-state";
import { applyServerErrors } from "@/utils/api-error";
import { setEditorDirty } from "@/store/ui-slice";
import { canAssignCustomers } from "@/constants/customers";
import {
  customerFormValues,
  customerPayload,
  emptyContact,
  emptyAddress,
  selectedOptions,
} from "@/utils/customer";
import { customerSchema } from "../schemas/customer.schema";
import { CustomerBlockers } from "./customer-shared";
import styles from "../customers.module.css";
export function CustomerForm({
  customer,
  options,
  initialValues,
  onSave,
  onCancel,
  onReload,
  blocked = false,
}) {
  const [baseline] = useState(customer),
    [error, setApiError] = useState(null),
    [reload, setReload] = useState(false);
  const dispatch = useDispatch();
  const form = useForm({
    defaultValues: initialValues
      ? customerFormValues(initialValues, options)
      : customerFormValues(customer, options),
    resolver: zodResolver(customerSchema(options, baseline)),
    mode: "onTouched",
  });
  const {
    control,
    setValue,
    handleSubmit,
    setError,
    formState: { isDirty, isSubmitting, errors },
  } = form;
  const contacts = useFieldArray({
      control,
      name: "contacts",
      keyName: "formKey",
    }),
    addresses = useFieldArray({
      control,
      name: "addresses",
      keyName: "formKey",
    }),
    values = useWatch({ control });
  const disabled = isSubmitting || blocked,
    assignmentAllowed = !baseline || canAssignCustomers(options.actor),
    team = options.teams.find((t) => t.id === values.salesTeamId),
    assignmentChanged =
      baseline &&
      (baseline.ownerId !== values.ownerId ||
        baseline.salesTeamId !== values.salesTeamId);
  const update = (key, value) =>
    setValue(key, value, { shouldDirty: true, shouldValidate: true });
  useEffect(() => {
    dispatch(setEditorDirty(isDirty));
    return () => dispatch(setEditorDirty(false));
  }, [dispatch, isDirty]);
  useEffect(() => {
    if (!isDirty && !blocked) return;
    const prevent = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [isDirty, blocked]);
  const field = (name, label, props = {}) => (
    <FormField name={name} label={label} control={control} {...props} />
  );
  const countries = (options.company.countries || []).map((id) => ({
    id,
    label: id,
  }));
  const submit = async (data) => {
    setApiError(null);
    try {
      await onSave(customerPayload(data, baseline));
    } catch (e) {
      setApiError(e);
      applyServerErrors(e, setError);
    }
  };
  return (
    <form onSubmit={handleSubmit(submit)} noValidate>
      <ApiErrorAlert error={error} resource="customer">
        {error?.code === "STALE_VERSION" && (
          <Button onClick={() => setReload(true)}>
            Reload and review server data
          </Button>
        )}
      </ApiErrorAlert>
      <CustomerBlockers details={error?.details} newTab />
      {baseline?.status === "Archived" && (
        <Alert severity="info" className={styles.notice}>
          You are repairing an archived profile. Save keeps it Archived;
          reactivate separately after reviewing the changes.
        </Alert>
      )}
      <fieldset disabled={disabled} className={styles.fieldset}>
        <section className={`${styles.panel} ${styles.section}`}>
          <h2>Company details</h2>
          <p className={styles.muted}>
            Business buyer information and defaults for future commercial
            documents.
          </p>
          <div className={styles.grid}>
            {field("name", "Legal company name", { required: true })}
            {field("displayName", "Display name")}
            {field("country", "Country", {
              required: true,
              options: countries,
              onValueChange: (value) => {
                values.addresses.forEach((a, i) => {
                  if (!a.country) update(`addresses.${i}.country`, value);
                });
              },
            })}
            {field("currency", "Default currency", {
              required: true,
              options: options.company.currencies.map((id) => ({
                id,
                label: id,
              })),
            })}
            <div className={styles.full}>
              {field("paymentTerms", "Payment terms", {
                required: true,
                multiline: true,
                minRows: 2,
              })}
            </div>
            {field("email", "Business email")}
            {field("phone", "Business phone")}
            {field("website", "Website")}
            {field("registrationNumber", "Registration number")}
            <div className={styles.full}>
              {field("internalNotes", "Internal notes", {
                multiline: true,
                minRows: 3,
                helperText: "Staff only. Never copied to buyer documents.",
              })}
            </div>
          </div>
        </section>
        <section className={`${styles.panel} ${styles.section}`}>
          <h2>Assignment</h2>
          <p className={styles.muted}>
            Choose an active sales team and a member of that team.
          </p>
          <div className={styles.grid}>
            {field("salesTeamId", "Sales team", {
              required: true,
              disabled: disabled || !assignmentAllowed,
              options: selectedOptions(
                options.teams.map((t) => ({ id: t.id, label: t.name })),
                values.salesTeamId,
              ),
              onValueChange: () => update("ownerId", ""),
            })}
            {field("ownerId", "Owner", {
              required: true,
              disabled: disabled || !assignmentAllowed,
              options: selectedOptions(
                (team?.members || []).map((m) => ({
                  id: m.id,
                  label: m.displayName,
                })),
                values.ownerId,
              ),
            })}
            {assignmentChanged && (
              <div className={styles.full}>
                {field("reason", "Ownership change reason", {
                  required: true,
                  multiline: true,
                  minRows: 2,
                })}
              </div>
            )}
          </div>
        </section>
        <section className={`${styles.panel} ${styles.section}`}>
          <div className={`${styles.row} ${styles.between}`}>
            <h2>Contacts</h2>
            <Button
              startIcon={<Plus size={15} />}
              onClick={() => contacts.append(emptyContact())}
              disabled={disabled || contacts.fields.length >= 500}
            >
              Add contact
            </Button>
          </div>
          <p className={styles.muted}>
            Exactly one active primary contact. Every active contact needs an
            email or phone.
          </p>
          {errors.contacts?.message && (
            <p role="alert" className={styles.error}>
              {errors.contacts.message}
            </p>
          )}
          {errors.contacts?.root?.message && (
            <p role="alert" className={styles.error}>
              {errors.contacts.root.message}
            </p>
          )}
          <div className={styles.stack}>
            {contacts.fields.map((row, i) => {
              const c = values.contacts?.[i] || row;
              return (
                <article
                  className={styles.child}
                  key={row.formKey}
                  aria-label={`Contact ${i + 1}`}
                >
                  <div className={styles.childHead}>
                    <strong>Contact {i + 1}</strong>
                    <div className={styles.row}>
                      <FormControlLabel
                        label="Primary contact"
                        control={
                          <Radio
                            checked={c.primary}
                            disabled={disabled || !c.isActive}
                            onChange={() =>
                              values.contacts.forEach((_, j) =>
                                update(`contacts.${j}.primary`, j === i),
                              )
                            }
                            inputProps={{
                              "aria-label": `Primary contact ${i + 1}`,
                            }}
                          />
                        }
                      />
                      <FormControlLabel
                        label="Active"
                        control={
                          <Checkbox
                            checked={c.isActive}
                            disabled={disabled}
                            onChange={(_, checked) => {
                              update(`contacts.${i}.isActive`, checked);
                              if (!checked)
                                update(`contacts.${i}.primary`, false);
                            }}
                            inputProps={{
                              "aria-label": `Contact ${i + 1} active`,
                            }}
                          />
                        }
                      />
                      {!c.id && contacts.fields.length > 1 && (
                        <Button
                          color="error"
                          onClick={() => contacts.remove(i)}
                          startIcon={<Trash2 size={14} />}
                          disabled={disabled}
                          aria-label={`Remove new contact ${i + 1}`}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className={styles.grid}>
                    {field(`contacts.${i}.name`, `Contact ${i + 1} name`, {
                      required: true,
                    })}
                    {field(
                      `contacts.${i}.jobTitle`,
                      `Contact ${i + 1} job title`,
                    )}
                    {field(`contacts.${i}.email`, `Contact ${i + 1} email`)}
                    {field(`contacts.${i}.phone`, `Contact ${i + 1} phone`)}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <section className={`${styles.panel} ${styles.section}`}>
          <div className={`${styles.row} ${styles.between}`}>
            <h2>Addresses</h2>
            <div className={styles.row}>
              <Button
                onClick={() =>
                  addresses.append(emptyAddress("billing", values.country))
                }
                disabled={disabled || addresses.fields.length >= 500}
              >
                Add billing address
              </Button>
              <Button
                startIcon={<Plus size={15} />}
                onClick={() =>
                  addresses.append(emptyAddress("shipping", values.country))
                }
                disabled={disabled || addresses.fields.length >= 500}
              >
                Add shipping address
              </Button>
            </div>
          </div>
          <p className={styles.muted}>
            One active default for each type. Choose a replacement before
            deactivating a current default.
          </p>
          {(errors.addresses?.message || errors.addresses?.root?.message) && (
            <p role="alert" className={styles.error}>
              {errors.addresses.message || errors.addresses.root.message}
            </p>
          )}
          <div className={styles.stack}>
            {addresses.fields.map((row, i) => {
              const a = values.addresses?.[i] || row;
              return (
                <article
                  className={styles.child}
                  key={row.formKey}
                  aria-label={`Address ${i + 1}`}
                >
                  <div className={styles.childHead}>
                    <strong>
                      {a.label ||
                        `${a.addressType === "billing" ? "Billing" : "Shipping"} address ${i + 1}`}
                    </strong>
                    <div className={styles.row}>
                      <FormControlLabel
                        label={`Default ${a.addressType}`}
                        control={
                          <Radio
                            checked={a.isDefault}
                            disabled={disabled || !a.isActive}
                            onChange={() =>
                              values.addresses.forEach((other, j) => {
                                if (other.addressType === a.addressType)
                                  update(`addresses.${j}.isDefault`, j === i);
                              })
                            }
                            inputProps={{
                              "aria-label": `Default address ${i + 1}`,
                            }}
                          />
                        }
                      />
                      <FormControlLabel
                        label="Active"
                        control={
                          <Checkbox
                            checked={a.isActive}
                            disabled={disabled}
                            onChange={(_, checked) => {
                              update(`addresses.${i}.isActive`, checked);
                              if (!checked)
                                update(`addresses.${i}.isDefault`, false);
                            }}
                            inputProps={{
                              "aria-label": `Address ${i + 1} active`,
                            }}
                          />
                        }
                      />
                      {!a.id && (
                        <Button
                          color="error"
                          disabled={disabled}
                          onClick={() => addresses.remove(i)}
                          aria-label={`Remove new address ${i + 1}`}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className={styles.grid}>
                    {field(`addresses.${i}.label`, `Address ${i + 1} label`)}
                    {field(
                      `addresses.${i}.addressType`,
                      `Address ${i + 1} type`,
                      {
                        disabled: true,
                        options: [
                          { id: "billing", label: "Billing" },
                          { id: "shipping", label: "Shipping" },
                        ],
                      },
                    )}
                    {field(`addresses.${i}.line1`, `Address ${i + 1} line 1`, {
                      required: true,
                    })}
                    {field(`addresses.${i}.line2`, `Address ${i + 1} line 2`)}
                    {field(`addresses.${i}.city`, `Address ${i + 1} city`, {
                      required: true,
                    })}
                    {field(`addresses.${i}.region`, `Address ${i + 1} region`)}
                    {field(
                      `addresses.${i}.postalCode`,
                      `Address ${i + 1} postal code`,
                    )}
                    {field(
                      `addresses.${i}.country`,
                      `Address ${i + 1} country`,
                      { required: true, options: countries },
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </fieldset>
      <Alert severity="info">
        Address, currency and payment-term changes affect future defaults.
        Existing documents keep their selected addresses and snapshots.
      </Alert>
      <div className={styles.actions}>
        <Button onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          startIcon={<Save size={16} />}
          disabled={disabled}
        >
          {isSubmitting
            ? "Saving…"
            : baseline
              ? "Save changes"
              : "Create customer"}
        </Button>
      </div>
      <Dialog open={reload} onClose={() => setReload(false)}>
        <DialogTitle>Reload this profile?</DialogTitle>
        <DialogContent>
          Review the latest server data. Your current unsaved form edits will be
          discarded only when you confirm.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReload(false)}>Keep editing</Button>
          <Button
            color="error"
            onClick={async () => {
              setReload(false);
              await onReload();
            }}
          >
            Discard edits and reload
          </Button>
        </DialogActions>
      </Dialog>
    </form>
  );
}
