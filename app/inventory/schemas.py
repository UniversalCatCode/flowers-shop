from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from decimal import Decimal

# ============ BATCHES (Партии) ============
class BatchBase(BaseModel):
    product_id: int
    supplier_id: Optional[int] = None
    batch_number: Optional[str] = Field(None, max_length=100)
    purchase_price: Decimal = Field(..., gt=0, decimal_places=2)
    received_at: datetime
    expires_at: Optional[datetime] = None
    initial_qty: Decimal = Field(..., gt=0, decimal_places=2)
    notes: Optional[str] = None

class BatchCreate(BatchBase):
    pass

class BatchOut(BatchBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    current_qty: Decimal
    status: str
    quality_score: Optional[Decimal] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

class BatchListOut(BaseModel):
    total: int
    items: List[BatchOut]

# ============ STOCK (Остатки) ============
class StockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    quantity: Decimal
    updated_at: Optional[datetime] = None

class StockByProduct(BaseModel):
    product_id: int
    product_name: str
    sku: str
    product_type: str  # <-- ДОБАВЛЕНО
    total_quantity: Decimal
    batches_count: int = 0

# ============ WRITE OFF ============


class WriteOffCreate(BaseModel):
    batch_id: Optional[int] = None  # Для цветов (партия)
    product_id: Optional[int] = None  # Для packaging/consumable (без партии)
    quantity: Decimal = Field(..., gt=0, decimal_places=2)
    reason: str = Field(..., max_length=255)

class WriteOffUpdate(BaseModel):
    reason: Optional[str] = Field(None, max_length=255)

class WriteOffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    batch_id: Optional[int] = None
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    quantity: Decimal
    reason: str
    created_by: Optional[int] = None
    created_at: datetime

class WriteOffListOut(BaseModel):
    total: int
    items: List[WriteOffOut]

# ============ PURCHASE ORDERS (Заказы поставщикам) ============

class PurchaseOrderItemCreate(BaseModel):
    """Позиция заказа поставщику"""
    product_id: int
    product_type: Optional[str] = None  # Передаётся с фронта для денормализации
    ordered_qty: Decimal = Field(..., gt=0, decimal_places=2)
    unit_price: Decimal = Field(..., ge=0, decimal_places=2)
    notes: Optional[str] = None

class PurchaseOrderCreate(BaseModel):
    """Создание заказа поставщику"""
    supplier_invoice_number: Optional[str] = Field(None, max_length=100)
    supplier_id: int
    expected_date: Optional[date] = None
    mode: str = Field(default='manual', pattern='^(manual|by_bouquet)$')
    notes: Optional[str] = None
    items: List[PurchaseOrderItemCreate] = Field(..., min_length=1)

class PurchaseOrderItemUpdate(BaseModel):
    """Обновление позиции заказа (только в статусе draft)"""
    product_id: Optional[int] = None
    ordered_qty: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    unit_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    notes: Optional[str] = None

class PurchaseOrderUpdate(BaseModel):
    """Обновление заказа (только в статусе draft)"""
    supplier_invoice_number: Optional[str] = Field(None, max_length=100)
    invoice_date: Optional[date] = None
    supplier_id: Optional[int] = None
    expected_date: Optional[date] = None
    notes: Optional[str] = None
    items: Optional[List[PurchaseOrderItemUpdate]] = None

class PurchaseOrderConfirm(BaseModel):
    """Подтверждение заказа — номер и дата счёта обязательны"""
    supplier_invoice_number: str = Field(..., max_length=100, description="Номер счёта от поставщика")
    invoice_date: date = Field(..., description="Дата счёта")

class PurchaseOrderStatusUpdate(BaseModel):
    """Смена статуса заказа (для отката админом)"""
    status: str = Field(..., pattern='^(confirmed|cancelled|draft)$')

class PurchaseOrderItemOut(BaseModel):
    """Позиция заказа с деталями товара"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    product_id: int
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    product_type: Optional[str] = None
    ordered_qty: Decimal
    received_qty: Decimal
    remaining_qty: Decimal = 0  # Вычисляется: ordered - received
    unit_price: Decimal
    notes: Optional[str] = None

class PurchaseOrderReceiptItemOut(BaseModel):
    """Позиция акта приёмки"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    product_id: int
    product_name: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    notes: Optional[str] = None

class PurchaseOrderReceiptOut(BaseModel):
    """Акт приёмки"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    purchase_order_id: int
    receipt_number: Optional[str] = None
    received_at: datetime
    received_by: Optional[int] = None
    receiver_name: Optional[str] = None
    status: str
    notes: Optional[str] = None
    items: List[PurchaseOrderReceiptItemOut] = []

class PurchaseOrderOut(BaseModel):
    """Заказ поставщику с деталями"""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    order_number: str
    supplier_invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    supplier_waybill_number: Optional[str] = None
    supplier_id: int
    supplier_name: Optional[str] = None
    status: str
    payment_status: str
    paid_amount: Decimal = Decimal('0')
    mode: str
    expected_date: Optional[date] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_by: Optional[int] = None
    creator_name: Optional[str] = None
    
    # Вычисляемые поля
    total_amount: Decimal = 0  # Сумма всех позиций
    received_amount: Decimal = 0  # Сумма принятых позиций
    is_fully_received: bool = False
    
    items: List[PurchaseOrderItemOut] = []
    receipts: List[PurchaseOrderReceiptOut] = []

class PurchaseOrderListOut(BaseModel):
    """Список заказов"""
    total: int
    items: List[PurchaseOrderOut]

# ============ ПРИЁМКА ЗАКАЗА ============

class PurchaseOrderReceiptItemCreate(BaseModel):
    """Позиция акта приёмки"""
    product_id: int
    quantity: Decimal = Field(..., gt=0, decimal_places=2)
    unit_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)  # Если None — берём из заказа
    
    # Качество для цветов (product_type == 'flower')
    received_quality_pct: Optional[int] = Field(None, ge=0, le=100)
    
    notes: Optional[str] = None

class PurchaseOrderReceiptCreate(BaseModel):
    """Создание акта приёмки"""
    receipt_number: str = Field(..., max_length=100, description="Номер накладной")
    receipt_date: date = Field(..., description="Дата накладной")
    notes: Optional[str] = None
    items: List[PurchaseOrderReceiptItemCreate] = Field(..., min_length=1)

# ============ РАСЧЁТ ПО БУКЕТАМ ============


class PurchaseOrderPaymentUpdate(BaseModel):
    """Обновление оплаты заказа (только админ)"""
    paid_amount: Decimal = Field(..., ge=0, decimal_places=2)
    payment_status: Optional[str] = Field(None, pattern='^(pending|partial|paid)$')

class BouquetSelection(BaseModel):
    """Выбранный букет для расчёта"""
    bouquet_product_id: int
    quantity: int = Field(..., gt=0)

class BouquetCalculationRequest(BaseModel):
    """Запрос на расчёт потребностей по букетам"""
    bouquets: List[BouquetSelection] = Field(..., min_length=1)

class BouquetCalculationItem(BaseModel):
    """Компонент для заказа (результат расчёта)"""
    product_id: int
    product_name: str
    product_sku: str
    product_type: str
    
    # Потребность
    required_qty: Decimal
    # Текущий остаток (с учётом резерва на витрину)
    available_qty: Decimal
    # Дефицит (нужно докупить)
    shortage_qty: Decimal
    
    # Рекомендуемая цена (последняя закупочная)
    last_purchase_price: Optional[Decimal] = None

class BouquetCalculationResponse(BaseModel):
    """Результат расчёта потребностей по букетам"""
    bouquets_selected: int  # Сколько букетов выбрано
    total_bouquet_units: int  # Общее количество букетов
    components: List[BouquetCalculationItem]
    
    # Итоги
    total_shortage_items: int  # Сколько позиций нужно закупить
    estimated_cost: Optional[Decimal] = None  # Примерная стоимость