const electronInstaller = require('electron-winstaller');
const path = require('path');
const fs = require('fs');

async function build() {
  console.log('Starting StudyX installer wizard build...');

  const builderDirectory = path.join(__dirname, '../release/win-unpacked');
  const legacyDirectory = path.join(__dirname, '../release/StudyX-win32-x64');
  const appDirectory = fs.existsSync(builderDirectory) ? builderDirectory : legacyDirectory;
  const outputDirectory = path.join(__dirname, '../release/installer');
  const setupIcon = path.join(__dirname, '../public/icon.ico');
  const fallbackIcon = path.join(__dirname, '../public/icon.png');
  const iconPath = fs.existsSync(setupIcon) ? setupIcon : fallbackIcon;

  try {
    if (!fs.existsSync(appDirectory)) {
      throw new Error('Missing unpacked app. Run "npm run electron:build:dir" first.');
    }

    await electronInstaller.createWindowsInstaller({
      appDirectory,
      outputDirectory,
      authors: 'StudyX',
      exe: 'StudyX.exe',
      setupExe: 'StudyX-Setup.exe',
      setupIcon: iconPath,
      iconUrl: fs.existsSync(iconPath) ? `file:///${iconPath.replace(/\\/g, '/')}` : undefined,
      noMsi: true,
      title: 'StudyX',
      description: 'Aplicatie premium de studiu pentru studenti la medicina',
      loadingGif: undefined,
    });
    console.log('Installer generated successfully at release/installer/StudyX-Setup.exe');
  } catch (error) {
    console.error(`Installer generation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

build();
