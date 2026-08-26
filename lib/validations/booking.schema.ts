import { z } from 'zod';

export const bookingContactSchema = z.object({
  name: z.string().min(2, 'Full name is required').max(100),
  phone: z
    .string()
    .min(8, 'Valid phone number required')
    .max(20)
    .regex(/^[+\d\s()-]+$/, 'Invalid phone number'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  postalCode: z
    .string()
    .regex(/^\d{6}$/, 'Enter a valid 6-digit Singapore postal code'),
  unitNumber: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
});

export type BookingContactInput = z.infer<typeof bookingContactSchema>;
