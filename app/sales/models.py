from typing import Optional
from decimal import Decimal
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, ForeignKey, Text, DECIMAL
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

# Импортируем модели из каталога для создания связей. 
# Циклического импорта не будет, так как catalog не импортирует sales.
from app.catalog.models import Product, Recipe


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = {'schema': 'sales'}

    id = Column(BigInteger, primary_key=True, index=True)
    sale_number = Column(String(50), unique=True, nullable=False)
    store_id = Column(BigInteger, ForeignKey('stores.stores.id'), nullable=True)
    marketplace_id = Column(BigInteger, nullable=True)
    external_order_id = Column(String(200), nullable=True)
    total_amount = Column(DECIMAL(10, 2), nullable=False)
    discount_amount = Column(DECIMAL(10, 2), default=0)
    final_amount = Column(DECIMAL(10, 2), nullable=False)
    total_fees = Column(DECIMAL(10, 2), default=0)
    net_amount = Column(DECIMAL(10, 2), nullable=False)
    payment_method = Column(String(50), nullable=True)
    customer_id = Column(BigInteger, nullable=True)
    customer_name = Column(String(200), nullable=True)
    customer_phone = Column(String(20), nullable=True)
    
    # Статусы жизненного цикла заказа (из v1.2)
    status = Column(String(50), default='accepted')
    assembly_started_at = Column(DateTime(timezone=True), nullable=True)
    assembly_completed_at = Column(DateTime(timezone=True), nullable=True)
    shipped_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancellation_reason = Column(Text, nullable=True)
    returned_at = Column(DateTime(timezone=True), nullable=True)
    return_reason = Column(Text, nullable=True)
    
    notes = Column(Text, nullable=True)
    created_by = Column(BigInteger, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    fees = relationship("SaleFee", back_populates="sale", cascade="all, delete-orphan")

    # --- ДОБАВЬ ЭТО ---
    @property
    def cost_price(self) -> Optional[Decimal]:
        """Вычисляемое поле для совместимости со схемой SaleOut"""
        # В MVP возвращаем None, реальная себестоимость считается при сборке
        return None

    @property
    def gross_profit(self) -> Optional[Decimal]:
        """Вычисляемое поле для совместимости со схемой SaleOut"""
        return None
    # --------------------



class SaleItem(Base):
    __tablename__ = "sale_items"
    __table_args__ = {'schema': 'sales'}

    id = Column(BigInteger, primary_key=True, index=True)
    sale_id = Column(BigInteger, ForeignKey('sales.sales.id', ondelete='CASCADE'), nullable=False)
    product_id = Column(BigInteger, ForeignKey('catalog.products.id'), nullable=False)
    batch_id = Column(BigInteger, ForeignKey('inventory.batches.id'), nullable=True)
    quantity = Column(DECIMAL(10, 2), nullable=False)
    recipe_id = Column(BigInteger, ForeignKey('catalog.recipes.id'), nullable=True)
    unit_price = Column(DECIMAL(10, 2), nullable=False)
    total_price = Column(DECIMAL(10, 2), nullable=False)
    
    status = Column(String(50), default='pending')
    actual_items = Column(JSONB, nullable=True)
    substitutions = Column(JSONB, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sale = relationship("Sale", back_populates="items")
    
    # !!! ВОТ ЭТИХ ДВУХ СТРОК НЕ ХВАТАЛО !!!
    product = relationship("Product", foreign_keys=[product_id])
    recipe = relationship("Recipe", foreign_keys=[recipe_id])


class SaleFee(Base):
    __tablename__ = "sale_fees"
    __table_args__ = {'schema': 'sales'}

    id = Column(BigInteger, primary_key=True, index=True)
    sale_id = Column(BigInteger, ForeignKey('sales.sales.id', ondelete='CASCADE'), nullable=False)
    fee_id = Column(BigInteger, nullable=True)
    fee_type = Column(String(50), nullable=False)
    fee_name = Column(String(200), nullable=False)
    base_amount = Column(DECIMAL(10, 2), nullable=False)
    calculated_fee = Column(DECIMAL(10, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sale = relationship("Sale", back_populates="fees")

