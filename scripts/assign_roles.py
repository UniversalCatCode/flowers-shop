"""
Назначение ролей существующим пользователям.
Запуск: python scripts/assign_roles.py
"""
import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import async_session_maker
from app.users.models import User, Role, user_roles


# Маппинг: username → роль
USER_ROLES_MAPPING = {
    "m.razumov": "admin", # Твой админский аккаунт
    "test":"florist"  
    # Добавь других пользователей по мере необходимости:
    # "florist1": "florist",
    # "manager1": "manager",
}


async def assign_roles():
    async with async_session_maker() as session:
        for username, role_name in USER_ROLES_MAPPING.items():
            # Находим пользователя
            result = await session.execute(
                select(User).where(User.username == username)
            )
            user = result.scalar_one_or_none()
            
            if not user:
                print(f"⚠️  Пользователь '{username}' не найден, пропускаем")
                continue
            
            # Находим роль
            result = await session.execute(
                select(Role).where(Role.name == role_name)
            )
            role = result.scalar_one_or_none()
            
            if not role:
                print(f"⚠️  Роль '{role_name}' не найдена, пропускаем")
                continue
            
            # Проверяем, есть ли уже эта роль
            result = await session.execute(
                select(user_roles).where(
                    user_roles.c.user_id == user.id,
                    user_roles.c.role_id == role.id
                )
            )
            if result.first():
                print(f"ℹ️  Роль '{role_name}' уже назначена пользователю '{username}'")
                continue
            
            # Назначаем роль
            await session.execute(
                user_roles.insert().values(
                    user_id=user.id,
                    role_id=role.id
                )
            )
            print(f"✅ Роль '{role_name}' назначена пользователю '{username}'")
        
        await session.commit()
        print("\n🎉 Роли назначены!")


if __name__ == "__main__":
    asyncio.run(assign_roles())
