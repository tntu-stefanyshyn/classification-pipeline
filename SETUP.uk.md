[English](SETUP.md) | Українська

# Мінімальне локальне налаштування: WSL і Linux

Запустіть бекенд, MongoDB і десктопний застосунок локально, а CSV-файли зберігайте в AWS S3.
Обчислення й оптимізація виконуються в Docker-контейнерах на вашому комп'ютері. AWS Batch,
AWS CLI, Python на хості та окремий сервіс завдань не потрібні.

## 1. Підготовка WSL або Linux

У Windows використовуйте WSL 2 з Ubuntu та WSLg для вікна Electron-застосунку.
В адміністративному PowerShell встановіть WSL, якщо його ще немає:

```powershell
wsl --install -d Ubuntu-24.04
```

Перезапустіть Windows, якщо система попросить, потім відкрийте Ubuntu і завершіть створення користувача Linux.
Для наявного встановлення WSL виконайте `wsl --update` і перевірте `wsl --list --verbose`,
щоб переконатися, що дистрибутив працює у версії 2. Підтримка графічного інтерфейсу вимагає Windows 11 або
Windows 10 зі збіркою 19044+. Дивіться [посібник Microsoft з графічних застосунків у WSL](https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps).

У рідному Linux використовуйте звичайний сеанс робочого столу. Усі подальші команди виконуються
в терміналі Linux, зокрема й у WSL. Тримайте репозиторій у домашній теці Linux
(наприклад, `~/projects/classification-pipeline`).

Вам потрібні Git, curl, Node.js 24 з npm 11+, локальний MongoDB і Docker. В Ubuntu:

```bash
sudo apt update
sudo apt install -y git curl
```

Встановіть Node.js 24 через [NVM](https://github.com/nvm-sh/nvm/tree/v0.40.3) або скористайтеся
наявним встановленням, якщо воно відповідає вимогам:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24
nvm use 24
node --version
npm --version
```

Встановіть MongoDB Community за [офіційною інструкцією для Ubuntu](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu/)
або за [інструкцією для вашого дистрибутива Linux](https://www.mongodb.com/docs/manual/administration/install-on-linux/).
У системі з systemd запустіть його й перевірте з'єднання:

```bash
sudo systemctl start mongod
mongosh --quiet --eval 'db.adminCommand({ ping: 1 })'
```

Якщо systemd у WSL недоступний, запустіть MongoDB в окремому терміналі Linux:

```bash
mkdir -p "$HOME/.local/share/classification-pipeline/mongodb"
mongod --dbpath "$HOME/.local/share/classification-pipeline/mongodb" --bind_ip 127.0.0.1 --port 27017
```

### Docker для локальних обчислень

У WSL встановіть і запустіть [Docker Desktop для Windows](https://docs.docker.com/desktop/features/wsl/).
Використовуйте Linux-контейнери, увімкніть **Use WSL 2 based engine** і ввімкніть свій дистрибутив Ubuntu
в **Settings → Resources → WSL Integration**.

У рідному Linux встановіть [Docker Engine](https://docs.docker.com/engine/install/ubuntu/)
і налаштуйте [доступ до Docker без sudo](https://docs.docker.com/engine/install/linux-postinstall/),
оскільки застосунок викликає Docker від імені звичайного користувача.

Перевірте в тому самому терміналі Linux, з якого запускатимете застосунок:

```bash
docker version
docker info
```

Обидві команди мають підключатися до демона Docker без `sudo`. Python і його залежності для
обчислень встановлено всередині образів завдань.
