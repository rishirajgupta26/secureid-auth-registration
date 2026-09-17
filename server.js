const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret-change-me";

app.use(express.json());
app.use(cookieParser(SESSION_SECRET));
app.use(express.static(path.join(__dirname, "public")));

const users = new Map();
const challenges = new Map();
const sessions = new Map();
const loginFailures = new Map();

const OTP_TTL_MS = 2 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 3;
const MAX_LOGIN_FAILURES = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const JWT_TTL = "10m";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(`${otp}:${SESSION_SECRET}`).digest("hex");
}

function publicUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    mobile: user.mobile,
    emailVerified: user.emailVerified,
    mobileVerified: user.mobileVerified,
    mfaEnabled: user.mfaEnabled,
    createdAt: user.createdAt
  };
}

function createChallenge(userId, channel, purpose) {
  const challengeId = crypto.randomUUID();
  const otp = generateOtp();

  challenges.set(challengeId, {
    challengeId,
    userId,
    channel,
    purpose,
    otpHash: hashOtp(otp),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    used: false
  });

  const user = users.get(userId);
  console.log(`\n[SIMULATED ${channel.toUpperCase()}]`);
  console.log(`To: ${channel === "email" ? user.email : user.mobile}`);
  console.log(`OTP: ${otp}`);
  console.log(`Challenge: ${challengeId}\n`);

  // OTP is intentionally NOT returned to the browser.
  return challengeId;
}

function getChallenge(challengeId, purpose, channel) {
  const challenge = challenges.get(challengeId);
  if (!challenge) throw new Error("Invalid verification challenge.");
  if (challenge.used) throw new Error("This OTP has already been used.");
  if (challenge.purpose !== purpose || challenge.channel !== channel) {
    throw new Error("Invalid verification challenge.");
  }
  if (Date.now() > challenge.expiresAt) {
    challenges.delete(challengeId);
    const error = new Error("OTP expired. Please request a new code.");
    error.code = "OTP_EXPIRED";
    throw error;
  }
  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    challenges.delete(challengeId);
    const error = new Error("Maximum OTP attempts reached. Please request a new code.");
    error.code = "OTP_MAX_ATTEMPTS";
    throw error;
  }
  return challenge;
}

function verifyChallenge(challengeId, otp, purpose, channel) {
  const challenge = getChallenge(challengeId, purpose, channel);
  challenge.attempts += 1;

  if (hashOtp(String(otp || "")) !== challenge.otpHash) {
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
      challenges.delete(challengeId);
      const error = new Error("Maximum OTP attempts reached. Please request a new code.");
      error.code = "OTP_MAX_ATTEMPTS";
      throw error;
    }
    const error = new Error(`Incorrect OTP. ${MAX_OTP_ATTEMPTS - challenge.attempts} attempt(s) remaining.`);
    error.code = "OTP_WRONG";
    throw error;
  }

  challenge.used = true;
  challenges.delete(challengeId);
  return challenge;
}

function createSession(userId) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  sessions.set(sessionId, {
    sessionId,
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return sessionId;
}

function setSessionCookie(res, sessionId) {
  res.cookie("secureid_session", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
    path: "/"
  });
}

function getSessionUser(req) {
  const sessionId = req.cookies.secureid_session;
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session || Date.now() > session.expiresAt) {
    if (session) sessions.delete(sessionId);
    return null;
  }
  return users.get(session.userId) || null;
}

function requireSession(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required." });
  req.user = user;
  next();
}

function validateRegistration(body) {
  const fullName = String(body.fullName || "").trim();
  const email = normalizeEmail(body.email);
  const mobile = String(body.mobile || "").trim();
  const password = String(body.password || "");

  if (!fullName || !email || !mobile || !password) {
    throw new Error("Full name, email, mobile and password are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (!/^\+?[0-9\s-]{10,16}$/.test(mobile)) {
    throw new Error("Enter a valid mobile number.");
  }
  if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Password must be at least 8 characters and include uppercase, lowercase, number and special character.");
  }
  return { fullName, email, mobile, password };
}

