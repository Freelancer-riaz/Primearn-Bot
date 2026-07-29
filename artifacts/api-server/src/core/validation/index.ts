import { z } from "zod";
import { ValidationError } from "../errors/AppError";

/**
 * Validates data against a Zod schema.
 * Throws ValidationError (400) on failure.
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.errors.map((e) => e.message).join(", ");
    throw new ValidationError(message);
  }
  return result.data;
}

export { z };
