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

// Base object schema (no superRefine). Used as the react-hook-form
// resolver on the /signup client — the new-company fields (name, uen,
// etc.) live in local useState there rather than registered form
// fields, so the superRefine would always fire "Company name is
// required" client-side and block onSubmit from ever running.
//
// The full strict schema below (signupSchema) reapplies superRefine
// so the server still enforces every rule when the POST hits
// /api/auth/signup.
const signupObjectSchema = z
  .object({
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
    // Either link to an existing company via company_id (legacy /
    // Zoe-seeded flow) OR provide the new-company fields for self-serve
    // boss signup. Enforced by the .superRefine() below.
    //
    // Accepts empty string too because the react-hook-form default is
    // `''` (from the wizard's dropdown-flow leftover), and `''` isn't
    // a valid UUID — without this or() the schema rejects every
    // self-signup with "Invalid company id" before onSubmit even fires.
    company_id: z
      .string()
      .uuid('Invalid company id')
      .or(z.literal(''))
      .optional(),
    company_name: z.string().min(2).max(160).optional(),
    company_uen: z.string().min(6).max(32).optional(),
    company_address: z.string().min(4).max(400).optional(),
    hdb_drc_license: z.string().min(3).max(64).optional(),
    accounts_name: z.string().min(2).max(160).optional(),
    accounts_email: z.string().email('Accounts email must be valid').optional(),
    accounts_phone: z.string().min(6).max(32).optional(),
    partner_role: z
      .enum(['interior_designer', 'agent', 'other', 'admin'], {
        message: 'Please select what best describes you',
      })
      .optional(),
    tnc_accepted: z
      .literal(true, { message: 'You must accept the Terms & Conditions' }),
    signup_token: z
      .string()
      .min(20, 'Missing verification token')
      .optional(),
    oauth_provider: z.enum(['google', 'apple']).optional(),
    oauth_subject: z.string().optional(),
  });

// Client-side resolver: validates ONLY the fields the wizard has
// registered with react-hook-form (account step + T&C). The step-1
// company fields + step-2 document uploads are gated by the wizard's
// own goNext() / onSubmit() guards using local state.
export const signupClientSchema = signupObjectSchema;

// Server-side strict schema: the same object + full self-signup
// enforcement. /api/auth/signup uses this to validate the POST body.
export const signupSchema = signupObjectSchema
  .superRefine((v, ctx) => {
    if (v.company_id) return; // legacy flow — nothing else required
    // Self-signup — all new-company fields required for every role.
    const required: [keyof typeof v, string][] = [
      ['company_name', 'Company name is required'],
      ['company_uen', 'UEN is required'],
      ['company_address', 'Registered address is required'],
      ['accounts_name', 'Accounts contact name is required'],
      ['accounts_email', 'Accounts email is required'],
      ['accounts_phone', 'Accounts phone is required'],
    ];
    for (const [key, msg] of required) {
      if (!v[key]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [String(key)], message: msg });
      }
    }
    // HDB DRC License is no longer collected at signup (removed 2026-09-30
    // per product decision — too much friction at the top of funnel).
    // Interior Designers can supply it later via Onboarding → Company Details
    // when uploading their ACRA + UEN. Backend column stays nullable so
    // legacy admin-invited flows and the onboarding route can still write it.
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ReferenceLoginInput = z.infer<typeof referenceLoginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
