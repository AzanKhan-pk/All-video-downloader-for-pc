#define AppName "VidLoom Video Downloader"
#define AppVersion "1.0.0"
#define AppPublisher "Azan Khan"
#define AppExeName "VidLoom.exe"

[Setup]
AppId={{8D2E9D76-7D25-4A10-9D36-7C8A2E2F5C91}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\VidLoom
DefaultGroupName=VidLoom
OutputDir=..\build\installer
OutputBaseFilename=VidLoom-Setup
SetupIconFile=..\windows\icon.ico
UninstallDisplayIcon={app}\{#AppExeName}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
CloseApplications=yes
RestartIfNeededByRun=no

[Files]
Source: "..\build\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\build\MicrosoftEdgeWebView2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{autodesktop}\VidLoom Video Downloader"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\{#AppExeName}"
Name: "{group}\VidLoom Video Downloader"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\{#AppExeName}"
Name: "{group}\Uninstall VidLoom"; Filename: "{uninstallexe}"

[Run]
Filename: "{tmp}\MicrosoftEdgeWebView2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installing Microsoft Edge WebView2 Runtime..."; Flags: runhidden waituntilterminated
Filename: "{app}\{#AppExeName}"; Description: "Launch VidLoom Video Downloader"; Flags: postinstall nowait skipifsilent unchecked
