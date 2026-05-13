const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

async function sendMail({ to, subject, html }) {
  await transporter.sendMail({ from: env.EMAIL_FROM, to, subject, html });
}

async function sendVerificationEmail(email, token) {
  const url = `${env.APP_URL}/auth/verify-email?token=${token}`;
  await sendMail({
    to: email,
    subject: '✅ Verify your LeanStock account',
    html: `
      <h2>Welcome to LeanStock!</h2>
      <p>Click the link below to verify your email address. This link expires in 24 hours.</p>
      <a href="${url}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
        Verify Email
      </a>
      <p>Or copy this link: <code>${url}</code></p>
    `,
  });
}

async function sendPasswordResetEmail(email, token) {
  const url = `${env.APP_URL}/auth/reset-password?token=${token}`;
  await sendMail({
    to: email,
    subject: '🔑 Reset your LeanStock password',
    html: `
      <h2>Password Reset Request</h2>
      <p>We received a request to reset your password. Click below — this link expires in 1 hour.</p>
      <a href="${url}" style="background:#DC2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
        Reset Password
      </a>
      <p>If you didn't request this, ignore this email. Your password will not change.</p>
    `,
  });
}

async function sendLowStockAlertEmail(managerEmail, productName, sku, quantity, threshold, locationName) {
  await sendMail({
    to: managerEmail,
    subject: `⚠️ Low Stock Alert: ${productName} (${sku})`,
    html: `
      <h2>Low Stock Alert</h2>
      <p>The following product has dropped below its reorder threshold:</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Product</strong></td><td style="padding:8px;border:1px solid #ddd">${productName}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>SKU</strong></td><td style="padding:8px;border:1px solid #ddd">${sku}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Location</strong></td><td style="padding:8px;border:1px solid #ddd">${locationName}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Current Qty</strong></td><td style="padding:8px;border:1px solid #ddd;color:#DC2626">${quantity}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd"><strong>Reorder Threshold</strong></td><td style="padding:8px;border:1px solid #ddd">${threshold}</td></tr>
      </table>
      <p>Please arrange restocking immediately.</p>
    `,
  });
}

async function sendStaffInviteEmail(email, token, inviterName) {
  const url = `${env.APP_URL}/auth/accept-invite?token=${token}`;
  await sendMail({
    to: email,
    subject: '📦 You have been invited to LeanStock',
    html: `
      <h2>You're Invited!</h2>
      <p>${inviterName} has invited you to join their team on LeanStock.</p>
      <p>Click the link below to set your password and activate your account. This link expires in 24 hours.</p>
      <a href="${url}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
        Accept Invitation
      </a>
    `,
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendLowStockAlertEmail,
  sendStaffInviteEmail,
};
