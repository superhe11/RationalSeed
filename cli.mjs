#!/usr/bin/env node
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn, spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const NOVEL_URL = 'http://127.0.0.1:38741/';
const NOVEL_FALLBACK_URL = 'http://127.0.0.1:3000/';

function printHeader() {
  console.log('\n====================================================');
  console.log('       Управление проектом — Рациональное зерно     ');
  console.log('====================================================');
  console.log(' 1. Открыть новеллу (запуск сервера)');
  console.log(' 2. Подготовить обновление');
  console.log(' 3. Опубликовать обновление в GitHub');
  console.log(' 4. Собрать Android APK');
  console.log(' 0. Выход');
  console.log('====================================================');
}

function openBrowser(url) {
  const platform = process.platform;
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

function getPowerShellCmd() {
  if (process.platform === 'win32') return 'powershell';
  try {
    execSync('which pwsh', { stdio: 'ignore' });
    return 'pwsh';
  } catch {
    return null;
  }
}

function runPowerShellScript(scriptRelPath, args = []) {
  const pwsh = getPowerShellCmd();
  if (!pwsh) {
    return null;
  }

  const scriptPath = path.resolve(scriptRelPath);
  const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args];
  const res = spawnSync(pwsh, psArgs, { stdio: 'inherit' });
  return res.status === 0;
}

async function taskOpenNovel() {
  console.log('\nПроверка запущенного сервера...');
  for (const url of [NOVEL_URL, NOVEL_FALLBACK_URL]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const body = await res.text();
        if (body.includes('title-screen')) {
          console.log(`Сервер уже активен на ${url}. Открываю браузер...`);
          openBrowser(url);
          return;
        }
      }
    } catch {}
  }

  if (!fs.existsSync(path.join('node_modules', '.bin'))) {
    console.log('Первый запуск: установка компонентов (npm install)...');
    const install = spawnSync('npm install', { stdio: 'inherit', shell: true });
    if (install.status !== 0) {
      console.error('Ошибка npm install.');
      return;
    }
  }

  if (!fs.existsSync(path.join('dist', 'server', 'index.js'))) {
    console.log('Сборка проекта (npm run build)...');
    const build = spawnSync('npm run build', { stdio: 'inherit', shell: true });
    if (build.status !== 0) {
      console.error('Ошибка сборки проекта.');
      return;
    }
  }

  console.log('\nЗапуск локального сервера...');
  console.log('Окно браузера откроется автоматически.');
  console.log('Нажмите Ctrl+C, чтобы остановить сервер и вернуться в меню.\n');

  const isWin = process.platform === 'win32';
  const server = isWin
    ? spawn('npx vinext start --host 127.0.0.1 --port 38741 --strictPort', { stdio: 'inherit', shell: true })
    : spawn('npx', ['vinext', 'start', '--host', '127.0.0.1', '--port', '38741', '--strictPort'], { stdio: 'inherit' });

  (async () => {
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null) break;
      try {
        const res = await fetch(NOVEL_URL, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          openBrowser(NOVEL_URL);
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
  })();

  await new Promise((resolve) => {
    server.on('close', resolve);
    process.on('SIGINT', () => server.kill('SIGINT'));
  });
}

function taskPrepareUpdate() {
  console.log('\nПодготовка обновления...');
  const res = runPowerShellScript(path.join('scripts', 'prepare-update.ps1'));
  if (res === null) {
    console.error('\n[Ошибка] Для этого действия требуется PowerShell (pwsh). Установите его в Linux.');
  } else if (res) {
    console.log('\nОбновление подготовлено.');
  }
}

function taskPublishUpdate() {
  console.log('\nПубликация обновления в GitHub...');
  const res = runPowerShellScript(path.join('scripts', 'publish-github.ps1'));
  if (res === null) {
    console.error('\n[Ошибка] Для этого действия требуется PowerShell (pwsh). Установите его в Linux.');
  } else if (res) {
    console.log('\nОбновление опубликовано в GitHub.');
  }
}

function taskBuildApk() {
  console.log('\nСборка Android APK — Рациональное зерно');

  if (!fs.existsSync(path.join('node_modules', '@capacitor', 'cli'))) {
    console.log('Установка компонентов...');
    const inst = spawnSync('npm install', { stdio: 'inherit', shell: true });
    if (inst.status !== 0) return;
  }

  if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
      process.env.ANDROID_HOME = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
    } else {
      process.env.ANDROID_HOME = path.join(os.homedir(), 'Android', 'Sdk');
    }
    process.env.ANDROID_SDK_ROOT = process.env.ANDROID_HOME;
  }

  console.log('\n[1/3] Синхронизация ассетов (mobile:sync)...');
  const sync = spawnSync('npm run mobile:sync', { stdio: 'inherit', shell: true, env: process.env });
  if (sync.status !== 0) {
    console.error('Ошибка на этапе mobile:sync.');
    return;
  }

  console.log('\n[2/3] Компиляция APK через Gradle...');
  const isWin = process.platform === 'win32';
  const androidDir = path.resolve('android');

  if (!isWin) {
    const gradlewPath = path.join(androidDir, 'gradlew');
    try {
      fs.chmodSync(gradlewPath, 0o755);
    } catch (err) {
      console.warn('Предупреждение: не удалось выставить права chmod на gradlew:', err.message);
    }
  }

  const gradlewCmd = isWin ? 'gradlew.bat' : './gradlew';
  const gradle = isWin
    ? spawnSync('gradlew.bat assembleRelease', { cwd: androidDir, stdio: 'inherit', shell: true, env: process.env })
    : spawnSync('./gradlew', ['assembleRelease'], { cwd: androidDir, stdio: 'inherit', env: process.env });

  if (gradle.status !== 0) {
    console.error('\nОшибка компиляции Gradle. Проверьте установку JDK и Android SDK.');
    return;
  }

  console.log('\n[3/3] Завершение сборки...');
  const apkRelPath = path.join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

  if (!fs.existsSync(apkRelPath)) {
    console.error(`Файл APK не найден по пути: ${apkRelPath}`);
    return;
  }

  const verified = runPowerShellScript(path.join('scripts', 'verify-apk.ps1'), ['-ApkPath', apkRelPath]);
  if (verified === false) {
    console.error('Верификация через verify-apk.ps1 завершилась с ошибкой.');
    return;
  } else if (verified === null) {
    console.log('(PowerShell не найден, верификация контрольной суммы пропущена)');
  }

  try {
    const targetApk = 'Рациональное_зерно.apk';
    fs.copyFileSync(apkRelPath, targetApk);
    console.log(`\nУспешно! APK собран: ${path.resolve(targetApk)}`);
  } catch (err) {
    console.error('Ошибка копирования APK:', err.message);
  }
}

async function main() {
  const rl = readline.createInterface({ input, output });

  while (true) {
    printHeader();
    const answer = (await rl.question('Выберите пункт [0-4]: ')).trim();

    switch (answer) {
      case '1': await taskOpenNovel(); break;
      case '2': taskPrepareUpdate(); break;
      case '3': taskPublishUpdate(); break;
      case '4': taskBuildApk(); break;
      case '0':
        console.log('Выход.');
        rl.close();
        process.exit(0);
      default:
        console.log('Неверный пункт. Попробуйте снова.');
        break;
    }

    await rl.question('\nНажмите Enter, чтобы продолжить...');
  }
}

main().catch((err) => {
  console.error('Фатальная ошибка:', err);
});