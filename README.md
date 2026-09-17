# SecureID — IAM Authentication & Registration

Vanilla HTML/CSS/JavaScript frontend + Node.js/Express backend.

## Requirements implemented

### Registration
- POST `/api/register`
- bcrypt password hashing
- server-side email OTP
- challengeId
- email OTP verification
- SMS OTP
- SMS verification
- MFA enabled after successful SMS verification
- registration success screen

### OTP
- backend-generated OTP
- hashed OTP storage
- 2-minute expiry
- 3-attempt maximum
- single-use challenge
- wrong / expired / maximum-attempt screens
- simulated delivery to server console only

### Login
- POST `/api/login`
- password verification
- 5-failure temporary lockout
- MFA-required response
- login email OTP
- OTP verification

### Session
- server-side session
- HttpOnly + SameSite cookie
- Secure cookie in production
- GET `/api/me`
- POST `/api/logout`

### JWT
- POST `/api/token`
- short-lived 10-minute JWT
- GET `/api/protected`
- Bearer token validation
- no localStorage token storage

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

For development:

```bash
npm run dev
```

## Test the OTP

When you register or log in, the browser will show that a code was sent, but **the actual OTP is printed only in the terminal**:

```text
[SIMULATED EMAIL]
To: student@example.com
OTP: 482913
```

For SMS it prints:

```text
[SIMULATED SMS]
To: +919876543210
OTP: 123456
```

This matches the assignment requirement that the OTP not be returned in the API response.

## Vercel note

This Express project can be deployed to a Node-compatible host. For production/Vercel, move users, OTP challenges and sessions from memory to a persistent database/session store. Also configure `JWT_SECRET`, `SESSION_SECRET`, and production cookie settings.
