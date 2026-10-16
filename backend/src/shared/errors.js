export class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    Object.assign(this, { status, code, fields });
  }
}
export const conflict = (
  code = "INVALID_TRANSITION",
  message = "Action is not eligible in the current state",
) => {
  throw new AppError(409, code, message);
};
export const invalid = (field, message) => {
  throw new AppError(422, "VALIDATION_ERROR", "Check highlighted fields", {
    [field]: message,
  });
};
export function errorHandler(error, req, res, _next) {
  if (res.headersSent) return _next(error);
  let status = error.status || 500;
  let code = error.code || "INTERNAL_ERROR";
  let message = error.message;
  if (error.type === "entity.parse.failed") {
    status = 400;
    code = "MALFORMED_JSON";
  }
  if (error.name === "SequelizeUniqueConstraintError") {
    status = 409;
    code = "CONSTRAINT_CONFLICT";
    message = "Record conflicts with an existing record";
  }
  if (error.name === "SequelizeForeignKeyConstraintError") {
    status = 409;
    code = "REFERENCED_RECORD_CONFLICT";
    message = "Referenced record is missing or in use";
  }
  if (status >= 500)
    console.error({
      requestId: req.requestId,
      error: error.name,
      code: error.original?.code || code,
    });
  res.status(status).json({
    error: {
      code: status >= 500 ? "INTERNAL_ERROR" : code,
      message:
        status >= 500
          ? "Internal server error"
          : error.type === "entity.parse.failed"
            ? "Malformed JSON body"
            : message,
      ...(error.fields ? { fields: error.fields } : {}),
      requestId: req.requestId,
    },
  });
}
