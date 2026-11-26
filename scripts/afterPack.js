const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productName}.app`);
  console.log('Ad-hoc signing:', appPath);
  try {
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
    console.log('Ad-hoc signing OK');
  } catch (e) {
    console.warn('Ad-hoc signing failed:', e.message);
  }
};
