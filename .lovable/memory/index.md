# Good App - Secure Earning Platform

## Design
- Dark theme with emerald green primary (152 68% 50%)
- Glass-card morphism UI
- Bengali language interface
- Custom CSS classes: glass-card, input-field, btn-primary

## Architecture
- Guest login (no Supabase Auth, uses localStorage for session)
- Direct Supabase client queries (no edge functions)
- Tables: users, settings, verification_pool, submitted_numbers, reset_history, transactions, user_transfer_requests, user_request_submissions
- Admin password: Anamul-963050, Pool secret: Anamul-984516
- User request submit password: Anamul-341321 (hidden, no hint shown)

## Key Decisions
- RLS is permissive (USING true) because app uses guest login, not Supabase auth
- All data access via client-side Supabase queries in src/lib/api.ts
- User can only have ONE pending request at a time (duplicate prevention)
- When submitting to admin: submitter's bKash number goes to admin, individual payment numbers stay in user history
- Google login: uses lovable managed auth on lovable domains, skipBrowserRedirect on custom domains
- Email verification: auto-confirm enabled (no custom domain yet). When domain is added, switch to OTP code verification.
