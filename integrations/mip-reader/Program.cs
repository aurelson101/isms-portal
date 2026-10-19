using System.Net.Mail;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using Microsoft.Identity.Client;
using Microsoft.InformationProtection;
using Microsoft.InformationProtection.File;
using Microsoft.InformationProtection.Exceptions;

const int limit = 50 * 1024 * 1024;
var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = limit);
var app = builder.Build();
var config = new ReaderConfig();
// One native operation at a time bounds memory and avoids sharing engines across users.
var gate = new SemaphoreSlim(1, 1);
app.MapGet("/health/live", () => Results.Ok(new { status = "live" }));
app.MapGet("/health/ready", () => MipOfficeReader.NativeReady()
    ? Results.Ok(new { status = "ready", nativeSdk = true })
    : Results.StatusCode(503));
app.MapPost("/v1/office-preview", async (HttpContext http) =>
{
    http.Response.Headers.CacheControl = "no-store, private";
    byte[]? input = null;
    byte[]? output = null;
    var acquired = false;
    try
    {
        var authorization = Encoding.UTF8.GetBytes(http.Request.Headers.Authorization.ToString());
        var expected = Encoding.UTF8.GetBytes("Bearer " + config.ApiKey);
        if (!CryptographicOperations.FixedTimeEquals(authorization, expected))
        { http.Response.StatusCode = 401; return; }
        var user = http.Request.Headers["X-Mip-User"].ToString().Trim().ToLowerInvariant();
        if (!MailAddress.TryCreate(user, out var mail) || mail.Address != user || !config.Domains.Contains(mail.Host))
        { http.Response.StatusCode = 403; return; }
        var extension = http.Request.Headers["X-Mip-Extension"].ToString();
        if (extension is not ".xlsx" and not ".docx")
        { http.Response.StatusCode = 415; return; }
        acquired = await gate.WaitAsync(0, http.RequestAborted);
        if (!acquired) { http.Response.StatusCode = 429; return; }
        using var body = new MemoryStream();
        var chunk = new byte[65536];
        int read;
        while ((read = await http.Request.Body.ReadAsync(chunk, http.RequestAborted)) != 0)
        {
            if (body.Length + read > limit) { http.Response.StatusCode = 413; return; }
            await body.WriteAsync(chunk.AsMemory(0, read), http.RequestAborted);
        }
        input = body.ToArray();
        if (input.Length < 8 || !input.AsSpan(0, 8).SequenceEqual(new byte[] { 208, 207, 17, 224, 161, 177, 26, 225 }))
        { http.Response.StatusCode = 415; return; }
        output = await MipOfficeReader.Decrypt(config, input, extension, user);
        http.Response.ContentType = "application/octet-stream";
        http.Response.ContentLength = output.Length;
        await http.Response.Body.WriteAsync(output, http.RequestAborted);
    }
    catch (AccessDeniedException) { if (!http.Response.HasStarted) http.Response.StatusCode = 403; }
    catch (OperationCanceledException) { if (!http.Response.HasStarted) http.Response.StatusCode = 503; }
    catch { if (!http.Response.HasStarted) http.Response.StatusCode = 422; }
    finally
    {
        if (input != null) CryptographicOperations.ZeroMemory(input);
        if (output != null) CryptographicOperations.ZeroMemory(output);
        if (acquired) gate.Release();
    }
});
app.Run();

