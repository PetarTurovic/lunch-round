export class AppError extends Error {
  constructor(message: string, public readonly statusCode = 500) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError { constructor(res = "Resource") { super(`${res} not found`, 404); } }
export class UnauthorizedError extends AppError { constructor(msg = "Unauthorized") { super(msg, 401); } }
export class ForbiddenError extends AppError { constructor(msg = "Forbidden") { super(msg, 403); } }
export class BadRequestError extends AppError { constructor(msg = "Bad request") { super(msg, 400); } }
export class ConflictError extends AppError { constructor(msg = "Conflict") { super(msg, 409); } }
