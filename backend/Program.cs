using System.Collections.Concurrent;
using System.Buffers.Binary;
using System.Data;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

var adminUsername = builder.Configuration["ADMIN_USERNAME"] ?? string.Empty;
var adminPassword = builder.Configuration["ADMIN_PASSWORD"] ?? string.Empty;
var tokenSecret = builder.Configuration["ADMIN_TOKEN_SECRET"] ?? string.Empty;
var rateLimitSecret = builder.Configuration["RATE_LIMIT_SECRET"] ?? tokenSecret;
var databaseUrl = builder.Configuration["DATABASE_URL"] ?? string.Empty;
var databaseConnectionString = NormalizePostgresConnectionString(databaseUrl);
var usePostgres = !string.IsNullOrWhiteSpace(databaseConnectionString);

var allowedOrigins = (builder.Configuration["ALLOWED_ORIGINS"] ?? string.Empty)
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

if (builder.Environment.IsDevelopment() && allowedOrigins.Length == 0)
{
    allowedOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
}

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        }
    });
});

var app = builder.Build();
var requireTrustedProxy = !app.Environment.IsDevelopment();

// Also apply CORS to proxy-verification failures, so the frontend can read 503.
app.UseCors();
app.Use(async (context, next) =>
{
    var endpointPath = context.Request.Path.Value?.TrimEnd('/');
    var protectsIpLimit = HttpMethods.IsPost(context.Request.Method) &&
        (string.Equals(endpointPath, "/api/bookings", StringComparison.OrdinalIgnoreCase) ||
         string.Equals(endpointPath, "/api/admin/login", StringComparison.OrdinalIgnoreCase));
    if (requireTrustedProxy && protectsIpLimit)
    {
        var header = context.Request.Headers["X-Real-IP"];
        if (header.Count != 1 || !IPAddress.TryParse(header[0], out var parsedClientIp))
        {
            app.Logger.LogWarning("IP limit refused request: Railway did not supply one valid X-Real-IP header.");
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            context.Response.Headers.RetryAfter = "60";
            await context.Response.WriteAsJsonAsync(new { message = "This request is temporarily unavailable. Please try again later." });
            return;
        }
        context.Items["VerifiedClientIp"] = NormalizeIp(parsedClientIp)!.ToString();
    }

    await next(context);
});

var allowedServices = new HashSet<string>(new[]
{
    "ADVANCED CODING",
    "ECU / TCU TUNING",
    "DME / ECU UNLOCKS",
    "PERFORMANCE INSTALL",
    "REPAIRS / SERVICE",
    "RETROFITS / MORE",
    "Other",
}, StringComparer.Ordinal);

var fileLock = new SemaphoreSlim(1, 1);
var loginAttempts = new ConcurrentDictionary<string, LoginAttempt>(StringComparer.Ordinal);
var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);

if (usePostgres)
{
    await EnsureDatabaseAsync(databaseConnectionString);
}

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    storage = usePostgres ? "postgres" : "local-file",
}));

