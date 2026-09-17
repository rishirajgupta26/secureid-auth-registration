const app = document.getElementById("app");
let state = {
  screen: "login",
  challengeId: null,
  email: "",
  mobile: "",
  otp: "",
  timer: 120,
  timerId: null,
  error: "",
  message: "",
  showPassword: false
};


function shieldLockIcon(className = "shield-icon") {
  return `<svg class="${className}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path d="M24 4 39 10v12c0 10-6.5 17.5-15 22C15.5 39.5 9 32 9 22V10L24 4Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
    <rect x="17" y="21" width="14" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.7"/>
    <path d="M20 21v-4a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"/>
    <circle cx="24" cy="27" r="1.5" fill="currentColor"/>
  </svg>`;
}

function mailIcon() {
  return `<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

function strength(password) {
  if (!password) return { label: "", score: 0 };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return { label: "Weak", score };
  if (score <= 4) return { label: "Medium", score };
  return { label: "Strong", score };
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, x => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[x]));
}

function alerts() {
  return `${state.error ? `<div class="alert error">${esc(state.error)}</div>` : ""}${state.message ? `<div class="alert">${esc(state.message)}</div>` : ""}`;
}

function setTimer(seconds=120) {
  clearInterval(state.timerId);
  state.timer = seconds;
  state.timerId = setInterval(() => {
    state.timer--;
    const el = document.getElementById("timer");
    if (el) el.textContent = `${Math.floor(state.timer/60).toString().padStart(2,"0")}:${(state.timer%60).toString().padStart(2,"0")}`;
    if (state.timer <= 0) {
      clearInterval(state.timerId);
      const resend = document.getElementById("resend");
      if (resend) resend.disabled = false;
    }
  }, 1000);
}

function otpBoxes() {
  return `<div class="otp">${[0,1,2,3,4,5].map(i => `<input maxlength="1" inputmode="numeric" data-otp="${i}" aria-label="OTP digit ${i}">`).join("")}</div>`;
}

function readOtp() {
  return [...document.querySelectorAll("[data-otp]")].map(x => x.value).join("");
}

function bindOtp() {
  document.querySelectorAll("[data-otp]").forEach((input, i, all) => {
    input.addEventListener("input", e => {
      e.target.value = e.target.value.replace(/\D/g,"").slice(-1);
      if (e.target.value && all[i+1]) all[i+1].focus();
      state.otp = readOtp();
    });
    input.addEventListener("keydown", e => {
      if (e.key === "Backspace" && !e.target.value && all[i-1]) all[i-1].focus();
    });
  });
}

async function api(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed.");
    err.data = data;
    throw err;
  }
  return data;
}

function renderLogin() {
  app.innerHTML = `
    <div class="icon">${shieldLockIcon()}</div>
    <h2>Welcome back!</h2>
    <p class="subtitle">Login to your account</p>
    <label>Email or Username</label>
    <input id="email" type="email" placeholder="rishi.sharma@email.com">
    <label>Password</label>
    <div class="password"><input id="password" type="${state.showPassword ? "text":"password"}" placeholder="••••••••"><button class="show" id="show">${state.showPassword ? "Hide":"Show"}</button></div>
    <div class="row">
      <label class="check"><input id="remember" type="checkbox"> Remember me</label>
      <button class="link" id="forgot">Forgot password?</button>
    </div>
    ${alerts()}
    <button class="primary" id="login">Login</button>
    <div class="or">or</div>
    <button class="secondary"><span class="google-g">G</span> Continue with Google</button>
    <p class="switch">New here? <button class="link" id="register">Create an account</button></p>
  `;
  document.getElementById("show").onclick = () => { state.showPassword = !state.showPassword; renderLogin(); };
  document.getElementById("register").onclick = () => { state.screen="register"; state.error=""; state.message=""; render(); };
  document.getElementById("forgot").onclick = () => { state.message="Password reset can use the same secure OTP challenge pattern."; renderLogin(); };
  document.getElementById("login").onclick = login;
}

function renderRegister() {
  app.innerHTML = `
    <div class="icon">${shieldLockIcon()}</div>
    <h2>Create your account</h2>
    <p class="subtitle">Let's get you started</p>
    <label>Full Name</label><input id="name" type="text" placeholder="Rishi Sharma">
    <label>Email</label><input id="email" type="email" placeholder="rishi.sharma@email.com">
    <label>Mobile Number</label><input id="mobile" type="tel" placeholder="+91 98765 43210">
    <label>Password</label>
    <div class="password"><input id="password" type="${state.showPassword ? "text":"password"}" placeholder="••••••••"><button class="show" id="show">${state.showPassword ? "Hide":"Show"}</button></div>
    <div id="strength"></div>
    <label class="check"><input id="terms" type="checkbox"> I agree to the Terms & Conditions and Privacy Policy</label>
    ${alerts()}
    <button class="primary" id="create">Create Account</button>
    <p class="switch">Already have an account? <button class="link" id="loginLink">Login</button></p>
  `;
  const pass = document.getElementById("password");
  const update = () => {
    const s = strength(pass.value);
    document.getElementById("strength").innerHTML = s.label ? `<div class="strength ${s.label.toLowerCase()}"><div class="strength-head"><span>Password strength</span><b>${s.label}</b></div><div class="bars">${[1,2,3].map(n=>`<i class="${s.score >= n+1 ? "on":""}"></i>`).join("")}</div><small>Use 8+ characters with upper/lowercase, a number and a special character.</small></div>` : "";
  };
  pass.addEventListener("input", update);
  document.getElementById("show").onclick = () => { state.showPassword=!state.showPassword; renderRegister(); };
  document.getElementById("loginLink").onclick = () => { state.screen="login"; state.error=""; state.message=""; render(); };
  document.getElementById("create").onclick = register;
}

async function register() {
  state.error=""; state.message="";
  const payload = {
    fullName: document.getElementById("name").value,
    email: document.getElementById("email").value,
    mobile: document.getElementById("mobile").value,
    password: document.getElementById("password").value
  };
  if (!document.getElementById("terms").checked) {
    state.error="Please accept the Terms & Conditions and Privacy Policy.";
    renderRegister(); return;
  }
  const s = strength(payload.password);
  if (s.label !== "Strong") {
    state.error="Registration is blocked until the password reaches Strong.";
    renderRegister(); return;
  }
  try {
    const data = await api("/api/register", payload);
    state.email=payload.email; state.mobile=payload.mobile; state.challengeId=data.challengeId;
    state.screen="emailOtp"; state.message="Verification code sent to your email.";
    setTimer(); render();
  } catch(e) { state.error=e.message; renderRegister(); }
}

function renderOtp(kind) {
  const email = kind === "email";
  const title = email ? "Email Verification" : "Verify your mobile";
  const target = email ? state.email : state.mobile;
  app.innerHTML = `
    <div class="icon ${state.screen.includes("Expired")||state.screen.includes("Max")?"danger":""}">${email?mailIcon():"<span class=\"phone-glyph\">⌕</span>"}</div>
    <h2>${title}</h2>
    <p class="subtitle">Enter the 6-digit code sent to<br><b>${esc(target)}</b></p>
    ${otpBoxes()}
    ${alerts()}
    <p class="timer">Code expires in <b id="timer">${Math.floor(state.timer/60).toString().padStart(2,"0")}:${(state.timer%60).toString().padStart(2,"0")}</b></p>
    <button class="link" id="resend" disabled>Resend code</button>
    <button class="primary" id="verify">Verify Code</button>
    <button class="back" id="back">← Back</button>
  `;
  bindOtp();
  document.getElementById("verify").onclick = email ? verifyEmail : verifySms;
  document.getElementById("resend").onclick = resend;
  document.getElementById("back").onclick = () => { state.screen = email ? "register":"emailOtp"; render(); };
}

async function verifyEmail() {
  state.error=""; state.message="";
  try {
    const data = await api("/api/verify-email-otp", {challengeId:state.challengeId, otp:readOtp()});
    state.challengeId=data.challengeId; state.screen="smsOtp"; state.message=data.message; state.otp="";
    setTimer(); render();
  } catch(e) {
    state.error=e.message;
    if (e.data?.code === "OTP_EXPIRED") state.screen="emailExpired";
    else if (e.data?.code === "OTP_MAX_ATTEMPTS") state.screen="emailMax";
    render();
  }
}

async function verifySms() {
  state.error=""; state.message="";
  try {
    const data = await api("/api/verify-sms-otp", {challengeId:state.challengeId, otp:readOtp()});
    state.screen="success"; state.user=data.user; clearInterval(state.timerId); render();
  } catch(e) {
    state.error=e.message;
    if (e.data?.code === "OTP_EXPIRED") state.screen="smsExpired";
    else if (e.data?.code === "OTP_MAX_ATTEMPTS") state.screen="smsMax";
    render();
  }
}

async function resend() {
  try {
    const endpoint = state.screen === "emailOtp" ? "/api/send-email-otp" : "/api/send-sms-otp";
    const data = await api(endpoint, {challengeId:state.challengeId});
    state.challengeId=data.challengeId; state.error=""; state.message="A new OTP was sent.";
    setTimer(); render();
  } catch(e) { state.error=e.message; render(); }
}

function renderExpired(kind, max=false) {
  const label = kind === "email" ? "Email Verification" : "Verify your mobile";
  app.innerHTML = `<div class="icon danger">${mailIcon()}</div><h2>${max?"Maximum attempts reached":"Code expired"}</h2><p class="subtitle">${max?"Too many incorrect attempts. Please request a new code.":"This verification code has expired."}</p>${alerts()}<button class="primary" id="resend">Resend New Code</button><button class="back" id="back">← Back</button>`;
  document.getElementById("resend").onclick = resend;
  document.getElementById("back").onclick = () => { state.screen = kind==="email"?"register":"smsOtp"; render(); };
}

function renderSuccess() {
  app.innerHTML = `<div class="icon success">✓</div><h2>Account created!</h2><p class="subtitle">Your account has been created successfully and MFA is enabled.</p><div class="success-list">✓ Email verified<br>✓ Mobile verified<br>✓ MFA enabled</div><button class="primary" id="goLogin">Continue to Login</button>`;
  document.getElementById("goLogin").onclick=()=>{state.screen="login";state.message="Registration successful. Please login.";render();};
}

async function login() {
  state.error=""; state.message="";
  const email=document.getElementById("email").value;
  const password=document.getElementById("password").value;
  try {
    const data=await api("/api/login",{email,password});
    state.email=email; state.challengeId=data.challengeId; state.screen="loginOtp"; state.timer=120; render(); setTimer();
  } catch(e) { state.error=e.message; renderLogin(); }
}

function renderLoginOtp() {
  app.innerHTML = `<div class="icon">${mailIcon()}</div><h2>Email Verification</h2><p class="subtitle">Credentials are valid. Enter the MFA code sent to<br><b>${esc(state.email)}</b></p>${otpBoxes()}${alerts()}<p class="timer">Code expires in <b id="timer">02:00</b></p><button class="primary" id="verify">Verify & Login</button><button class="back" id="back">← Back</button>`;
  bindOtp();
  document.getElementById("verify").onclick=verifyLogin;
  document.getElementById("back").onclick=()=>{state.screen="login";render();};
}

async function verifyLogin() {
  try {
    const data=await api("/api/verify-login-otp",{challengeId:state.challengeId,otp:readOtp()});
    state.user=data.user; state.screen="dashboard"; clearInterval(state.timerId); render();
  } catch(e) { state.error=e.message; renderLoginOtp(); }
}

function renderDashboard() {
  app.innerHTML=`<div class="icon success">✓</div><h2>Authenticated</h2><p class="subtitle">Session-based authentication is active.</p><div class="success-list"><b>${esc(state.user.fullName)}</b><br>${esc(state.user.email)}<br><br>✓ Server-side session<br>✓ HttpOnly cookie<br>✓ SameSite cookie<br>✓ MFA verified</div><button class="primary" id="logout">Logout</button>`;
  document.getElementById("logout").onclick=async()=>{await fetch("/api/logout",{method:"POST"});state.screen="login";state.message="Logged out successfully.";render();};
}

function render() {
  if(state.screen==="login") renderLogin();
  else if(state.screen==="register") renderRegister();
  else if(state.screen==="emailOtp") renderOtp("email");
  else if(state.screen==="smsOtp") renderOtp("sms");
  else if(state.screen==="emailExpired") renderExpired("email",false);
  else if(state.screen==="emailMax") renderExpired("email",true);
  else if(state.screen==="smsExpired") renderExpired("sms",false);
  else if(state.screen==="smsMax") renderExpired("sms",true);
  else if(state.screen==="success") renderSuccess();
  else if(state.screen==="loginOtp") renderLoginOtp();
  else if(state.screen==="dashboard") renderDashboard();
}

fetch("/api/me").then(r=>r.ok?r.json():null).then(data=>{
  if(data?.authenticated){state.user=data.user;state.screen="dashboard";}
  render();
}).catch(render);
