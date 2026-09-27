from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, ForeignKey, Integer, DECIMAL, Date
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Marketplace(Base):
    __tablename__ = "marketplaces"
    __table_args__ = {'schema': 'integrations'}

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    api_url = Column(String(500), nullable=True)
    api_key = Column(String(500), nullable=True)
    default_logistics_included = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    config = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    fees = relationship("MarketplaceFee", back_populates="marketplace")
    category_fees = relationship("MarketplaceCategoryFee", back_populates="marketplace")


class MarketplaceFee(Base):
    __tablename__ = "marketplace_fees"
    __table_args__ = {'schema': 'integrations'}

    id = Column(BigInteger, primary_key=True, index=True)
    marketplace_id = Column(BigInteger, ForeignKey('integrations.marketplaces.id'), nullable=False)
    fee_type = Column(String(50), nullable=False)
    fee_name = Column(String(200), nullable=False)
    calculation_type = Column(String(50), nullable=False)
    fixed_amount = Column(DECIMAL(10, 2), nullable=True)
    percentage = Column(DECIMAL(5, 2), nullable=True)
    tiers = Column(JSONB, nullable=True)
    applies_to = Column(String(50), default='sale_price')
    is_active = Column(Boolean, default=True)
    valid_from = Column(Date, nullable=True)
    valid_to = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    marketplace = relationship("Marketplace", back_populates="fees")


class MarketplaceCategoryFee(Base):
    __tablename__ = "marketplace_category_fees"
    __table_args__ = {'schema': 'integrations'}

    id = Column(BigInteger, primary_key=True, index=True)
    marketplace_id = Column(BigInteger, ForeignKey('integrations.marketplaces.id'), nullable=False)
    category_id = Column(BigInteger, ForeignKey('catalog.categories.id'), nullable=False)
    fee_id = Column(BigInteger, ForeignKey('integrations.marketplace_fees.id'), nullable=False)
    override_percentage = Column(DECIMAL(5, 2), nullable=True)
    override_fixed = Column(DECIMAL(10, 2), nullable=True)
    priority = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    marketplace = relationship("Marketplace", back_populates="category_fees")


class SyncLog(Base):
    __tablename__ = "sync_logs"
    __table_args__ = {'schema': 'integrations'}

    id = Column(BigInteger, primary_key=True, index=True)
    system_id = Column(BigInteger, ForeignKey('integrations.marketplaces.id'), nullable=False)
    sync_type = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False)
    records_synced = Column(Integer, nullable=True)
    errors_count = Column(Integer, nullable=True)
    error_details = Column(JSONB, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=False)
    finished_at = Column(DateTime(timezone=True), nullable=True)

