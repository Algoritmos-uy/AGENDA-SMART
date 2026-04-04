function isAutoStartSupported(platform = process.platform) {
  return platform === 'win32' || platform === 'darwin';
}

function isAutoStartLaunch({ argv = [], loginItemSettings = {} } = {}) {
  const args = Array.isArray(argv) ? argv : [];
  const byArg = args.includes('--autostart') || args.includes('--hidden');
  const bySystem = !!loginItemSettings?.wasOpenedAtLogin;
  return byArg || bySystem;
}

module.exports = {
  isAutoStartSupported,
  isAutoStartLaunch,
};
