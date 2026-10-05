# Запуск BMWcodes: Vercel + Railway + Supabase

Сайт и админка — Vercel. ASP.NET Core API — Railway. PostgreSQL — Supabase.
Код готов к этой схеме, но ваши облачные проекты и секреты необходимо настроить отдельно.

## 1. Supabase — создать базу

1. Создай проект Supabase, сохрани пароль БД в менеджере паролей. Это НЕ пароль входа в Supabase и НЕ anon/service_role API key.
2. Открой SQL Editor. Вставь весь `backend/sql/001_bookings.sql` и выполни.
3. Будет создана таблица `bmw_private.bookings`. Скрипт можно выполнить повторно; он не удаляет данные.
4. Таблица находится в приватной схеме с RLS. Не добавляй bmw_private в exposed schemas и не создавай публичные политики чтения/записи. Браузер работает только с C# API.
5. Нажми Connect → Session pooler, открой параметры. Скопируй реальный Host и User: обычно пользователь выглядит как `postgres.PROJECT_REF`, порт — `5432`, база — `postgres`. Не используй Transaction pooler на 6543 в этой инструкции.

Собери строку для Npgsql (одной строкой):

```text
Host=HOST_FROM_SUPABASE;Port=5432;Database=postgres;Username=USER_FROM_SUPABASE;Password=YOUR_DATABASE_PASSWORD;SSL Mode=VerifyFull;GSS Encryption Mode=Disable;Maximum Pool Size=10
```

Подставляй параметры Session pooler, не адрес HTTPS API проекта. Символы пароля не URL-кодировать. Если пароль содержит `;`, заключи его значение в двойные кавычки: `Password="abc;def"`; внутренние кавычки удваиваются. Удобнее сгенерировать длинный случайный пароль без `;` и кавычек.

TLS проверяет сертификат и имя сервера. Если получена ошибка доверия CA, скачай CA из настроек Supabase, сохрани как `backend/certs/supabase-ca.crt` (публичный сертификат, не приватный ключ). Добавь в csproj внутри ItemGroup:

```xml
<Content Include="certs/supabase-ca.crt" CopyToPublishDirectory="PreserveNewest" />
```

Добавь `Root Certificate=/app/certs/supabase-ca.crt` к строке на Railway; локально укажи абсолютный путь к этому файлу. Не отключай VerifyFull для обхода ошибки.

## 2. Railway — запустить C# backend

1. Залей исходники из ZIP в свой GitHub-репозиторий. В архиве нет node_modules, .next, bin, obj и настоящих секретов.
2. В Railway создай сервис из этого репозитория.
3. В настройках сервиса укажи Root Directory: `/backend`. В этой папке уже есть Dockerfile. Он собирает и запускает .NET 10. Не задавай npm-команды и не создавай здесь сервис PostgreSQL: база уже в Supabase.
4. Variables:

| Переменная | Значение |
| --- | --- |
| DATABASE_CONNECTION_STRING | Строка Npgsql из шага 1 |
| ADMIN_USERNAME | Твой логин, например viktor |
| ADMIN_PASSWORD | Уникальный пароль минимум 16 символов |
| ADMIN_TOKEN_SECRET | Случайный секрет минимум 32 символа |
| RATE_LIMIT_SECRET | Другой случайный секрет минимум 32 символа |
| ALLOWED_ORIGINS | `https://YOUR-SITE.vercel.app` — точный адрес сайта без `/` в конце |
| TRUSTED_PROXY_IPS | Проверенные IP непосредственного Railway ingress, через запятую |
| TRUSTED_PROXY_NETWORKS | При необходимости: подтверждённые CIDR ingress, через запятую |
| FORWARDED_FOR_HEADER | `X-Real-IP` для Railway |
| ASPNETCORE_ENVIRONMENT | `Production` |

Можно сохранить уже созданные ADMIN_* и RATE_LIMIT_SECRET, если они соответствуют длинам. Смена ADMIN_TOKEN_SECRET завершает прежние сессии; смена RATE_LIMIT_SECRET сбрасывает сопоставление старых IP-хешей.

Для двух доменов: `https://YOUR-SITE.vercel.app,https://yourdomain.com`. Wildcard `*` не использовать. При смене домена обнови эту переменную. Если URL Vercel пока неизвестен, сначала создай там проект и получи его адрес, затем заверши настройку Railway.

