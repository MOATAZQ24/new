# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Persist Telegram data scope without replacing existing records."""
from alembic import op
import sqlalchemy as sa

revision = '20261117_telegram_scope'
down_revision = '20261117_telegram_identity'
branch_labels = None
depends_on = None


def upgrade():
    if 'data_scope' not in {c['name'] for c in sa.inspect(op.get_bind()).get_columns('telegram_user_links')}:
        op.add_column('telegram_user_links', sa.Column('data_scope', sa.String(50), nullable=False, server_default='Self'))


def downgrade():
    op.drop_column('telegram_user_links', 'data_scope')