// Registration
app.post("/api/register", async (req, res) => {
  try {
    const data = validateRegistration(req.body);
    if (users.has(data.email)) return res.status(409).json({ error: "An account with this email already exists." });

    const user = {
      id: crypto.randomUUID(),
      fullName: data.fullName,
      email: data.email,
      mobile: data.mobile,
      passwordHash: await bcrypt.hash(data.password, 12),
      emailVerified: false,
      mobileVerified: false,
      mfaEnabled: false,
      createdAt: new Date().toISOString()
    };

    users.set(user.id, user);
    const challengeId = createChallenge(user.id, "email", "registration-email");

    res.status(201).json({
      message: "Registration started. Verify your email.",
      next: "email-otp",
      challengeId
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/send-email-otp", (req, res) => {
  try {
    const { challengeId } = req.body;
    const old = challengeId ? challenges.get(challengeId) : null;
    if (!old) return res.status(400).json({ error: "A valid registration challenge is required." });
    const newChallengeId = createChallenge(old.userId, "email", old.purpose);
    res.json({ message: "Email OTP sent.", challengeId: newChallengeId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/verify-email-otp", (req, res) => {
  try {
    const challenge = verifyChallenge(req.body.challengeId, req.body.otp, "registration-email", "email");
    const user = users.get(challenge.userId);
    user.emailVerified = true;
    const smsChallengeId = createChallenge(user.id, "sms", "registration-sms");
    res.json({
      message: "Email verified. SMS OTP sent.",
      next: "sms-otp",
      challengeId: smsChallengeId
    });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code || "OTP_ERROR" });
  }
});

app.post("/api/send-sms-otp", (req, res) => {
  try {
    const { challengeId } = req.body;
    const old = challengeId ? challenges.get(challengeId) : null;
    if (!old) return res.status(400).json({ error: "A valid SMS challenge is required." });
    const newChallengeId = createChallenge(old.userId, "sms", "registration-sms");
    res.json({ message: "SMS OTP sent.", challengeId: newChallengeId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/verify-sms-otp", (req, res) => {
  try {
    const challenge = verifyChallenge(req.body.challengeId, req.body.otp, "registration-sms", "sms");
    const user = users.get(challenge.userId);
    user.mobileVerified = true;
    user.mfaEnabled = true;
    res.json({
      message: "Mobile verified. MFA enabled. Registration complete.",
      next: "success",
      user: publicUser(user)
    });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code || "OTP_ERROR" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const failure = loginFailures.get(email);

  if (failure && failure.lockedUntil > Date.now()) {
    return res.status(429).json({
      error: "Account temporarily locked due to repeated failed login attempts.",
      lockedUntil: failure.lockedUntil
    });
  }

  const user = users.get([...users.values()].find(u => u.email === email)?.id || "");
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    const next = failure && failure.lockedUntil <= Date.now() ? { count: 0, lockedUntil: 0 } : (failure || { count: 0, lockedUntil: 0 });
    next.count += 1;
    if (next.count >= MAX_LOGIN_FAILURES) next.lockedUntil = Date.now() + LOCKOUT_MS;
    loginFailures.set(email, next);

    return res.status(401).json({
      error: next.lockedUntil ? "Too many failed attempts. Account temporarily locked." : "Invalid email or password.",
      attemptsRemaining: next.lockedUntil ? 0 : MAX_LOGIN_FAILURES - next.count
    });
  }

  loginFailures.delete(email);

  if (!user.emailVerified || !user.mobileVerified || !user.mfaEnabled) {
    return res.status(403).json({
      error: "Complete registration verification before logging in.",
      mfaRequired: true
    });
  }

  const challengeId = createChallenge(user.id, "email", "login");
  res.json({
    message: "Credentials valid. MFA verification required.",
    mfaRequired: true,
    method: "email",
    challengeId
  });
});

app.post("/api/verify-login-otp", (req, res) => {
  try {
    const challenge = verifyChallenge(req.body.challengeId, req.body.otp, "login", "email");
    const user = users.get(challenge.userId);
    const sessionId = createSession(user.id);
    setSessionCookie(res, sessionId);

    res.json({
      message: "Login successful.",
      authenticated: true,
      user: publicUser(user)
    });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code || "OTP_ERROR" });
  }
});

// Session APIs
app.get("/api/me", requireSession, (req, res) => {
  res.json({ authenticated: true, user: publicUser(req.user) });
});

app.post("/api/logout", (req, res) => {
  const sessionId = req.cookies.secureid_session;
  if (sessionId) sessions.delete(sessionId);
  res.clearCookie("secureid_session", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.json({ message: "Logged out." });
});

// Separate short-lived JWT flow
app.post("/api/token", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const user = [...users.values()].find(u => u.email === email);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid credentials." });
  }
  if (!user.mfaEnabled) return res.status(403).json({ error: "MFA must be enabled before issuing an API token." });

  const token = jwt.sign(
    { sub: user.id, email: user.email, scope: "protected:read" },
    JWT_SECRET,
    { expiresIn: JWT_TTL, issuer: "secureid" }
  );

  res.json({ tokenType: "Bearer", expiresIn: JWT_TTL, accessToken: token });
});

function requireJwt(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return res.status(401).json({ error: "Bearer token required." });

  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: "secureid" });
    const user = users.get([...users.keys()].find(id => id === payload.sub));
    if (!user) return res.status(401).json({ error: "User no longer exists." });
    req.jwtUser = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired JWT." });
  }
}

app.get("/api/protected", requireJwt, (req, res) => {
  res.json({
    message: "JWT validated successfully. Protected API access granted.",
    user: publicUser(req.jwtUser)
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`SecureID running on http://localhost:${PORT}`);
  console.log("OTP delivery is simulated; OTPs are printed ONLY in this server terminal.");
});
