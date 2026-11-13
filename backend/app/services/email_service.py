"""Email Service for Investor Gate OS.

Handles:
- Outbound SMTP delivery over TLS (Port 587) via Gmail SMTP
- Branded Arabic RTL HTML email templates (Investor Gate visual identity)
- Graceful test fallback & delivery tracking when SMTP credentials are not yet configured in .env
- Zero plaintext credential leakage
"""

import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime
from typing import Optional, Dict, Any, List

from app.core.config import settings

logger = logging.getLogger(__name__)

# In-memory delivery tracker for testing and verification
MOCK_EMAIL_OUTBOX: List[Dict[str, Any]] = []


def is_smtp_configured() -> bool:
    """Check if live SMTP credentials are configured in the environment."""
    return bool(settings.SMTP_USER and settings.SMTP_PASSWORD and len(settings.SMTP_PASSWORD) >= 8)


def get_mock_outbox() -> List[Dict[str, Any]]:
    """Retrieve sent messages from the in-memory test outbox."""
    return MOCK_EMAIL_OUTBOX


def clear_mock_outbox() -> None:
    """Clear the test outbox."""
    MOCK_EMAIL_OUTBOX.clear()


def build_password_reset_email_html(recipient_name: str, reset_url: str, expire_minutes: int = 15) -> str:
    """Generate professional Arabic RTL HTML email template."""
    return f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>استعادة كلمة المرور - بوابة المستثمر</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F5F7F8; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; text-align: right; color: #1E293B;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F5F7F8; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #E2E8F0;">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #123D32; padding: 32px 30px; text-align: center; border-bottom: 4px solid #C5A46D;">
              <h1 style="color: #FFFFFF; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: -0.5px;">
                شركة بوابة المستثمر
              </h1>
              <p style="color: #C5A46D; margin: 6px 0 0; font-size: 13px; font-weight: 500;">
                نظام إدارة العمليات والأصول التقنية (Investor Gate OS)
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 35px 30px;">
              <h2 style="color: #0F172A; font-size: 18px; margin: 0 0 16px; font-weight: 700;">
                مرحباً {recipient_name}،
              </h2>
              
              <p style="color: #475569; font-size: 14px; line-height: 1.8; margin: 0 0 20px;">
                تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك على نظام إدارة العمليات التقنية. يمكنك تعيين كلمة مرور جديدة من خلال الضغط على الزر أدناه:
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="{reset_url}" target="_blank" style="background-color: #187A5A; color: #FFFFFF; display: inline-block; padding: 14px 36px; font-size: 15px; font-weight: bold; text-decoration: none; border-radius: 10px; box-shadow: 0 3px 12px rgba(24, 122, 90, 0.35);">
                  إعادة تعيين كلمة المرور
                </a>
              </div>

              <!-- Security Notice -->
              <div style="background-color: #FEF9C3; border-right: 4px solid #CA8A04; padding: 14px 18px; border-radius: 8px; margin: 25px 0;">
                <p style="margin: 0; font-size: 13px; color: #854D0E; line-height: 1.6;">
                  ⚠️ <strong>تنبيه أمني:</strong> هذا الرابط صالح للاستخدام <strong>لمرة واحدة فقط</strong> وينتهي مفعوله تلقائياً بعد <strong>{expire_minutes} دقيقة</strong>.
                </p>
              </div>

              <p style="color: #64748B; font-size: 13px; line-height: 1.7; margin: 20px 0 0;">
                إذا لم تكن قد طلبت استعادة كلمة المرور، فيمكنك تجاهل هذه الرسالة بأمان؛ وستظل كلمة المرور الحالية صالحة ومحمية دون تغيير.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAFC; padding: 20px 30px; text-align: center; border-top: 1px solid #E2E8F0;">
              <p style="color: #94A3B8; font-size: 12px; margin: 0; line-height: 1.5;">
                هذه الرسالة آلية من نظام Investor Gate OS الداخلي. يُرجى عدم الرد عليها مباشرة.<br>
                جميع الحقوق محفوظة &copy; {datetime.utcnow().year} شركة بوابة المستثمر.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_password_reset_email(
    to_email: str,
    recipient_name: str,
    raw_token: str,
    expire_minutes: int = 15,
) -> bool:
    """Send password reset email to the recipient.
    If SMTP credentials are not configured in environment, safely records into MOCK_EMAIL_OUTBOX.
    """
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
    subject = "استعادة كلمة المرور - نظام إدارة العمليات (Investor Gate OS)"
    sender_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER or "noreply@investorgate.sa"
    sender_name = settings.SMTP_FROM_NAME or "Investor Gate OS"

    html_content = build_password_reset_email_html(
        recipient_name=recipient_name,
        reset_url=reset_url,
        expire_minutes=expire_minutes,
    )

    text_content = (
        f"مرحباً {recipient_name}،\n\n"
        f"تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك.\n"
        f"يرجى فتح الرابط التالي لإعادة التعيين (صالح لمدة {expire_minutes} دقيقة):\n"
        f"{reset_url}\n\n"
        f"إذا لم تكن صاحب هذا الطلب، فيمكنك تجاهل هذه الرسالة بأمان.\n"
        f"شركة بوابة المستثمر"
    )

    # If live SMTP credentials are not configured, log and record in mock outbox
    if not is_smtp_configured():
        logger.info(
            f"SMTP not configured in environment. Password reset email queued to mock outbox for {to_email}"
        )
        MOCK_EMAIL_OUTBOX.append({
            "to_email": to_email,
            "recipient_name": recipient_name,
            "subject": subject,
            "reset_url": reset_url,
            "raw_token": raw_token,
            "sent_at": datetime.utcnow(),
            "mode": "mock",
        })
        return True

    # Live delivery via Gmail SMTP (TLS Port 587)
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{sender_name} <{sender_email}>"
        msg["To"] = to_email

        part1 = MIMEText(text_content, "plain", "utf-8")
        part2 = MIMEText(html_content, "html", "utf-8")
        msg.attach(part1)
        msg.attach(part2)

        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(sender_email, [to_email], msg.as_string())
        server.quit()

        logger.info(f"Password reset email sent successfully via Gmail SMTP to {to_email}")
        MOCK_EMAIL_OUTBOX.append({
            "to_email": to_email,
            "recipient_name": recipient_name,
            "subject": subject,
            "reset_url": reset_url,
            "sent_at": datetime.utcnow(),
            "mode": "smtp_live",
        })
        return True
    except Exception as e:
        logger.error(f"Failed to deliver email via SMTP to {to_email}: {str(e)}")
        # Record attempt with error
        MOCK_EMAIL_OUTBOX.append({
            "to_email": to_email,
            "recipient_name": recipient_name,
            "subject": subject,
            "error": str(e),
            "sent_at": datetime.utcnow(),
            "mode": "smtp_failed",
        })
        return False
