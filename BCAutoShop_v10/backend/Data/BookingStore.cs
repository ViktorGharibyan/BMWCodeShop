using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Npgsql;

public sealed class BookingStore(NpgsqlDataSource database)
{
    public async Task CheckAsync(CancellationToken ct)
    {
        await using var command = database.CreateCommand("select id from bmw_private.bookings limit 1");
        await command.ExecuteScalarAsync(ct);
    }

    public async Task<SaveResult> SaveAsync(BookingRecord record, CancellationToken ct)
    {
        await using var connection = await database.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        // Serialize count + insert for this IP across all backend instances.
        await using (var gate = new NpgsqlCommand("select pg_advisory_xact_lock(hashtextextended(@ip, 0))", connection, transaction))
        {
            gate.Parameters.AddWithValue("ip", record.IpHash ?? "unknown");
            await gate.ExecuteNonQueryAsync(ct);
        }
        await using (var count = new NpgsqlCommand("""
            select count(*), min(created_at) from bmw_private.bookings
            where ip_hash = @ip and created_at >= now() - interval '6 hours'
            """, connection, transaction))
        {
            count.Parameters.AddWithValue("ip", record.IpHash ?? "unknown");
            await using var reader = await count.ExecuteReaderAsync(ct);
            await reader.ReadAsync(ct);
            if (reader.GetInt64(0) >= 5)
            {
                var retryAt = reader.GetFieldValue<DateTimeOffset>(1).AddHours(6);
                return new SaveResult(null, Math.Max(60, (int)Math.Ceiling((retryAt - DateTimeOffset.UtcNow).TotalSeconds)));
            }
        }
        var id = Guid.NewGuid();
        await InsertAsync(connection, transaction, id, record, null, ct);
        await transaction.CommitAsync(ct);
        return new SaveResult(id, null);
    }

    public async Task<List<BookingAdminView>> ListAsync(CancellationToken ct)
    {
        await using var command = database.CreateCommand("""
            select name, phone, vehicle, service, preferred_date, message, created_at
            from bmw_private.bookings order by created_at desc, id desc limit 500
            """);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var rows = new List<BookingAdminView>();
        while (await reader.ReadAsync(ct))
            rows.Add(new BookingAdminView(reader.GetString(0), reader.GetString(1), reader.GetString(2),
                reader.GetString(3), reader.GetFieldValue<DateOnly>(4).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                reader.GetString(5), reader.GetFieldValue<DateTimeOffset>(6)));
        return rows;
    }

    public async Task<int> ImportAsync(string path, CancellationToken ct)
    {
        // All-or-nothing import; never delete or overwrite the original JSONL file.
        var lines = await File.ReadAllLinesAsync(path, ct);
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        await using var connection = await database.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        var imported = 0;
        for (var i = 0; i < lines.Length; i++)
        {
            if (string.IsNullOrWhiteSpace(lines[i])) continue;
            BookingRecord record;
            try
            {
                record = JsonSerializer.Deserialize<BookingRecord>(lines[i], options)
                    ?? throw new FormatException();
                if (string.IsNullOrWhiteSpace(record.Name) || string.IsNullOrWhiteSpace(record.Phone)
                    || string.IsNullOrWhiteSpace(record.Vehicle) || string.IsNullOrWhiteSpace(record.Service)
                    || record.CreatedAt == default || !DateOnly.TryParseExact(record.PreferredDate, "yyyy-MM-dd", out _))
                    throw new FormatException();
            }
            catch (Exception ex) when (ex is JsonException or FormatException)
            {
                throw new InvalidDataException($"Invalid legacy booking at line {i + 1}; no rows imported.");
            }
            var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{i + 1}:{lines[i]}")));
            imported += await InsertAsync(connection, transaction, Guid.NewGuid(), record, key, ct);
        }
        await transaction.CommitAsync(ct);
        return imported;
    }

    private static async Task<int> InsertAsync(NpgsqlConnection connection, NpgsqlTransaction transaction,
        Guid id, BookingRecord record, string? importKey, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("""
            insert into bmw_private.bookings
                (id, name, phone, vehicle, service, preferred_date, message, created_at, ip_hash, import_key)
            values (@id, @name, @phone, @vehicle, @service, @date, @message, @created, @ip, @import)
            on conflict (import_key) do nothing
            """, connection, transaction);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("name", record.Name);
        command.Parameters.AddWithValue("phone", record.Phone);
        command.Parameters.AddWithValue("vehicle", record.Vehicle);
        command.Parameters.AddWithValue("service", record.Service);
        command.Parameters.AddWithValue("date", DateOnly.ParseExact(record.PreferredDate, "yyyy-MM-dd", CultureInfo.InvariantCulture));
        command.Parameters.AddWithValue("message", record.Message ?? string.Empty);
        command.Parameters.AddWithValue("created", record.CreatedAt.ToUniversalTime());
        command.Parameters.AddWithValue("ip", record.IpHash ?? "legacy-unknown");
        command.Parameters.AddWithValue("import", NpgsqlTypes.NpgsqlDbType.Text, (object?)importKey ?? DBNull.Value);
        return await command.ExecuteNonQueryAsync(ct);
    }
}

public record SaveResult(Guid? Id, int? RetryAfter);
