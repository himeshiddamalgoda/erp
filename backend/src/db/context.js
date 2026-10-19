import { CustomerRepository } from "../modules/customers/customer.repository.js";
import { CustomerService } from "../modules/customers/customer.service.js";
import { createSequelize } from "./sequelize.js";
import { defineModels } from "./schema.js";
import { QuotationRepository } from "../modules/quotations/quotation.repository.js";
import { QuotationService } from "../modules/quotations/quotation.service.js";
import { SalesOrderRepository } from "../modules/sales-orders/sales-order.repository.js";
import { SalesOrderService } from "../modules/sales-orders/sales-order.service.js";
export function createQuotationContext(db = createSequelize()) {
  const models = defineModels(db);
  const repository = new QuotationRepository(db, models);
  const service = new QuotationService(repository);
  const salesOrderRepository = new SalesOrderRepository(db, models);
  const salesOrders = new SalesOrderService(salesOrderRepository);
  return {
    db,
    models,
    repository,
    service,
    salesOrders,
    customers: new CustomerService(new CustomerRepository(db, models)),
    close: () => db.close(),
  };
}