app.MapPost("/api/bookings", async (BookingRequest request, HttpContext context, IWebHostEnvironment environment) =>
{
    if (!string.IsNullOrEmpty(request.Website))
        return Results.BadRequest(new { message = "Could not submit the request." });

    var name = CleanText(request.Name, 80);
    var phone = NormalizePhone(request.Phone);
    var vehicle = CleanText(request.Vehicle, 100);
    var service = CleanText(request.Service, 100);
    var preferredDate = request.PreferredDate?.Trim() ?? string.Empty;
    var message = CleanText(request.Message, 1000);

    var validation = new Dictionary<string, string[]>();

    if (string.IsNullOrWhiteSpace(name) || !Regex.IsMatch(name, @"^[\p{L}\p{M}\s.'-]+$"))
        validation["name"] = ["Enter a valid name."];

    if (phone is null)
        validation["phone"] = ["Enter a valid US phone number."];

    if (string.IsNullOrWhiteSpace(vehicle) || !Regex.IsMatch(vehicle, @"^[\p{L}\p{N}\s#./,()\-]+$"))
        validation["vehicle"] = ["Enter a valid vehicle description."];

    if (!allowedServices.Contains(service))
        validation["service"] = ["Select one of the listed services."];

    DateOnly preferredDateValue = default;
    if (!DateOnly.TryParseExact(preferredDate, "yyyy-MM-dd", out preferredDateValue))
    {
        validation["preferredDate"] = ["Choose a valid date."];
    }
    else
    {
        var today = GetShopDate();
        var maxDate = today.AddMonths(1);
        if (preferredDateValue < today || preferredDateValue > maxDate)
            validation["preferredDate"] = [$"Choose a date from {today:yyyy-MM-dd} through {maxDate:yyyy-MM-dd}."];
    }

    if (validation.Count > 0)
        return Results.ValidationProblem(validation);

    var ipAddress = requireTrustedProxy
        ? context.Items["VerifiedClientIp"] as string
        : NormalizeIp(context.Connection.RemoteIpAddress)?.ToString();
    if (ipAddress is null)
        return Results.Problem("Client address could not be verified.", statusCode: StatusCodes.Status503ServiceUnavailable);
    var ipHash = HashIp(ipAddress, rateLimitSecret);
    var now = DateTimeOffset.UtcNow;
    var since = now.AddHours(-6);

    if (usePostgres)
    {
        var retryAfter = await TryInsertBookingPostgresAsync(
            databaseConnectionString,
            new BookingRecord(name!, phone!, vehicle!, service!, preferredDate, message, now, ipHash),
            context.RequestAborted);
        if (retryAfter is not null)
        {
            context.Response.Headers.RetryAfter = retryAfter.Value.ToString();
            return Results.Json(new { message = "Too many booking requests from this connection. Please try again later." }, statusCode: StatusCodes.Status429TooManyRequests);
        }
    }
    else
    {
        var folder = Path.Combine(environment.ContentRootPath, "App_Data");
        var filePath = Path.Combine(folder, "bookings.jsonl");
        Directory.CreateDirectory(folder);

        await fileLock.WaitAsync();
        try
        {
            now = DateTimeOffset.UtcNow;
            since = now.AddHours(-6);
            var recentRequests = await ReadRecentIpRequestsFileAsync(filePath, ipHash, since, jsonOptions);
            if (recentRequests.Count >= 5)
            {
                var retryAt = recentRequests.OrderByDescending(time => time).Take(5).Min().AddHours(6);
                var retryAfter = Math.Max(60, (int)Math.Ceiling((retryAt - now).TotalSeconds));
                context.Response.Headers.RetryAfter = retryAfter.ToString();
                return Results.Json(new { message = "Too many booking requests from this connection. Please try again later." }, statusCode: StatusCodes.Status429TooManyRequests);
            }

            var record = new BookingRecord(name!, phone!, vehicle!, service!, preferredDate, message, now, ipHash);
            await File.AppendAllTextAsync(filePath, JsonSerializer.Serialize(record, jsonOptions) + Environment.NewLine);
        }
        finally
        {
            fileLock.Release();
        }
    }

    return Results.Created("/api/bookings", new { received = true });
});

app.MapPost("/api/admin/login", (AdminLoginRequest request, HttpContext context) =>
{
    if (string.IsNullOrWhiteSpace(adminUsername) || string.IsNullOrWhiteSpace(adminPassword) || string.IsNullOrWhiteSpace(tokenSecret))
        return Results.Problem("Admin access is not configured on the server.", statusCode: StatusCodes.Status503ServiceUnavailable);

    var clientKey = requireTrustedProxy
        ? context.Items["VerifiedClientIp"] as string
        : NormalizeIp(context.Connection.RemoteIpAddress)?.ToString();
    if (clientKey is null)
        return Results.Problem("Client address could not be verified.", statusCode: StatusCodes.Status503ServiceUnavailable);
    if (IsLoginRateLimited(clientKey))
        return Results.Json(new { message = "Too many sign-in attempts. Please wait and try again." }, statusCode: StatusCodes.Status429TooManyRequests);

    var usernameOk = FixedTimeStringEquals(request.Username ?? string.Empty, adminUsername);
    var passwordOk = FixedTimeStringEquals(request.Password ?? string.Empty, adminPassword);

    if (!usernameOk || !passwordOk)
        return Results.Json(new { message = "Invalid username or password." }, statusCode: StatusCodes.Status401Unauthorized);

    ResetLoginAttempts(clientKey);
    return Results.Ok(new { token = CreateToken(adminUsername, tokenSecret) });
});

