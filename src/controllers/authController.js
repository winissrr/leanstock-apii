const authService = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');
const { z } = require('zod');

const createError = (status, msg) => { const e = new Error(msg); e.status = status; e.isOperational = true; return e; };

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/, 'Must contain uppercase').regex(/[0-9]/, 'Must contain digit'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  tenantName: z.string().min(1),
});

exports.register = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const result = await authService.register(data);
  res.status(201).json(result);
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (!token) throw createError(400, 'Verification token required');
  const result = await authService.verifyEmail(token);
  res.json(result);
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const result = await authService.login({ email, password });
  res.json(result);
});

exports.refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw createError(400, 'refreshToken required');
  const result = await authService.refreshTokens(refreshToken);
  res.json(result);
});

exports.logout = asyncHandler(async (req, res) => {
  await authService.logout(req.token, req.user.sub);
  res.json({ message: 'Logged out successfully' });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  await authService.forgotPassword(email);
  res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = z.object({
    token: z.string(),
    password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  }).parse(req.body);
  await authService.resetPassword(token, password);
  res.json({ message: 'Password reset successful. You can now log in.' });
});

exports.inviteStaff = asyncHandler(async (req, res) => {
  const { email, role } = z.object({ email: z.string().email(), role: z.enum(['STAFF', 'MANAGER']).default('STAFF') }).parse(req.body);
  const result = await authService.inviteStaff({ email, role, tenantId: req.tenantId, invitedById: req.user.sub });
  res.status(201).json(result);
});

exports.acceptInvite = asyncHandler(async (req, res) => {
  const data = z.object({
    token: z.string(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  }).parse(req.body);
  const result = await authService.acceptInvite(data);
  res.json(result);
});

exports.acceptInviteForm = (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('<h2>Invalid link — token is missing</h2>');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>LeanStock — Accept Invite</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 80px auto; padding: 20px; }
        h2 { color: #1e40af; }
        input { width: 100%; padding: 10px; margin: 8px 0; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #1e40af; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; }
        button:hover { background: #1d4ed8; }
        #msg { margin-top: 12px; color: green; font-weight: bold; }
        #err { margin-top: 12px; color: red; }
      </style>
    </head>
    <body>
      <h2>Welcome to LeanStock!</h2>
      <p>Fill in your details to activate your account:</p>
      <input type="text" id="fn" placeholder="First name" />
      <input type="text" id="ln" placeholder="Last name" />
      <input type="password" id="pw" placeholder="Password (min 8 chars, 1 uppercase, 1 digit)" />
      <input type="password" id="pw2" placeholder="Repeat password" />
      <button onclick="submitForm()">Activate account</button>
      <div id="msg"></div>
      <div id="err"></div>
      <script>
        async function submitForm() {
          const fn = document.getElementById('fn').value.trim();
          const ln = document.getElementById('ln').value.trim();
          const pw = document.getElementById('pw').value;
          const pw2 = document.getElementById('pw2').value;
          if (!fn || !ln) { document.getElementById('err').textContent = 'First name and last name are required'; return; }
          if (pw !== pw2) { document.getElementById('err').textContent = 'Passwords do not match'; return; }
          if (pw.length < 8) { document.getElementById('err').textContent = 'Password is too short'; return; }
          document.getElementById('err').textContent = '';
          const res = await fetch('/auth/accept-invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: '${token}', firstName: fn, lastName: ln, password: pw })
          });
          const data = await res.json();
          if (res.ok) {
            document.getElementById('msg').textContent = 'Account activated! You can now log in.';
            document.querySelector('button').disabled = true;
          } else {
            document.getElementById('err').textContent = data.detail || JSON.stringify(data);
          }
        }
      </script>
    </body>
    </html>
  `);
};