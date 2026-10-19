export const ROUTES = {
  customers: "/orders/customers",
  newCustomer: "/orders/customers/new",
  customer: (id) => `/orders/customers/${id}`,
  editCustomer: (id) => `/orders/customers/${id}/edit`,
  salesOrders: "/orders/sales-orders",
  newSalesOrder: "/orders/sales-orders/new",
  salesOrder: (id) => `/orders/sales-orders/${id}`,
  editSalesOrder: (id) => `/orders/sales-orders/${id}/edit`,
  quotations: "/orders/quotations",
  newQuotation: "/orders/quotations/new",
  quotation: (id) => `/orders/quotations/${id}`,
  editQuotation: (id) => `/orders/quotations/${id}/edit`,
};
