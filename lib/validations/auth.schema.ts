import { z } from 'zod';

export const loginSchema = z.object({
  // Accepts either username (a-z0-9_.-) or an email address (contains @).
  // The server-side login route decides which lookup to run based on the
  // presence of an @ in the string.
  username: z
    .string()
    .min(3, 'Enter your username or email')
    .max(200, 'Too long')
    .regex(/^[a-zA-Z0-9_.@+-]+$/, 'Invalid characters in username or email'),
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

export const signupSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username too long')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Only letters, numbers, dots, hyphens, and underscores'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .optional()
    .or(z.literal('')),
  full_name: z
    .string()
    .min(2, 'Please enter your full name')
    .max(120, 'Name too long'),
  email: z
    .string()
    .email('Enter a valid email address')
    .max(200, 'Email too long'),
  whatsapp_phone: z
    .string()
    .min(8, 'Enter a valid phone number')
    .max(20, 'Phone number too long')
    .regex(/^[+0-9\s\-()]+$/, 'Invalid phone number format'),
  company_id: z
    .string()
    .uuid('Please select a company'),
  partner_role: z
    .enum(['interior_designer', 'agent', 'other'], { message: 'Please select what best describes you' }),
  tnc_accepted: z
    .literal(true, { message: 'You must accept the Terms & Conditions' }),
  signup_token: z
    .string()
    .min(20, 'Missing verification token')
    .optional(),
  oauth_provider: z.enum(['google', 'apple']).optional(),
  oauth_subject: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ReferenceLoginInput = z.infer<typeof referenceLoginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
