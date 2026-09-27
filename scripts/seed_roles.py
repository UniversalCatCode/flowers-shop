"""
Скрипт для заполнения таблиц roles и permissions начальными данными.
Обновлено под ТЗ v1.2: добавлены права для жизненного цикла заказа и упаковки.
"""
import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import async_session_maker
from app.users.models import Role, Permission


# ============ ПРАВА ============
PERMISSIONS_DATA = [
    # Catalog (существующие)
    ("catalog.products.read", "Просмотр товаров"),
    ("catalog.products.write", "Создание/редактирование товаров"),
    ("catalog.products.delete", "Удаление товаров"),
    ("catalog.categories.read", "Просмотр категорий"),
    ("catalog.categories.write", "Создание/редактирование категорий"),
    ("catalog.recipes.read", "Просмотр рецептов"),
    ("catalog.recipes.write", "Создание/редактирование рецептов"),
    ("catalog.suppliers.read", "Просмотр поставщиков"),
    ("catalog.suppliers.write", "Создание/редактирование поставщиков"),
    
    # Inventory (существующие + новые для v1.2)
    ("inventory.receipts.read", "Просмотр поступлений"),
    ("inventory.receipts.write", "Создание поступлений"),
    ("inventory.write_offs.read", "Просмотр списаний"),
    ("inventory.write_offs.write", "Создание списаний"),
    ("inventory.stock.read", "Просмотр остатков"),
    ("inventory.packaging.read", "Просмотр упаковки"),
    ("inventory.packaging.open", "Открытие рулона/пачки"),
    ("inventory.packaging.close", "Закрытие рулона/пачки"),
    
    # Sales (существующие)
    ("sales.read", "Просмотр продаж"),
    ("sales.create", "Создание продаж"),
    ("sales.delete", "Удаление продаж"),
    
    # Order lifecycle (НОВЫЕ для ТЗ v1.2)
    ("order.assemble", "Сборка заказа"),
    ("order.substitute", "Замена компонентов при сборке"),
    ("order.cancel", "Отмена заказа"),
    ("order.return", "Оформление возврата"),
    ("order.ship", "Отгрузка заказа"),
    
    # Finance (существующие)
    ("finance.pricing.read", "Просмотр правил ценообразования"),
    ("finance.pricing.write", "Редактирование правил ценообразования"),
    ("finance.targets.read", "Просмотр целевых показателей"),
    ("finance.targets.write", "Редактирование целевых показателей"),
    
    # Reports (существующие)
    ("reports.view", "Просмотр отчётов"),
    
    # Users (существующие)
    ("users.read", "Просмотр пользователей"),
    ("users.write", "Создание/редактирование пользователей"),
    ("users.delete", "Удаление пользователей"),
    ("users.roles.manage", "Управление ролями пользователей"),
    
    # System (существующие)
    ("system.settings.read", "Просмотр системных настроек"),
    ("system.settings.write", "Редактирование системных настроек"),
]

