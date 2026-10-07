from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Date, ForeignKey, Text, DECIMAL, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Stock(Base):
    """Временный кэш остатков для совместимости с текущим роутером."""
    __tablename__ = "stock"
    __table_args__ = {'schema': 'inventory'}

    id = Column(BigInteger, primary_key=True, index=True)
    product_id = Column(BigInteger, ForeignKey('catalog.products.id'), nullable=False, unique=True)
    quantity = Column(DECIMAL(10, 2), nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Batch(Base):
    __tablename__ = "batches"
    __table_args__ = {'schema': 'inventory'}

    id = Column(BigInteger, primary_key=True, index=True)
    product_id = Column(BigInteger, ForeignKey('catalog.products.id'), nullable=False)
    supplier_id = Column(BigInteger, ForeignKey('catalog.suppliers.id'), nullable=True)
    batch_number = Column(String(100), nullable=True)
    purchase_price = Column(DECIMAL(10, 2), nullable=False)
    received_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    initial_qty = Column(DECIMAL(10, 2), nullable=False)
    current_qty = Column(DECIMAL(10, 2), nullable=False)
    status = Column(String(50), default='active')
    quality_score = Column(DECIMAL(3, 2), nullable=True)
    received_quality_pct =Column(DECIMAL(5,2), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    movements = relationship("Movement", back_populates="batch")
    write_offs = relationship("WriteOff", back_populates="batch")

class Movement(Base):
    __tablename__ = "movements"
    __table_args__ = {'schema': 'inventory'}

    id = Column(Integer, primary_key=True, index=True)
    
    # ИЗМЕНЕНО: batch_id теперь может быть NULL (для consumable и прямых корректировок)
    batch_id = Column(Integer, ForeignKey("inventory.batches.id"), nullable=True)
    
    # ДОБАВЛЕНО: прямая привязка к товару (для consumable)
    product_id = Column(Integer, ForeignKey("catalog.products.id"), nullable=True)
    
    sale_id = Column(Integer, ForeignKey("sales.sales.id"), nullable=True)
    movement_type = Column(String(50), nullable=False)  # 'receipt', 'sale', 'write_off', 'adjustment'
    quantity = Column(DECIMAL(10, 2), nullable=False)
    reason = Column(String(255), nullable=True)
    created_by = Column(Integer, ForeignKey("users.users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Связи
    batch = relationship("Batch", back_populates="movements")
    product = relationship("Product")
    sale = relationship("Sale")
    user = relationship("User")

class WriteOff(Base):
    __tablename__ = "write_offs"
    __table_args__ = {'schema': 'inventory'}

    id = Column(BigInteger, primary_key=True, index=True)
    batch_id = Column(BigInteger, ForeignKey('inventory.batches.id'), nullable=True)
    product_id = Column(BigInteger, ForeignKey('catalog.products.id'), nullable=True)
    quantity = Column(DECIMAL(10, 2), nullable=False)
    reason = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    days_in_stock = Column(Integer, nullable=True)
    created_by = Column(BigInteger, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    batch = relationship("Batch", back_populates="write_offs")
    product = relationship("Product", foreign_keys=[product_id])

class PurchaseOrder(Base):
    """
    Заказ поставщику с жизненным циклом:
    - draft: можно редактировать
    - confirmed: согласован с поставщиком, ждёт приёмки
    - received: полностью принят (все позиции получены)
    - cancelled: отменён
    
    Оплата учитывается отдельно (payment_status).
    """
    __tablename__ = "purchase_orders"
    __table_args__ = {'schema': 'inventory'}

    id = Column(BigInteger, primary_key=True, index=True)
    
    # Внутренняя нумерация (авто)
    order_number = Column(String(50), unique=True, nullable=False)
    
    # Номер счёта от поставщика (заполняется при подтверждении)
    supplier_invoice_number = Column(String(100), nullable=True)
    
    # Дата счёта
    invoice_date = Column(Date, nullable=True)
    
    # Номер накладной (заполняется при приёмке)
    supplier_waybill_number = Column(String(100), nullable=True)
    
    supplier_id = Column(BigInteger, ForeignKey('catalog.suppliers.id'), nullable=False)
    
    # Статусы документа
    status = Column(String(20), default='draft', nullable=False)
    
    # Статус оплаты (отдельно от статуса документа)
    payment_status = Column(String(20), default='pending', nullable=False)
    paid_amount = Column(DECIMAL(12, 2), default=0, nullable=False)
    
    # Режим создания: ручной или по букетам
    mode = Column(String(20), default='manual', nullable=False)
    
    # Даты
    expected_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Метаданные
    notes = Column(Text, nullable=True)
    created_by = Column(BigInteger, ForeignKey('users.users.id'), nullable=False)
    
    # Связи
    supplier = relationship("Supplier", foreign_keys=[supplier_id])
    creator = relationship("User", foreign_keys=[created_by])
    items = relationship("PurchaseOrderItem", back_populates="order", cascade="all, delete-orphan")
    receipts = relationship("PurchaseOrderReceipt", back_populates="order", cascade="all, delete-orphan")

class PurchaseOrderItem(Base):
    """
    Позиция заказа поставщику.
    ordered_qty — сколько заказали
    received_qty — сколько уже приняли (может быть меньше при частичной поставке)
    """
    __tablename__ = "purchase_order_items"
    __table_args__ = {'schema': 'inventory'}

    id = Column(BigInteger, primary_key=True, index=True)
    purchase_order_id = Column(BigInteger, ForeignKey('inventory.purchase_orders.id'), nullable=False)
    product_id = Column(BigInteger, ForeignKey('catalog.products.id'), nullable=False)
    product_type = Column(String(20), nullable=True)  # Денормализованный тип товара
    
    # Заказанное количество
    ordered_qty = Column(DECIMAL(10, 2), nullable=False)
    
    # Принятое количество (заполняется при приёмке)
    received_qty = Column(DECIMAL(10, 2), default=0, nullable=False)
    
    # Цена за единицу
    unit_price = Column(DECIMAL(10, 2), nullable=False)
    
    # Примечания
    notes = Column(Text, nullable=True)
    
    # Связи
    order = relationship("PurchaseOrder", back_populates="items")
    product = relationship("Product", foreign_keys=[product_id])

class PurchaseOrderReceipt(Base):
    """
    Акт приёмки по заказу.
    Позволяет принимать заказ по частям (несколько приёмов на один заказ).
    Каждый приём сразу влияет на остаток.
    """
    __tablename__ = "purchase_order_receipts"
    __table_args__ = {'schema': 'inventory'}

    id = Column(BigInteger, primary_key=True, index=True)
    purchase_order_id = Column(BigInteger, ForeignKey('inventory.purchase_orders.id'), nullable=False)
    
    # Кто принял и когда
    received_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    received_by = Column(BigInteger, ForeignKey('users.users.id'), nullable=False)
    
    # Номер накладной (может отличаться от основной, если довезли без документов)
    receipt_number = Column(String(100), nullable=True)
    
    # Статус приёмки
    status = Column(String(20), default='active', nullable=False)  # active, rolled_back
    
    # Примечания
    notes = Column(Text, nullable=True)
    
    # Связи
    order = relationship("PurchaseOrder", back_populates="receipts")
    receiver = relationship("User", foreign_keys=[received_by])
    items = relationship("PurchaseOrderReceiptItem", back_populates="receipt", cascade="all, delete-orphan")

class PurchaseOrderReceiptItem(Base):
    """
    Позиция акта приёмки.
    Указывает, сколько конкретно приняли в этом приёме.
    """
    __tablename__ = "purchase_order_receipt_items"
    __table_args__ = {'schema': 'inventory'}

    id = Column(BigInteger, primary_key=True, index=True)
    receipt_id = Column(BigInteger, ForeignKey('inventory.purchase_order_receipts.id'), nullable=False)
    product_id = Column(BigInteger, ForeignKey('catalog.products.id'), nullable=False)
    
    # Принятое количество в этом приёме
    quantity = Column(DECIMAL(10, 2), nullable=False)
    
    # Цена за единицу (может отличаться от заказа, если новая поставка)
    unit_price = Column(DECIMAL(10, 2), nullable=False)
    
    # Примечания
    notes = Column(Text, nullable=True)
    
    # Связи
    receipt = relationship("PurchaseOrderReceipt", back_populates="items")
    product = relationship("Product", foreign_keys=[product_id])
