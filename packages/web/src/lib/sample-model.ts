export const SAMPLE_MODEL = `# RFC-0001 sample model
Browser: Chrome, Firefox, Safari
OS: Windows, macOS, Linux
Login: Email, SSO, ~ExpiredSession
Network: Online, Offline
Locale: ja-JP, en-US

IF [Browser] = "Safari" THEN [OS] <> "Linux";
IF [Network] = "Offline" THEN [Login] <> "SSO";
IF [Login] = "~ExpiredSession" THEN [Network] = "Online";
`;
