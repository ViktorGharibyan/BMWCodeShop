using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Npgsql;
using System.Net;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 16 * 1024);

var adminUsername = builder.Configuration["ADMIN_USERNAME"] ?? string.Empty;
var adminPassword = builder.Configuration["ADMIN_PASSWORD"] ?? string.Empty;
var tokenSecret = builder.Configuration["ADMIN_TOKEN_SECRET"] ?? string.Empty;
var rateLimitSecret = builder.Configuration["RATE_LIMIT_SECRET"] ?? tokenSecret;
var connectionString = builder.Configuration["DATABASE_CONNECTION_STRING"];
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("Set DATABASE_CONNECTION_STRING to the Supabase PostgreSQL connection string.");
var connectionSettings = new NpgsqlConnectionStringBuilder(connectionString);
if (!builder.Environment.IsDevelopment() && connectionSettings.SslMode != SslMode.VerifyFull)
    throw new InvalidOperationException("Production database connections require SSL Mode=VerifyFull.");
connectionSettings.IncludeErrorDetail = false;
connectionSettings.LogParameters = false;
connectionSettings.MaxPoolSize = 10;
connectionSettings.Timeout = 15;
connectionSettings.CommandTimeout = 15;

var importMode = args.Length == 2 && args[0] == "--import-jsonl";
if (!importMode && (string.IsNullOrWhiteSpace(adminUsername) || adminPassword.Length < 16
    || tokenSecret.Length < 32 || rateLimitSecret.Length < 32))
    throw new InvalidOperationException("Set ADMIN_USERNAME, ADMIN_PASSWORD (16+ characters), ADMIN_TOKEN_SECRET and RATE_LIMIT_SECRET (32+ characters each).");

var origins = (builder.Configuration["ALLOWED_ORIGINS"] ?? (builder.Environment.IsDevelopment() ? "http://localhost:3000" : ""))
    .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
if (!importMode && (origins.Length == 0 || origins.Any(origin =>
    !Uri.TryCreate(origin, UriKind.Absolute, out var uri) || uri.GetLeftPart(UriPartial.Authority) != origin
    || (uri.Scheme != "https" && !(builder.Environment.IsDevelopment() && uri.Scheme == "http")))))
    throw new InvalidOperationException("Set ALLOWED_ORIGINS to exact frontend origins, comma-separated, without trailing slashes.");
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(origins).WithHeaders("Content-Type", "Authorization").WithMethods("GET", "POST")));

var proxyIps = (builder.Configuration["TRUSTED_PROXY_IPS"] ?? "")
    .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
var proxyNetworks = (builder.Configuration["TRUSTED_PROXY_NETWORKS"] ?? "")
    .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
var forwarding = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor,
    ForwardedForHeaderName = builder.Configuration["FORWARDED_FOR_HEADER"] ?? "X-Real-IP",
    ForwardLimit = 1
};
if (forwarding.ForwardedForHeaderName is not ("X-Real-IP" or "X-Forwarded-For"))
    throw new InvalidOperationException("FORWARDED_FOR_HEADER must be X-Real-IP or X-Forwarded-For.");
forwarding.KnownProxies.Clear();
forwarding.KnownIPNetworks.Clear();
foreach (var ip in proxyIps) forwarding.KnownProxies.Add(IPAddress.Parse(ip));
foreach (var network in proxyNetworks)
{
    var parsed = System.Net.IPNetwork.Parse(network);
    if (parsed.PrefixLength == 0) throw new InvalidOperationException("Do not trust all networks for forwarded headers.");
    forwarding.KnownIPNetworks.Add(parsed);
}
var useForwarding = proxyIps.Length > 0 || proxyNetworks.Length > 0;
builder.Services.AddSingleton(NpgsqlDataSource.Create(connectionSettings.ConnectionString));
builder.Services.AddSingleton<BookingStore>();

// Railway sets PORT. Local dotnet run keeps launchSettings.json's port 5080.
if (int.TryParse(builder.Configuration["PORT"], out var port))
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
var app = builder.Build();
if (importMode)
{
    var imported = await app.Services.GetRequiredService<BookingStore>().ImportAsync(args[1], CancellationToken.None);
    Console.WriteLine($"Imported {imported} bookings. Original file preserved.");
    await app.DisposeAsync();
    return;
}
// With no configured proxy, do not run this middleware: empty trust lists trust everyone.
if (builder.Configuration.GetValue<bool>("LOG_PROXY_PEER"))
    app.Use(async (context, next) =>
    {
        app.Logger.LogInformation("Immediate proxy peer: {Peer}", context.Connection.RemoteIpAddress);
        await next(context);
    });
