from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, ForeignKey, Integer, DECIMAL, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Store(Base):
    __tablename__ = "stores"
    __table_args__ = {'schema': 'stores'}

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    store_type = Column(String(50), nullable=False)
    marketplace_id = Column(BigInteger, nullable=True)
    external_store_id = Column(String(200), nullable=True)
    timezone = Column(String(50), default='Europe/Moscow')
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    store_products = relationship("StoreProduct", back_populates="store")
    store_priorities = relationship("StorePriority", back_populates="store")


class StoreProduct(Base):
    __tablename__ = "store_products"
    __table_args__ = (
        UniqueConstraint('store_id', 'product_id', name='uq_store_product'),
        {'schema': 'stores'}
    )

    id = Column(BigInteger, primary_key=True, index=True)
    store_id = Column(BigInteger, ForeignKey('stores.stores.id'), nullable=False)
    product_id = Column(BigInteger, ForeignKey('catalog.products.id'), nullable=False)
    store_name = Column(String(300), nullable=False)
    store_sku = Column(String(100), nullable=True)
    base_price = Column(DECIMAL(10, 2), nullable=False)
    external_id = Column(String(200), nullable=True)
    is_listed = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    store = relationship("Store", back_populates="store_products")


class StorePriority(Base):
    __tablename__ = "store_priorities"
    __table_args__ = {'schema': 'stores'}

    id = Column(BigInteger, primary_key=True, index=True)
    store_id = Column(BigInteger, ForeignKey('stores.stores.id'), nullable=False)
    priority = Column(Integer, nullable=False, default=0)
    min_margin_pct = Column(DECIMAL(5, 2), nullable=True)
    avg_daily_sales = Column(DECIMAL(10, 2), nullable=True)
    is_active = Column(Boolean, default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    store = relationship("Store", back_populates="store_priorities")


class AvailabilityAlert(Base):
    __tablename__ = "availability_alerts"
    __table_args__ = {'schema': 'stores'}

    id = Column(BigInteger, primary_key=True, index=True)
    alert_type = Column(String(50), nullable=False)
    product_id = Column(BigInteger, ForeignKey('catalog.products.id'), nullable=True)
    batch_id = Column(BigInteger, ForeignKey('inventory.batches.id'), nullable=True)
    required_qty = Column(DECIMAL(10, 2), nullable=False)
    available_qty = Column(DECIMAL(10, 2), nullable=False)
    shortage_qty = Column(DECIMAL(10, 2), nullable=False)
    recommendations = Column(JSONB, nullable=True)
    status = Column(String(50), default='active')
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by = Column(BigInteger, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    product = relationship("Product") 

