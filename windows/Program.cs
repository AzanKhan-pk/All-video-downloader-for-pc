using System.Net;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace VidLoom.Desktop;

internal static class Program
{
    private const string StartUrl = "https://avd.up.railway.app/";

    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }

    private sealed class MainForm : Form
    {
        private readonly WebView2 browser = new() { Dock = DockStyle.Fill };
        private static readonly HttpClient Http = new(new HttpClientHandler { AutomaticDecompression = DecompressionMethods.All });

        public MainForm()
        {
            Text = "VidLoom Video Downloader";
            StartPosition = FormStartPosition.CenterScreen;
            Width = 1280;
            Height = 820;
            MinimumSize = new Size(900, 600);
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            Controls.Add(browser);
            Load += async (_, _) => await InitializeBrowserAsync();
            FormClosed += (_, _) => browser.Dispose();
        }

        private async Task InitializeBrowserAsync()
        {
            try
            {
                await browser.EnsureCoreWebView2Async();
                browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
                browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                browser.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
                await browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("""
                    (() => {
                      window.VidLoomNative = {
                        download: (url, filename) => {
                          window.chrome.webview.postMessage({ type: "download", url, filename });
                        }
                      };
                    })();
                    """);
                browser.CoreWebView2.Navigate(StartUrl);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "VidLoom could not start the embedded browser. Please install Microsoft Edge WebView2 Runtime and try again.\n\n" + ex.Message,
                    "VidLoom", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                using var document = JsonDocument.Parse(e.WebMessageAsJson);
                var root = document.RootElement;
                if (!root.TryGetProperty("type", out var type) || type.GetString() != "download") return;

                var url = root.GetProperty("url").GetString();
                var filename = root.GetProperty("filename").GetString();
                if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(filename)) return;

                await DownloadToDownloadsAsync(url, filename);
            }
            catch (Exception ex)
            {
                BeginInvoke(() => MessageBox.Show(
                    "The download could not be saved.\n\n" + ex.Message,
                    "VidLoom", MessageBoxButtons.OK, MessageBoxIcon.Error));
            }
        }

        private static async Task DownloadToDownloadsAsync(string url, string filename)
        {
            var downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            Directory.CreateDirectory(downloads);
            var safeName = string.Join("_", filename.Split(Path.GetInvalidFileNameChars()));
            var destination = Path.Combine(downloads, safeName);

            using var response = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();
            await using var source = await response.Content.ReadAsStreamAsync();
            await using var target = File.Create(destination);
            await source.CopyToAsync(target);
        }
    }
}
