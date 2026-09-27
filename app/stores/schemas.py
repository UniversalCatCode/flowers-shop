from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field, ConfigDict
from decimal import Decimal


class AvailabilityAlertCreate(BaseModel):
    alert_type: str = Field(..., max_length=50)
    product_id: Optional[int] = None
    batch_id: Optional[int] = None
    required_qty: Decimal = Field(..., decimal_places=2)
    available_qty: Decimal = Field(..., decimal_places=2)
    shortage_qty: Decimal = Field(..., decimal_places=2)
    recommendations: Optional[dict[str, Any]] = None


class AvailabilityAlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    alert_type: str
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    batch_id: Optional[int] = None
    required_qty: Decimal
    available_qty: Decimal
    shortage_qty: Decimal
    recommendations: Optional[dict[str, Any]] = None
    status: str
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[int] = None
    created_at: datetime


class AvailabilityAlertListOut(BaseModel):
    total: int
    items: List[AvailabilityAlertOut]


class AlertResolveRequest(BaseModel):
    notes: Optional[str] = None
