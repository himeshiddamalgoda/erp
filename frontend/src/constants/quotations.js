export const QUOTATION_STATUSES = [
  "Draft",
  "PendingApproval",
  "Approved",
  "Issued",
  "Accepted",
  "Declined",
  "Expired",
  "Superseded",
  "Cancelled",
  "Converted",
];
export const STATUS_LABELS = { PendingApproval: "Pending approval" };
export const STATUS_COLORS = {
  Draft: "neutral",
  PendingApproval: "amber",
  Approved: "green",
  Issued: "blue",
  Accepted: "teal",
  Declined: "red",
  Expired: "amber",
  Superseded: "neutral",
  Cancelled: "red",
  Converted: "purple",
};
export const CURRENCIES = ["USD", "LKR", "GBP", "EUR"];
export const PAGE_SIZES = [10, 20, 50, 100];
export const WRITER_ROLES = ["Sales", "SalesManager", "Admin"];
export const ACTION_LABELS = {
  submit: "Submit for approval",
  approve: "Approve quotation",
  reject: "Reject submission",
  withdraw: "Withdraw submission",
  issue: "Issue quotation",
  "buyer-response": "Record buyer response",
  revisions: "Create revision",
  void: "Void quotation",
  delete: "Delete draft",
  convert: "Convert to sales order",
};
export const DEFAULT_FILTERS = {
  q: "",
  status: "",
  customerId: "",
  salesTeamId: "",
  ownerId: "",
  fromDate: "",
  toDate: "",
  page: 1,
  pageSize: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
  includeRevisions: false,
};
