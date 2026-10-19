import { scopedService } from "../shared/team-guard.js";
import { SalesTeamRepository } from "../modules/sales-teams/sales-team.repository.js";
import { SalesTeamService } from "../modules/sales-teams/sales-team.service.js";
import { AssignmentService } from "../shared/assignments/assignment.service.js";
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
  const customers = new CustomerService(new CustomerRepository(db, models));
  scopedService(service, [
    "create",
    "detail",
    "list",
    "patch",
    "remove",
    "action",
    "convert",
  ]);
  scopedService(salesOrders, [
    "create",
    "detail",
    "list",
    "patch",
    "remove",
    "confirm",
    "action",
    "revise",
    "revisions",
    "activity",
    "fulfilment",
    "pdfData",
  ]);
  scopedService(customers, ["create", "detail", "list", "patch", "lifecycle"]);
  const salesTeams = scopedService(
    new SalesTeamService(new SalesTeamRepository(db, models)),
    ["create", "detail", "list", "patch", "lifecycle", "users"],
  );
  const assignments = scopedService(
    new AssignmentService(repository, customers, service, salesOrders),
    ["reassign"],
  );
  return {
    db,
    models,
    repository,
    service,
    salesOrders,
    customers,
    salesTeams,
    assignments,
    close: () => db.close(),
  };
}
