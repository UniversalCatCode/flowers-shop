from sqlalchemy import Column, BigInteger, String, DateTime, ForeignKey, Integer, DECIMAL, Date
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ProductSalesStat(Base):
    __tablename__ = "product_sales_stats"
    __table_args__ = {'schema': 'analytics'}

    id = Column(BigInteger, primary_key=True, index=True)
    product_id = Column(BigInteger, ForeignKey('catalog.products.id'), nullable=False)
    store_id = Column(BigInteger, ForeignKey('stores.stores.id'), nullable=True)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    total_sales = Column(Integer, nullable=False)
    avg_daily_sales = Column(DECIMAL(10, 2), nullable=False)
    std_deviation = Column(DECIMAL(10, 2), nullable=False)
    sales_by_weekday = Column(JSONB, nullable=True)
    sales_by_hour = Column(JSONB, nullable=True)
    coefficient_of_variation = Column(DECIMAL(5, 2), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class ComponentDemandForecast(Base):
    __tablename__ = "component_demand_forecast"
    __table_args__ = {'schema': 'analytics'}

    id = Column(BigInteger, primary_key=True, index=True)
    product_id = Column(BigInteger, ForeignKey('catalog.products.id'), nullable=False)
    forecast_date = Column(Date, nullable=False)
    days_ahead = Column(Integer, nullable=False)
    avg_demand = Column(DECIMAL(10, 2), nullable=False)
    std_deviation = Column(DECIMAL(10, 2), nullable=False)
    stock_90_pct = Column(DECIMAL(10, 2), nullable=False)
    stock_95_pct = Column(DECIMAL(10, 2), nullable=False)
    stock_99_pct = Column(DECIMAL(10, 2), nullable=False)
    demand_by_recipe = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PurchaseRecommendation(Base):
    __tablename__ = "purchase_recommendations"
    __table_args__ = {'schema': 'analytics'}

    id = Column(BigInteger, primary_key=True, index=True)
    product_id = Column(BigInteger, ForeignKey('catalog.products.id'), nullable=False)
    supplier_id = Column(BigInteger, ForeignKey('catalog.suppliers.id'), nullable=True)
    days_to_cover = Column(Integer, nullable=False)
    forecasted_demand = Column(DECIMAL(10, 2), nullable=False)
    current_stock = Column(DECIMAL(10, 2), nullable=False)
    expected_waste = Column(DECIMAL(10, 2), nullable=False)
    recommended_qty = Column(DECIMAL(10, 2), nullable=False)
    confidence_level = Column(DECIMAL(5, 2), nullable=False)
    reasoning = Column(JSONB, nullable=True)
    status = Column(String(50), default='pending')
    approved_by = Column(BigInteger, nullable=True)
    ordered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

