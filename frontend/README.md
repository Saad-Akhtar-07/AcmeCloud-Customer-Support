# AcmeCloud Customer Support Portal

React + TypeScript customer portal for the authenticated AcmeCloud support workflow.

## Security model

1. The customer signs in with Supabase email/password authentication.
2. React sends the Supabase access token in the `Authorization: Bearer ...` header.
3. n8n verifies the token against Supabase `/auth/v1/user`.
4. n8n uses the verified Supabase email to find the customer in `public.customers`.
5. The browser never chooses or submits `customer_id`.
6. Conversation memory is isolated with `customer_id:conversation_id`.

The Supabase anon key is intended for browser use. Never use the Supabase service-role key in this frontend or in a Vite environment variable.

## Local configuration

Copy `.env.example` to `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_N8N_SUPPORT_WEBHOOK_URL=http://localhost:5678/webhook/acme/support/chat
```

Find the URL and anon key in Supabase under **Project Settings → API**.

## n8n configuration

The `ACME – Agent – Customer Support` workflow reads these variables from the n8n server:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
```

Add them to the n8n process or Docker Compose environment and restart n8n. The values must match the frontend project.

After configuration:

1. Open the workflow and confirm `Verify Supabase Session` has no expression errors.
2. Test an invalid token and confirm the workflow returns HTTP 401.
3. Publish the workflow so the production webhook URL works.

## Create a test customer login

The login email must already exist in `public.customers`.

In Supabase:

1. Open **Authentication → Users**.
2. Choose **Add user**.
3. Use an existing seeded customer email, such as `aisha.khan@example.com`.
4. Set a test password and mark the email as confirmed.

The portal deliberately has no public sign-up page. Customer accounts are provisioned by an administrator.

For local auth redirects, set the Supabase **Site URL** to:

```text
http://localhost:5173
```

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:5173`.

## Verify

```powershell
npm.cmd run typecheck
npm.cmd run build
```

The production files are generated in `dist/`.
