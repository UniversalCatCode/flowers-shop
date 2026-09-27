import os
import asyncio
import time
import json
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import Message
from dotenv import load_dotenv
import httpx

# Загружаем переменные окружения
load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
API_URL = "http://127.0.0.1:8000"

# Учетные данные для авторизации бота в API
BOT_USERNAME = os.getenv("BOT_USERNAME", "bot_user")
BOT_PASSWORD = os.getenv("BOT_PASSWORD", "bot_password")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# Кэш для токена (чтобы не логиниться при каждом сообщении)
access_token_cache = {"token": None, "expires_at": 0}

async def get_access_token() -> str:
    """Получает JWT-токен через логин/пароль"""
    # Если токен еще валиден (с запасом 5 минут), возвращаем его
    if access_token_cache["token"] and access_token_cache["expires_at"] > time.time() + 300:
        print("🔑 Используем кэшированный токен")
        return access_token_cache["token"]
    
    print("🔐 Получаем новый токен через /users/login...")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{API_URL}/users/login",
            json={"username": BOT_USERNAME, "password": BOT_PASSWORD}
        )
        if response.status_code == 200:
            print("✅ Токен успешно получен")
            token_data = response.json()
            access_token_cache["token"] = token_data["access_token"]
            access_token_cache["expires_at"] = time.time() + 3600  # Кэшируем на 1 час
            return access_token_cache["token"]
        else:
            print(f"❌ Ошибка получения токена: {response.text}")
            raise Exception(f"Не удалось получить токен: {response.status_code} - {response.text}")

async def api_get(endpoint: str):
    """Делает GET-запрос к API с авторизацией"""
    token = await get_access_token()
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{API_URL}{endpoint}",
            headers={"Authorization": f"Bearer {token}"}
        )
        return response

async def api_post(endpoint: str, json_data: dict):
    """Делает POST-запрос к API с авторизацией"""
    token = await get_access_token()
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{API_URL}{endpoint}",
            content=json.dumps(json_data, ensure_ascii=False),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
        )
        return response

# Хранилище состояния для пошагового ввода продажи
sale_sessions = {}

@dp.message(Command("start"))
async def cmd_start(message: Message):
    await message.answer(
        "🌸 Привет! Я бот цветочного магазина.\n\n"
        "Доступные команды:\n"
        "/stock <SKU> - проверить остаток товара\n"
        "/sell - начать оформление продажи"
    )

@dp.message(Command("stock"))
async def cmd_stock(message: Message):
    parts = message.text.split()
    if len(parts) < 2:
        await message.answer("❌ Использование: /stock <SKU>\nПример: /stock ROSE-SOLAYA")
        return
    
    sku = parts[1].upper()
    
    try:
        response = await api_get("/inventory/stock")
        if response.status_code == 200:
            stock_data = response.json()
            item = next((x for x in stock_data if x['sku'].upper() == sku), None)
            if item:
                await message.answer(f"✅ *{item['product_name']}*\nОстаток: *{item.get('total_quantity', 0)}* шт.", parse_mode="Markdown")
            else:
                await message.answer(f"❌ Товар с SKU `{sku}` не найден или остаток равен 0.")
        else:
            await message.answer(f"❌ Ошибка при получении данных с сервера. Код: {response.status_code}")
    except Exception as e:
        await message.answer(f"❌ Критическая ошибка: {str(e)}")

@dp.message(Command("sell"))
async def cmd_sell_start(message: Message):
    sale_sessions[message.from_user.id] = {"step": "sku"}
    await message.answer("🛒 Введите SKU товара для продажи:")

@dp.message(F.text)
async def handle_sale_input(message: Message):
    user_id = message.from_user.id
    if user_id not in sale_sessions:
        return
    
    session = sale_sessions[user_id]
    text = message.text.strip()

    if session["step"] == "sku":
        try:
            response = await api_get("/catalog/products?limit=500")
            if response.status_code == 200:
                products = response.json().get("items", response.json())
                product = next((p for p in products if p["sku"].upper() == text.upper()), None)
                
                if product:
                    session["product_id"] = product["id"]
                    session["product_name"] = product["name"]
                    session["sku"] = product["sku"]
                    session["step"] = "qty"
                    
                    stock_resp = await api_get("/inventory/stock")
                    if stock_resp.status_code == 200:
                        stock_data = stock_resp.json()
                        stock_item = next((x for x in stock_data if x["product_id"] == product["id"]), None)
                        current_stock = stock_item.get("total_quantity", 0) if stock_item else 0
                        
                        await message.answer(f"📦 *{product['name']}*\nТекущий остаток: *{current_stock}* шт.\n\nВведите количество для продажи:", parse_mode="Markdown")
                    else:
                        await message.answer(f"❌ Ошибка получения остатков. Код: {stock_resp.status_code}")
                else:
                    await message.answer(f"❌ Товар с SKU `{text.upper()}` не найден. Попробуйте еще раз или нажмите /sell для отмены.")
            else:
                await message.answer(f"❌ Ошибка связи с сервером. Код: {response.status_code}")
        except Exception as e:
            await message.answer(f"❌ Критическая ошибка: {str(e)}")

    elif session["step"] == "qty":
        try:
            qty = float(text.replace(',', '.'))
            if qty <= 0:
                raise ValueError
            session["qty"] = qty
            session["step"] = "price"
            await message.answer("💰 Введите цену продажи за единицу (или напишите '0', чтобы использовать цену по умолчанию):")
        except ValueError:
            await message.answer("❌ Пожалуйста, введите корректное число (например, 5 или 2.5).")

    elif session["step"] == "price":
        try:
            price = float(text.replace(',', '.'))
            session["price"] = price if price > 0 else None
            session["step"] = "confirm"
            
            total = session["qty"] * (session["price"] or 0)
            await message.answer(
                f"📋 *Проверьте данные:*\n"
                f"Товар: {session['product_name']}\n"
                f"Количество: {session['qty']} шт.\n"
                f"Цена за шт: {session['price'] or 'По умолчанию'} ₽\n"
                f"Итого: {total:.2f} ₽\n\n"
                f"Напишите *ДА* для подтверждения или *ОТМЕНА*:", 
                parse_mode="Markdown"
            )
        except ValueError:
            await message.answer("❌ Пожалуйста, введите корректную цену числом.")

    elif session["step"] == "confirm":
        if text.upper() in ["ДА", "YES", "OK"]:
            sale_payload = {
                "sale_number": f"BOT-{session['sku']}-{int(session['qty'])}",
                "items": [
                    {
                        "product_id": int(session["product_id"]),
                        "quantity": float(session["qty"]),
                        "unit_price": float(session["price"]) if session["price"] else 0.0
                    }
                ]
            }
            
            print(f"📤 Отправляем payload: {sale_payload}")
            
            try:
                response = await api_post("/sales", sale_payload)
                print(f"📥 Ответ от сервера: {response.status_code} - {response.text}")
                
                if response.status_code in [200, 201]:
                    await message.answer("✅ *Продажа успешно оформлена!* Остатки обновлены.", parse_mode="Markdown")
                else:
                    error_detail = response.json().get("detail", "Неизвестная ошибка")
                    await message.answer(f"❌ Ошибка при создании продажи: {error_detail}")
            except Exception as e:
                print(f"❌ Критическая ошибка при отправке: {e}")
                await message.answer(f"❌ Критическая ошибка: {str(e)}")
        else:
            await message.answer("❌ Продажа отменена.")
        
        del sale_sessions[user_id]

async def main():
    print("🤖 Бот запущен и ожидает сообщения...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())

