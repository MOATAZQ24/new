; Investor Gate OS — Windows Installer Script (Inno Setup 6+)
; Safe Upgrade, Clean First-Run Initialization, Offline Docs & Developer Attribution

#define MyAppName "Investor Gate OS"
#define MyAppVersion "3.0.0"
#define MyAppDeveloper "Moataz Qasem / معتز قاسم (Cybersecurity & Networks Specialist)"
#define MyAppPublisher "Investor Gate OS (Publisher Legal Identity Pending Confirmation)"

[Setup]
AppId={{8D6B4B2E-9F11-4E9B-8C77-20260101IGOS}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppComments=Developed by {#MyAppDeveloper}
AppCopyright=© 2026 {#MyAppName} — Developer: Moataz Qasem
DefaultDirName={autopf}\InvestorGateOS
DefaultGroupName={#MyAppName}
LicenseFile=LICENSE_NOTICE.txt
InfoBeforeFile=..\docs\THIRD_PARTY_NOTICES.md
OutputDir=..\dist
OutputBaseFilename=InvestorGateOS-Setup-v{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\dist\release-clean\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Investor Gate OS"; Filename: "http://localhost:3000"
Name: "{group}\User Guide (Offline)"; Filename: "{app}\docs\USER_GUIDE_OFFLINE.html"
Name: "{group}\Third-Party Notices"; Filename: "{app}\docs\THIRD_PARTY_NOTICES.md"
Name: "{autodesktop}\Investor Gate OS"; Filename: "http://localhost:3000"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Run]
Filename: "{app}\docs\USER_GUIDE_OFFLINE.html"; Description: "Open Offline User Guide"; Flags: postinstall shellexec skipifsilent unchecked

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
  if DirExists(ExpandConstant('{autopf}\InvestorGateOS\data')) then
  begin
    MsgBox('Existing Investor Gate OS installation detected.' + #13#10 +
           'Upgrade/Repair mode will preserve all existing databases, backups, and integration settings.',
           mbInformation, MB_OK);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    MsgBox('Business data directories (data\ and backups\) are preserved during uninstall to prevent accidental data loss.',
           mbInformation, MB_OK);
  end;
end;
