"""Seed comprehensive digital assets: Social Media Accounts, Corporate Domains,
Enterprise Emails, Cloud Services, with standard recovery emails, recovery phone numbers,
2FA Authenticator TOTP secret keys, and backup recovery codes.
"""

import sys
import os
import uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal, init_db
from app.models.company import Company, Branch
from app.models.user import Employee, User
from app.models.digital_asset import DigitalAsset, AssetSecret, AssetAccessPermission
from app.services.vault_service import store_secret_in_vault, VAULT_DEV_MOCK
import app.services.vault_service as vs

vs.VAULT_DEV_MOCK = True

def seed_digital_assets():
    init_db()
    db = SessionLocal()
    try:
        c1 = db.query(Company).filter(Company.company_name_ar.ilike("%بوابة المستثمر%")).first()
        if not c1:
            c1 = db.query(Company).first()

        branch = db.query(Branch).filter(Branch.company_id == c1.id).first()
        emp1 = db.query(Employee).filter(Employee.company_id == c1.id).first()
        admin = db.query(User).filter(User.username == "admin").first()

        print(f"Seeding standard digital assets for Company: {c1.company_name_ar} (ID: {c1.id})")

        assets_data = [
            {
                "name": "النطاق الرسمي للشركة (investorgate.sa)",
                "category": "Domain",
                "platform": "SaudiNIC / Cloudflare",
                "url": "https://www.investorgate.sa",
                "username": "investorgate_domains",
                "account_email": "domains@investorgate.sa",
                "recovery_email": "it-security@investorgate-holdings.com",
                "recovery_phone": "+966 50 111 2233",
                "two_factor_method": "Authenticator App (TOTP)",
                "two_factor_phone": "+966 50 111 2233",
                "domain_registrar": "SaudiNIC (.sa Registry) / Sahab",
                "nameservers": "ns1.cloudflare.com, ns2.cloudflare.com",
                "subscription_tier": "Enterprise Premium (.sa TLD)",
                "payment_method": "بطاقة الشركة الائتمانية (*4412)",
                "two_factor_enabled": True,
                "status": "Active",
                "subscription_cost": 250.0,
                "notes": "النطاق المؤسسي السيادي السعودي (.sa). دي إن إس مدار عبر Cloudflare مع تفعيل حماية DNSSEC و SSL التلقائي وقفل النطاق (Transfer Lock).",
                "secrets": [
                    ("Password", "NIC#GateDomain2026!Sec"),
                    ("Domain Transfer Auth / EPP Code", "SA-DOM-AUTH-9921-XKQ-2026"),
                    ("2FA Authenticator Key", "JBSWY3DPEHPK3PXP77A"),
                    ("Recovery Code", "DOM-REC-1122-99, DOM-REC-3344-88, DOM-REC-5566-77"),
                ]
            },
            {
                "name": "حساب إكس / تويتر الرسمي (@InvestorGateSA)",
                "category": "Social Media",
                "platform": "X (Twitter)",
                "url": "https://x.com/investorgatesa",
                "username": "@investorgatesa",
                "account_email": "social.media@investorgate.sa",
                "recovery_email": "pr.escalation@investorgate.sa",
                "recovery_phone": "+966 50 123 4567",
                "two_factor_method": "Authenticator App (TOTP)",
                "two_factor_phone": "+966 50 123 4567",
                "domain_registrar": None,
                "nameservers": None,
                "subscription_tier": "X Premium Organizations (العلامة الذهبية)",
                "payment_method": "بطاقة الشركة الائتمانية (*4412)",
                "two_factor_enabled": True,
                "status": "Active",
                "subscription_cost": 4500.0,
                "notes": "الحساب الرسمي للشركة موثق بالعلامة الذهبية للمنشآت. مرتبط بهاتف الإدارة العامة وتطبيق Google Authenticator مع حفظ السيريال الاحتياطي.",
                "secrets": [
                    ("Password", "InvGate@Social2026!Sec#"),
                    ("2FA Authenticator Key", "JBSWY3DPEHPK3PXP77A"),
                    ("Recovery Code", "REC-8492-1048-X, REC-9921-3847-X, REC-1102-4958-X"),
                    ("API Key", "API_TWTR_KEY_99812903_INV"),
                ]
            },
            {
                "name": "صفحة لينكد إن المؤسسية (LinkedIn Corporate Page)",
                "category": "Social Media",
                "platform": "LinkedIn",
                "url": "https://www.linkedin.com/company/investor-gate-tech",
                "username": "investor-gate-tech-admin",
                "account_email": "pr.media@investorgate.sa",
                "recovery_email": "hr.exec@investorgate.sa",
                "recovery_phone": "+966 55 987 6543",
                "two_factor_method": "Authenticator App (TOTP)",
                "two_factor_phone": "+966 55 987 6543",
                "domain_registrar": None,
                "nameservers": None,
                "subscription_tier": "LinkedIn Recruiter & Talent Enterprise",
                "payment_method": "حوالة بنكية سنوية (Corporate Invoice)",
                "two_factor_enabled": True,
                "status": "Active",
                "subscription_cost": 3200.0,
                "notes": "صفحة الشركة الرسمية للتوظيف والعلاقات المهنية والتسويق المؤسسي. مسندة إلى مدير الموارد البشرية وإدارة الإعلام.",
                "secrets": [
                    ("Password", "LkdnCorp#9821_InvGate!"),
                    ("2FA Authenticator Key", "HXDMVJECJJWSRZ3U"),
                    ("Recovery Code", "LKDN-RECOV-2026-991, LKDN-RECOV-2026-882"),
                ]
            },
            {
                "name": "حساب إنستغرام للأعمال (@investorgate_sa)",
                "category": "Social Media",
                "platform": "Instagram",
                "url": "https://www.instagram.com/investorgate_sa",
                "username": "investorgate_sa",
                "account_email": "marketing@investorgate.sa",
                "recovery_email": "social.media@investorgate.sa",
                "recovery_phone": "+966 54 321 0987",
                "two_factor_method": "Authenticator App (TOTP)",
                "two_factor_phone": "+966 54 321 0987",
                "domain_registrar": None,
                "nameservers": None,
                "subscription_tier": "Meta Verified for Business",
                "payment_method": "بطاقة الشركة الائتمانية (*4412)",
                "two_factor_enabled": True,
                "status": "Active",
                "subscription_cost": 650.0,
                "notes": "حساب إنستغرام للأعمال مرتبط بـ Meta Business Suite ومدير الإعلانات Ads Manager. 2FA مفعّل برمز TOTP طويل.",
                "secrets": [
                    ("Password", "Insta!Gate$2026Mktg"),
                    ("2FA Authenticator Key", "HXDMVJECJJWSRZ3U99A"),
                    ("Recovery Code", "META-IG-4491-0192, META-IG-8821-3312"),
                ]
            },
            {
                "name": "لوحة إدارة جوجل وورك سبيس (Google Workspace Super Admin)",
                "category": "Email",
                "platform": "Google Workspace",
                "url": "https://admin.google.com",
                "username": "admin@investorgate.sa",
                "account_email": "emergency.backup@investorgate-holdings.com",
                "recovery_email": "ciso.backup@investorgate.sa",
                "recovery_phone": "+966 50 888 9900",
                "two_factor_method": "Security Key (FIDO2) / Authenticator",
                "two_factor_phone": "+966 50 888 9900",
                "domain_registrar": None,
                "nameservers": None,
                "subscription_tier": "Google Workspace Enterprise Plus",
                "payment_method": "حوالة سنوية مفوترة (Partner Reseller)",
                "two_factor_enabled": True,
                "status": "Active",
                "subscription_cost": 14400.0,
                "notes": "إدارة بريد وخدمات Google لكافة الشركات والفروع (Gmail, Drive, Meet). المصادقة الثنائية إلزامية مشددة مع حفظ مفتاح Authenticator والرموز الثمانية للطوارئ.",
                "secrets": [
                    ("Password", "GWork#SuperAdmin2026!Master"),
                    ("2FA Authenticator Key", "KRMU4TKRN5XW2Z3C77"),
                    ("Recovery Code", "GW-BKUP-0912-3847, GW-BKUP-5519-2041, GW-BKUP-8812-7744, GW-BKUP-1192-4411"),
                ]
            },
            {
                "name": "لوحة إدارة ميكروسوفت 365 (Microsoft 365 Global Admin)",
                "category": "Email",
                "platform": "Microsoft 365",
                "url": "https://admin.microsoft.com",
                "username": "it.globaladmin@investorgate.sa",
                "account_email": "it.escalations@investorgate.sa",
                "recovery_email": "emergency.it@investorgate-holdings.com",
                "recovery_phone": "+966 55 444 3322",
                "two_factor_method": "Microsoft Authenticator / TOTP",
                "two_factor_phone": "+966 55 444 3322",
                "domain_registrar": None,
                "nameservers": None,
                "subscription_tier": "Microsoft 365 E5 Enterprise",
                "payment_method": "حوالة سنوية مفوترة (Enterprise Agreement)",
                "two_factor_enabled": True,
                "status": "Active",
                "subscription_cost": 21600.0,
                "notes": "إدارة تراخيص Teams, Exchange Online, SharePoint, Intune MDM للمؤسسة كاملة. 2FA مفعّل عبر Microsoft Authenticator.",
                "secrets": [
                    ("Password", "M365!GateGlobal#Admin2026"),
                    ("2FA Authenticator Key", "NZQW4ZDPNVRW63TBN5XW2Z3C"),
                    ("Recovery Code", "MSFT-SEC-99201-11, MSFT-SEC-44102-22, MSFT-SEC-77192-33"),
                ]
            },
            {
                "name": "حساب مطوري آبل للمؤسسات (Apple Developer Enterprise)",
                "category": "Cloud Service",
                "platform": "Apple Developer",
                "url": "https://developer.apple.com/account",
                "username": "ios.dev@investorgate.sa",
                "account_email": "apple.enterprise@investorgate.sa",
                "recovery_email": "mobile.lead@investorgate.sa",
                "recovery_phone": "+966 50 777 8899",
                "two_factor_method": "Apple ID 2FA / Trusted Devices",
                "two_factor_phone": "+966 50 777 8899",
                "domain_registrar": None,
                "nameservers": None,
                "subscription_tier": "Apple Developer Enterprise Program",
                "payment_method": "بطاقة الشركة الائتمانية (*4412)",
                "two_factor_enabled": True,
                "status": "Active",
                "subscription_cost": 1125.0,
                "notes": "شهادات التوقيع الرقمي لتطبيقات iOS الداخلية للموظفين وتوزيع Enterprise Apps بدون App Store.",
                "secrets": [
                    ("Password", "Apple#EntDev2026!Token"),
                    ("Recovery Code", "APPL-RECOV-38192-88, APPL-RECOV-19283-77"),
                ]
            },
        ]

        existing_names = set(a.name for a in db.query(DigitalAsset).filter(DigitalAsset.company_id == c1.id).all())

        for ad in assets_data:
            if ad["name"] in existing_names:
                # Update existing with full fields
                existing_asset = db.query(DigitalAsset).filter(
                    DigitalAsset.company_id == c1.id,
                    DigitalAsset.name == ad["name"]
                ).first()
                if existing_asset:
                    existing_asset.recovery_email = ad["recovery_email"]
                    existing_asset.two_factor_method = ad["two_factor_method"]
                    existing_asset.two_factor_phone = ad["two_factor_phone"]
                    existing_asset.domain_registrar = ad["domain_registrar"]
                    existing_asset.nameservers = ad["nameservers"]
                    existing_asset.subscription_tier = ad["subscription_tier"]
                    existing_asset.payment_method = ad["payment_method"]
                    db.commit()
                continue

            asset = DigitalAsset(
                asset_id=uuid.uuid4(),
                name=ad["name"],
                category=ad["category"],
                platform=ad["platform"],
                company_id=c1.id,
                branch_id=branch.id if branch else None,
                url=ad["url"],
                username=ad["username"],
                account_email=ad["account_email"],
                recovery_email=ad["recovery_email"],
                recovery_phone=ad["recovery_phone"],
                two_factor_method=ad["two_factor_method"],
                two_factor_phone=ad["two_factor_phone"],
                domain_registrar=ad["domain_registrar"],
                nameservers=ad["nameservers"],
                subscription_tier=ad["subscription_tier"],
                payment_method=ad["payment_method"],
                assigned_employee_id=emp1.id if emp1 else None,
                owner_id=admin.id if admin else None,
                status=ad["status"],
                subscription_cost=ad["subscription_cost"],
                two_factor_enabled=ad["two_factor_enabled"],
                notes=ad["notes"],
                expires_at=datetime.utcnow() + timedelta(days=365),
            )
            db.add(asset)
            db.flush()

            # Add Secrets in Vault & DB
            for sec_type, sec_val in ad["secrets"]:
                vault_ref = store_secret_in_vault(
                    asset_id=asset.asset_id,
                    secret_type=sec_type,
                    secret_value=sec_val
                )
                secret_entry = AssetSecret(
                    secret_id=uuid.uuid4(),
                    asset_id=asset.asset_id,
                    secret_type=sec_type,
                    vault_reference=vault_ref,
                    access_policy="Reauth Required",
                    rotation_due=datetime.utcnow() + timedelta(days=90),
                    status="Active",
                )
                db.add(secret_entry)

            # Add Owner Permission for admin
            if admin:
                perm = AssetAccessPermission(
                    permission_id=uuid.uuid4(),
                    asset_id=asset.asset_id,
                    user_id=admin.id,
                    company_id=c1.id,
                    access_level="Owner",
                    can_reveal_secrets=True,
                    status="Active",
                )
                db.add(perm)

            print(f"  ✓ Seeded: {asset.name} ({len(ad['secrets'])} secrets vaulted)")

        db.commit()
        print("Standard Digital Assets successfully seeded!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding digital assets: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_digital_assets()
