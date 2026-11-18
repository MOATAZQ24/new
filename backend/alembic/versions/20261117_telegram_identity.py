"""Prevent silent or concurrent reassignment of a verified Telegram identity."""
from alembic import op
from sqlalchemy import text, inspect

revision = "20261117_telegram_identity"
down_revision = "20261113_workspace"
branch_labels = None
depends_on = None

def upgrade():
    connection = op.get_bind()
    insp = inspect(connection)
    if "telegram_user_links" not in insp.get_table_names():
        from app.core.database import Base
        import app.models  # noqa: F401
        Base.metadata.create_all(bind=connection)
        insp = inspect(connection)
    if any(i['name'] == 'uq_telegram_verified_identity' for i in insp.get_indexes('telegram_user_links')):
        return
    duplicates = connection.execute(text('SELECT telegram_user_id FROM telegram_user_links WHERE is_verified = true AND telegram_user_id IS NOT NULL GROUP BY telegram_user_id HAVING COUNT(*) > 1')).first()
    if duplicates:
        raise RuntimeError('Duplicate verified Telegram identities require authorized unlinking before migration; no records changed')
    op.create_index('uq_telegram_verified_identity', 'telegram_user_links', ['telegram_user_id'], unique=True,
                    sqlite_where=text('is_verified = 1 AND telegram_user_id IS NOT NULL'),
                    postgresql_where=text('is_verified = true AND telegram_user_id IS NOT NULL'))

def downgrade():
    op.drop_index('uq_telegram_verified_identity', table_name='telegram_user_links')
