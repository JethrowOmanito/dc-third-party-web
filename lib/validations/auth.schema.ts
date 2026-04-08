import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username too long')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username contains invalid characters'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password too long'),
});

export const referenceLoginSchema = z.object({
  referenceNumber: z
    .string()
    .min(1, 'Reference number is required')
    .max(100, 'Reference number too long')
    .regex(/^[a-zA-Z0-9\-_/]+$/, 'Invalid reference number format'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ReferenceLoginInput = z.infer<typeof referenceLoginSchema>;
