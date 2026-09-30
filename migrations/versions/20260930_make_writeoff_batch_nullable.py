"""make write_offs.batch_id nullable for non-batch products

Revision ID: make_batch_nullable
Revises: 
Create Date: 2026-09-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '40c662579fcf'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.alter_column('write_offs', 'batch_id', schema='inventory', nullable=True)
    op.add_column('write_offs', sa.Column('product_id', sa.BigInteger(), nullable=True), schema='inventory')

def downgrade() -> None:
    op.drop_column('write_offs', 'product_id', schema='inventory')
    op.alter_column('write_offs', 'batch_id', schema='inventory', nullable=False)
