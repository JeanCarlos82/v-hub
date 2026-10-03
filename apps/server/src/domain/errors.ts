/** Error con código HTTP. Los servicios lanzan estos errores y la capa HTTP los traduce. */
export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message);
  }
}
