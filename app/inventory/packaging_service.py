from typing import Optional, List, Tuple
from decimal import Decimal
from datetime import datetime
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.inventory.models import (
    PackagingUnit, PackagingOpening, 
    PackagingConsumption, PackagingAdjustment
)


class PackagingService:
    """Сервис для управления упаковкой (рулоны, пачки, корректировки)"""

    # ============ PACKAGING UNITS ============
    
    @staticmethod
    async def create_unit(db: AsyncSession, data: dict) -> PackagingUnit:
        unit = PackagingUnit(**data)
        db.add(unit)
        await db.commit()
        await db.refresh(unit)
        return unit

    @staticmethod
    async def get_unit(db: AsyncSession, unit_id: int) -> Optional[PackagingUnit]:
        stmt = select(PackagingUnit).where(PackagingUnit.id == unit_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_units(
        db: AsyncSession,
        is_active: Optional[bool] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[List[PackagingUnit], int]:
        stmt = select(PackagingUnit)
        count_stmt = select(func.count(PackagingUnit.id))
        
        if is_active is not None:
            stmt = stmt.where(PackagingUnit.is_active == is_active)
            count_stmt = count_stmt.where(PackagingUnit.is_active == is_active)
        
        # Подсчёт общего количества
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0
        
        # Получение списка с пагинацией
        stmt = stmt.offset(skip).limit(limit).order_by(PackagingUnit.created_at.desc())
        result = await db.execute(stmt)
        items = list(result.scalars().all())
        
        return items, total

    @staticmethod
    async def update_unit(db: AsyncSession, unit_id: int, data: dict) -> Optional[PackagingUnit]:
        unit = await PackagingService.get_unit(db, unit_id)
        if not unit:
            return None
        
        for key, value in data.items():
            setattr(unit, key, value)
        
        await db.commit()
        await db.refresh(unit)
        return unit

    @staticmethod
    async def _check_auto_close_opening(db: AsyncSession, opening_id: int):
        """Проверяет, нужно ли автозакрыть рулон при низком остатке"""
        stmt = (
            select(PackagingOpening)
            .options(selectinload(PackagingOpening.consumption))
            .where(PackagingOpening.id == opening_id)
        )
        result = await db.execute(stmt)
        opening = result.scalar_one_or_none()
        
        if not opening or opening.status != 'active':
            return
        
        # Считаем текущий остаток
        total_consumed = sum(c.normative_qty for c in opening.consumption)
        current_remaining = opening.initial_qty - total_consumed
        
        # Если остаток < 10% от начального количества — автозакрываем
        threshold = opening.initial_qty * Decimal('0.10')
        
        if current_remaining <= threshold and current_remaining > 0:
            # Автозакрываем рулон
            await PackagingService.close_opening(
                db=db,
                opening_id=opening.id,
                final_qty=current_remaining,
                notes=f"Автозакрытие: остаток {current_remaining} ниже порога {threshold}"
            )

    # ============ PACKAGING OPENINGS ============
    
    @staticmethod
    async def open_unit(
        db: AsyncSession,
        packaging_unit_id: int,
        initial_qty: Decimal,
        opened_by: Optional[int] = None,
        notes: Optional[str] = None
    ) -> PackagingOpening:
        """Открытие рулона/пачки"""
        # Проверяем, что упаковка существует
        unit = await PackagingService.get_unit(db, packaging_unit_id)
        if not unit:
            raise ValueError("Единица упаковки не найдена")
        
        # Проверяем, что initial_qty не больше base_quantity
        if initial_qty > unit.base_quantity:
            raise ValueError(f"Начальное количество ({initial_qty}) не может быть больше базового ({unit.base_quantity})")
        
        opening = PackagingOpening(
            packaging_unit_id=packaging_unit_id,
            initial_qty=initial_qty,
            opened_by=opened_by,
            notes=notes,
            status='active'
        )
        db.add(opening)
        await db.commit()
        await db.refresh(opening)
        return opening

    @staticmethod
    async def close_opening(
        db: AsyncSession,
        opening_id: int,
        final_qty: Decimal,
        notes: Optional[str] = None
    ) -> Tuple[PackagingOpening, Optional[PackagingAdjustment]]:
        """Закрытие рулона с расчётом коэффициента корректировки"""
        # Загружаем открытие с связями
        stmt = (
            select(PackagingOpening)
            .options(
                selectinload(PackagingOpening.consumption),
                selectinload(PackagingOpening.packaging_unit)
            )
            .where(PackagingOpening.id == opening_id)
        )
        result = await db.execute(stmt)
        opening = result.scalar_one_or_none()
        
        if not opening:
            raise ValueError("Открытие не найдено")
        
        if opening.status != 'active':
            raise ValueError("Открытие уже закрыто")
        
        # Считаем нормативный расход (сумма всех consumption)
        normative_total = sum(
            record.normative_qty for record in opening.consumption
        )
        
        # Фактический расход = initial_qty - final_qty
        actual_total = opening.initial_qty - final_qty
        
        # Коэффициент корректировки
        if normative_total > 0:
            adjustment_factor = actual_total / normative_total
        else:
            adjustment_factor = Decimal('1.000')
        
        # Детекция аномалии
        is_anomaly = adjustment_factor > Decimal('1.1')
        anomaly_reason = None
        if is_anomaly:
            anomaly_reason = f"Коэффициент {adjustment_factor:.3f} превышает порог 1.1"
        
        # Влияние на себестоимость (разница между фактом и нормативом)
        unit = opening.packaging_unit
        cost_per_unit = unit.purchase_price / unit.base_quantity
        cost_impact = (actual_total - normative_total) * cost_per_unit
        
        # Обновляем открытие
        opening.status = 'closed'
        opening.closed_at = datetime.utcnow()
        opening.final_qty = final_qty
        if notes:
            opening.notes = notes
        
        # Создаём корректировку
        adjustment = PackagingAdjustment(
            opening_id=opening.id,
            normative_total=normative_total,
            actual_total=actual_total,
            adjustment_factor=adjustment_factor,
            is_anomaly=is_anomaly,
            anomaly_reason=anomaly_reason,
            cost_impact=cost_impact
        )
        db.add(adjustment)
        
        await db.commit()
        await db.refresh(opening)
        await db.refresh(adjustment)
        
        return opening, adjustment

    @staticmethod
    async def get_opening(db: AsyncSession, opening_id: int) -> Optional[PackagingOpening]:
        stmt = (
            select(PackagingOpening)
            .options(
                selectinload(PackagingOpening.consumption),
                selectinload(PackagingOpening.adjustments),
                selectinload(PackagingOpening.packaging_unit)
            )
            .where(PackagingOpening.id == opening_id)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_openings(
        db: AsyncSession,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[List[PackagingOpening], int]:
        stmt = select(PackagingOpening).options(
            selectinload(PackagingOpening.packaging_unit)
        )
        count_stmt = select(func.count(PackagingOpening.id))
        
        if status:
            stmt = stmt.where(PackagingOpening.status == status)
            count_stmt = count_stmt.where(PackagingOpening.status == status)
        
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0
        
        stmt = stmt.offset(skip).limit(limit).order_by(PackagingOpening.opened_at.desc())
        result = await db.execute(stmt)
        items = list(result.scalars().all())
        
        return items, total

    # ============ PACKAGING CONSUMPTION ============
    
    @staticmethod
    async def record_consumption(
        db: AsyncSession,
        opening_id: int,
        product_id: int,
        normative_qty: Decimal,
        normative_unit: str,
        sale_id: Optional[int] = None
    ) -> PackagingConsumption:
        """Запись нормативного расхода упаковки при продаже"""
        # Проверяем, что открытие активно
        stmt = select(PackagingOpening).where(PackagingOpening.id == opening_id)
        result = await db.execute(stmt)
        opening = result.scalar_one_or_none()
        
        if not opening:
            raise ValueError("Открытие не найдено")
        
        if opening.status != 'active':
            raise ValueError("Нельзя записывать расход в закрытое открытие")
        
        consumption = PackagingConsumption(
            opening_id=opening_id,
            sale_id=sale_id,
            product_id=product_id,
            normative_qty=normative_qty,
            normative_unit=normative_unit
        )
        db.add(consumption)
        await db.commit()
        await db.refresh(consumption)
        return consumption

    @staticmethod
    async def list_consumption(
        db: AsyncSession,
        opening_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[List[PackagingConsumption], int]:
        stmt = select(PackagingConsumption)
        count_stmt = select(func.count(PackagingConsumption.id))
        
        if opening_id:
            stmt = stmt.where(PackagingConsumption.opening_id == opening_id)
            count_stmt = count_stmt.where(PackagingConsumption.opening_id == opening_id)
        
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0
        
        stmt = stmt.offset(skip).limit(limit).order_by(PackagingConsumption.created_at.desc())
        result = await db.execute(stmt)
        items = list(result.scalars().all())
        
        return items, total

    # ============ PACKAGING ADJUSTMENTS ============
    
    @staticmethod
    async def list_adjustments(
        db: AsyncSession,
        is_anomaly: Optional[bool] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[List[PackagingAdjustment], int]:
        stmt = select(PackagingAdjustment).options(
            selectinload(PackagingAdjustment.opening)
        )
        count_stmt = select(func.count(PackagingAdjustment.id))
        
        if is_anomaly is not None:
            stmt = stmt.where(PackagingAdjustment.is_anomaly == is_anomaly)
            count_stmt = count_stmt.where(PackagingAdjustment.is_anomaly == is_anomaly)
        
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0
        
        stmt = stmt.offset(skip).limit(limit).order_by(PackagingAdjustment.created_at.desc())
        result = await db.execute(stmt)
        items = list(result.scalars().all())
        
        return items, total