app.MapGet("/api/admin/bookings", async (HttpContext context, IWebHostEnvironment environment) =>
{
    if (!IsAuthorized(context, tokenSecret, adminUsername))
        return Results.Unauthorized();

    List<BookingAdminView> rows;

    if (usePostgres)
    {
        rows = await ReadBookingsPostgresAsync(databaseConnectionString);
    }
    else
    {
        var filePath = Path.Combine(environment.ContentRootPath, "App_Data", "bookings.jsonl");
        rows = await ReadBookingsFileAsync(filePath, jsonOptions);
    }

    context.Response.Headers.CacheControl = "no-store";
    return Results.Ok(new { bookings = rows });
});

app.Run();

static DateOnly GetShopDate()
{
    try
    {
        var timezone = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone));
    }
    catch (TimeZoneNotFoundException)
    {
        var timezone = TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone));
    }
}

static string CleanText(string? value, int maxLength)
{
    if (string.IsNullOrWhiteSpace(value)) return string.Empty;
    var normalized = Regex.Replace(value.Trim(), @"[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]", string.Empty);
    normalized = Regex.Replace(normalized, @"\s+", " ");
    return normalized.Length <= maxLength ? normalized : normalized[..maxLength].TrimEnd();
}

static string? NormalizePhone(string? value)
{
    if (string.IsNullOrWhiteSpace(value)) return null;
    var digits = Regex.Replace(value, @"\D", string.Empty);
    if (digits.Length == 11 && digits.StartsWith('1')) digits = digits[1..];
    if (digits.Length != 10) return null;
    return $"+1 ({digits[..3]}) {digits[3..6]}-{digits[6..]}";
}

static string HashIp(string ip, string secret)
{
    var key = Encoding.UTF8.GetBytes(string.IsNullOrWhiteSpace(secret) ? "local-rate-limit-secret" : secret);
    var input = Encoding.UTF8.GetBytes(ip);
    using var hmac = new HMACSHA256(key);
    return Convert.ToHexString(hmac.ComputeHash(input));
}

static bool FixedTimeStringEquals(string left, string right)
{
    var leftBytes = Encoding.UTF8.GetBytes(left);
    var rightBytes = Encoding.UTF8.GetBytes(right);
    return leftBytes.Length == rightBytes.Length && CryptographicOperations.FixedTimeEquals(leftBytes, rightBytes);
}

static async Task EnsureDatabaseAsync(string connectionString)
{
    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = """
        CREATE TABLE IF NOT EXISTS bookings (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            vehicle TEXT NOT NULL,
            service TEXT NOT NULL,
            preferred_date DATE NOT NULL,
            message TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ip_hash TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_bookings_created_at ON bookings (created_at DESC);
        CREATE INDEX IF NOT EXISTS ix_bookings_ip_hash_created_at ON bookings (ip_hash, created_at DESC);
        """;
    await command.ExecuteNonQueryAsync();
}