5. Healthcheck Path: `/health`. Backend сам слушает `PORT`, который задаёт Railway; Start Command оставь пустым (используется Dockerfile).
6. Создай публичный HTTPS-домен сервиса в Networking / Generate Domain.
7. Открой `https://YOUR-API.up.railway.app/health`. Нужен ответ:

```json
{"status":"ok","database":"connected"}
```

503 означает проблему подключения/таблицы; смотри также переменные и статус проекта Supabase. Если приложение вообще не запустилось, проверь сообщения о недостающих настройках в Railway Logs. Не публикуй строку подключения в скриншотах.

Для backend не требуется Railway Volume: записи находятся в Supabase.

### Доверенный reverse proxy: обязательно проверить перед рабочим запуском

У Railway нет указанного в этом проекте универсального доверенного IP/CIDR. Значения не выдуманы и автоматически все адреса не разрешаются.

1. Временно установи `LOG_PROXY_PEER=true` на Railway и открой `/health` через публичный домен сервиса. В логах будет `Immediate proxy peer: ...` — адрес непосредственного соединения до обработки заголовков. Заголовки клиента при этом не логируются.
2. Уточни у Railway актуальные адреса/диапазоны ingress для сервиса. Сверь их с наблюдаемым адресом. Разрешай только подтверждённые proxy IP в `TRUSTED_PROXY_IPS` или подтверждённые сети в `TRUSTED_PROXY_NETWORKS`. Одна наблюдаемая IP не гарантирует весь пул; адреса могут измениться при передеплое.
3. `FORWARDED_FOR_HEADER=X-Real-IP`, лимит цепочки — один хоп. Middleware проверяет socket peer до принятия заголовка. Код приложения читает только `RemoteIpAddress` после middleware.
4. Отключи `LOG_PROXY_PEER` после настройки. Не ставь `0.0.0.0/0`, `::/0` или всю приватную сеть ради обхода настройки. Не открывай контейнер напрямую по публичному TCP.
5. Если список пустой, middleware не запускается. Поддельные заголовки игнорируются, но клиенты одного ingress будут делить общий лимит — это безопасный режим до настройки, а не готовая настройка для публичного запуска.

Если ingress не предоставляет стабильный доверенный диапазон, используй управляемый reverse proxy с известным адресом и закрытым прямым доступом к backend. Не отключай проверку доверия ради удобства.

## 3. Vercel — сайт

1. Импортируй тот же репозиторий. Framework: Next.js. Root Directory: корень проекта, не backend.
2. В Environment Variables добавь:

```text
NEXT_PUBLIC_BOOKING_API_URL=https://YOUR-API.up.railway.app/api/bookings
```

3. Укажи нужные окружения и запусти Redeploy. NEXT_PUBLIC-переменная встраивается при сборке; одной смены настройки недостаточно.
4. Пароль БД и ADMIN_* на Vercel НЕ добавлять. Supabase JS SDK и anon/service_role keys этому проекту не нужны.
5. Проверь, что реальный URL сайта есть в ALLOWED_ORIGINS на Railway. Для Vercel Preview нужны отдельные явно разрешённые origins; произвольные preview-адреса автоматически не допускаются.

## 4. Проверка после запуска

- Открой /booking, отправь одну тестовую заявку с допустимыми полями и датой.
- Должен появиться экран Request received с телефоном и выбранной датой. Не повторяй отправку, если уже видишь успех.
- Открой /admin, войди своими ADMIN_USERNAME и ADMIN_PASSWORD.
- Найди тестовую заявку. Перезапусти backend Railway и проверь, что заявка осталась.
- После пяти заявок с одного IP за шесть часов ожидается 429. Не отключай лимит ради теста на рабочей базе.

## 5. Старые заявки из файла

Они НЕ появятся в Supabase автоматически. Скопируй прежний `backend/App_Data/bookings.jsonl`, останови старый backend и следуй импорту из `backend/README_ADMIN.md`. Рекомендуется выполнять импорт локально через dotnet user-secrets до переключения рабочего сайта. Исходный файл не удалять, пока не проверишь перенос.

## 6. Резервные копии

Пересборка Railway теперь не удаляет заявки. Это не заменяет резервное копирование самой базы. Проверь доступные бэкапы/восстановление на своём тарифе Supabase; не считай их настроенными автоматически этим ZIP. Для независимой копии можно делать pg_dump PostgreSQL (не хранить копии с телефонами клиентов в GitHub):

