using System.Net;
using System.Text.Json;
using CefSharp;
using CefSharp.WinForms;

namespace VidLoom.Desktop;

internal static class Program
{
    private const string StartUrl = "https://avd.up.railway.app/";

    [STAThread]
    private static void Main()
    {
        var settings = new CefSettings
        {
            CachePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "All Video Downloader Without Watermark",
                "BrowserCache"),
            LogSeverity = LogSeverity.Disable
        };

        Cef.EnableHighDPISupport();
        Cef.Initialize(settings, performDependencyCheck: true, browserProcessHandler: null);

        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());

        Cef.Shutdown();
    }

    private sealed class MainForm : Form
    {
        private readonly ChromiumWebBrowser browser;
        private static readonly HttpClient Http = new(new HttpClientHandler
        {
            AutomaticDecompression = DecompressionMethods.All
        });

        public MainForm()
        {
            Text = "All Video Downloader Without Watermark";
            StartPosition = FormStartPosition.CenterScreen;
            Width = 1280;
            Height = 820;
            MinimumSize = new Size(900, 600);
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);

            browser = new ChromiumWebBrowser(StartUrl)
            {
                Dock = DockStyle.Fill
            };

            // Keep the normal Chromium context menu enabled so text selection,
            // Copy/Paste, links, image actions and other right-click actions work.
            browser.MenuHandler = new DefaultMenuHandler();

            // Legacy binding exposes window.VidLoomNative directly to the existing
            // web UI, so the website does not need to be redesigned.
            browser.JavascriptObjectRepository.Settings.LegacyBindingEnabled = true;
            browser.JavascriptObjectRepository.Register(
                "VidLoomNative",
                new NativeBridge(this),
                isAsync: false,
                options: BindingOptions.DefaultBinder);

            Controls.Add(browser);
            FormClosed += (_, _) => browser.Dispose();
        }

        private sealed class DefaultMenuHandler : IContextMenuHandler
        {
            public void OnBeforeContextMenu(
                IWebBrowser chromiumWebBrowser,
                IBrowser browser,
                IFrame frame,
                IContextMenuParams parameters,
                IMenuModel model)
            {
                // Do not clear the default menu.
            }

            public bool RunContextMenu(
                IWebBrowser chromiumWebBrowser,
                IBrowser browser,
                IFrame frame,
                IContextMenuParams parameters,
                IRunContextMenuCallback callback)
                => false;

            public bool OnContextMenuCommand(
                IWebBrowser chromiumWebBrowser,
                IBrowser browser,
                IFrame frame,
                IContextMenuParams parameters,
                CefMenuCommand commandId,
                CefEventFlags eventFlags)
                => false;

            public void OnContextMenuDismissed(
                IWebBrowser chromiumWebBrowser,
                IBrowser browser,
                IFrame frame)
            {
            }

            public bool RunContextMenu(
                IWebBrowser chromiumWebBrowser,
                IBrowser browser,
                IFrame frame,
                IContextMenuParams parameters,
                IRunContextMenuCallback callback,
                int commandId)
                => false;
        }

        private sealed class NativeBridge
        {
            private readonly MainForm form;

            public NativeBridge(MainForm form)
            {
                this.form = form;
            }

            public void download(string url, string filename)
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await DownloadToDownloadsAsync(url, filename);
                    }
                    catch (Exception ex)
                    {
                        form.BeginInvoke(() => MessageBox.Show(
                            form,
                            "The download could not be saved.\n\n" + ex.Message,
                            "All Video Downloader Without Watermark",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error));
                    }
                });
            }

            public void openDownloads()
            {
                try
                {
                    var downloads = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                        "Downloads");
                    Directory.CreateDirectory(downloads);

                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = "explorer.exe",
                        Arguments = $"\"{downloads}\"",
                        UseShellExecute = true
                    });
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        form,
                        "Could not open the Downloads folder.\n\n" + ex.Message,
                        "All Video Downloader Without Watermark",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }
            }

            private static async Task DownloadToDownloadsAsync(string url, string filename)
            {
                var downloads = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "Downloads");
                Directory.CreateDirectory(downloads);

                var safeName = string.Join(
                    "_",
                    filename.Split(Path.GetInvalidFileNameChars()));
                var destination = Path.Combine(downloads, safeName);

                using var response = await Http.GetAsync(
                    url,
                    HttpCompletionOption.ResponseHeadersRead);
                response.EnsureSuccessStatusCode();

                await using var source = await response.Content.ReadAsStreamAsync();
                await using var target = File.Create(destination);
                await source.CopyToAsync(target);
            }
        }
    }
}