static async Task<int?> TryInsertBookingPostgresAsync(string connectionString, BookingRecord record, CancellationToken cancellationToken)
{
    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync(cancellationToken);
    await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);

    // All API instances using this database serialize check + insert for this IP.
    // The transaction-scoped lock also works through transaction-mode poolers.
    var lockKey = BinaryPrimitives.ReadInt64BigEndian(Convert.FromHexString(record.IpHash!));
    await using (var lockCommand = connection.CreateCommand())
    {
        lockCommand.Transaction = transaction;
        lockCommand.CommandText = "SELECT pg_advisory_xact_lock(@lockKey)";
        lockCommand.Parameters.AddWithValue("lockKey", lockKey);
        await lockCommand.ExecuteNonQueryAsync(cancellationToken);
    }

    DateTimeOffset now;
    await using (var clockCommand = connection.CreateCommand())
    {
        clockCommand.Transaction = transaction;
        clockCommand.CommandText = "SELECT clock_timestamp()";
        now = new DateTimeOffset((DateTime)(await clockCommand.ExecuteScalarAsync(cancellationToken))!, TimeSpan.Zero);
    }

    var recentRequests = new List<DateTimeOffset>();
    await using (var recentCommand = connection.CreateCommand())
    {
        recentCommand.Transaction = transaction;
        recentCommand.CommandText = """
            SELECT created_at FROM bookings
            WHERE ip_hash = @ipHash AND created_at > @since
            ORDER BY created_at DESC LIMIT 5
            """;
        recentCommand.Parameters.AddWithValue("ipHash", record.IpHash!);
        recentCommand.Parameters.AddWithValue("since", now.AddHours(-6).UtcDateTime);
        await using var reader = await recentCommand.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            recentRequests.Add(new DateTimeOffset(reader.GetDateTime(0), TimeSpan.Zero));
    }
    if (recentRequests.Count >= 5)
    {
        var retryAt = recentRequests.Min().AddHours(6);
        var retryAfter = Math.Max(60, (int)Math.Ceiling((retryAt - now).TotalSeconds));
        await transaction.CommitAsync(cancellationToken);
        return retryAfter;
    }

    await using var command = connection.CreateCommand();
    command.Transaction = transaction;
    command.CommandText = """
        INSERT INTO bookings (name, phone, vehicle, service, preferred_date, message, created_at, ip_hash)
        VALUES (@name, @phone, @vehicle, @service, @preferredDate, @message, @createdAt, @ipHash)
        """;
    command.Parameters.AddWithValue("name", record.Name);
    command.Parameters.AddWithValue("phone", record.Phone);
    command.Parameters.AddWithValue("vehicle", record.Vehicle);
    command.Parameters.AddWithValue("service", record.Service);
    command.Parameters.AddWithValue("preferredDate", DateOnly.Parse(record.PreferredDate));
    command.Parameters.AddWithValue("message", record.Message ?? string.Empty);
    command.Parameters.AddWithValue("createdAt", now.UtcDateTime);
    command.Parameters.AddWithValue("ipHash", record.IpHash ?? string.Empty);
    await command.ExecuteNonQueryAsync(cancellationToken);
    await transaction.CommitAsync(cancellationToken);
    return null;
}

static async Task<List<BookingAdminView>> ReadBookingsPostgresAsync(string connectionString)
{
    var rows = new List<BookingAdminView>();
    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync();
    await using var command = connection.CreateCommand();
    command.CommandText = """
        SELECT name, phone, vehicle, service, preferred_date, message, created_at
        FROM bookings
        ORDER BY created_at DESC
        LIMIT 500
        """;
    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        rows.Add(new BookingAdminView(
            reader.GetString(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetFieldValue<DateOnly>(4).ToString("yyyy-MM-dd"),
            reader.GetString(5),
            new DateTimeOffset(reader.GetDateTime(6), TimeSpan.Zero)));
    }
    return rows;
}

static async Task<List<DateTimeOffset>> ReadRecentIpRequestsFileAsync(string filePath, string ipHash, DateTimeOffset since, JsonSerializerOptions jsonOptions)
{
    var result = new List<DateTimeOffset>();
    if (!File.Exists(filePath)) return result;
    var lines = await File.ReadAllLinesAsync(filePath);
    foreach (var line in lines)
    {
        try
        {
            var record = JsonSerializer.Deserialize<BookingRecord>(line, jsonOptions);
            if (record?.CreatedAt > since && record.IpHash == ipHash)
                result.Add(record.CreatedAt);
        }
        catch (JsonException) { }
    }
    return result;
}

static async Task<List<BookingAdminView>> ReadBookingsFileAsync(string filePath, JsonSerializerOptions jsonOptions)
{
    var rows = new List<BookingAdminView>();
    if (!File.Exists(filePath)) return rows;
    var lines = await File.ReadAllLinesAsync(filePath);
    foreach (var line in lines)
    {
        try
        {
            var record = JsonSerializer.Deserialize<BookingRecord>(line, jsonOptions);
            if (record is null) continue;
            rows.Add(new BookingAdminView(record.Name, record.Phone, record.Vehicle, record.Service, record.PreferredDate, record.Message ?? string.Empty, record.CreatedAt));
        }
        catch (JsonException) { }
    }
    return rows.OrderByDescending(row => row.CreatedAt).Take(500).ToList();
}

