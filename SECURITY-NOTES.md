# Security / architecture notes

## Registration

`POST /api/register` validates data, hashes the password with bcrypt, creates the user, generates a server-side email OTP challenge and returns only the `challengeId`.

The OTP itself is printed to the server console under `[SIMULATED EMAIL]`. It is never returned to the frontend.

After email verification, `/api/verify-email-otp` creates the SMS challenge. After SMS verification, the user is marked `mobileVerified=true` and `mfaEnabled=true`.

## OTP security

Each challenge contains:

- challengeId
- userId
- channel
- purpose
- otpHash
- expiresAt
- attempts
- used

The OTP is hashed before storage. It expires after 2 minutes, has a maximum of 3 attempts, and is deleted after successful verification.

## Login

`POST /api/login` verifies bcrypt credentials and checks MFA status. Repeated failed password attempts trigger a 5-minute temporary lockout after 5 failures.

Successful credentials create a login OTP challenge. `/api/verify-login-otp` verifies the OTP and then creates a server-side session.

## Session authentication

The session ID is stored server-side in `sessions`. The browser receives only an HttpOnly cookie:

- HttpOnly
- SameSite=Lax
- Secure in production

`GET /api/me` resolves the session to the user. `POST /api/logout` deletes the server-side session and clears the cookie.

## JWT authentication

`POST /api/token` issues a separate short-lived JWT (10 minutes). The frontend should not put this token in localStorage. `GET /api/protected` requires:

`Authorization: Bearer <JWT>`

The server validates signature, issuer and expiry before allowing access.

## Assignment simulation

Email/SMS delivery is simulated by printing OTPs to the server terminal. A production implementation should replace this with an email/SMS provider and should never expose the OTP in an HTTP response.

## Storage

The demo uses in-memory Maps so it is easy to run. Production should use a persistent database and a distributed session store such as Redis. Secrets should be environment variables.
