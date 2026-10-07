from datetime import datetime, timezone
from typing import Optional, List, Tuple
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.stores.models import AvailabilityAlert


class AlertService:
    """Сервис для управления алертами о нехватке ресурсов"""

    @staticmethod
    async def create_alert(
        db: AsyncSession,
        alert_type: str,
        product_id: Optional[int],
        required_qty: float,
        available_qty: float,
        batch_id: Optional[int] = None,
        recommendations: Optional[dict] = None
    ) -> AvailabilityAlert:
        """Создаёт алерт о нехватке ресурса"""
        shortage_qty = required_qty - available_qty
        
        alert = AvailabilityAlert(
            alert_type=alert_type,
            product_id=product_id,
            batch_id=batch_id,
            required_qty=required_qty,
            available_qty=available_qty,
            shortage_qty=shortage_qty,
            recommendations=recommendations,
            status='active'
        )
        db.add(alert)
        await db.commit()
        await db.refresh(alert)
        return alert

    @staticmethod
    async def get_active_alerts(
        db: AsyncSession,
        alert_type: Optional[str] = None,
        product_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[List[AvailabilityAlert], int]:
        """Получает список активных алертов"""
        stmt = select(AvailabilityAlert).where(AvailabilityAlert.status == 'active')
        count_stmt = select(func.count(AvailabilityAlert.id)).where(AvailabilityAlert.status == 'active')
        
        if alert_type:
            stmt = stmt.where(AvailabilityAlert.alert_type == alert_type)
            count_stmt = count_stmt.where(AvailabilityAlert.alert_type == alert_type)
        
        if product_id:
            stmt = stmt.where(AvailabilityAlert.product_id == product_id)
            count_stmt = count_stmt.where(AvailabilityAlert.product_id == product_id)
        
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0
        
        stmt = stmt.offset(skip).limit(limit).order_by(AvailabilityAlert.created_at.desc())
        result = await db.execute(stmt)
        items = list(result.scalars().all())
        
        return items, total

    @staticmethod
    async def resolve_alert(
        db: AsyncSession,
        alert_id: int,
        resolved_by: int,
        notes: Optional[str] = None
    ) -> Optional[AvailabilityAlert]:
        """Закрывает алерт"""
        stmt = select(AvailabilityAlert).where(AvailabilityAlert.id == alert_id)
        result = await db.execute(stmt)
        alert = result.scalar_one_or_none()
        
        if not alert:
            return None
        
        if alert.status != 'active':
            raise ValueError(f"Алерт уже закрыт (статус: {alert.status})")
        
        alert.status = 'resolved'
        alert.resolved_at = datetime.now(timezone.utc)
        alert.resolved_by = resolved_by
        
        if notes and alert.recommendations:
            alert.recommendations['resolution_notes'] = notes
        elif notes:
            alert.recommendations = {'resolution_notes': notes}
        
        await db.commit()
        await db.refresh(alert)
        return alert
