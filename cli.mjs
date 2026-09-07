#!/usr/bin/env node
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn, spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

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

function createZipArchive(sourceDir, outZipPath) {
  function getFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(getFiles(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    return files;
  }

  function crc32Fallback(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const allFiles = getFiles(sourceDir);
  const zipEntries = [];

  for (const filePath of allFiles) {
    const relPath = path.relative(sourceDir, filePath).replace(/\\/g, '/');
    if (/(\.\.|^\/|\\|releases\/|\.apk$|\.map$)/.test(relPath)) {
      throw new Error(`Недопустимый файл в бандле: ${relPath}`);
    }

    const content = fs.readFileSync(filePath);
    const crc = zlib.crc32 ? zlib.crc32(content) : crc32Fallback(content);
    const compressed = zlib.deflateRawSync(content, { level: 9 });

    zipEntries.push({
      name: relPath,
      crc,
      uncompressedSize: content.length,
      compressedSize: compressed.length,
      compressedData: compressed
    });
  }

  if (!zipEntries.some(e => e.name === 'index.html')) {
    throw new Error('В корне архива отсутствует index.html.');
  }

  const parts = [];
  const centralDirectoryHeaders = [];
  let offset = 0;

  for (const entry of zipEntries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(entry.crc, 14);
    localHeader.writeUInt32LE(entry.compressedSize, 18);
    localHeader.writeUInt32LE(entry.uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    parts.push(localHeader, nameBuffer, entry.compressedData);

    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(0x0800, 8);
    cdHeader.writeUInt16LE(8, 10);
    cdHeader.writeUInt16LE(0, 12);
    cdHeader.writeUInt16LE(0, 14);
    cdHeader.writeUInt32LE(entry.crc, 16);
    cdHeader.writeUInt32LE(entry.compressedSize, 20);
    cdHeader.writeUInt32LE(entry.uncompressedSize, 24);
    cdHeader.writeUInt16LE(nameBuffer.length, 28);
    cdHeader.writeUInt16LE(0, 30);
    cdHeader.writeUInt16LE(0, 32);
    cdHeader.writeUInt16LE(0, 34);
    cdHeader.writeUInt16LE(0, 36);
    cdHeader.writeUInt32LE(0, 38);
    cdHeader.writeUInt32LE(offset, 42);

    centralDirectoryHeaders.push(cdHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + entry.compressedData.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const part of centralDirectoryHeaders) {
    cdSize += part.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(zipEntries.length, 8);
  eocd.writeUInt16LE(zipEntries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(outZipPath, Buffer.concat([...parts, ...centralDirectoryHeaders, eocd]));
}

async function getGitHubToken(rl) {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();

  try {
    const ghToken = execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (ghToken) return ghToken;
  } catch {}

  try {
    const credInput = 'protocol=https\nhost=github.com\n\n';
    const out = execSync('git credential fill', {
      input: credInput,
      encoding: 'utf8',
      env: { ...process.env, GCM_INTERACTIVE: 'never', GIT_TERMINAL_PROMPT: '0' },
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const match = out.match(/^password=(.*)$/m);
    if (match && match[1]) return match[1].trim();
  } catch {}

  console.log('\nДля работы с GitHub API требуется Personal Access Token (PAT).');
  const token = (await rl.question('Введите GitHub Token: ')).trim();
  return token || null;
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
    if (install.status !== 0) return;
  }

  if (!fs.existsSync(path.join('dist', 'server', 'index.js'))) {
    console.log('Сборка проекта (npm run build)...');
    const build = spawnSync('npm run build', { stdio: 'inherit', shell: true });
    if (build.status !== 0) return;
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
  console.log('\n[1/3] Чтение конфигурации релиза...');
  try {
    const releasePath = path.resolve('app/release.json');
    if (!fs.existsSync(releasePath)) {
      throw new Error('Файл app/release.json не найден.');
    }
    const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
    if (!/^\d+\.\d+\.\d+$/.test(release.versionName) || Number(release.contentCode) < 1) {
      throw new Error('Некорректная версия или contentCode в app/release.json.');
    }

    console.log(`[2/3] Сборка веб-пакета v${release.versionName} (npm run mobile:web)...`);
    const build = spawnSync('npm run mobile:web', { stdio: 'inherit', shell: true });
    if (build.status !== 0) {
      throw new Error('Ошибка сборки mobile:web.');
    }

    const bundleDir = path.resolve('dist-mobile');
    const releaseDir = path.resolve('public/releases');
    fs.mkdirSync(releaseDir, { recursive: true });

    const archiveName = `novel-${release.versionName}-${release.contentCode}.zip`;
    const archivePath = path.join(releaseDir, archiveName);

    if (fs.existsSync(archivePath)) {
      throw new Error(`Архив ${archiveName} уже существует!\nПеред созданием следующего релиза увеличьте contentCode и versionName в app/release.json.`);
    }

    console.log(`[3/3] Упаковка в ZIP: ${archiveName}...`);
    createZipArchive(bundleDir, archivePath);

    const archiveBuffer = fs.readFileSync(archivePath);
    const hash = crypto.createHash('sha256').update(archiveBuffer).digest('hex').toLowerCase();
    const sizeBytes = fs.statSync(archivePath).size;

    const manifest = {
      contentCode: Number(release.contentCode),
      versionName: release.versionName,
      runtimeVersion: release.runtimeVersion,
      publishedAt: new Date().toISOString(),
      notes: release.notes,
      bundleUrl: `${release.updateOrigin}/releases/${archiveName}`,
      sha256: hash,
      sizeBytes: sizeBytes
    };

    fs.writeFileSync(path.join(releaseDir, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');

    manifest.bundleUrl = `https://github.com/${release.githubRepository}/releases/download/v${release.versionName}/${archiveName}`;
    fs.writeFileSync(path.join(releaseDir, 'github-latest.json'), JSON.stringify(manifest, null, 2) + '\n');

    console.log(`\nГотово: ${archiveName} (${(sizeBytes / 1024 / 1024).toFixed(2)} МБ).`);
    console.log('Манифесты обновлены. Теперь закоммитьте изменения и переходите к пункту 3.');
  } catch (err) {
    console.error(`\n[Ошибка] Не удалось подготовить обновление: ${err.message}`);
  }
}

async function taskPublishUpdate(rl) {
  console.log('\n[1/5] Проверка перед публикацией...');
  try {
    const releasePath = path.resolve('app/release.json');
    const manifestPath = path.resolve('public/releases/github-latest.json');

    if (!fs.existsSync(releasePath) || !fs.existsSync(manifestPath)) {
      throw new Error('Файлы релиза не найдены. Сначала выполните пункт 2 («Подготовить обновление»).');
    }

    const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const repository = 'superhe11/RationalSeed';

    if (release.githubRepository !== repository || manifest.contentCode !== release.contentCode || manifest.versionName !== release.versionName) {
      throw new Error('Несовпадение метаданных релиза. Сначала подготовьте обновление (пункт 2).');
    }

    const archiveName = `novel-${release.versionName}-${release.contentCode}.zip`;
    const archivePath = path.resolve('public/releases', archiveName);

    if (!fs.existsSync(archivePath)) {
      throw new Error(`Архив ${archiveName} не найден в public/releases/.`);
    }

    const archiveBuffer = fs.readFileSync(archivePath);
    const archiveHash = crypto.createHash('sha256').update(archiveBuffer).digest('hex').toLowerCase();
    if (archiveHash !== manifest.sha256 || archiveBuffer.length !== manifest.sizeBytes) {
      throw new Error('Контрольная сумма или размер архива не совпадают с манифестом. Пересоберите обновление.');
    }

    const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (gitStatus.length > 0) {
      throw new Error('В репозитории есть незакоммиченные файлы. Сделайте "git commit" перед публикацией.');
    }

    const sourceSha = execSync('git rev-parse --verify HEAD', { encoding: 'utf8' }).trim();

    console.log('\n[2/5] Авторизация в GitHub...');
    const token = await getGitHubToken(rl);
    if (!token) {
      throw new Error('GitHub токен не предоставлен.');
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'RationalSeed-Publisher'
    };

    const repoRes = await fetch(`https://api.github.com/repos/${repository}`, { headers });
    if (!repoRes.ok) throw new Error(`Не удалось получить данные репозитория: HTTP ${repoRes.status}`);
    const repoData = await repoRes.json();
    if (repoData.private || !repoData.permissions?.push) {
      throw new Error('Репозиторий должен быть публичным и доступным для записи.');
    }

    console.log('\n[3/5] Отправка коммитов в ветку main...');
    const push = spawnSync(`git push https://github.com/${repository}.git HEAD:main`, { stdio: 'inherit', shell: true });
    if (push.status !== 0) throw new Error('Ошибка git push HEAD:main.');

    console.log(`\n[4/5] Создание релиза v${release.versionName} на GitHub...`);
    const tag = `v${release.versionName}`;
    let releaseRes = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, { headers });
    let publishedRelease = null;

    if (releaseRes.status === 200) {
      publishedRelease = await releaseRes.json();
    } else {
      const createRes = await fetch(`https://api.github.com/repos/${repository}/releases`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag_name: tag,
          target_commitish: sourceSha,
          name: `RationalSeed ${release.versionName}`,
          body: release.notes.map(n => `- ${n}`).join('\n'),
          draft: true,
          prerelease: false
        })
      });
      if (!createRes.ok) throw new Error(`Ошибка создания релиза: HTTP ${createRes.status}`);
      publishedRelease = await createRes.json();
    }

    console.log(`Загрузка архива ${archiveName}...`);
    const uploadBase = publishedRelease.upload_url.replace(/\{.*$/, '');
    const uploadZipUrl = `${uploadBase}?name=${encodeURIComponent(archiveName)}`;

    const zipUploadRes = await fetch(uploadZipUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/zip', 'Content-Length': String(archiveBuffer.length) },
      body: archiveBuffer
    });
    if (!zipUploadRes.ok && zipUploadRes.status !== 422) {
      throw new Error(`Ошибка загрузки ZIP-архива: HTTP ${zipUploadRes.status}`);
    }

    const rootApkPath = path.resolve('Рациональное_зерно.apk');
    if (fs.existsSync(rootApkPath)) {
      const askApk = (await rl.question('Найден собранный Рациональное_зерно.apk. Прикрепить к релизу? [Y/n]: ')).trim().toLowerCase();
      if (askApk !== 'n') {
        const apkBuffer = fs.readFileSync(rootApkPath);
        const apkName = `RationalSeed-${release.versionName}.apk`;
        console.log(`Загрузка ${apkName}...`);
        const uploadApkUrl = `${uploadBase}?name=${encodeURIComponent(apkName)}`;
        await fetch(uploadApkUrl, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': String(apkBuffer.length) },
          body: apkBuffer
        });
      }
    }

    if (publishedRelease.draft) {
      await fetch(`https://api.github.com/repos/${repository}/releases/${publishedRelease.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: false, make_latest: 'true' })
      });
    }

    console.log('\n[5/5] Обновление манифеста в ветке updates...');
    const branchRes = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/updates`, { headers });
    if (branchRes.status === 404) {
      await fetch(`https://api.github.com/repos/${repository}/git/refs`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'refs/heads/updates', sha: sourceSha })
      });
    }

    const feedUrl = `https://api.github.com/repos/${repository}/contents/latest.json`;
    const oldFeedRes = await fetch(`${feedUrl}?ref=updates`, { headers });
    let oldFeed = null;
    if (oldFeedRes.status === 200) {
      oldFeed = await oldFeedRes.json();
      const prev = JSON.parse(Buffer.from(oldFeed.content, 'base64').toString('utf8'));
      if (prev.contentCode > manifest.contentCode) throw new Error('Откат версии запрещён.');
      if (prev.contentCode === manifest.contentCode && prev.sha256 !== manifest.sha256) {
        throw new Error('Версия с таким contentCode уже опубликована.');
      }
    }

    const putRes = await fetch(feedUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Publish update feed ${release.versionName}`,
        branch: 'updates',
        content: fs.readFileSync(manifestPath).toString('base64'),
        ...(oldFeed ? { sha: oldFeed.sha } : {})
      })
    });
    if (!putRes.ok) throw new Error(`Ошибка обновления ленты updates: HTTP ${putRes.status}`);

    console.log(`\nУспешно опубликовано!`);
    console.log(`Релиз доступен: ${publishedRelease.html_url}`);
    console.log('Канал обновлений Android-приложения переключён на новую версию.');
  } catch (err) {
    console.error(`\n[Ошибка публикации]: ${err.message}`);
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
  if (sync.status !== 0) return;

  console.log('\n[2/3] Компиляция APK через Gradle...');
  const isWin = process.platform === 'win32';
  const androidDir = path.resolve('android');

  if (!isWin) {
    try {
      fs.chmodSync(path.join(androidDir, 'gradlew'), 0o755);
    } catch {}
  }

  const gradle = isWin
    ? spawnSync('gradlew.bat assembleRelease', { cwd: androidDir, stdio: 'inherit', shell: true, env: process.env })
    : spawnSync('./gradlew', ['assembleRelease'], { cwd: androidDir, stdio: 'inherit', env: process.env });

  if (gradle.status !== 0) {
    console.error('\nОшибка компиляции Gradle.');
    return;
  }

  console.log('\n[3/3] Копирование собранного APK...');
  const apkRelPath = path.join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

  if (!fs.existsSync(apkRelPath)) {
    console.error(`Файл APK не найден: ${apkRelPath}`);
    return;
  }

  try {
    const targetApk = 'Рациональное_зерно.apk';
    fs.copyFileSync(apkRelPath, targetApk);
    console.log(`\nГотово: ${path.resolve(targetApk)}`);
  } catch (err) {
    console.error('Ошибка копирования:', err.message);
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
      case '3': await taskPublishUpdate(rl); break;
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