# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import sys
import os
import uuid
import unittest
from datetime import datetime

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base
from app.models.company import Company
from app.models.user import User
from app.models.ticket import (
    HelpDeskTicket,
    ServiceCatalogItem,
    TicketApproval,
    ServiceWorkflow,
    SlaPolicy,
)
from app.services.service_desk_service import (
    DEFAULT_CATALOG_ITEMS,
    seed_service_desk_defaults,
    process_ticket_approval,
)


class TestEnterpriseServiceDesk(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # In-memory SQLite for rapid isolation testing
        cls.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.SessionLocal()
        # Seed test company
        self.company = Company(
            id=uuid.uuid4(),
            company_name_ar="بوابة المستثمر القابضة",
            company_name_en="Investor Gate Holding",
            company_code=f"IGH_{uuid.uuid4().hex[:6]}",
            status="Active",
        )
        self.db.add(self.company)

        # Seed test user (Approver & Requester)
        uid = uuid.uuid4().hex[:6]
        self.user = User(
            id=uuid.uuid4(),
            email=f"manager_{uid}@investorgate.com",
            username=f"manager_{uid}",
            password_hash="dummy_hash",
            account_status="Active",
        )
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_01_seed_service_desk_defaults(self):
        """Verify automatic enterprise seeding of service catalog, SLA tiers, and workflow."""
        seed_service_desk_defaults(self.db, self.company.id)

        # 1. Verify catalog items
        catalog_count = (
            self.db.query(ServiceCatalogItem)
            .filter(ServiceCatalogItem.company_id == self.company.id)
            .count()
        )
        self.assertEqual(catalog_count, len(DEFAULT_CATALOG_ITEMS))

        # Check dynamic schema structure on hardware replacement
        repl_item = (
            self.db.query(ServiceCatalogItem)
            .filter(
                ServiceCatalogItem.company_id == self.company.id,
                ServiceCatalogItem.requires_approval == True,
            )
            .first()
        )
        self.assertIsNotNone(repl_item)
        self.assertTrue(repl_item.requires_approval)
        self.assertIn("fields", repl_item.dynamic_form_schema)

        # 2. Verify SLA tiers
        sla_count = (
            self.db.query(SlaPolicy)
            .filter(SlaPolicy.company_id == self.company.id)
            .count()
        )
        self.assertGreaterEqual(sla_count, 4)

        # 3. Verify ITIL Workflow
        wf = (
            self.db.query(ServiceWorkflow)
            .filter(ServiceWorkflow.company_id == self.company.id)
            .first()
        )
        self.assertIsNotNone(wf)
        self.assertEqual(wf.workflow_key, "enterprise_standard")
        self.assertGreaterEqual(len(wf.nodes_json), 5)
        self.assertGreaterEqual(len(wf.transitions_json), 8)

    def test_02_approval_lifecycle(self):
        """Verify ticket approval workflow (Pending -> Approved / Rejected)."""
        # Create ticket needing approval
        ticket = HelpDeskTicket(
            id=uuid.uuid4(),
            company_id=self.company.id,
            ticket_number="TCK-APPR-001",
            issue_title="طلب استبدال محطة عمل معطوبة",
            issue_description="تعطل اللوحة الأم للمحطة ولا تستجيب",
            priority="High",
            status="Pending Approval",
            category="Hardware",
            approval_status="Pending",
            requester_id=self.user.id,
        )
        self.db.add(ticket)

        approval = TicketApproval(
            id=uuid.uuid4(),
            company_id=self.company.id,
            ticket_id=ticket.id,
            approval_stage="اعتماد المدير المباشر",
            stage_order=1,
            status="Pending",
            assigned_approver_id=self.user.id,
        )
        self.db.add(approval)
        self.db.commit()

        # Test approving
        updated_appr = process_ticket_approval(
            db=self.db,
            ticket=ticket,
            approval_id=approval.id,
            decision="Approved",
            decider_user=self.user,
            notes="تمت الموافقة الفنية على الاستبدال",
        )

        self.assertEqual(updated_appr.status, "Approved")
        self.assertEqual(ticket.approval_status, "Approved")
        self.assertEqual(ticket.status, "Assigned")

    def test_03_first_response_sla_tracking(self):
        """Verify ticket first_response_at milestone recording."""
        ticket = HelpDeskTicket(
            id=uuid.uuid4(),
            company_id=self.company.id,
            ticket_number="TCK-SLA-001",
            issue_title="عطل في الطابعة المركزية",
            issue_description="انحشار متكرر للورق",
            priority="Medium",
            status="Open",
            category="Hardware",
            requester_id=self.user.id,
        )
        self.db.add(ticket)
        self.db.commit()

        self.assertIsNone(ticket.first_response_at)

        # Simulate first technician interaction
        now = datetime.utcnow()
        ticket.first_response_at = now
        self.db.commit()

        reloaded = self.db.query(HelpDeskTicket).filter(HelpDeskTicket.id == ticket.id).first()
        self.assertIsNotNone(reloaded.first_response_at)


if __name__ == "__main__":
    unittest.main()
