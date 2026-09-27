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
    packaging_units_count: int = 0  # <-- ДОБАВЛЕНО




# ============ PACKAGING UNITS ============
class PackagingUnitBase(BaseModel):
    product_id: int
    supplier_id: Optional[int] = None
    unit_type: str = Field(..., pattern="^(roll|pack|box)$")
    unit_name: str = Field(..., max_length=100)
    base_quantity: Decimal = Field(..., gt=0, decimal_places=2)
    base_unit: str = Field(..., pattern="^(meter|stem|piece)$")
    actual_quantity: Optional[Decimal] = Field(None, decimal_places=2)
    purchase_price: Decimal = Field(..., gt=0, decimal_places=2)


class PackagingUnitCreate(PackagingUnitBase):
    pass


class PackagingUnitUpdate(BaseModel):
    product_id: Optional[int] = None
    supplier_id: Optional[int] = None
    unit_type: Optional[str] = Field(None, pattern="^(roll|pack|box)$")
    unit_name: Optional[str] = Field(None, max_length=100)
    base_quantity: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    base_unit: Optional[str] = Field(None, pattern="^(meter|stem|piece)$")
    actual_quantity: Optional[Decimal] = Field(None, decimal_places=2)
    purchase_price: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    is_active: Optional[bool] = None


class PackagingUnitOut(PackagingUnitBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    received_at: datetime
    is_active: bool
    created_at: datetime


class PackagingUnitListOut(BaseModel):
    total: int
    items: List[PackagingUnitOut]


# ============ PACKAGING OPENINGS ============
class PackagingOpeningBase(BaseModel):
    packaging_unit_id: int
    initial_qty: Decimal = Field(..., gt=0, decimal_places=2)
    notes: Optional[str] = None


class PackagingOpeningCreate(PackagingOpeningBase):
    pass


class PackagingOpeningUpdate(BaseModel):
    status: Optional[str] = Field(None, pattern="^(active|closed)$")
    final_qty: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    notes: Optional[str] = None


class PackagingOpeningOut(PackagingOpeningBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    opened_at: datetime
    opened_by: Optional[int] = None
    status: str
    closed_at: Optional[datetime] = None
    created_at: datetime


class PackagingOpeningListOut(BaseModel):
    total: int
    items: List[PackagingOpeningOut]


# ============ PACKAGING CONSUMPTION ============
class PackagingConsumptionBase(BaseModel):
    opening_id: int
    sale_id: Optional[int] = None
    product_id: int
    normative_qty: Decimal = Field(..., gt=0, decimal_places=2)
    normative_unit: str = Field(..., pattern="^(meter|stem|piece)$")


class PackagingConsumptionCreate(PackagingConsumptionBase):
    pass


class PackagingConsumptionOut(PackagingConsumptionBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    created_at: datetime


class PackagingConsumptionListOut(BaseModel):
    total: int
    items: List[PackagingConsumptionOut]


# ============ PACKAGING ADJUSTMENTS ============
class PackagingAdjustmentBase(BaseModel):
    opening_id: int
    normative_total: Decimal = Field(..., decimal_places=2)
    actual_total: Decimal = Field(..., decimal_places=2)
    adjustment_factor: Decimal = Field(..., decimal_places=3)
    is_anomaly: bool = False
    anomaly_reason: Optional[str] = Field(None, max_length=200)
    cost_impact: Optional[Decimal] = Field(None, decimal_places=2)


class PackagingAdjustmentCreate(PackagingAdjustmentBase):
    pass


class PackagingAdjustmentOut(PackagingAdjustmentBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    created_at: datetime


class PackagingAdjustmentListOut(BaseModel):
    total: int
    items: List[PackagingAdjustmentOut]

# ============ RECEIPT (Приёмка товара) ============
class ReceiptItemCreate(BaseModel):
    product_id: int
    quantity: Decimal = Field(..., gt=0, decimal_places=2)
    purchase_price: Decimal = Field(..., ge=0, decimal_places=2)
    # Для упаковки: тип и базовое количество
    unit_type: Optional[str] = None  # 'roll', 'pack', 'box'
    base_quantity: Optional[Decimal] = None  # например, 10 метров в рулоне
    base_unit: Optional[str] = None  # 'meter', 'piece', 'stem'
    received_quality_pct: Optional[Decimal] = None  # процент годного (для аналитики)
    notes: Optional[str] = None


class ReceiptCreate(BaseModel):
    supplier_id: int
    receipt_number: Optional[str] = None  # автогенерируется, если не указан
    received_at: Optional[datetime] = None  # по умолчанию now
    items: List[ReceiptItemCreate] = Field(..., min_length=1)
    notes: Optional[str] = None

# ============ WRITE-OFF (Списание) ============
class WriteOffCreate(BaseModel):
    batch_id: int
    quantity: Decimal = Field(..., gt=0, decimal_places=2)
    reason: str = Field(..., max_length=255)  # Увеличили лимит, чтобы вместить детали

class WriteOffUpdate(BaseModel):
    reason: Optional[str] = Field(None, max_length=255)

class WriteOffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    batch_id: int
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
    """Подтверждение заказа — номер счёта обязателен"""
    supplier_invoice_number: str = Field(..., max_length=100, description="Номер счёта от поставщика")
    invoice_date: Optional[date] = None


class PurchaseOrderStatusUpdate(BaseModel):
    """Смена статуса заказа"""
    status: str = Field(..., pattern='^(confirmed|cancelled)$')


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
    
    # Поля для упаковки (product_type == 'packaging')
    unit_type: Optional[str] = Field(None, pattern='^(roll|pack|box)$')
    base_quantity: Optional[float] = Field(None, gt=0)
    base_unit: Optional[str] = Field(None, pattern='^(meter|piece|kg)$')
    
    # Качество для цветов (product_type == 'flower')
    received_quality_pct: Optional[int] = Field(None, ge=0, le=100)
    
    notes: Optional[str] = None


class PurchaseOrderReceiptCreate(BaseModel):
    """Создание акта приёмки"""
    receipt_number: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    items: List[PurchaseOrderReceiptItemCreate] = Field(..., min_length=1)


# ============ РАСЧЁТ ПО БУКЕТАМ ============

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