```powershell
# Параметры Session pooler. pg_dump запросит пароль интерактивно.
$env:PGSSLMODE = "verify-full"
pg_dump --host=POOLER_HOST --port=5432 --username=postgres.PROJECT_REF --dbname=postgres --schema=bmw_private --format=custom --file=bmwcodes-backup.dump --password
```

Если нужен CA, задай PGSSLROOTCERT. Храни копии отдельно от рабочего проекта, с ограниченным доступом. Расписание бэкапов этим кодом не создаётся.

## Частые проблемы

- «Password authentication failed»: нужен пароль базы и User именно из Session pooler, не пароль админки сайта.
- «relation bmw_private.bookings does not exist»: запусти SQL из шага 1 в правильном проекте Supabase.
- /health работает, браузер не отправляет заявки: проверь HTTPS URL API, ALLOWED_ORIGINS и сделай Redeploy Vercel.
- Backend не стартует после замены ZIP: добавь DATABASE_CONNECTION_STRING и ALLOWED_ORIGINS; эта версия намеренно не возвращается к файлу.
- /admin показывает максимум 500 записей; старые заявки остаются в БД.
- REQUEST RECEIVED значит, что заявка записана. Это не автоматическое подтверждение свободного времени, не SMS и не email.

## Официальные инструкции

- Supabase подключения: https://supabase.com/docs/guides/database/connecting-to-postgres
- Npgsql TLS: https://www.npgsql.org/doc/security.html
- Railway healthchecks: https://docs.railway.com/deployments/healthchecks
- Railway network headers: https://docs.railway.com/networking/public-networking/specs-and-limits

## Оплата сервисов

Отдельно ассистенту за ZIP или деплой переводить деньги не нужно. Хостинги оплачиваются напрямую в твоих аккаунтах. Ни платный тариф, ни списание средств этим архивом не включаются.

Ориентиры по официальным страницам, проверенным 05.10.2026 (USD, возможны налоги и доплата за ресурсы):

| Сервис | Базовая стоимость | Как оплачивать |
| --- | --- | --- |
| Vercel Pro | от $20/месяц | Settings → Billing → выбрать Pro, проверить сумму и добавить карту |
| Railway Hobby | $5/месяц, включает $5 использования; превышение оплачивается дополнительно | Workspace → Billing / Plans → выбрать тариф, добавить карту, настроить ограничения расходов |
| Supabase | Free — $0; Pro — от $25/месяц | Organization → Billing → выбрать тариф и добавить карту; проверить compute/add-ons |

Vercel Hobby предназначен для личного некоммерческого использования; для сайта бизнеса учитывай платный тариф. Supabase Free можно использовать для тестов в рамках лимитов, но проверь ограничения, паузу неактивных проектов и доступность бэкапов. Базовая арифметика с Pro у Vercel/Supabase и Hobby Railway — от $50/месяц; это не гарантия итогового счёта. Домен и превышение лимитов оплачиваются отдельно, если не включены в конкретный тариф. При работе для клиента желательно создавать счета и проекты на владельца бизнеса либо явно согласовать, кто платит.

Перед подтверждением оплаты сверяй актуальную сумму в checkout. Не присылай номер карты, CVV, пароли или секреты в чат. Можно прислать скрин настроек с закрытыми значениями.

- https://vercel.com/pricing
- https://vercel.com/docs/plans/hobby
- https://railway.com/pricing
- https://supabase.com/pricing

## Дополнение после аудита V10

Используйте Node.js 22.12+ (ветка 22) или 24. Перед production-сборкой задайте `NEXT_PUBLIC_BOOKING_API_URL=https://ВАШ-API.up.railway.app/api/bookings` в Vercel. Отсутствующий URL, HTTP, другой путь, credentials/query/hash теперь останавливают сборку. Переменная публичная и не должна содержать секрет. После её изменения нужен новый deployment frontend.

Локальная разработка: `npm run dev`. Проверка типов: `npm run typecheck`. ESLint в проекте не настроен. Полный результат аудита, исправления и оставшиеся условия запуска находятся в `AUDIT_RU.md`. Пока Privacy пустая, текст нужно согласовать до публичного запуска. Счётчик входа админки рассчитан на один процесс; при нескольких репликах добавьте общее ограничение.
