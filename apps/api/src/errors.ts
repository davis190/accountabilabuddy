export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function badRequest(message: string, fields?: Record<string, string>): AppError {
  return new AppError(400, 'bad_request', message, fields);
}

export function unauthorized(message = 'Authentication required'): AppError {
  return new AppError(401, 'unauthorized', message);
}

export function forbidden(message = 'Not allowed'): AppError {
  return new AppError(403, 'forbidden', message);
}

export function notFound(message = 'Not found'): AppError {
  return new AppError(404, 'not_found', message);
}

export function conflict(message: string, fields?: Record<string, string>): AppError {
  return new AppError(409, 'conflict', message, fields);
}
