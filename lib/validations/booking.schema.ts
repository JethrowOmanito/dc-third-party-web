import { z } from 'zod';

export const bookingContactSchema = z.object({
  name: z.string().min(2, 'Name is required').max(100),
  phone: z
    .string()
    .min(8, 'Valid phone number required')
    .max(20)
    .regex(/^[+\d\s()-]+$/, 'Invalid phone number'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().min(5, 'Address is required').max(300),
  notes: z.string().max(500).optional(),
});

export type BookingContactInput = z.infer<typeof bookingContactSchema>;