sealed class ReaderConfig
{
    public string Tenant { get; } = Guid.Parse(Required("MIP_TENANT_ID")).ToString();
    public string Client { get; } = Guid.Parse(Required("MIP_CLIENT_ID")).ToString();
    public string ApiKey { get; } = System.IO.File.ReadAllText(Required("MIP_API_KEY_FILE")).Trim();
    public HashSet<string> Domains { get; } = Required("MIP_ALLOWED_DOMAINS").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).ToHashSet(StringComparer.OrdinalIgnoreCase);
    public string WorkRoot { get; } = Environment.GetEnvironmentVariable("MIP_WORK_ROOT") ?? "/tmp/mip";
    public IConfidentialClientApplication ClientApplication { get; }
    public ReaderConfig()
    {
        if (ApiKey.Length < 48 || Domains.Count == 0) throw new InvalidOperationException("Invalid MIP configuration");
        var client = ConfidentialClientApplicationBuilder.Create(Client).WithAuthority($"https://login.microsoftonline.com/{Tenant}");
        var certificatePath = Environment.GetEnvironmentVariable("MIP_CERTIFICATE_PEM_FILE");
        if (!string.IsNullOrEmpty(certificatePath))
            client.WithCertificate(X509Certificate2.CreateFromPemFile(certificatePath, Required("MIP_PRIVATE_KEY_PEM_FILE")));
        else client.WithClientSecret(System.IO.File.ReadAllText(Required("MIP_CLIENT_SECRET_FILE")).Trim());
        ClientApplication = client.Build();
    }
    static string Required(string key) => Environment.GetEnvironmentVariable(key) is { Length: > 0 } value ? value : throw new InvalidOperationException($"Missing {key}");
}

sealed class AuthDelegate(ReaderConfig config) : IAuthDelegate
{
    public string AcquireToken(Identity identity, string authority, string resource, string claims)
    {
        var uri = new Uri(authority);
        if (uri.Scheme != "https" || uri.Host is not "login.microsoftonline.com" and not "login.windows.net") throw new InvalidOperationException("Unsupported authority");
        var allowed = new[] { "https://api.aadrm.com", "https://aadrm.com", "00000012-0000-0000-c000-000000000000" };
        if (!allowed.Contains(resource.TrimEnd('/'), StringComparer.OrdinalIgnoreCase)) throw new InvalidOperationException("Unsupported resource");
        return config.ClientApplication.AcquireTokenForClient(new[] { resource.TrimEnd('/') + "/.default" })
            .WithClaims(claims).ExecuteAsync().GetAwaiter().GetResult().AccessToken;
    }
}

sealed class ConsentDelegate : IConsentDelegate
{
    public Consent GetUserConsent(string url) => Consent.Accept;
}

static class MipOfficeReader
{
    static readonly Lazy<bool> Initialized = new(() => { MIP.Initialize(MipComponent.File); return true; });
    public static bool NativeReady()
    {
        try { return Initialized.Value; }
        catch { return false; }
    }
    public static async Task<byte[]> Decrypt(ReaderConfig config, byte[] content, string extension, string user)
    {
        var directory = Path.Combine(config.WorkRoot, Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        MipContext? context = null;
        try
        {
            _ = Initialized.Value;
            var info = new ApplicationInfo { ApplicationId = config.Client, ApplicationName = "ISMS optional MIP reader", ApplicationVersion = "1.0.0" };
            context = MIP.CreateMipContext(new MipConfiguration(info, directory, Microsoft.InformationProtection.LogLevel.Error, false, CacheStorageType.InMemory));
            using var profile = await MIP.LoadFileProfileAsync(new FileProfileSettings(context, CacheStorageType.InMemory, new ConsentDelegate()));
            var settings = new FileEngineSettings(user, new AuthDelegate(config), "", "en-US")
            { Identity = new Identity(user), DelegatedUserEmail = user, ProtectionOnlyEngine = true };
            using var engine = await profile.AddEngineAsync(settings);
            var source = Path.Combine(directory, "input" + extension);
            await System.IO.File.WriteAllBytesAsync(source, content);
            using var handler = await engine.CreateFileHandlerAsync(source, source, false);
            using var protection = handler.Protection;
            // Plaintext delivered to a browser cannot enforce a no-copy license.
            if (protection == null || !protection.AccessCheck("VIEW") || !protection.AccessCheck("EXTRACT"))
                throw new AccessDeniedException("Web preview requires VIEW and EXTRACT");
            var decrypted = await handler.GetDecryptedTemporaryFileAsync();
            try
            {
                if (new FileInfo(decrypted).Length > 50 * 1024 * 1024) throw new InvalidOperationException("Preview too large");
                return await System.IO.File.ReadAllBytesAsync(decrypted);
            }
            finally { System.IO.File.Delete(decrypted); }
        }
        finally
        {
            try { context?.ShutDown(); }
            finally { Directory.Delete(directory, true); }
        }
    }
}
