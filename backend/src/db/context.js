import { createSequelize } from "./sequelize.js";
import { defineModels } from "./schema.js";
import { QuotationRepository } from "../modules/quotations/quotation.repository.js";
import { QuotationService } from "../modules/quotations/quotation.service.js";
export function createQuotationContext(db = createSequelize()) {
  const models = defineModels(db);
  const repository = new QuotationRepository(db, models);
  const service = new QuotationService(repository);
  return { db, models, repository, service, close: () => db.close() };
}
