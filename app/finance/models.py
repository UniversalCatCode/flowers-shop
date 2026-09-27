from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, ForeignKey, Text, DECIMAL, Date
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class PricingRule(Base):
    __tablename__ = "pricing_rules"
    __table_args__ = {'schema': 'finance'}

    id = Column(BigInteger, primary_key=True, index=True)
    product_id = Column(BigInteger, ForeignKey('catalog.products.id'), nullable=True)
    category_id = Column(BigInteger, ForeignKey('catalog.categories.id'), nullable=True)
    store_id = Column(BigInteger, ForeignKey('stores.stores.id'), nullable=True)
    marketplace_id = Column(BigInteger, nullable=True)
    rule_type = Column(String(50), nullable=False)
    markup_pct = Column(DECIMAL(5, 2), nullable=True)
    target_margin = Column(DECIMAL(5, 2), nullable=True)
    priority = Column(BigInteger, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ProfitTarget(Base):
    __tablename__ = "profit_targets"
    __table_args__ = {'schema': 'finance'}

    id = Column(BigInteger, primary_key=True, index=True)
    store_id = Column(BigInteger, ForeignKey('stores.stores.id'), nullable=True)
    period_type = Column(String(50), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    target_revenue = Column(DECIMAL(12, 2), nullable=True)
    target_profit = Column(DECIMAL(12, 2), nullable=True)
    target_margin = Column(DECIMAL(5, 2), nullable=True)
    actual_revenue = Column(DECIMAL(12, 2), nullable=True)
    actual_profit = Column(DECIMAL(12, 2), nullable=True)
    forecast_profit = Column(DECIMAL(12, 2), nullable=True)
    forecast_gap = Column(DECIMAL(12, 2), nullable=True)
    marketplace_targets = Column(JSONB, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PriceHistory(Base):
    __tablename__ = "price_history"
    __table_args__ = {'schema': 'finance'}

    id = Column(BigInteger, primary_key=True, index=True)
    product_id = Column(BigInteger, ForeignKey('catalog.products.id'), nullable=False)
    batch_id = Column(BigInteger, ForeignKey('inventory.batches.id'), nullable=True)
    old_price = Column(DECIMAL(10, 2), nullable=True)
    new_price = Column(DECIMAL(10, 2), nullable=False)
    reason = Column(String(200), nullable=True)
    changed_by = Column(BigInteger, nullable=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now())

