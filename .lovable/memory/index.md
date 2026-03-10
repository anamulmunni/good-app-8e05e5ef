# GoodDollar Secure Earn App

## Design
- Dark theme with emerald green primary (152 68% 50%)
- Glass-card morphism UI
- Bengali language interface
- Custom CSS classes: glass-card, input-field, btn-primary

## Architecture
- Supabase Auth with phone-based fake email (phone@goodapp.local)
- No Gmail/email in registration or login - phone number only
- No TK/balance shown to users - only verified count
- Direct Supabase client queries in src/lib/api.ts
- Tables: users, settings, verification_pool, submitted_numbers, reset_history, transactions
- Admin password: Anamul-963050, Pool secret: Anamul-984516

## Key Decisions
- Admin panel shows user's key_count from users table, not submitted_numbers.verified_count
- Verified count updates immediately via refreshUser() after submission
- Telegram gets only clean private key, no metadata
- RLS is permissive (USING true)
