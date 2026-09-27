from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field, ConfigDict
from decimal import Decimal


# ============ SALE ITEMS (Позиции чека) ============
class SaleItemCreate(BaseModel):
    product_id: int
    quantity: Decimal = Field(..., gt=0, decimal_places=2)
    recipe_id: Optional[int] = None  # Если продаём букет по рецепту
    unit_price: Decimal = Field(..., ge=0, decimal_places=2)


class SaleItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    batch_id: Optional[int] = None
    quantity: Decimal
    recipe_id: Optional[int] = None
    unit_price: Decimal
    total_price: Decimal
    actual_items: Optional[dict[str, Any]] = None
    created_at: datetime


# ============ SALES (Продажи) ============
class SaleBase(BaseModel):
    sale_number: str = Field(..., max_length=50)
    store_id: Optional[int] = None
    customer_name: Optional[str] = Field(None, max_length=200)
    customer_phone: Optional[str] = Field(None, max_length=20)
    payment_method: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None


class SaleCreate(SaleBase):
    items: List[SaleItemCreate] = Field(..., min_length=1)


class SaleOut(SaleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    marketplace_id: Optional[int] = None
    external_order_id: Optional[str] = None
    total_amount: Decimal
    discount_amount: Optional[Decimal] = None  # <-- ИСПРАВЛЕНО
    final_amount: Decimal
    total_fees: Optional[Decimal] = None       # <-- ИСПРАВЛЕНО
    net_amount: Decimal
    cost_price: Optional[Decimal] = None
    gross_profit: Optional[Decimal] = None
    customer_id: Optional[int] = None
    status: str
    created_by: Optional[int] = None
    items: List[SaleItemOut] = []
    created_at: datetime
    updated_at: Optional[datetime] = None



class SaleListOut(BaseModel):
    total: int
    items: List[SaleOut]


# ============ ОТЧЁТЫ ============
class StockByBatch(BaseModel):
    batch_id: int
    batch_number: Optional[str]
    product_id: int
    product_name: str
    purchase_price: Decimal
    received_at: datetime
    expires_at: Optional[datetime]
    current_qty: Decimal
    status: str


class SalesReportItem(BaseModel):
    sale_id: int
    sale_number: str
    sale_date: datetime
    product_id: int
    product_name: str
    quantity: Decimal
    unit_price: Decimal
    total_price: Decimal
    cost_price: Optional[Decimal] = None


#+=====================================

class SaleActionRequest(BaseModel):
    reason: Optional[str] = None
    notes: Optional[str] = None
