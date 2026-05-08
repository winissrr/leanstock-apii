const nodemailer = require('nodemailer');
const env = require('../config/env');
let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  if (env.NODE_ENV === 'test') {
    return { messageId: 'test-mode-skipped' };
  }
  const info = await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });
  return info;
}

async function sendVerificationEmail({ to, firstName, token }) {
  const verifyUrl = `${env.APP_URL}/auth/verify-email?token=${token}`;
  const subject = 'Verify your LeanStock account';
  const html = `
    <h2>Welcome to LeanStock, ${firstName}!</h2>
    <p>Please verify your email address by clicking the link below:</p>
    <p><a href="${verifyUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none">Verify Email</a></p>
    <p>This link expires in 24 hours.</p>
    <p>If you did not create an account, you can ignore this email.</p>
  `;
  return sendMail({ to, subject, html, text: `Verify your account: ${verifyUrl}` });
}

async function sendPasswordResetEmail({ to, firstName, token }) {
  const resetUrl = `${env.APP_URL}/auth/reset-password?token=${token}`;
  const subject = 'Reset your LeanStock password';
  const html = `
    <h2>Password Reset Request</h2>
    <p>Hi ${firstName},</p>
    <p>Click the link below to reset your password. This link is valid for 1 hour.</p>
    <p><a href="${resetUrl}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none">Reset Password</a></p>
    <p>If you did not request a password reset, please ignore this email.</p>
  `;
  return sendMail({ to, subject, html, text: `Reset your password: ${resetUrl}` });
}

async function sendLowStockAlert({ to, productName, sku, locationName, currentQty, threshold }) {
  const subject = `[LeanStock Alert] Low stock: ${productName} (${sku})`;
  const html = `
    <h2>Low Stock Alert</h2>
    <p>The following product has fallen below its reorder threshold:</p>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Product</strong></td><td style="padding:8px;border:1px solid #ddd">${productName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>SKU</strong></td><td style="padding:8px;border:1px solid #ddd">${sku}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Location</strong></td><td style="padding:8px;border:1px solid #ddd">${locationName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Current Quantity</strong></td><td style="padding:8px;border:1px solid #ddd">${currentQty}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Reorder Threshold</strong></td><td style="padding:8px;border:1px solid #ddd">${threshold}</td></tr>
    </table>
    <p>Please reorder this product as soon as possible.</p>
  `;
  return sendMail({
    to,
    subject,
    html,
    text: `Low stock alert: ${productName} (${sku}) at ${locationName} — only ${currentQty} left (threshold: ${threshold}).`,
  });
}

async function sendStockReceivedEmail({ to, productName, sku, locationName, quantity, supplierRef }) {
  const subject = `[LeanStock] Stock received: ${productName} (${sku})`;
  const html = `
    <h2>📦 Stock Received</h2>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Product</strong></td><td style="padding:8px;border:1px solid #ddd">${productName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>SKU</strong></td><td style="padding:8px;border:1px solid #ddd">${sku}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Location</strong></td><td style="padding:8px;border:1px solid #ddd">${locationName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Quantity Added</strong></td><td style="padding:8px;border:1px solid #ddd">${quantity}</td></tr>
      ${supplierRef ? `<tr><td style="padding:8px;border:1px solid #ddd"><strong>Supplier Ref</strong></td><td style="padding:8px;border:1px solid #ddd">${supplierRef}</td></tr>` : ''}
    </table>
  `;
  return sendMail({
    to,
    subject,
    html,
    text: `Stock received: ${quantity}x ${productName} (${sku}) at ${locationName}.`,
  });
}

async function sendDecayNotificationEmail({ to, productName, sku, oldPrice, newPrice, decayPercent }) {
  const subject = `[LeanStock] Price decay applied: ${productName} (${sku})`;
  const html = `
    <h2>Dead Stock Price Decay</h2>
    <p>The daily decay job has reduced the price for a dead-stock item:</p>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Product</strong></td><td style="padding:8px;border:1px solid #ddd">${productName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>SKU</strong></td><td style="padding:8px;border:1px solid #ddd">${sku}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Price Before</strong></td><td style="padding:8px;border:1px solid #ddd">$${oldPrice}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Price After</strong></td><td style="padding:8px;border:1px solid #ddd">$${newPrice}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Decay Rate</strong></td><td style="padding:8px;border:1px solid #ddd">${decayPercent}%</td></tr>
    </table>
  `;
  return sendMail({
    to,
    subject,
    html,
    text: `Price decay applied to ${productName}: ${oldPrice} → ${newPrice} (-${decayPercent}%).`,
  });
}

module.exports = {
  sendMail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendLowStockAlert,
  sendStockReceivedEmail,
  sendDecayNotificationEmail,
};
