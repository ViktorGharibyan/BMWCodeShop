# BMWcodes backend — Supabase PostgreSQL

Подробная инструкция: `../DEPLOY_RU.md`.

- Runtime: .NET 10; драйвер PostgreSQL: Npgsql 10.
- Новые заявки хранятся только в `bmw_private.bookings` в Supabase.
- JSONL больше не используется для новых заявок. Старый файл можно импортировать.
- Скрипт создания таблицы: `sql/001_bookings.sql`. Запустить в Supabase SQL Editor до старта backend.
- `GET /health` проверяет соединение и наличие таблицы; 200 = готов, 503 = база недоступна.
- `POST /api/bookings`: проверка полей, запись в БД, ответ 201 с `bookingId` только после commit.
- Лимит: пять заявок с одного IP за шесть часов; транзакционная блокировка действует между экземплярами backend.
- `POST /api/admin/login`: логин и пароль из секретов; подписанный токен на 12 часов.
- `GET /api/admin/bookings`: последние 500 заявок, только с авторизацией.
- Лимит входа: пять попыток за 15 минут на IP, хранится в памяти экземпляра и сбрасывается при перезапуске.
- Токен админки хранится в sessionStorage браузера; пароль БД браузеру не передаётся.
- `TRUSTED_PROXY_IPS` / `TRUSTED_PROXY_NETWORKS`: явный список доверенных непосредственных прокси. `ForwardedHeaders` принимает IP только от них. Без списка заголовки игнорируются. Подробная настройка — в DEPLOY_RU.md.
- CORS разрешает только origins из ALLOWED_ORIGINS. Это ограничение браузера, не замена авторизации.
- При недоступной БД возвращается 503: скрытого сохранения в локальный файл нет.

## Локально

Установить .NET 10 SDK. В папке backend:

```powershell
dotnet user-secrets set "DATABASE_CONNECTION_STRING" 'Host=POOLER_HOST;Port=5432;Database=postgres;Username=postgres.PROJECT_REF;Password=DB_PASSWORD;SSL Mode=VerifyFull;GSS Encryption Mode=Disable'
dotnet user-secrets set "ADMIN_USERNAME" "viktor"
dotnet user-secrets set "ADMIN_PASSWORD" "YOUR_UNIQUE_PASSWORD_16_PLUS_CHARS"
dotnet user-secrets set "ADMIN_TOKEN_SECRET" "YOUR_RANDOM_SECRET_32_PLUS_CHARS"
dotnet user-secrets set "RATE_LIMIT_SECRET" "YOUR_OTHER_RANDOM_SECRET_32_PLUS_CHARS"
dotnet run
```

UserSecretsId уже есть в csproj; повторный `init` не нужен.
Локально разрешён http://localhost:3000, API запускается на http://localhost:5080.
Файл .env.example — справочник: ASP.NET не загружает .env автоматически.

## Перенос прежних заявок

После создания таблицы, настройки строки подключения и остановки старого backend:

```powershell
dotnet run -- --import-jsonl "C:\path\to\bookings.jsonl"
```

Импорт — одна транзакция. Ошибка строки отменяет весь импорт. Повторный импорт того же неизменённого файла не создаёт дублей. Порядок строк/их содержание менять не нужно. Разные одинаковые строки файла сохраняются как отдельные заявки. Исходный файл остаётся на месте. Сохраните копию до импорта и проверьте записи через админку.
