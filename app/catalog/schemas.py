from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field, ConfigDict, model_validator
from decimal import Decimal


# ============ CATEGORIES ============
class CategoryBase(BaseModel):
    name: str = Field(..., max_length=200)
    category_type: str = Field(..., pattern="^(flower|packaging|bouquet|consumable)$")
    parent_id: Optional[int] = None


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    category_type: Optional[str] = Field(None, pattern="^(flower|packaging|bouquet|consumable)$")
    parent_id: Optional[int] = None


class CategoryOut(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None


class CategoryTree(CategoryOut):
    children: List["CategoryTree"] = []


# ============ PRODUCTS ============
class ProductBase(BaseModel):
    category_id: int
    sku: str = Field(..., max_length=100)
    name: str = Field(..., max_length=300)
    product_type: str = Field(..., pattern="^(flower|packaging|bouquet|consumable)$")
    unit: str = Field(..., pattern="^(stem|meter|piece)$")
    shelf_life_days: Optional[int] = None
    recipe_id: Optional[int] = None
    supplier_id: Optional[int] = None
    meta_data: Optional[dict[str, Any]] = None
    external_ids: Optional[dict[str, Any]] = None
    purchase_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)  # <-- ДОБАВЛЕНО
    selling_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)   # <-- ДОБАВЛЕНО

    model_config = ConfigDict(from_attributes=True)



class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    category_id: Optional[int] = None
    sku: Optional[str] = Field(None, max_length=100)
    name: Optional[str] = Field(None, max_length=300)
    product_type: Optional[str] = Field(None, pattern="^(flower|packaging|bouquet|consumable)$")
    unit: Optional[str] = Field(None, pattern="^(stem|meter|piece)$")
    shelf_life_days: Optional[int] = None
    recipe_id: Optional[int] = None
    supplier_id: Optional[int] = None
    meta_data: Optional[dict[str, Any]] = None
    external_ids: Optional[dict[str, Any]] = None
    purchase_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    selling_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    is_active: Optional[bool] = None

    @model_validator(mode='after')
    def validate_prices(self):
        if self.purchase_price is not None and self.selling_price is not None:
            if self.selling_price < self.purchase_price:
                raise ValueError('Цена продажи не может быть меньше цены закупки')
        return self


class ProductOut(ProductBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None


class ProductListOut(BaseModel):
    total: int
    items: List[ProductOut]



# ============ SUPPLIERS ============
class SupplierBase(BaseModel):
    name: str = Field(..., max_length=300)
    contact_info: Optional[dict[str, Any]] = None
    notes: Optional[str] = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=300)
    contact_info: Optional[dict[str, Any]] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class SupplierOut(SupplierBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    created_at: datetime


class SupplierOut(SupplierBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    created_at: datetime

# ============ RECIPES (Рецепты) ============
class RecipeItemBase(BaseModel):
    product_id: int
    quantity: Decimal = Field(..., gt=0, decimal_places=2)
    min_quantity: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    max_quantity: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    is_required: bool = True


class RecipeItemCreate(RecipeItemBase):
    pass


class RecipeItemOut(RecipeItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class RecipeBase(BaseModel):
    name: str = Field(..., max_length=300)
    description: Optional[str] = None
    tolerance_pct: Optional[Decimal] = Field(None, ge=0, le=100, decimal_places=2)


class RecipeCreate(RecipeBase):
    items: List[RecipeItemCreate] = Field(..., min_length=1)


class RecipeUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=300)
    description: Optional[str] = None
    tolerance_pct: Optional[Decimal] = Field(None, ge=0, le=100, decimal_places=2)
    is_active: Optional[bool] = None
    items: Optional[List[RecipeItemCreate]] = None  # <-- ДОБАВЬ ЭТУ СТРОКУ



class RecipeOut(RecipeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    items: List[RecipeItemOut] = []
    created_at: datetime
    updated_at: Optional[datetime] = None


class RecipeListOut(BaseModel):
    total: int
    items: List[RecipeOut]

# ============ PRODUCT IMAGES ============
class ProductImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    product_id: int
    image_url: str
    sort_order: int
    is_primary: bool
    created_at: datetime

# ==========================================
# АЛИАСЫ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
# ==========================================
ProductRead = ProductOut
CategoryRead = CategoryOut
SupplierRead = SupplierOut