# ============ РОЛИ ============
ROLES_DATA = [
    # 1. Admin — полный доступ
    {
        "name": "admin",
        "description": "Администратор системы. Имеет полный доступ ко всем функциям.",
        "permissions": [p[0] for p in PERMISSIONS_DATA],
    },
    
    # 2. Manager — управляющий
    {
        "name": "manager",
        "description": "Менеджер. Может управлять каталогом, продажами, складом, финансами, заказами.",
        "permissions": [
            # Catalog
            "catalog.products.read", "catalog.products.write", "catalog.products.delete",
            "catalog.categories.read", "catalog.categories.write",
            "catalog.recipes.read", "catalog.recipes.write",
            "catalog.suppliers.read", "catalog.suppliers.write",
            # Inventory
            "inventory.receipts.read", "inventory.receipts.write",
            "inventory.write_offs.read", "inventory.write_offs.write",
            "inventory.stock.read",
            "inventory.packaging.read", "inventory.packaging.open", "inventory.packaging.close",
            # Sales + Order lifecycle
            "sales.read", "sales.create", "sales.delete",
            "order.assemble", "order.substitute", "order.cancel", "order.return", "order.ship",
            # Finance
            "finance.pricing.read", "finance.pricing.write",
            "finance.targets.read", "finance.targets.write",
            # Reports + Users
            "reports.view", "users.read", "users.write",
        ],
    },
    
    # 3. Senior Florist — старший флорист (НОВАЯ)
    {
        "name": "senior_florist",
        "description": "Старший флорист. Сборка заказов, замены компонентов, списания, работа с упаковкой.",
        "permissions": [
            # Catalog (только чтение)
            "catalog.products.read", "catalog.recipes.read",
            # Inventory
            "inventory.stock.read", "inventory.write_offs.read", "inventory.write_offs.write",
            "inventory.packaging.read", "inventory.packaging.open", "inventory.packaging.close",
            # Sales + Order lifecycle (с заменами)
            "sales.read", "sales.create",
            "order.assemble", "order.substitute", "order.cancel", "order.ship",
        ],
    },
    
    # 4. Florist — флорист (НОВАЯ, заменяет cashier)
    {
        "name": "florist",
        "description": "Флорист. Базовые операции: сборка заказов без замен, просмотр остатков.",
        "permissions": [
            "catalog.products.read", "catalog.recipes.read",
            "inventory.stock.read", "inventory.packaging.read",
            "sales.read", "sales.create",
            "order.assemble", "order.ship",
        ],
    },
    
    # 5. Receiver — приёмщик (НОВАЯ)
    {
        "name": "receiver",
        "description": "Приёмщик. Приёмка товара, фиксация брака, просмотр каталога.",
        "permissions": [
            "catalog.products.read", "catalog.suppliers.read",
            "inventory.receipts.read", "inventory.receipts.write",
            "inventory.stock.read",
        ],
    },
    
    # 6. Cashier — кассир (оставляем для обратной совместимости)
    {
        "name": "cashier",
        "description": "Кассир. Может создавать продажи и просматривать остатки.",
        "permissions": [
            "sales.create", "sales.read",
            "inventory.stock.read",
            "catalog.products.read",
        ],
    },
    
    # 7. Viewer — наблюдатель (оставляем)
    {
        "name": "viewer",
        "description": "Наблюдатель. Только чтение данных и отчётов.",
        "permissions": [
            "catalog.products.read", "catalog.categories.read", "catalog.recipes.read",
            "catalog.suppliers.read",
            "inventory.receipts.read", "inventory.write_offs.read", "inventory.stock.read",
            "inventory.packaging.read",
            "sales.read",
            "finance.pricing.read", "finance.targets.read",
            "reports.view", "users.read", "system.settings.read",
        ],
    },
]


async def seed_roles_and_permissions():
    async with async_session_maker() as session:
        # 1. Создаём права
        existing_perms_result = await session.execute(select(Permission.name))
        existing_perms = set(existing_perms_result.scalars().all())

        new_perms_count = 0
        for perm_name, perm_description in PERMISSIONS_DATA:
            if perm_name not in existing_perms:
                perm = Permission(name=perm_name, description=perm_description)
                session.add(perm)
                new_perms_count += 1

        await session.flush()
        print(f"✅ Создано {new_perms_count} новых прав (всего {len(PERMISSIONS_DATA)})")

        # 2. Загружаем все права в память
        all_perms_result = await session.execute(select(Permission))
        all_perms = {p.name: p for p in all_perms_result.scalars().all()}

        # 3. Создаём или обновляем роли
        for role_data in ROLES_DATA:
            stmt = (
                select(Role)
                .where(Role.name == role_data["name"])
                .options(selectinload(Role.permissions))
            )
            result = await session.execute(stmt)
            role = result.scalar_one_or_none()

            if not role:
                role = Role(name=role_data["name"], description=role_data["description"])
                session.add(role)
                print(f"✅ Создана новая роль: {role.name}")
                role.permissions = []
            else:
                print(f"ℹ️  Роль найдена, обновляем права: {role.name}")
                role.permissions = []

            # Добавляем права
            for perm_name in role_data["permissions"]:
                perm = all_perms.get(perm_name)
                if perm:
                    role.permissions.append(perm)
                else:
                    print(f"⚠️  Право {perm_name} не найдено!")

        await session.commit()
        print("\n🎉 Roles and permissions seeded successfully!")
        print(f"📊 Итого: {len(ROLES_DATA)} ролей, {len(PERMISSIONS_DATA)} прав")


if __name__ == "__main__":
    asyncio.run(seed_roles_and_permissions())
