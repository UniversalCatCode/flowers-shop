from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, DECIMAL
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = {'schema': 'catalog'}

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey('catalog.categories.id'), nullable=True)
    name = Column(String(200), nullable=False)
    category_type = Column(String(50), nullable=False)  # 'flower', 'packaging', 'bouquet'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    parent = relationship("Category", remote_side=[id], backref="children")
    products = relationship("Product", back_populates="category")


class Supplier(Base):
    __tablename__ = "suppliers"
    __table_args__ = {'schema': 'catalog'}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(300), nullable=False)
    contact_info = Column(JSONB, nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    products = relationship("Product", back_populates="supplier")
    # batches = relationship("Batch", back_populates="supplier")  # Раскомментируем, когда создадим модуль inventory


class Recipe(Base):
    __tablename__ = "recipes"
    __table_args__ = {'schema': 'catalog'}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    tolerance_pct = Column(DECIMAL(5, 2), default=0.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    product = relationship("Product", back_populates="recipe", uselist=False)
    items = relationship("RecipeItem", back_populates="recipe", cascade="all, delete-orphan")


class RecipeItem(Base):
    __tablename__ = "recipe_items"
    __table_args__ = {'schema': 'catalog'}

    id = Column(Integer, primary_key=True, index=True)
    recipe_id = Column(Integer, ForeignKey('catalog.recipes.id', ondelete='CASCADE'), nullable=False)
    product_id = Column(Integer, ForeignKey('catalog.products.id'), nullable=False)
    quantity = Column(DECIMAL(10, 2), nullable=False)
    min_quantity = Column(DECIMAL(10, 2), nullable=True)
    max_quantity = Column(DECIMAL(10, 2), nullable=True)
    is_required = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    recipe = relationship("Recipe", back_populates="items")
    product = relationship("Product", foreign_keys=[product_id])


class Product(Base):
    __tablename__ = "products"
    __table_args__ = {'schema': 'catalog'}

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey('catalog.categories.id'), nullable=False)
    sku = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(300), nullable=False)
    product_type = Column(String(50), nullable=False)  # 'flower', 'packaging', 'bouquet', 'consumable'
    unit = Column(String(50), nullable=False)  # 'stem', 'meter', 'piece'
    shelf_life_days = Column(Integer, nullable=True)
    recipe_id = Column(Integer, ForeignKey('catalog.recipes.id'), nullable=True)
    
    # ИСПРАВЛЕНИЕ: атрибут Python называется meta_data, но в БД он маппится на колонку 'metadata'
    meta_data = Column('metadata', JSONB, nullable=True)  # цвет, длина, страна и т.д.
    
    # ЦЕНООБРАЗОВАНИЕ
    purchase_price = Column(DECIMAL(10, 2), nullable=True)   # Текущая цена закупки
    selling_price = Column(DECIMAL(10, 2), nullable=True)    # Цена продажи
    

    external_ids = Column(JSONB, nullable=True)  # {"ozon": 123, "wb": 456}
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    category = relationship("Category", back_populates="products")
    supplier_id = Column(Integer, ForeignKey('catalog.suppliers.id'), nullable=True)
    supplier = relationship("Supplier", back_populates="products")
    recipe = relationship("Recipe", back_populates="product")

class ProductImage(Base):
    __tablename__ = "product_images"
    __table_args__ = {'schema': 'catalog'}

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey('catalog.products.id', ondelete='CASCADE'), nullable=False)
    image_url = Column(String(500), nullable=False)  # Относительный путь к файлу
    sort_order = Column(Integer, default=0)  # Порядок отображения
    is_primary = Column(Boolean, default=False)  # Главное фото
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product", backref="images")