static bool IsAuthorized(HttpContext context, string secret, string expectedUsername)
{
    if (string.IsNullOrWhiteSpace(secret)) return false;
    var header = context.Request.Headers.Authorization.FirstOrDefault();
    if (header is null || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return false;
    return VerifyToken(header[7..].Trim(), secret, expectedUsername);
}

static string CreateToken(string username, string secret)
{
    var payload = $"{username}|{DateTimeOffset.UtcNow.AddHours(12).ToUnixTimeSeconds()}";
    var encodedPayload = Base64UrlEncode(Encoding.UTF8.GetBytes(payload));
    var signature = Sign(encodedPayload, secret);
    return $"{encodedPayload}.{signature}";
}

static bool VerifyToken(string token, string secret, string expectedUsername)
{
    var parts = token.Split('.', 2);
    if (parts.Length != 2) return false;
    var expected = Sign(parts[0], secret);
    var expectedBytes = Encoding.UTF8.GetBytes(expected);
    var actualBytes = Encoding.UTF8.GetBytes(parts[1]);
    if (expectedBytes.Length != actualBytes.Length || !CryptographicOperations.FixedTimeEquals(expectedBytes, actualBytes)) return false;

    try
    {
        var payload = Encoding.UTF8.GetString(Base64UrlDecode(parts[0]));
        var separator = payload.LastIndexOf('|');
        if (separator <= 0 || separator == payload.Length - 1) return false;
        var username = payload[..separator];
        var expires = long.Parse(payload[(separator + 1)..]);
        return username == expectedUsername && DateTimeOffset.UtcNow.ToUnixTimeSeconds() < expires;
    }
    catch { return false; }
}

static string Sign(string payload, string secret)
{
    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
    return Base64UrlEncode(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)));
}

static string Base64UrlEncode(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

static byte[] Base64UrlDecode(string value)
{
    var padded = value.Replace('-', '+').Replace('_', '/');
    padded += new string('=', (4 - padded.Length % 4) % 4);
    return Convert.FromBase64String(padded);
}

bool IsLoginRateLimited(string key)
{
    var now = DateTimeOffset.UtcNow;
    var item = loginAttempts.GetOrAdd(key, _ => new LoginAttempt(0, now));
    if (now - item.WindowStart >= TimeSpan.FromMinutes(15))
    {
        loginAttempts[key] = new LoginAttempt(0, now);
        return false;
    }
    if (item.Count >= 5) return true;
    loginAttempts[key] = item with { Count = item.Count + 1 };
    return false;
}

void ResetLoginAttempts(string key) => loginAttempts.TryRemove(key, out _);

static IPAddress? NormalizeIp(IPAddress? address) =>
    address?.IsIPv4MappedToIPv6 == true ? address.MapToIPv4() : address;

static string NormalizePostgresConnectionString(string value)
{
    if (string.IsNullOrWhiteSpace(value)) return string.Empty;
    if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
        !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        return value;

    var uri = new Uri(value);
    var userInfo = uri.UserInfo.Split(':', 2);
    var username = Uri.UnescapeDataString(userInfo[0]);
    var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty;
    var database = uri.AbsolutePath.TrimStart('/');

    var builder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Username = username,
        Password = password,
        Database = database,
        SslMode = SslMode.Require,
        Pooling = true,
        MaxPoolSize = 20,
    };

    return builder.ConnectionString;
}

record BookingRequest(string? Name, string? Phone, string? Vehicle, string? Service, string? PreferredDate, string? Message, string? Website);
record AdminLoginRequest(string? Username, string? Password);
record BookingRecord(string Name, string Phone, string Vehicle, string Service, string PreferredDate, string? Message, DateTimeOffset CreatedAt, string? IpHash);
record BookingAdminView(string Name, string Phone, string Vehicle, string Service, string PreferredDate, string Message, DateTimeOffset CreatedAt);
record LoginAttempt(int Count, DateTimeOffset WindowStart);
