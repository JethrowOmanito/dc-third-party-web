// Normalize a phone number to E.164 for Meta's WhatsApp API and for
// consistent matching between /api/auth/{otp/send, otp/verify, wa-login,
// signup}. Returns null if the input cannot be safely normalized (e.g.
// a bare 10-digit number that could be either SG or India).
//
// Accepted inputs:
//   +65 8888 8888  → +6588888888
//   6588888888     → +6588888888
//   88888888       → +6588888888  (SG mobile shortcut)
//   +91 9955 8321 89 → +919955832189  (any E.164 international)
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+') && /^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  if (/^65\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^[89]\d{7}$/.test(cleaned)) return `+65${cleaned}`;
  return null;
}