if (useForwarding) app.UseForwardedHeaders(forwarding);
else app.Logger.LogWarning("No trusted proxy configured. Rate limits use socket peer IP; configure trusted proxy before public launch.");
app.UseCors();
app.Use(async (context, next) =>
{
    try { await next(context); }
    catch (Exception ex) when (ex is NpgsqlException or TimeoutException)
    {
        // Do not log connection strings, SQL parameters or customer details.
        app.Logger.LogError("Database request failed ({ErrorType}). Trace: {Trace}", ex.GetType().Name, context.TraceIdentifier);
        if (context.Response.HasStarted) throw;
        context.Response.StatusCode = 503;
        await context.Response.WriteAsJsonAsync(new { message = "Booking service is temporarily unavailable. Please try again later." });
    }
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

var loginAttempts = new Dictionary<string, LoginAttempt>(StringComparer.Ordinal);
var loginAttemptsLock = new object();
var nextLoginCleanup = DateTimeOffset.MinValue;

app.MapGet("/health", async (BookingStore store, CancellationToken ct) =>
{
    await store.CheckAsync(ct);
    return Results.Ok(new { status = "ok", database = "connected" });
});

app.MapPost("/api/bookings", async (BookingRequest request, HttpContext context, BookingStore store, CancellationToken ct) =>
{
    if (!string.IsNullOrEmpty(request.Website))
    {
        return Results.BadRequest(new { message = "Could not submit the request." });
    }

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

    if (!DateOnly.TryParseExact(preferredDate, "yyyy-MM-dd", out var date))
    {
        validation["preferredDate"] = ["Choose a valid date."];
    }
    else
    {
        var today = GetShopDate();
        var maxDate = today.AddMonths(1);
        if (date < today || date > maxDate)
            validation["preferredDate"] = [$"Choose a date from {today:yyyy-MM-dd} through {maxDate:yyyy-MM-dd}."];
    }

    if (validation.Count > 0)
        return Results.ValidationProblem(validation);

    var ipAddress = GetClientIp(context);
    var ipHash = HashIp(ipAddress, rateLimitSecret);
    var result = await store.SaveAsync(new BookingRecord(name!, phone!, vehicle!, service!,
        preferredDate, message, DateTimeOffset.UtcNow, ipHash), ct);
    if (result.RetryAfter is int retryAfter)
    {
        context.Response.Headers.RetryAfter = retryAfter.ToString();
        return Results.Json(new { message = "Too many booking requests from this connection. Please try again later." }, statusCode: 429);
    }
    return Results.Created("/api/bookings", new { received = true, bookingId = result.Id });
});

app.MapPost("/api/admin/login", (AdminLoginRequest request, HttpContext context) =>
{
    if (string.IsNullOrWhiteSpace(adminUsername) || string.IsNullOrWhiteSpace(adminPassword) || string.IsNullOrWhiteSpace(tokenSecret))
        return Results.Problem("Admin access is not configured on the server.", statusCode: StatusCodes.Status503ServiceUnavailable);

    context.Response.Headers.CacheControl = "no-store";
    var clientKey = GetClientIp(context);
    if (IsLoginRateLimited(clientKey))
        return Results.Json(new { message = "Too many sign-in attempts. Please wait and try again." }, statusCode: StatusCodes.Status429TooManyRequests);

    var usernameOk = CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(request.Username ?? string.Empty),
        Encoding.UTF8.GetBytes(adminUsername));
    var passwordOk = CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(request.Password ?? string.Empty),
        Encoding.UTF8.GetBytes(adminPassword));

    if (!usernameOk || !passwordOk)
        return Results.Json(new { message = "Invalid username or password." }, statusCode: StatusCodes.Status401Unauthorized);

    ResetLoginAttempts(clientKey);
    return Results.Ok(new { token = CreateToken(adminUsername, tokenSecret) });
});

app.MapGet("/api/admin/bookings", async (HttpContext context, BookingStore store, CancellationToken ct) =>
{
    if (!IsAuthorized(context, tokenSecret, adminUsername))
        return Results.Unauthorized();

    var rows = await store.ListAsync(ct);

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

static string GetClientIp(HttpContext context)
{
    return context.Connection.RemoteIpAddress?.MapToIPv6().ToString() ?? "unknown";
}

static string HashIp(string ip, string secret)
{
    var key = Encoding.UTF8.GetBytes(string.IsNullOrWhiteSpace(secret) ? "local-rate-limit-secret" : secret);
    var input = Encoding.UTF8.GetBytes(ip);
    using var hmac = new HMACSHA256(key);
    return Convert.ToHexString(hmac.ComputeHash(input));
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
        return username == expectedUsername
            && DateTimeOffset.UtcNow.ToUnixTimeSeconds() < expires;
    }
    catch
    {
        return false;
    }
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
    lock (loginAttemptsLock)
    {
        var now = DateTimeOffset.UtcNow;
        if (now >= nextLoginCleanup)
        {
            foreach (var expired in loginAttempts.Where(pair => now - pair.Value.WindowStart >= TimeSpan.FromMinutes(15)).Select(pair => pair.Key).ToArray())
                loginAttempts.Remove(expired);
            nextLoginCleanup = now.AddMinutes(1);
        }
        if (!loginAttempts.TryGetValue(key, out var item) || now - item.WindowStart >= TimeSpan.FromMinutes(15))
        {
            // Bound memory; fail closed rather than evict active rate limits.
            if (!loginAttempts.ContainsKey(key) && loginAttempts.Count >= 10000) return true;
            loginAttempts[key] = new LoginAttempt(1, now);
            return false;
        }
        if (item.Count >= 5) return true;
        loginAttempts[key] = item with { Count = item.Count + 1 };
        return false;
    }
}

void ResetLoginAttempts(string key)
{
    lock (loginAttemptsLock) loginAttempts.Remove(key);
}

record BookingRequest(string? Name, string? Phone, string? Vehicle, string? Service, string? PreferredDate, string? Message, string? Website);
record AdminLoginRequest(string? Username, string? Password);
public record BookingRecord(string Name, string Phone, string Vehicle, string Service, string PreferredDate, string? Message, DateTimeOffset CreatedAt, string? IpHash);
public record BookingAdminView(string Name, string Phone, string Vehicle, string Service, string PreferredDate, string Message, DateTimeOffset CreatedAt);
record LoginAttempt(int Count, DateTimeOffset WindowStart);
